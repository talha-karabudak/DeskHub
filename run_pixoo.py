from __future__ import annotations

import argparse
import json
import logging
import time
from pathlib import Path

from pixoo import Framebuffer, Pixoo
from pixoo.discovery import find_serial_port
from pixoo.transport import SerialTransport


def load_device(config_path: Path) -> Pixoo:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    configured_port = config.get("serial_port", "auto")
    port = (
        find_serial_port(config["device_address"])
        if configured_port == "auto"
        else configured_port
    )
    logging.info("Using Pixoo serial port: %s", port)
    return Pixoo(SerialTransport(port, config.get("baudrate", 115200)))


def make_pattern(name: str) -> Framebuffer:
    colors = {"red": (255, 0, 0), "green": (0, 255, 0), "blue": (0, 0, 255)}
    if name in colors:
        return Framebuffer(colors[name])
    frame = Framebuffer()
    for i in range(16):
        frame.set_pixel(i, i, 255, 0, 0)
        frame.set_pixel(15 - i, i, 255, 0, 0)
    return frame


def make_demo_frame(step: int) -> Framebuffer:
    frame = Framebuffer()
    colors = ((255, 0, 0), (0, 255, 0), (0, 0, 255))
    offset = step % 16
    frame.draw_line(0, offset, 15, 15 - offset, *colors[step % 3])
    frame.draw_line(offset, 0, 15 - offset, 15, *colors[(step + 1) % 3])
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description="Minimal Pixoo 16 hardware test")
    parser.add_argument("--config", type=Path, default=Path("config.json"))
    parser.add_argument("--debug", action="store_true")
    commands = parser.add_subparsers(dest="command", required=True)
    brightness = commands.add_parser("brightness")
    brightness.add_argument("percent", type=int)
    pattern = commands.add_parser("pattern")
    pattern.add_argument("name", choices=("red", "green", "blue", "x"))
    image = commands.add_parser("image", help="show a local PNG/JPEG image")
    image.add_argument("path", type=Path)
    demo = commands.add_parser("demo", help="run a persistent-connection animation")
    demo.add_argument("--seconds", type=float, default=30.0)
    demo.add_argument("--fps", type=float, default=4.0)
    scroll = commands.add_parser("scroll", help="scroll bitmap text")
    scroll.add_argument("text")
    scroll.add_argument("--seconds", type=float, default=30.0)
    scroll.add_argument("--fps", type=float, default=4.0)
    scroll.add_argument("--scale", type=int, default=1)
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="[%(levelname)s] %(message)s",
    )
    device = load_device(args.config)
    try:
        with device:
            if args.command == "brightness":
                device.set_brightness(args.percent)
                logging.info("Brightness command sent: %d%%", args.percent)
            elif args.command == "pattern":
                device.show(make_pattern(args.name))
                logging.info("Frame sent successfully: %s", args.name)
            elif args.command == "image":
                frame = Framebuffer()
                frame.load_image(args.path)
                device.show(frame)
                logging.info("Image sent successfully: %s", args.path)
            elif args.command == "demo":
                if args.seconds <= 0 or args.fps <= 0:
                    parser.error("demo seconds and fps must be positive")
                started = time.monotonic()
                step = 0
                while time.monotonic() - started < args.seconds:
                    device.show(make_demo_frame(step))
                    step += 1
                    time.sleep(max(0.0, 1.0 / args.fps - 0.25))
                logging.info("Demo completed: %d frames", step)
            else:
                if args.seconds <= 0 or args.fps <= 0 or args.scale < 1:
                    parser.error("scroll seconds, fps and scale must be positive")
                text = args.text.upper()
                width = Framebuffer.text_width(text, args.scale)
                positions = list(range(16, -width - 1, -1))
                started = time.monotonic()
                step = 0
                y = (16 - 5 * args.scale) // 2
                while time.monotonic() - started < args.seconds:
                    frame = Framebuffer()
                    frame.draw_text(
                        positions[step % len(positions)],
                        y,
                        text,
                        255,
                        255,
                        0,
                        scale=args.scale,
                    )
                    device.show(frame)
                    step += 1
                    time.sleep(max(0.0, 1.0 / args.fps - 0.25))
                logging.info("Scroll completed: %d frames", step)
    except KeyboardInterrupt:
        logging.info("Demo stopped by user")


if __name__ == "__main__":
    main()
