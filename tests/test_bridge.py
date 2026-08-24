import io
import unittest
from unittest.mock import Mock

from PIL import Image

from bridge import BridgeController


class BridgeControllerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.device = Mock()
        self.device.transport.is_connected = True
        self.controller = BridgeController(self.device, "11:22:33:44:55:66", "COM9")

    def test_health(self) -> None:
        self.assertEqual(
            self.controller.health(),
            {
                "status": "ok",
                "connected": True,
                "device_address": "11:22:33:44:55:66",
                "serial_port": "COM9",
            },
        )

    def test_zero_brightness_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsafe"):
            self.controller.set_brightness(0)
        self.device.set_brightness.assert_not_called()

    def test_frame_requires_768_channels(self) -> None:
        with self.assertRaisesRegex(ValueError, "768"):
            self.controller.show_frame([0, 0, 0])

    def test_valid_frame_is_sent(self) -> None:
        self.controller.show_frame([0] * 768)
        frame = self.device.show.call_args.args[0]
        self.assertEqual(len(frame.to_rgb_bytes()), 768)

    def test_encoded_image_is_sent(self) -> None:
        output = io.BytesIO()
        Image.new("RGB", (2, 2), (1, 2, 3)).save(output, format="PNG")
        self.controller.show_image(output.getvalue())
        frame = self.device.show.call_args.args[0]
        self.assertEqual(frame.get_pixel(0, 0), (1, 2, 3))


if __name__ == "__main__":
    unittest.main()
