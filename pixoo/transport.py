from __future__ import annotations

import logging
import time
from typing import Any

from .errors import NotConnectedError, TransportError

logger = logging.getLogger(__name__)


class SerialTransport:
    """Byte transport over Windows' Bluetooth SPP virtual COM port."""

    def __init__(self, port: str, baudrate: int = 115200, timeout: float = 5.0) -> None:
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self._serial: Any = None

    @property
    def is_connected(self) -> bool:
        return bool(self._serial and self._serial.is_open)

    def connect(self) -> None:
        if self.is_connected:
            return
        try:
            import serial
        except ImportError as exc:
            raise TransportError("pyserial is missing; run: python -m pip install -r requirements.txt") from exc
        logger.info("Connecting to Pixoo using Bluetooth SPP port %s...", self.port)
        try:
            self._serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout,
                write_timeout=self.timeout,
            )
        except serial.SerialException as exc:
            raise TransportError(f"cannot open {self.port}: {exc}") from exc
        # Some original Pixoo firmwares silently discard the first command
        # when it follows the RFCOMM open immediately.
        time.sleep(0.5)
        logger.info("Connection established on %s", self.port)

    def disconnect(self) -> None:
        serial_port, self._serial = self._serial, None
        if serial_port is not None and serial_port.is_open:
            serial_port.close()
            logger.info("Connection closed on %s", self.port)

    def reconnect(self, attempts: int = 3, delay: float = 1.0) -> None:
        if attempts < 1:
            raise ValueError("attempts must be at least 1")
        self.disconnect()
        last_error: TransportError | None = None
        for attempt in range(1, attempts + 1):
            try:
                logger.info("Reconnect attempt %d/%d...", attempt, attempts)
                self.connect()
                return
            except TransportError as exc:
                last_error = exc
                logger.warning("Reconnect attempt %d failed: %s", attempt, exc)
                if attempt < attempts:
                    time.sleep(delay)
        raise TransportError(
            f"could not reconnect to {self.port} after {attempts} attempts: {last_error}"
        ) from last_error

    def send(self, data: bytes) -> None:
        if not self.is_connected:
            raise NotConnectedError("transport is not connected")
        logger.debug("Sending %d bytes: %s", len(data), data.hex(" "))
        try:
            written = self._serial.write(data)
            self._serial.flush()
            # Let the Bluetooth serial stack deliver the final bytes before
            # a one-shot CLI command closes the virtual COM port.
            time.sleep(0.25)
        except Exception as exc:
            raise TransportError(f"write to {self.port} failed: {exc}") from exc
        if written != len(data):
            raise TransportError(f"short write on {self.port}: {written}/{len(data)} bytes")
