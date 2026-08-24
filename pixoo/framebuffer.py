from __future__ import annotations

from pathlib import Path
from io import BytesIO

from .font import FONT_3X5


class Framebuffer:
    """A strict 16x16, row-major RGB framebuffer."""

    WIDTH = 16
    HEIGHT = 16

    def __init__(self, color: tuple[int, int, int] = (0, 0, 0)) -> None:
        self._pixels = bytearray(self.WIDTH * self.HEIGHT * 3)
        self.fill(*color)

    @staticmethod
    def _channel(value: int) -> int:
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError("RGB channels must be integers")
        if not 0 <= value <= 255:
            raise ValueError("RGB channels must be between 0 and 255")
        return value

    @classmethod
    def _offset(cls, x: int, y: int) -> int:
        if not isinstance(x, int) or not isinstance(y, int):
            raise TypeError("pixel coordinates must be integers")
        if not 0 <= x < cls.WIDTH or not 0 <= y < cls.HEIGHT:
            raise IndexError(f"pixel ({x}, {y}) is outside 16x16 framebuffer")
        return (y * cls.WIDTH + x) * 3

    def set_pixel(self, x: int, y: int, r: int, g: int, b: int) -> None:
        offset = self._offset(x, y)
        self._pixels[offset : offset + 3] = bytes(
            (self._channel(r), self._channel(g), self._channel(b))
        )

    def get_pixel(self, x: int, y: int) -> tuple[int, int, int]:
        offset = self._offset(x, y)
        return tuple(self._pixels[offset : offset + 3])  # type: ignore[return-value]

    def fill(self, r: int, g: int, b: int) -> None:
        color = bytes((self._channel(r), self._channel(g), self._channel(b)))
        self._pixels[:] = color * (self.WIDTH * self.HEIGHT)

    def draw_line(
        self,
        x0: int,
        y0: int,
        x1: int,
        y1: int,
        r: int,
        g: int,
        b: int,
    ) -> None:
        """Draw an inclusive line with integer Bresenham rasterization."""
        self._offset(x0, y0)
        self._offset(x1, y1)
        color = (self._channel(r), self._channel(g), self._channel(b))
        dx = abs(x1 - x0)
        sx = 1 if x0 < x1 else -1
        dy = -abs(y1 - y0)
        sy = 1 if y0 < y1 else -1
        error = dx + dy

        while True:
            self.set_pixel(x0, y0, *color)
            if x0 == x1 and y0 == y1:
                break
            doubled = 2 * error
            if doubled >= dy:
                error += dy
                x0 += sx
            if doubled <= dx:
                error += dx
                y0 += sy

    def draw_text(
        self,
        x: int,
        y: int,
        text: str,
        r: int,
        g: int,
        b: int,
        scale: int = 1,
    ) -> None:
        """Draw uppercase 3x5 bitmap text; pixels outside the screen are clipped."""
        if not isinstance(x, int) or not isinstance(y, int):
            raise TypeError("text coordinates must be integers")
        if not isinstance(scale, int) or isinstance(scale, bool) or scale < 1:
            raise ValueError("text scale must be a positive integer")
        color = (self._channel(r), self._channel(g), self._channel(b))
        cursor_x = x
        for character in text.upper():
            try:
                glyph = FONT_3X5[character]
            except KeyError as exc:
                raise ValueError(f"unsupported font character: {character!r}") from exc
            for row, bits in enumerate(glyph):
                for column, bit in enumerate(bits):
                    if bit == "0":
                        continue
                    for sy in range(scale):
                        for sx in range(scale):
                            px = cursor_x + column * scale + sx
                            py = y + row * scale + sy
                            if 0 <= px < self.WIDTH and 0 <= py < self.HEIGHT:
                                self.set_pixel(px, py, *color)
            cursor_x += 4 * scale

    @staticmethod
    def text_width(text: str, scale: int = 1) -> int:
        """Return the visible width of text rendered by draw_text()."""
        if not isinstance(scale, int) or isinstance(scale, bool) or scale < 1:
            raise ValueError("text scale must be a positive integer")
        for character in text.upper():
            if character not in FONT_3X5:
                raise ValueError(f"unsupported font character: {character!r}")
        return 0 if not text else (len(text) * 4 - 1) * scale

    def to_rgb_bytes(self) -> bytes:
        return bytes(self._pixels)

    def load_image(self, path: str | Path) -> None:
        """Load an image, resizing to 16x16 without smoothing pixel edges."""
        try:
            from PIL import Image
        except ImportError as exc:
            raise RuntimeError(
                "Pillow is missing; run: python -m pip install -r requirements.txt"
            ) from exc
        image_path = Path(path)
        if not image_path.is_file():
            raise FileNotFoundError(f"image file not found: {image_path}")
        with Image.open(image_path) as image:
            self._load_pillow_image(image)

    def load_image_bytes(self, data: bytes) -> None:
        """Load encoded PNG/JPEG bytes into this framebuffer."""
        try:
            from PIL import Image
        except ImportError as exc:
            raise RuntimeError(
                "Pillow is missing; run: python -m pip install -r requirements.txt"
            ) from exc
        with Image.open(BytesIO(data)) as image:
            self._load_pillow_image(image)

    def _load_pillow_image(self, image: object) -> None:
        from PIL import Image

        rgb = image.convert("RGB").resize(  # type: ignore[attr-defined]
            (self.WIDTH, self.HEIGHT),
            resample=Image.Resampling.NEAREST,
        )
        self._pixels[:] = rgb.tobytes()
