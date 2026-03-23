"""Tests for SIT recognizer compilation and Presidio integration.

These tests verify the SIT→Presidio compilation logic independently
of whether presidio-analyzer is installed. When presidio IS available,
we also test end-to-end detection.
"""

import re

import pytest

from app.services.sit_recognizers import (
    ENTITY_PATTERNS,
    SitRecognizerFactory,
    _collect_context_words,
    _collect_evidence_regex,
    _PRESIDIO_AVAILABLE,
)


# ── Context word extraction ────────────────────────────────────


class TestCollectContextWords:
    def test_keyword_list_ref(self) -> None:
        evidence = {
            "min_matches": 1,
            "matches": [{"type": "keyword_list", "id": "health"}],
        }
        definitions = {
            "health": {
                "type": "keyword_list",
                "keywords": ["patient", "diagnosis"],
            },
        }
        words = _collect_context_words(evidence, definitions)
        assert words == ["patient", "diagnosis"]

    def test_inline_keywords(self) -> None:
        evidence = {
            "min_matches": 1,
            "matches": [{"type": "inline_keyword", "keywords": ["cvv", "expiration"]}],
        }
        words = _collect_context_words(evidence, {})
        assert words == ["cvv", "expiration"]

    def test_multiple_evidence_sources(self) -> None:
        evidence = {
            "min_matches": 1,
            "matches": [
                {"type": "keyword_list", "id": "health"},
                {"type": "inline_keyword", "keywords": ["SSN"]},
            ],
        }
        definitions = {
            "health": {"type": "keyword_list", "keywords": ["patient"]},
        }
        words = _collect_context_words(evidence, definitions)
        assert words == ["patient", "SSN"]

    def test_no_evidence(self) -> None:
        assert _collect_context_words(None, {}) == []

    def test_regex_evidence_ignored(self) -> None:
        evidence = {
            "matches": [{"type": "regex", "id": "date"}],
        }
        words = _collect_context_words(evidence, {"date": {"patterns": [r"\d+"]}})
        assert words == []


class TestCollectEvidenceRegex:
    def test_regex_ref(self) -> None:
        evidence = {
            "matches": [{"type": "regex", "id": "date"}],
        }
        definitions = {
            "date": {"type": "regex", "patterns": [r"\b\d{2}/\d{2}/\d{4}\b"]},
        }
        patterns = _collect_evidence_regex(evidence, definitions)
        assert patterns == [r"\b\d{2}/\d{2}/\d{4}\b"]

    def test_inline_regex(self) -> None:
        evidence = {
            "matches": [{"type": "inline_regex", "patterns": [r"\bMRN\d+\b"]}],
        }
        patterns = _collect_evidence_regex(evidence, {})
        assert patterns == [r"\bMRN\d+\b"]

    def test_no_evidence(self) -> None:
        assert _collect_evidence_regex(None, {}) == []


# ── Entity pattern registry ────────────────────────────────────


class TestEntityPatterns:
    def test_known_entities_have_patterns(self) -> None:
        """All commonly used entity types should have regex patterns."""
        expected = ["US_SSN", "CREDIT_CARD", "EMAIL_ADDRESS", "PHONE_NUMBER", "IBAN_CODE"]
        for entity in expected:
            assert entity in ENTITY_PATTERNS, f"Missing patterns for {entity}"
            assert len(ENTITY_PATTERNS[entity]) > 0

    def test_ssn_pattern_matches(self) -> None:
        pattern = ENTITY_PATTERNS["US_SSN"][0]
        assert re.search(pattern, "SSN: 123-45-6789")
        assert not re.search(pattern, "no ssn here")

    def test_email_pattern_matches(self) -> None:
        pattern = ENTITY_PATTERNS["EMAIL_ADDRESS"][0]
        assert re.search(pattern, "contact user@example.com today")
        assert not re.search(pattern, "no email here")


# ── SIT recognizer factory ─────────────────────────────────────


