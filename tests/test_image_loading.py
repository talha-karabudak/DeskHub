import tempfile
import unittest
from pathlib import Path

from PIL import Image

from pixoo.framebuffer import Framebuffer


class ImageLoadingTests(unittest.TestCase):
    def test_load_image_converts_and_resizes_nearest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "quadrants.png"
            image = Image.new("RGB", (2, 2))
            image.putdata(
                [
                    (255, 0, 0),
                    (0, 255, 0),
                    (0, 0, 255),
                    (255, 255, 255),
                ]
            )
            image.save(path)

            frame = Framebuffer()
            frame.load_image(path)

        self.assertEqual(frame.get_pixel(0, 0), (255, 0, 0))
        self.assertEqual(frame.get_pixel(15, 0), (0, 255, 0))
        self.assertEqual(frame.get_pixel(0, 15), (0, 0, 255))
        self.assertEqual(frame.get_pixel(15, 15), (255, 255, 255))

    def test_load_image_reports_missing_file(self) -> None:
        with self.assertRaises(FileNotFoundError):
            Framebuffer().load_image("definitely-missing.png")


if __name__ == "__main__":
    unittest.main()
