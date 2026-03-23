"""Tests for the content classifier — presidio wrapper with graceful fallback.

These tests don't require presidio to be installed — they verify the
fallback behaviour and the classify_content interface.
"""

import pytest

from app.services.classifier import classify_content, is_available
from app.services.policy_engine import ClassificationResult


class TestClassifyContentFallback:
    """Test classifier behaviour when presidio is NOT installed."""

    def test_empty_text_returns_empty_result(self) -> None:
        result = classify_content("")
        assert isinstance(result, ClassificationResult)
        assert result.entities == []
        assert result.error == ""

    def test_whitespace_only_returns_empty(self) -> None:
        result = classify_content("   \n\t  ")
        assert result.entities == []
        assert result.error == ""

    def test_filename_preserved_in_result(self) -> None:
        result = classify_content("", filename="report.xlsx")
        assert result.filename == "report.xlsx"

    def test_returns_error_when_presidio_missing(self) -> None:
        """If presidio is not installed, classify_content returns an error string."""
        result = classify_content("John Smith SSN 123-45-6789", filename="test.txt")
        # Either presidio is installed and entities are found,
        # or it's not and we get an error
        if not is_available():
            assert result.error == "presidio-analyzer not installed"
            assert result.entities == []
        else:
            # Presidio is available — should find something
            assert result.error == ""
            assert len(result.entities) > 0


class TestIsAvailable:
    def test_returns_bool(self) -> None:
        result = is_available()
        assert isinstance(result, bool)


class TestClassificationResultModel:
    def test_default_values(self) -> None:
        cr = ClassificationResult()
        assert cr.filename == ""
        assert cr.entities == []
        assert cr.error == ""

    def test_with_entities(self) -> None:
        from app.services.policy_engine import EntityMatch

        cr = ClassificationResult(
            filename="test.docx",
            entities=[
                EntityMatch(entity_type="CREDIT_CARD", confidence=0.95, start=10, end=25),
            ],
        )
        assert len(cr.entities) == 1
        assert cr.entities[0].entity_type == "CREDIT_CARD"
        assert cr.entities[0].confidence == 0.95

    def test_entity_types_deduplicates(self) -> None:
        from app.services.policy_engine import EntityMatch

        cr = ClassificationResult(entities=[
            EntityMatch(entity_type="EMAIL_ADDRESS", confidence=0.8),
            EntityMatch(entity_type="EMAIL_ADDRESS", confidence=0.9),
            EntityMatch(entity_type="PHONE_NUMBER", confidence=0.7),
        ])
        assert cr.entity_types == {"EMAIL_ADDRESS", "PHONE_NUMBER"}


class TestTextContentPopulation:
    """Verify that classify_content populates text_content on the result."""

    def test_text_content_populated(self) -> None:
        result = classify_content("some text")
        assert result.text_content == "some text"

    def test_text_content_when_empty(self) -> None:
        result = classify_content("")
        assert result.text_content == ""

    def test_text_content_when_no_presidio(self) -> None:
        """text_content should be set regardless of presidio availability."""
        result = classify_content("SSN 123-45-6789", filename="data.txt")
        # Whether presidio is installed or not, text_content must be populated
        assert result.text_content == "SSN 123-45-6789"

    def test_text_content_preserves_original(self) -> None:
        original = "Multi\nline\ntext with special chars: @#$%"
        result = classify_content(original)
        assert result.text_content == original
