from __future__ import annotations

import argparse
import base64
import binascii
import json
import logging
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from pixoo import Framebuffer, Pixoo
from pixoo.discovery import find_serial_port
from pixoo.transport import SerialTransport

logger = logging.getLogger("pixoo.bridge")
MAX_BODY_BYTES = 2 * 1024 * 1024


class BridgeController:
    """Serializes display commands while owning one persistent Pixoo connection."""

    def __init__(self, device: Pixoo, address: str, port: str) -> None:
        self.device = device
        self.address = address
        self.port = port
        self._lock = threading.Lock()

    def connect(self) -> None:
        with self._lock:
            self.device.reconnect()

    def close(self) -> None:
        with self._lock:
            self.device.disconnect()

    def health(self) -> dict[str, Any]:
        return {
            "status": "ok" if self.device.transport.is_connected else "disconnected",
            "connected": self.device.transport.is_connected,
            "device_address": self.address,
            "serial_port": self.port,
        }

    def set_brightness(self, value: int) -> None:
        # Zero puts this firmware to sleep and drops SPP, so the bridge rejects it.
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 100:
            raise ValueError("brightness must be an integer between 1 and 100; 0 is unsafe on this firmware")
        with self._lock:
            self.device.set_brightness(value)

    def show_frame(self, pixels: list[Any]) -> None:
        if len(pixels) != 768:
            raise ValueError("pixels must contain exactly 768 RGB channel values")
        frame = Framebuffer()
        for index in range(0, 768, 3):
            x = (index // 3) % 16
            y = (index // 3) // 16
            frame.set_pixel(x, y, pixels[index], pixels[index + 1], pixels[index + 2])
        with self._lock:
            self.device.show(frame)

    def show_image(self, encoded: bytes) -> None:
        frame = Framebuffer()
        frame.load_image_bytes(encoded)
        with self._lock:
            self.device.show(frame)

    def show_text(
        self,
        text: str,
        *,
        scroll: bool = False,
        duration: float = 10.0,
        fps: float = 4.0,
        color: tuple[int, int, int] = (255, 255, 0),
    ) -> int:
        if not isinstance(text, str) or not text:
            raise ValueError("text must be a non-empty string")
        if duration <= 0 or fps <= 0:
            raise ValueError("duration and fps must be positive")
        normalized = text.upper()
        width = Framebuffer.text_width(normalized)
        positions = range(16, -width - 1, -1) if scroll else (max(0, (16 - width) // 2),)
        position_list = list(positions)
        started = time.monotonic()
        frames = 0
        with self._lock:
            while True:
                frame = Framebuffer()
                x = position_list[frames % len(position_list)]
                frame.draw_text(x, 5, normalized, *color)
                self.device.show(frame)
                frames += 1
                if not scroll:
                    break
                if time.monotonic() - started >= duration:
                    break
                time.sleep(max(0.0, 1.0 / fps - 0.25))
        return frames


class BridgeHandler(BaseHTTPRequestHandler):
    server: "BridgeHTTPServer"

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(HTTPStatus.OK, self.server.controller.health())
        else:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
            if self.path == "/brightness":
                self.server.controller.set_brightness(payload.get("value"))
                result: dict[str, Any] = {"ok": True}
            elif self.path == "/display/frame":
                self.server.controller.show_frame(payload.get("pixels", []))
                result = {"ok": True}
            elif self.path == "/display/text":
                raw_color = payload.get("color", [255, 255, 0])
                if not isinstance(raw_color, list) or len(raw_color) != 3:
                    raise ValueError("color must be [r, g, b]")
                frames = self.server.controller.show_text(
                    payload.get("text"),
                    scroll=bool(payload.get("scroll", False)),
                    duration=float(payload.get("duration", 10)),
                    fps=float(payload.get("fps", 4)),
                    color=tuple(raw_color),  # type: ignore[arg-type]
                )
                result = {"ok": True, "frames": frames}
            elif self.path == "/display/image":
                encoded = payload.get("base64")
                if not isinstance(encoded, str):
                    raise ValueError("base64 must be a string")
                try:
                    image_data = base64.b64decode(encoded, validate=True)
                except (binascii.Error, ValueError) as exc:
                    raise ValueError("base64 contains invalid data") from exc
                self.server.controller.show_image(image_data)
                result = {"ok": True}
            else:
                self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            self._json(HTTPStatus.OK, result)
        except (ValueError, TypeError, KeyError) as exc:
            self._json(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": str(exc)})
        except Exception as exc:
            logger.exception("Request failed: %s %s", self.command, self.path)
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

    def _read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("invalid Content-Length") from exc
        if not 0 < length <= MAX_BODY_BYTES:
            raise ValueError(f"request body must be between 1 and {MAX_BODY_BYTES} bytes")
        try:
            value = json.loads(self.rfile.read(length))
        except json.JSONDecodeError as exc:
            raise ValueError("request body is not valid JSON") from exc
        if not isinstance(value, dict):
            raise ValueError("request JSON must be an object")
        return value

    def _json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: object) -> None:
        logger.info("%s - %s", self.client_address[0], format % args)


class BridgeHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], controller: BridgeController) -> None:
        self.controller = controller
        super().__init__(address, BridgeHandler)


def load_controller(config_path: Path) -> BridgeController:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    address = config["device_address"]
    configured_port = config.get("serial_port", "auto")
    port = find_serial_port(address) if configured_port == "auto" else configured_port
    device = Pixoo(SerialTransport(port, config.get("baudrate", 115200)))
    return BridgeController(device, address, port)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local-only DeskHub Pixoo bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--config", type=Path, default=Path("config.json"))
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        parser.error("bridge is local-only; host must be a loopback address")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    controller = load_controller(args.config)
    controller.connect()
    server = BridgeHTTPServer((args.host, args.port), controller)
    logger.info("Pixoo bridge listening on http://%s:%d", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Stopping bridge")
    finally:
        server.server_close()
        controller.close()


if __name__ == "__main__":
    main()
