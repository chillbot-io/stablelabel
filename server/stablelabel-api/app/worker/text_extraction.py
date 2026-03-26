"""Text extraction utilities for Office OOXML, PDF, and plain-text files.

Includes zip bomb protection for OOXML archives (docx, xlsx, pptx).
"""

from __future__ import annotations

import io
import logging
import zipfile

import defusedxml.ElementTree as ET

logger = logging.getLogger(__name__)

# File size limits
_MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024  # 5 GB
_STREAM_THRESHOLD = 50 * 1024 * 1024  # 50 MB — above this, stream to temp file

# Zip bomb protection limits
_ZIP_MAX_ENTRIES = 10_000  # max files inside a single archive
_ZIP_MAX_UNCOMPRESSED = 200 * 1024 * 1024  # 200 MB total decompressed
_ZIP_MAX_RATIO = 100  # max compression ratio (uncompressed / compressed)
_ZIP_MAX_SINGLE_FILE = 100 * 1024 * 1024  # 100 MB for a single file inside the zip


class _ZipBombError(Exception):
    """Raised when a zip archive looks like a zip bomb."""


def _validate_zip_safety(zf: zipfile.ZipFile, filename: str) -> None:
    """Check a zip archive for zip bomb characteristics.

    Raises _ZipBombError if any limit is exceeded.
    """
    if len(zf.infolist()) > _ZIP_MAX_ENTRIES:
        raise _ZipBombError(
            f"{filename}: zip has {len(zf.infolist())} entries "
            f"(limit {_ZIP_MAX_ENTRIES})"
        )

    total_uncompressed = 0
    for info in zf.infolist():
        # Check individual file size
        if info.file_size > _ZIP_MAX_SINGLE_FILE:
            raise _ZipBombError(
                f"{filename}: entry '{info.filename}' is {info.file_size} bytes "
                f"uncompressed (limit {_ZIP_MAX_SINGLE_FILE})"
            )

        # Check compression ratio per entry
        if info.compress_size > 0:
            ratio = info.file_size / info.compress_size
            if ratio > _ZIP_MAX_RATIO:
                raise _ZipBombError(
                    f"{filename}: entry '{info.filename}' has compression ratio "
                    f"{ratio:.0f}:1 (limit {_ZIP_MAX_RATIO}:1)"
                )

        total_uncompressed += info.file_size

    if total_uncompressed > _ZIP_MAX_UNCOMPRESSED:
        raise _ZipBombError(
            f"{filename}: total uncompressed size {total_uncompressed} bytes "
            f"(limit {_ZIP_MAX_UNCOMPRESSED})"
        )


def _extract_text_from_bytes(content: bytes, filename: str) -> str:
    """Extract text from file content based on file extension.

    Supports:
      - Plain text (.txt, .csv, .json, .xml, .ps1, .md, etc.)
      - Office OOXML (.docx, .xlsx, .pptx) via zipfile + XML parsing
      - PDF via pdfminer.six (optional dependency)

    Falls back to UTF-8 decode for unknown types.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # OOXML formats — extract text from XML inside the ZIP
    if ext in ("docx", "docm"):
        return _extract_docx(content)
    if ext in ("xlsx", "xlsm"):
        return _extract_xlsx(content)
    if ext in ("pptx", "pptm"):
        return _extract_pptx(content)
    if ext == "pdf":
        return _extract_pdf(content)

    # Default: UTF-8 text
    try:
        return content.decode("utf-8", errors="replace")
    except (UnicodeDecodeError, AttributeError):
        return ""


def _extract_docx(content: bytes) -> str:
    """Extract text from .docx by parsing word/document.xml inside the ZIP."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            _validate_zip_safety(zf, "docx")
            if "word/document.xml" not in zf.namelist():
                return ""
            xml_content = zf.read("word/document.xml")
            root = ET.fromstring(xml_content)
            # Word namespace
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            texts = [t.text for t in root.iter(f"{{{ns['w']}}}t") if t.text]
            return " ".join(texts)
    except _ZipBombError as exc:
        logger.error("Zip bomb detected in docx: %s", exc)
        return ""
    except (zipfile.BadZipFile, ET.ParseError, KeyError):
        return ""


def _extract_xlsx(content: bytes) -> str:
    """Extract text from .xlsx — shared strings, inline strings, and cell values.

    Excel stores text in three places:
      1. xl/sharedStrings.xml — shared string table (most text cells)
      2. Sheet XML <is><t> — inline strings
      3. Sheet XML <v> — raw cell values (numbers, dates, formulas)
    We read all three to ensure numeric PII (SSNs, account numbers) is captured.
    """
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            _validate_zip_safety(zf, "xlsx")
            texts: list[str] = []

            # 1. Shared strings table
            if "xl/sharedStrings.xml" in zf.namelist():
                root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
                texts.extend(t.text for t in root.iter(f"{{{ns['s']}}}t") if t.text)

            # 2 & 3. Walk sheet files for inline strings and raw cell values
            for name in sorted(zf.namelist()):
                if not name.startswith("xl/worksheets/sheet") or not name.endswith(".xml"):
                    continue
                root = ET.fromstring(zf.read(name))
                for cell in root.iter(f"{{{ns['s']}}}c"):
                    # Inline strings: <c><is><t>value</t></is></c>
                    inline = cell.find(f"{{{ns['s']}}}is")
                    if inline is not None:
                        for t in inline.iter(f"{{{ns['s']}}}t"):
                            if t.text:
                                texts.append(t.text)
                        continue
                    # Raw values (numbers, formula results): <c><v>123</v></c>
                    # Skip shared-string references (t="s") since we already have those
                    cell_type = cell.get("t", "")
                    if cell_type == "s":
                        continue
                    v = cell.find(f"{{{ns['s']}}}v")
                    if v is not None and v.text:
                        texts.append(v.text)

            return " ".join(texts)
    except _ZipBombError as exc:
        logger.error("Zip bomb detected in xlsx: %s", exc)
        return ""
    except (zipfile.BadZipFile, ET.ParseError, KeyError):
        return ""


def _extract_pptx(content: bytes) -> str:
    """Extract text from .pptx slide XML inside the ZIP."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            _validate_zip_safety(zf, "pptx")
            texts: list[str] = []
            ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
            for name in sorted(zf.namelist()):
                if name.startswith("ppt/slides/slide") and name.endswith(".xml"):
                    root = ET.fromstring(zf.read(name))
                    texts.extend(t.text for t in root.iter(f"{{{ns['a']}}}t") if t.text)
            return " ".join(texts)
    except _ZipBombError as exc:
        logger.error("Zip bomb detected in pptx: %s", exc)
        return ""
    except (zipfile.BadZipFile, ET.ParseError, KeyError):
        return ""


def _extract_pdf(content: bytes) -> str:
    """Extract text from PDF using pdfminer.six (optional dependency)."""
    try:
        from pdfminer.high_level import extract_text

        return extract_text(io.BytesIO(content))
    except ImportError:
        logger.debug("pdfminer.six not installed — skipping PDF text extraction")
        return ""
    except Exception:
        return ""
