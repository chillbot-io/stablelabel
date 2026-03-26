"""StableLabel-specific exceptions.

Each maps to a real failure mode discovered during Graph API audit.
"""

from __future__ import annotations


class StableLabelError(Exception):
    """Base for all StableLabel errors."""


class GraphAuthError(StableLabelError):
    """Token acquisition failed (expired secret, consent missing, etc.)."""


class GraphThrottledError(StableLabelError):
    """429 Too Many Requests.  Carries the Retry-After value."""

    def __init__(self, retry_after: float, message: str = "Graph API throttled") -> None:
        self.retry_after = retry_after
        super().__init__(message)


class GraphLockedError(StableLabelError):
    """423 Locked — file checked out, DKE-encrypted, or mid-sync."""


class UnsupportedFileTypeError(StableLabelError):
    """File extension not in the supported allowlist.

    Graph returns inconsistent errors (400 or silent 202 failure) for
    unsupported types, so we reject before calling the API.
    """


class EncryptionLabelGuardError(StableLabelError):
    """Attempted to bulk-apply a label that carries encryption/protection.

    This is the #1 risk at scale — accidentally encrypting thousands of
    files can lock out users org-wide.  Must be explicitly confirmed.
    """


class LabelDowngradeError(StableLabelError):
    """Target label has lower priority than the current label.

    Caller must supply justification_text or use privileged assignment.
    """


class LabelNotFoundError(StableLabelError):
    """Label GUID not found — deleted, disabled, or wrong tenant."""


class SilentFailureError(StableLabelError):
    """Async operation returned 202 but verification shows label not applied.

    This is the silent-failure landmine: Graph accepts the request but
    nothing happens (e.g., file was mid-processing from a prior change).
    """


class TenantNotEnabledError(StableLabelError):
    """Tenant has not enabled sensitivity labels for SharePoint/OneDrive.

    All label operations will fail with unhelpful errors until this is on.
    """


class GraphApiNotSupportedError(StableLabelError):
    """Graph API does not support this operation (e.g., label/policy creation).

    Triggers fallback to PowerShell Compliance Center cmdlets.
    """
