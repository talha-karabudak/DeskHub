import unittest
from unittest.mock import Mock

from pixoo.device import Pixoo
from pixoo.errors import NotConnectedError
from pixoo.framebuffer import Framebuffer


class DeviceReliabilityTests(unittest.TestCase):
    def test_show_reconnects_and_retries_once(self) -> None:
        transport = Mock()
        transport.send.side_effect = [NotConnectedError("dropped"), None]
        device = Pixoo(transport)

        device.show(Framebuffer((255, 0, 0)))

        self.assertEqual(transport.send.call_count, 2)
        transport.reconnect.assert_called_once_with()
        first_packet = transport.send.call_args_list[0].args[0]
        second_packet = transport.send.call_args_list[1].args[0]
        self.assertEqual(first_packet, second_packet)

    def test_auto_reconnect_can_be_disabled(self) -> None:
        transport = Mock()
        transport.send.side_effect = NotConnectedError("dropped")
        device = Pixoo(transport, auto_reconnect=False)

        with self.assertRaises(NotConnectedError):
            device.set_brightness(30)

        transport.reconnect.assert_not_called()

    def test_retry_failure_is_reported(self) -> None:
        transport = Mock()
        transport.send.side_effect = [NotConnectedError("first"), NotConnectedError("retry")]
        device = Pixoo(transport)

        with self.assertRaisesRegex(NotConnectedError, "retry"):
            device.show(Framebuffer())

        self.assertEqual(transport.send.call_count, 2)


if __name__ == "__main__":
    unittest.main()
