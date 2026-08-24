import unittest

from pixoo.framebuffer import Framebuffer


class FramebufferTests(unittest.TestCase):
    def test_set_and_get_pixel(self) -> None:
        frame = Framebuffer()
        frame.set_pixel(15, 15, 1, 2, 3)
        self.assertEqual(frame.get_pixel(15, 15), (1, 2, 3))

    def test_row_major_bytes(self) -> None:
        frame = Framebuffer()
        frame.set_pixel(1, 0, 9, 8, 7)
        self.assertEqual(frame.to_rgb_bytes()[3:6], b"\x09\x08\x07")

    def test_invalid_coordinates_raise(self) -> None:
        frame = Framebuffer()
        for point in ((-1, 0), (0, 16), (16, 0), (0, 20)):
            with self.assertRaises(IndexError):
                frame.set_pixel(*point, 0, 0, 0)

    def test_invalid_channel_raises(self) -> None:
        with self.assertRaises(ValueError):
            Framebuffer((256, 0, 0))

    def test_draw_line_is_inclusive(self) -> None:
        frame = Framebuffer()
        frame.draw_line(1, 2, 4, 2, 255, 0, 0)
        for x in range(1, 5):
            self.assertEqual(frame.get_pixel(x, 2), (255, 0, 0))
        self.assertEqual(frame.get_pixel(0, 2), (0, 0, 0))

    def test_draw_line_handles_diagonal_and_reverse(self) -> None:
        frame = Framebuffer()
        frame.draw_line(3, 3, 0, 0, 0, 255, 0)
        for point in ((0, 0), (1, 1), (2, 2), (3, 3)):
            self.assertEqual(frame.get_pixel(*point), (0, 255, 0))

    def test_draw_line_rejects_out_of_bounds_endpoint(self) -> None:
        with self.assertRaises(IndexError):
            Framebuffer().draw_line(-1, 0, 15, 15, 255, 255, 255)

    def test_draw_text_renders_and_scales(self) -> None:
        frame = Framebuffer()
        frame.draw_text(0, 0, "H", 255, 255, 255, scale=2)
        self.assertEqual(frame.get_pixel(0, 0), (255, 255, 255))
        self.assertEqual(frame.get_pixel(2, 0), (0, 0, 0))
        self.assertEqual(frame.get_pixel(4, 0), (255, 255, 255))
        self.assertEqual(frame.get_pixel(2, 4), (255, 255, 255))

    def test_draw_text_clips_and_rejects_unknown_character(self) -> None:
        frame = Framebuffer()
        frame.draw_text(-2, 13, "A", 255, 0, 0)
        with self.assertRaisesRegex(ValueError, "unsupported"):
            frame.draw_text(0, 0, "!", 255, 255, 255)

    def test_text_width(self) -> None:
        self.assertEqual(Framebuffer.text_width(""), 0)
        self.assertEqual(Framebuffer.text_width("HI"), 7)
        self.assertEqual(Framebuffer.text_width("HI", scale=2), 14)
        self.assertEqual(Framebuffer.text_width("+"), 3)


if __name__ == "__main__":
    unittest.main()
