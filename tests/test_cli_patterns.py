import unittest

from run_pixoo import make_demo_frame, make_pattern


class CliPatternTests(unittest.TestCase):
    def test_named_x_pattern(self) -> None:
        frame = make_pattern("x")
        self.assertEqual(frame.get_pixel(0, 0), (255, 0, 0))
        self.assertEqual(frame.get_pixel(7, 7), (255, 0, 0))
        self.assertEqual(frame.get_pixel(0, 1), (0, 0, 0))

    def test_demo_frame_changes_with_step(self) -> None:
        self.assertNotEqual(make_demo_frame(0).to_rgb_bytes(), make_demo_frame(1).to_rgb_bytes())


if __name__ == "__main__":
    unittest.main()
