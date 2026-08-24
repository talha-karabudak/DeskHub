class PixooError(Exception):
    """Base exception for this package."""


class TransportError(PixooError):
    """Opening or writing the Bluetooth serial connection failed."""


class NotConnectedError(TransportError):
    """An operation needs an open transport."""


class ProtocolError(PixooError):
    """A value cannot be represented by the Pixoo protocol."""

