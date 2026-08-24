from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from .errors import TransportError


def normalize_address(address: str) -> str:
    compact = re.sub(r"[^0-9A-Fa-f]", "", address).upper()
    if len(compact) != 12:
        raise ValueError(f"invalid Bluetooth address: {address!r}")
    return compact


def find_serial_port(device_address: str, ports: Iterable[Any] | None = None) -> str:
    """Find the outgoing Windows Bluetooth SPP port for a device MAC."""
    target = normalize_address(device_address)
    if ports is None:
        try:
            from serial.tools import list_ports
        except ImportError as exc:
            raise TransportError(
                "pyserial is missing; run: python -m pip install -r requirements.txt"
            ) from exc
        ports = list_ports.comports()

    inspected: list[str] = []
    for port in ports:
        device = str(getattr(port, "device", ""))
        hwid = str(getattr(port, "hwid", ""))
        inspected.append(f"{device} ({hwid})")
        if target in normalize_hwid(hwid):
            return device

    details = ", ".join(inspected) if inspected else "no serial ports found"
    raise TransportError(
        f"no outgoing Bluetooth SPP port found for {device_address}; inspected: {details}"
    )


def normalize_hwid(hwid: str) -> str:
    return re.sub(r"[^0-9A-Fa-f]", "", hwid).upper()

