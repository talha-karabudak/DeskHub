from __future__ import annotations

from math import ceil, log2

from .errors import ProtocolError
from .framebuffer import Framebuffer

START = 0x01
END = 0x02
CMD_SET_IMAGE = 0x44
CMD_SET_COLOR = 0x6F
CMD_SET_BRIGHTNESS = 0x74


def checksum(body: bytes) -> int:
    """Return the little-endian 16-bit additive checksum value."""
    return sum(body) & 0xFFFF


def encode_packet(command: int, payload: bytes = b"") -> bytes:
    if not 0 <= command <= 0xFF:
        raise ProtocolError("command must fit in one byte")
    payload_length = len(payload) + 3  # command byte + two checksum bytes
    if payload_length > 0xFFFF:
        raise ProtocolError("payload is too large")
    body = payload_length.to_bytes(2, "little") + bytes((command,)) + payload
    return bytes((START,)) + body + checksum(body).to_bytes(2, "little") + bytes((END,))


def encode_brightness(percent: int) -> bytes:
    if not isinstance(percent, int) or isinstance(percent, bool):
        raise TypeError("brightness must be an integer")
    if not 0 <= percent <= 100:
        raise ValueError("brightness must be between 0 and 100")
    return encode_packet(CMD_SET_BRIGHTNESS, bytes((percent,)))


def encode_color(r: int, g: int, b: int) -> bytes:
    channels = (r, g, b)
    if any(not isinstance(value, int) or isinstance(value, bool) for value in channels):
        raise TypeError("RGB channels must be integers")
    if any(not 0 <= value <= 255 for value in channels):
        raise ValueError("RGB channels must be between 0 and 255")
    return encode_packet(CMD_SET_COLOR, bytes(channels))


def encode_framebuffer(frame: Framebuffer) -> bytes:
    colors: list[tuple[int, int, int]] = []
    color_indexes: dict[tuple[int, int, int], int] = {}
    indexes: list[int] = []
    raw = frame.to_rgb_bytes()
    for offset in range(0, len(raw), 3):
        color = (raw[offset], raw[offset + 1], raw[offset + 2])
        if color not in color_indexes:
            color_indexes[color] = len(colors)
            colors.append(color)
        indexes.append(color_indexes[color])

    # The original Pixoo format uses zero bits per pixel for a one-color
    # palette: every pixel implicitly refers to palette entry 0.
    bits_per_pixel = 0 if len(colors) == 1 else ceil(log2(len(colors)))
    packed = bytearray()
    accumulator = 0
    accumulated_bits = 0
    for index in indexes:
        accumulator |= index << accumulated_bits
        accumulated_bits += bits_per_pixel
        while accumulated_bits >= 8:
            packed.append(accumulator & 0xFF)
            accumulator >>= 8
            accumulated_bits -= 8
    if accumulated_bits:
        packed.append(accumulator & 0xFF)

    palette = bytes(channel for color in colors for channel in color)
    frame_size = 7 + len(palette) + len(packed)
    image_frame = (
        bytes((0xAA,))
        + frame_size.to_bytes(2, "little")
        + b"\x00\x00\x00"
        + bytes((len(colors),))
        + palette
        + packed
    )
    return encode_packet(CMD_SET_IMAGE, b"\x00\x0A\x0A\x04" + image_frame)
