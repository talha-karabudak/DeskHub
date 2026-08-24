import unittest
from unittest.mock import patch

from pixoo.errors import TransportError
from pixoo.transport import SerialTransport


class ReconnectTests(unittest.TestCase):
    def test_reconnect_retries_until_success(self) -> None:
        transport = SerialTransport("COM_TEST")
        failures = [TransportError("first"), TransportError("second"), None]

        def connect() -> None:
            result = failures.pop(0)
            if result:
                raise result

        with (
            patch.object(transport, "disconnect") as disconnect,
            patch.object(transport, "connect", side_effect=connect) as connect_mock,
            patch("pixoo.transport.time.sleep"),
        ):
            transport.reconnect(attempts=3, delay=0.01)

        disconnect.assert_called_once_with()
        self.assertEqual(connect_mock.call_count, 3)

    def test_reconnect_reports_final_failure(self) -> None:
        transport = SerialTransport("COM_TEST")
        with (
            patch.object(transport, "disconnect"),
            patch.object(transport, "connect", side_effect=TransportError("busy")),
            patch("pixoo.transport.time.sleep"),
        ):
            with self.assertRaisesRegex(TransportError, "after 2 attempts"):
                transport.reconnect(attempts=2, delay=0.01)

    def test_reconnect_rejects_zero_attempts(self) -> None:
        with self.assertRaises(ValueError):
            SerialTransport("COM_TEST").reconnect(attempts=0)


if __name__ == "__main__":
    unittest.main()
