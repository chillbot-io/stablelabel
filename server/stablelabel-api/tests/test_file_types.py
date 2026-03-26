"""Tests for file type allowlist — the first line of defense."""

from app.core.file_types import is_legacy_office, is_supported


class TestIsSupported:
    def test_modern_word(self) -> None:
        assert is_supported("report.docx")
        assert is_supported("TEMPLATE.DOTM")

    def test_modern_excel(self) -> None:
        assert is_supported("data.xlsx")
        assert is_supported("binary.xlsb")

    def test_modern_powerpoint(self) -> None:
        assert is_supported("deck.pptx")
        assert is_supported("show.ppsx")

    def test_pdf(self) -> None:
        assert is_supported("document.pdf")
        assert is_supported("SCAN.PDF")

    def test_legacy_rejected(self) -> None:
        assert not is_supported("old.doc")
        assert not is_supported("old.xls")
        assert not is_supported("old.ppt")

    def test_non_office_rejected(self) -> None:
        assert not is_supported("data.csv")
        assert not is_supported("readme.txt")
        assert not is_supported("photo.png")
        assert not is_supported("archive.zip")
        assert not is_supported("email.msg")

    def test_no_extension(self) -> None:
        assert not is_supported("Makefile")

    def test_case_insensitive(self) -> None:
        assert is_supported("Report.DOCX")
        assert is_supported("DATA.Xlsx")


class TestIsLegacyOffice:
    def test_detects_legacy(self) -> None:
        assert is_legacy_office("old.doc")
        assert is_legacy_office("old.xls")
        assert is_legacy_office("old.ppt")

    def test_modern_not_legacy(self) -> None:
        assert not is_legacy_office("report.docx")

    def test_csv_not_legacy(self) -> None:
        assert not is_legacy_office("data.csv")
