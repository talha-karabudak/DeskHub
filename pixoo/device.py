from __future__ import annotations

from .framebuffer import Framebuffer
from .errors import TransportError
from .protocol import encode_brightness, encode_color, encode_framebuffer
from .transport import SerialTransport


class Pixoo:
    def __init__(self, transport: SerialTransport, auto_reconnect: bool = True) -> None:
        self.transport = transport
        self.auto_reconnect = auto_reconnect

    def connect(self) -> None:
        self.transport.connect()

    def disconnect(self) -> None:
        self.transport.disconnect()

    def reconnect(self, attempts: int = 3, delay: float = 1.0) -> None:
        self.transport.reconnect(attempts=attempts, delay=delay)

    def set_brightness(self, percent: int) -> None:
        self._send_reliably(encode_brightness(percent))

    def set_color(self, r: int, g: int, b: int) -> None:
        self._send_reliably(encode_color(r, g, b))

    def show(self, frame: Framebuffer) -> None:
        self._send_reliably(encode_framebuffer(frame))

    def _send_reliably(self, packet: bytes) -> None:
        try:
            self.transport.send(packet)
        except TransportError:
            if not self.auto_reconnect:
                raise
            self.transport.reconnect()
            # Retry exactly once. Commands are idempotent display state
            # updates, so a duplicate caused by an ambiguous write is safe.
            self.transport.send(packet)

    def __enter__(self) -> "Pixoo":
        self.connect()
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        self.disconnect()
