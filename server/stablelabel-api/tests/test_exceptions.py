"""Tests for exception hierarchy — ensures each landmine has a typed exception."""

from app.core.exceptions import (
    EncryptionLabelGuardError,
    GraphAuthError,
    GraphLockedError,
    GraphThrottledError,
    LabelDowngradeError,
    LabelNotFoundError,
    SilentFailureError,
    StableLabelError,
    TenantNotEnabledError,
    UnsupportedFileTypeError,
)


def test_all_inherit_from_base() -> None:
    """Every exception must be catchable via StableLabelError."""
    exceptions = [
        GraphAuthError("test"),
        GraphThrottledError(retry_after=5.0),
        GraphLockedError("test"),
        UnsupportedFileTypeError("test"),
        EncryptionLabelGuardError("test"),
        LabelDowngradeError("test"),
        LabelNotFoundError("test"),
        SilentFailureError("test"),
        TenantNotEnabledError("test"),
    ]
    for exc in exceptions:
        assert isinstance(exc, StableLabelError)


def test_throttled_carries_retry_after() -> None:
    exc = GraphThrottledError(retry_after=30.0)
    assert exc.retry_after == 30.0
