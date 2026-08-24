from __future__ import annotations

import argparse
import json
import logging
import time
from pathlib import Path

from pixoo import Framebuffer, Pixoo
from pixoo.discovery import find_serial_port
from pixoo.errors import TransportError
from pixoo.transport import SerialTransport


def moving_pattern(step: int) -> Framebuffer:
    frame = Framebuffer()
    colors = ((255, 0, 0), (0, 255, 0), (0, 0, 255))
    for y in range(16):
        x = (y + step) % 16
        frame.set_pixel(x, y, *colors[step % len(colors)])
        frame.set_pixel(15 - x, y, *colors[(step + 1) % len(colors)])
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description="Pixoo persistent-connection endurance test")
    parser.add_argument("--duration", type=float, default=600.0, help="test duration in seconds")
    parser.add_argument("--interval", type=float, default=1.0, help="seconds between frames")
    parser.add_argument("--config", type=Path, default=Path("config.json"))
    args = parser.parse_args()
    if args.duration <= 0 or args.interval <= 0:
        parser.error("duration and interval must be positive")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    config = json.loads(args.config.read_text(encoding="utf-8"))
    configured_port = config.get("serial_port", "auto")
    port = (
        find_serial_port(config["device_address"])
        if configured_port == "auto"
        else configured_port
    )
    device = Pixoo(SerialTransport(port, config.get("baudrate", 115200)))
    sent = errors = reconnects = 0
    started = time.monotonic()
    next_report = started + 60

    try:
        device.reconnect(attempts=3, delay=2)
        while time.monotonic() - started < args.duration:
            frame = moving_pattern(sent)
            try:
                device.show(frame)
            except TransportError as exc:
                errors += 1
                logging.warning("Frame %d failed: %s", sent + 1, exc)
                device.reconnect(attempts=3, delay=2)
                reconnects += 1
                device.show(frame)
            sent += 1
            now = time.monotonic()
            if now >= next_report:
                logging.info(
                    "Progress: %.0fs, frames=%d, errors=%d, reconnects=%d",
                    now - started,
                    sent,
                    errors,
                    reconnects,
                )
                next_report += 60
            time.sleep(args.interval)
    finally:
        device.disconnect()

    elapsed = time.monotonic() - started
    logging.info(
        "PASS: elapsed=%.1fs frames=%d errors=%d reconnects=%d",
        elapsed,
        sent,
        errors,
        reconnects,
    )


if __name__ == "__main__":
    main()

