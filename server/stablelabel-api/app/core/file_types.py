"""Supported file type allowlist for Graph assignSensitivityLabel.

Graph only supports modern Office formats and PDF.  Calling it on anything
else returns either an immediate 400 *or* a silent 202 that never applies —
inconsistent behaviour that we must guard against client-side.

Legacy Office formats (.doc, .xls, .ppt) are NOT supported.
"""

from __future__ import annotations

# Modern Office formats — exhaustive list from Microsoft docs
_WORD = frozenset({".docx", ".docm", ".dotx", ".dotm"})
_EXCEL = frozenset({".xlsx", ".xlsm", ".xltx", ".xltm", ".xlsb"})
_POWERPOINT = frozenset({".pptx", ".pptm", ".potx", ".potm", ".ppsx", ".ppsm"})
_PDF = frozenset({".pdf"})

SUPPORTED_EXTENSIONS: frozenset[str] = _WORD | _EXCEL | _POWERPOINT | _PDF

# Explicitly rejected — these look close enough that users might expect them
REJECTED_LEGACY: frozenset[str] = frozenset({
    ".doc", ".dot", ".xls", ".xlt", ".xlw", ".ppt", ".pot", ".pps",
})


def is_supported(filename: str) -> bool:
    """Check if a filename has a supported extension for Graph labeling."""
    dot = filename.rfind(".")
    if dot == -1:
        return False
    return filename[dot:].lower() in SUPPORTED_EXTENSIONS


def is_legacy_office(filename: str) -> bool:
    """Check if a filename uses a legacy Office format that must be converted first."""
    dot = filename.rfind(".")
    if dot == -1:
        return False
    return filename[dot:].lower() in REJECTED_LEGACY
