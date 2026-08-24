import unittest
from types import SimpleNamespace

from pixoo.discovery import find_serial_port, normalize_address
from pixoo.errors import TransportError


class DiscoveryTests(unittest.TestCase):
    def test_normalize_address(self) -> None:
        self.assertEqual(normalize_address("11:75:58:ba:2e:66"), "117558BA2E66")

    def test_finds_target_port_and_ignores_local_port(self) -> None:
        ports = [
            SimpleNamespace(device="COM3", hwid=r"BTHENUM\000000000000_0000000A"),
            SimpleNamespace(device="COM4", hwid=r"BTHENUM\117558BA2E66_C00000000"),
        ]
        self.assertEqual(find_serial_port("11:75:58:BA:2E:66", ports), "COM4")

    def test_missing_target_has_diagnostic_error(self) -> None:
        ports = [SimpleNamespace(device="COM3", hwid="LOCAL_ONLY")]
        with self.assertRaisesRegex(TransportError, "COM3"):
            find_serial_port("11:75:58:BA:2E:66", ports)


if __name__ == "__main__":
    unittest.main()