class TestSitRecognizerFactory:
    def test_empty_patterns_returns_empty(self) -> None:
        result = SitRecognizerFactory.compile("test", {"patterns": []})
        assert result == []

    def test_empty_rules_returns_empty(self) -> None:
        result = SitRecognizerFactory.compile("test", {})
        assert result == []

    @pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
    def test_regex_primary_produces_pattern_recognizer(self) -> None:
        from presidio_analyzer import PatternRecognizer

        rules = {
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "regex",
                    "patterns": [r"\bCUST\d{10}\b"],
                    "min_count": 1,
                },
            }],
        }
        recognizers = SitRecognizerFactory.compile("CUSTOM_ID", rules)
        assert len(recognizers) == 1
        assert isinstance(recognizers[0], PatternRecognizer)
        assert recognizers[0].supported_entities == ["SIT_CUSTOM_ID"]

    @pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
    def test_entity_primary_produces_composite_recognizer(self) -> None:
        from app.services.sit_recognizers import CompositeSitRecognizer

        rules = {
            "patterns": [{
                "confidence_level": 85,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["US_SSN"],
                    "min_confidence": 0.8,
                    "min_count": 1,
                },
                "corroborative_evidence": {
                    "min_matches": 1,
                    "matches": [{"type": "keyword_list", "id": "health"}],
                },
                "proximity": 300,
            }],
            "definitions": {
                "health": {
                    "type": "keyword_list",
                    "keywords": ["patient", "diagnosis"],
                },
            },
        }
        recognizers = SitRecognizerFactory.compile("HIPAA_PHI", rules)
        assert len(recognizers) == 1
        assert isinstance(recognizers[0], CompositeSitRecognizer)
        assert recognizers[0].supported_entities == ["SIT_HIPAA_PHI"]

    @pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
    def test_regex_primary_with_context_words(self) -> None:
        from presidio_analyzer import PatternRecognizer

        rules = {
            "patterns": [{
                "confidence_level": 85,
                "primary_match": {
                    "type": "regex",
                    "patterns": [r"\b\d{3}-\d{2}-\d{4}\b"],
                },
                "corroborative_evidence": {
                    "min_matches": 1,
                    "matches": [{"type": "inline_keyword", "keywords": ["social security", "SSN"]}],
                },
                "proximity": 200,
            }],
        }
        recognizers = SitRecognizerFactory.compile("SSN_WITH_CONTEXT", rules)
        assert len(recognizers) == 1
        rec = recognizers[0]
        assert isinstance(rec, PatternRecognizer)
        assert rec.context == ["social security", "SSN"]

    @pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
    def test_multiple_patterns_produce_multiple_recognizers(self) -> None:
        rules = {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [{"type": "inline_keyword", "keywords": ["patient"]}],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_count": 1,
                    },
                },
            ],
        }
        recognizers = SitRecognizerFactory.compile("HIPAA", rules)
        assert len(recognizers) == 2

    @pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
    def test_entity_type_naming(self) -> None:
        rules = {
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {"type": "regex", "patterns": [r"test"]},
            }],
        }
        recognizers = SitRecognizerFactory.compile("my-hipaa phi", rules)
        assert recognizers[0].supported_entities == ["SIT_MY_HIPAA_PHI"]

    def test_invalid_regex_skipped(self) -> None:
        rules = {
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "regex",
                    "patterns": ["[invalid("],
                },
            }],
        }
        recognizers = SitRecognizerFactory.compile("BAD", rules)
        # Should return empty — the only pattern was invalid
        assert recognizers == []

    def test_unknown_entity_type_returns_empty(self) -> None:
        rules = {
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["TOTALLY_UNKNOWN_ENTITY"],
                    "min_count": 1,
                },
            }],
        }
        recognizers = SitRecognizerFactory.compile("UNKNOWN", rules)
        assert recognizers == []


# ── CompositeSitRecognizer direct tests ────────────────────────


@pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
class TestCompositeSitRecognizer:
    """Direct tests for the composite recognizer's analyze() method."""

    def _make_recognizer(
        self,
        *,
        entity_type: str = "SIT_TEST",
        primary_patterns: list[str] | None = None,
        context_words: list[str] | None = None,
        evidence_regex: list[str] | None = None,
        min_evidence: int = 0,
        proximity: int = 300,
        base_score: float = 0.85,
    ):
        from app.services.sit_recognizers import CompositeSitRecognizer
        return CompositeSitRecognizer(
            supported_entity=entity_type,
            name="test_recognizer",
            primary_patterns=primary_patterns or [r"\b\d{3}-\d{2}-\d{4}\b"],
            base_score=base_score,
            context_words=context_words,
            evidence_regex=evidence_regex,
            min_evidence_matches=min_evidence,
            proximity=proximity,
        )

    def test_primary_match_no_evidence_required(self) -> None:
        rec = self._make_recognizer(min_evidence=0)
        results = rec.analyze("SSN: 123-45-6789", ["SIT_TEST"])
        assert len(results) == 1
        assert results[0].entity_type == "SIT_TEST"
        assert results[0].score == 0.85

    def test_primary_match_with_keyword_evidence(self) -> None:
        rec = self._make_recognizer(
            context_words=["patient", "diagnosis"],
            min_evidence=1,
            proximity=300,
        )
        text = "Patient record: SSN 123-45-6789 diagnosis pending"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        assert results[0].score == 0.85  # full score — evidence found

    def test_primary_match_without_evidence_reduced_score(self) -> None:
        rec = self._make_recognizer(
            context_words=["patient", "diagnosis"],
            min_evidence=1,
            proximity=300,
            base_score=0.85,
        )
        text = "Invoice data: 123-45-6789 total: $500"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        assert results[0].score == 0.55  # reduced: 0.85 - 0.3

    def test_evidence_outside_proximity_reduced(self) -> None:
        rec = self._make_recognizer(
            context_words=["patient"],
            min_evidence=1,
            proximity=20,
        )
        # SSN at start, "patient" far away
        text = "123-45-6789" + ("x" * 500) + "patient"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        assert results[0].score < 0.85  # reduced score

    def test_evidence_within_proximity_full_score(self) -> None:
        rec = self._make_recognizer(
            context_words=["patient"],
            min_evidence=1,
            proximity=50,
        )
        text = "patient SSN: 123-45-6789"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        assert results[0].score == 0.85

    def test_regex_evidence(self) -> None:
        rec = self._make_recognizer(
            evidence_regex=[r"\b\d{2}/\d{2}/\d{4}\b"],
            min_evidence=1,
            proximity=300,
        )
        text = "SSN: 123-45-6789 DOB: 01/15/1990"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        assert results[0].score == 0.85

    def test_no_primary_match_returns_empty(self) -> None:
        rec = self._make_recognizer()
        results = rec.analyze("no sensitive data here", ["SIT_TEST"])
        assert results == []

    def test_entity_not_requested_returns_empty(self) -> None:
        rec = self._make_recognizer()
        results = rec.analyze("SSN: 123-45-6789", ["CREDIT_CARD"])
        assert results == []

    def test_multiple_primary_matches(self) -> None:
        rec = self._make_recognizer(min_evidence=0)
        text = "SSN1: 123-45-6789 and SSN2: 987-65-4321"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 2

    def test_min_count_enforcement(self) -> None:
        from app.services.sit_recognizers import CompositeSitRecognizer
        rec = CompositeSitRecognizer(
            supported_entity="SIT_TEST",
            name="test",
            primary_patterns=[r"\b\d{3}-\d{2}-\d{4}\b"],
            min_count=3,
            base_score=0.85,
        )
        # Only 2 SSN matches — needs 3
        text = "123-45-6789 and 987-65-4321"
        results = rec.analyze(text, ["SIT_TEST"])
        assert results == []


# ── End-to-end with AnalyzerEngine ─────────────────────────────


@pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
class TestEndToEndWithAnalyzer:
    """Test SIT recognizers registered in a real AnalyzerEngine."""

    def test_register_and_scan(self) -> None:
        from presidio_analyzer import AnalyzerEngine

        from app.services.sit_recognizers import register_sit_recognizers

        analyzer = AnalyzerEngine()

        sit_defs = [{
            "name": "HIPAA_PHI",
            "rules": {
                "patterns": [{
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [{"type": "inline_keyword", "keywords": ["patient", "diagnosis"]}],
                    },
                    "proximity": 300,
                }],
            },
        }]

        registered = register_sit_recognizers(analyzer, sit_defs)
        assert "SIT_HIPAA_PHI" in registered

        # Scan text with both raw and SIT entities
        results = analyzer.analyze(
            text="Patient John: SSN 123-45-6789 diagnosis pending",
            entities=["US_SSN", "SIT_HIPAA_PHI"],
            language="en",
        )

        entity_types = {r.entity_type for r in results}
        # Should find both raw US_SSN and composite SIT_HIPAA_PHI
        assert "SIT_HIPAA_PHI" in entity_types

    def test_sit_without_evidence_lower_score(self) -> None:
        from presidio_analyzer import AnalyzerEngine

        from app.services.sit_recognizers import register_sit_recognizers

        analyzer = AnalyzerEngine()

        sit_defs = [{
            "name": "PCI_CHECK",
            "rules": {
                "patterns": [{
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [{"type": "inline_keyword", "keywords": ["cardholder"]}],
                    },
                    "proximity": 100,
                }],
            },
        }]

        register_sit_recognizers(analyzer, sit_defs)

        # No "cardholder" keyword — should get reduced score
        results = analyzer.analyze(
            text="Invoice: SSN 123-45-6789 total $500",
            entities=["SIT_PCI_CHECK"],
            language="en",
        )
        sit_results = [r for r in results if r.entity_type == "SIT_PCI_CHECK"]
        assert len(sit_results) >= 1
        assert sit_results[0].score < 0.85  # reduced because no evidence


# ── Classifier integration ─────────────────────────────────────


class TestClassifierSitIntegration:
    """Test the classifier module's SIT registration helpers."""

    def test_get_all_entity_types_includes_defaults(self) -> None:
        from app.services.classifier import get_all_entity_types, DEFAULT_ENTITIES
        all_types = get_all_entity_types()
        for et in DEFAULT_ENTITIES:
            assert et in all_types

    def test_clear_sit_recognizers(self) -> None:
        from app.services.classifier import clear_sit_recognizers, get_sit_entity_types
        clear_sit_recognizers()
        assert get_sit_entity_types() == []
