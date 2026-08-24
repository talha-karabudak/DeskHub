import unittest

from pixoo.framebuffer import Framebuffer
from pixoo.protocol import encode_brightness, encode_color, encode_framebuffer, encode_packet


class ProtocolTests(unittest.TestCase):
    def test_known_brightness_packet(self) -> None:
        self.assertEqual(encode_brightness(50), bytes.fromhex("01 04 00 74 32 AA 00 02"))

    def test_packet_length_and_checksum(self) -> None:
        packet = encode_packet(0x74, b"\x1e")
        self.assertEqual(packet, bytes.fromhex("01 04 00 74 1E 96 00 02"))

    def test_brightness_bounds(self) -> None:
        for value in (-1, 101):
            with self.assertRaises(ValueError):
                encode_brightness(value)

    def test_known_red_color_packet(self) -> None:
        self.assertEqual(
            encode_color(255, 0, 0),
            bytes.fromhex("01 06 00 6F FF 00 00 74 01 02"),
        )

    def test_solid_frame_uses_one_color_palette(self) -> None:
        packet = encode_framebuffer(Framebuffer((255, 0, 0)))
        self.assertEqual(packet[0], 0x01)
        self.assertEqual(packet[3], 0x44)
        self.assertEqual(packet[-1], 0x02)
        self.assertIn(bytes.fromhex("AA 0A 00 00 00 00 01 FF 00 00"), packet)
        # A one-color Pixoo image has an implicit palette index for every
        # pixel, so the protocol carries no pixel-index bytes.
        self.assertEqual(len(packet), 21)

    def test_x_pattern_uses_two_colors(self) -> None:
        frame = Framebuffer()
        for i in range(16):
            frame.set_pixel(i, i, 255, 0, 0)
            frame.set_pixel(15 - i, i, 255, 0, 0)
        packet = encode_framebuffer(frame)
        self.assertIn(bytes.fromhex("FF 00 00 00 00 00"), packet)


if __name__ == "__main__":
    unittest.main()
