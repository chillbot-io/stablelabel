"""Tests for text extraction helpers in app.worker.executor."""

import io
import zipfile

import pytest

from app.worker.executor import (
    _extract_text_from_bytes,
    _extract_docx,
    _extract_xlsx,
    _extract_pptx,
    _top_classification,
)
from app.services.policy_engine import ClassificationResult, EntityMatch


# ── Plain-text extraction ─────────────────────────────────────


class TestExtractPlaintext:
    def test_extract_plaintext(self) -> None:
        content = "Hello, this is plain text.".encode("utf-8")
        result = _extract_text_from_bytes(content, "readme.txt")
        assert result == "Hello, this is plain text."

    def test_extract_csv_as_text(self) -> None:
        content = "col1,col2\nval1,val2\n".encode("utf-8")
        result = _extract_text_from_bytes(content, "data.csv")
        assert "col1,col2" in result

    def test_extract_unknown_extension_as_utf8(self) -> None:
        content = "Some data here".encode("utf-8")
        result = _extract_text_from_bytes(content, "file.xyz")
        assert result == "Some data here"


# ── DOCX extraction ──────────────────────────────────────────


class TestExtractDocx:
    def test_extract_docx(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(
                "word/document.xml",
                '<?xml version="1.0"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                "<w:body><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:body>"
                "</w:document>",
            )
        content = buf.getvalue()

        result = _extract_docx(content)
        assert "Hello World" in result

    def test_extract_docx_via_filename(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(
                "word/document.xml",
                '<?xml version="1.0"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                "<w:body><w:p><w:r><w:t>Report Content</w:t></w:r></w:p></w:body>"
                "</w:document>",
            )
        content = buf.getvalue()

        result = _extract_text_from_bytes(content, "report.docx")
        assert "Report Content" in result

    def test_extract_docx_multiple_paragraphs(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(
                "word/document.xml",
                '<?xml version="1.0"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                "<w:body>"
                "<w:p><w:r><w:t>First</w:t></w:r></w:p>"
                "<w:p><w:r><w:t>Second</w:t></w:r></w:p>"
                "</w:body>"
                "</w:document>",
            )
        content = buf.getvalue()

        result = _extract_docx(content)
        assert "First" in result
        assert "Second" in result

    def test_extract_docx_missing_document_xml(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("word/other.xml", "<root/>")
        content = buf.getvalue()

        result = _extract_docx(content)
        assert result == ""


# ── XLSX extraction ──────────────────────────────────────────


class TestExtractXlsx:
    def test_extract_xlsx(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(
                "xl/sharedStrings.xml",
                '<?xml version="1.0"?>'
                '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                "<si><t>Revenue</t></si>"
                "<si><t>Expenses</t></si>"
                "</sst>",
            )
        content = buf.getvalue()

        result = _extract_xlsx(content)
        assert "Revenue" in result
        assert "Expenses" in result

    def test_extract_xlsx_via_filename(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(
                "xl/sharedStrings.xml",
                '<?xml version="1.0"?>'
                '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                "<si><t>Data</t></si>"
                "</sst>",
            )
        content = buf.getvalue()

        result = _extract_text_from_bytes(content, "report.xlsx")
        assert "Data" in result

    def test_extract_xlsx_missing_shared_strings(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("xl/workbook.xml", "<root/>")
        content = buf.getvalue()

        result = _extract_xlsx(content)
        assert result == ""

    def test_extract_xlsx_inline_strings(self) -> None:
        """Inline strings (<is><t>) in sheet cells should be extracted."""
        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        sheet_xml = (
            f'<?xml version="1.0"?>'
            f'<worksheet xmlns="{ns}">'
            f"<sheetData>"
            f'<row r="1">'
            f'<c r="A1" t="inlineStr"><is><t>John Smith</t></is></c>'
            f'<c r="B1" t="inlineStr"><is><t>SSN 123-45-6789</t></is></c>'
            f"</row>"
            f"</sheetData>"
            f"</worksheet>"
        )
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        content = buf.getvalue()

        result = _extract_xlsx(content)
        assert "John Smith" in result
        assert "SSN 123-45-6789" in result

    def test_extract_xlsx_cell_values(self) -> None:
        """Numeric cell values (<v>) should be extracted (catches numeric PII)."""
        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        sheet_xml = (
            f'<?xml version="1.0"?>'
            f'<worksheet xmlns="{ns}">'
            f"<sheetData>"
            f'<row r="1">'
            f'<c r="A1" t="n"><v>123456789</v></c>'
            f'<c r="B1"><v>98765</v></c>'
            f"</row>"
            f"</sheetData>"
            f"</worksheet>"
        )
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        content = buf.getvalue()

        result = _extract_xlsx(content)
        assert "123456789" in result
        assert "98765" in result

    def test_extract_xlsx_skips_shared_string_refs(self) -> None:
        """Cells with t='s' (shared string reference) should NOT duplicate values.

        The shared string index (e.g. <v>0</v>) is just a lookup index,
        not meaningful text. The actual text comes from sharedStrings.xml.
        """
        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        sheet_xml = (
            f'<?xml version="1.0"?>'
            f'<worksheet xmlns="{ns}">'
            f"<sheetData>"
            f'<row r="1">'
            f'<c r="A1" t="s"><v>0</v></c>'
            f"</row>"
            f"</sheetData>"
            f"</worksheet>"
        )
        shared_strings_xml = (
            f'<?xml version="1.0"?>'
            f'<sst xmlns="{ns}">'
            f"<si><t>Actual Text</t></si>"
            f"</sst>"
        )
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
            zf.writestr("xl/sharedStrings.xml", shared_strings_xml)
        content = buf.getvalue()

        result = _extract_xlsx(content)
        assert "Actual Text" in result
        # The index "0" should NOT appear as extracted text
        # (shared string refs are skipped in sheet processing)
        words = result.split()
        assert "0" not in words

    def test_extract_xlsx_combined_sources(self) -> None:
        """Shared strings + inline strings + cell values all extracted together."""
        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        shared_strings_xml = (
            f'<?xml version="1.0"?>'
            f'<sst xmlns="{ns}">'
            f"<si><t>FromShared</t></si>"
            f"</sst>"
        )
        sheet_xml = (
            f'<?xml version="1.0"?>'
            f'<worksheet xmlns="{ns}">'
            f"<sheetData>"
            f'<row r="1">'
            f'<c r="A1" t="s"><v>0</v></c>'
            f'<c r="B1" t="inlineStr"><is><t>FromInline</t></is></c>'
            f'<c r="C1" t="n"><v>42</v></c>'
            f"</row>"
            f"</sheetData>"
            f"</worksheet>"
        )
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("xl/sharedStrings.xml", shared_strings_xml)
            zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        content = buf.getvalue()

        result = _extract_xlsx(content)
        assert "FromShared" in result
        assert "FromInline" in result
        assert "42" in result


# ── PPTX extraction ──────────────────────────────────────────


class TestExtractPptx:
    def test_extract_pptx(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(
                "ppt/slides/slide1.xml",
                '<?xml version="1.0"?>'
                '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
                ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                "<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r>"
                "<a:t>Slide Title</a:t>"
                "</a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>"
                "</p:sld>",
            )
        content = buf.getvalue()

        result = _extract_pptx(content)
        assert "Slide Title" in result

    def test_extract_pptx_via_filename(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(
                "ppt/slides/slide1.xml",
                '<?xml version="1.0"?>'
                '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
                ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                "<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r>"
                "<a:t>Presentation</a:t>"
                "</a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>"
                "</p:sld>",
            )
        content = buf.getvalue()

        result = _extract_text_from_bytes(content, "deck.pptx")
        assert "Presentation" in result

    def test_extract_pptx_multiple_slides(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            for i in (1, 2):
                zf.writestr(
                    f"ppt/slides/slide{i}.xml",
                    '<?xml version="1.0"?>'
                    '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
                    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                    f"<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r>"
                    f"<a:t>Slide {i}</a:t>"
                    f"</a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>"
                    "</p:sld>",
                )
        content = buf.getvalue()

        result = _extract_pptx(content)
        assert "Slide 1" in result
        assert "Slide 2" in result


# ── Bad ZIP handling ─────────────────────────────────────────


class TestBadZip:
    def test_extract_bad_zip_docx(self) -> None:
        result = _extract_docx(b"this is not a zip file")
        assert result == ""

    def test_extract_bad_zip_xlsx(self) -> None:
        result = _extract_xlsx(b"this is not a zip file")
        assert result == ""

    def test_extract_bad_zip_pptx(self) -> None:
        result = _extract_pptx(b"this is not a zip file")
        assert result == ""

    def test_extract_bad_zip_via_filename(self) -> None:
        result = _extract_text_from_bytes(b"not a zip", "file.docx")
        assert result == ""


# ── _top_classification helper ───────────────────────────────


class TestTopClassification:
    def test_top_classification_with_entities(self) -> None:
        classification = ClassificationResult(
            entities=[
                EntityMatch(entity_type="EMAIL_ADDRESS", confidence=0.7),
                EntityMatch(entity_type="CREDIT_CARD", confidence=0.95),
                EntityMatch(entity_type="US_SSN", confidence=0.85),
            ],
        )
        entity_type, confidence = _top_classification(classification)
        assert entity_type == "CREDIT_CARD"
        assert confidence == 0.95

    def test_top_classification_empty(self) -> None:
        classification = ClassificationResult(entities=[])
        entity_type, confidence = _top_classification(classification)
        assert entity_type is None
        assert confidence is None

    def test_top_classification_none(self) -> None:
        entity_type, confidence = _top_classification(None)
        assert entity_type is None
        assert confidence is None

    def test_top_classification_single_entity(self) -> None:
        classification = ClassificationResult(
            entities=[
                EntityMatch(entity_type="PHONE_NUMBER", confidence=0.6),
            ],
        )
        entity_type, confidence = _top_classification(classification)
        assert entity_type == "PHONE_NUMBER"
        assert confidence == 0.6
