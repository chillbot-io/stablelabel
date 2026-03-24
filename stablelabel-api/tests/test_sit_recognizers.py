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
        # SSN at start, "patient" far away (spaces needed for \b word boundaries)
        text = "123-45-6789 " + (" " * 500) + "patient"
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


# ── _build_regex_recognizer direct tests ──────────────────────


@pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
class TestBuildRegexRecognizer:
    """Direct tests for the _build_regex_recognizer helper."""

    def test_valid_patterns_build_recognizer(self) -> None:
        from presidio_analyzer import PatternRecognizer
        from app.services.sit_recognizers import _build_regex_recognizer

        rec = _build_regex_recognizer(
            entity_type="SIT_TEST",
            name="test_rec",
            primary_patterns=[r"\bFOO\d+\b"],
            base_score=0.8,
            context_words=["bar"],
            language="en",
        )
        assert rec is not None
        assert isinstance(rec, PatternRecognizer)
        assert rec.supported_entities == ["SIT_TEST"]
        assert rec.context == ["bar"]

    def test_empty_patterns_returns_none(self) -> None:
        from app.services.sit_recognizers import _build_regex_recognizer

        rec = _build_regex_recognizer(
            entity_type="SIT_TEST",
            name="test_rec",
            primary_patterns=[],
            base_score=0.8,
            context_words=[],
            language="en",
        )
        assert rec is None

    def test_all_invalid_patterns_returns_none(self) -> None:
        from app.services.sit_recognizers import _build_regex_recognizer

        rec = _build_regex_recognizer(
            entity_type="SIT_TEST",
            name="test_rec",
            primary_patterns=["[invalid(", "(unclosed"],
            base_score=0.8,
            context_words=[],
            language="en",
        )
        assert rec is None

    def test_mixed_valid_invalid_patterns(self) -> None:
        from presidio_analyzer import PatternRecognizer
        from app.services.sit_recognizers import _build_regex_recognizer

        rec = _build_regex_recognizer(
            entity_type="SIT_TEST",
            name="test_rec",
            primary_patterns=["[invalid(", r"\bOK\d+\b"],
            base_score=0.7,
            context_words=[],
            language="en",
        )
        assert rec is not None
        assert isinstance(rec, PatternRecognizer)
        # Only the valid pattern should be present
        assert len(rec.patterns) == 1

    def test_no_context_words_sets_none(self) -> None:
        from app.services.sit_recognizers import _build_regex_recognizer

        rec = _build_regex_recognizer(
            entity_type="SIT_TEST",
            name="test_rec",
            primary_patterns=[r"\bX\b"],
            base_score=0.5,
            context_words=[],
            language="en",
        )
        assert rec is not None
        assert rec.context is None

    def test_multiple_valid_patterns(self) -> None:
        from app.services.sit_recognizers import _build_regex_recognizer

        rec = _build_regex_recognizer(
            entity_type="SIT_TEST",
            name="test_rec",
            primary_patterns=[r"\bA\d+\b", r"\bB\d+\b", r"\bC\d+\b"],
            base_score=0.9,
            context_words=["kw1", "kw2"],
            language="en",
        )
        assert rec is not None
        assert len(rec.patterns) == 3


# ── _build_composite_recognizer direct tests ──────────────────


@pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
class TestBuildCompositeRecognizer:
    """Direct tests for the _build_composite_recognizer helper."""

    def test_known_entity_types_build_recognizer(self) -> None:
        from app.services.sit_recognizers import _build_composite_recognizer, CompositeSitRecognizer

        rec = _build_composite_recognizer(
            entity_type="SIT_TEST",
            name="test_comp",
            entity_types=["US_SSN"],
            min_confidence=0.5,
            min_count=1,
            base_score=0.85,
            context_words=["patient"],
            evidence_regex=[],
            min_evidence_matches=1,
            proximity=300,
            language="en",
        )
        assert rec is not None
        assert isinstance(rec, CompositeSitRecognizer)
        assert rec.supported_entities == ["SIT_TEST"]

    def test_unknown_entity_type_returns_none(self) -> None:
        from app.services.sit_recognizers import _build_composite_recognizer

        rec = _build_composite_recognizer(
            entity_type="SIT_TEST",
            name="test_comp",
            entity_types=["COMPLETELY_UNKNOWN_TYPE"],
            min_confidence=0.5,
            min_count=1,
            base_score=0.85,
            context_words=[],
            evidence_regex=[],
            min_evidence_matches=0,
            proximity=300,
            language="en",
        )
        assert rec is None

    def test_multiple_entity_types_combines_patterns(self) -> None:
        from app.services.sit_recognizers import _build_composite_recognizer

        rec = _build_composite_recognizer(
            entity_type="SIT_MULTI",
            name="test_multi",
            entity_types=["US_SSN", "EMAIL_ADDRESS"],
            min_confidence=0.5,
            min_count=1,
            base_score=0.8,
            context_words=[],
            evidence_regex=[],
            min_evidence_matches=0,
            proximity=300,
            language="en",
        )
        assert rec is not None
        # Should have patterns from both entity types
        expected_count = len(ENTITY_PATTERNS["US_SSN"]) + len(ENTITY_PATTERNS["EMAIL_ADDRESS"])
        assert len(rec._primary_compiled) == expected_count

    def test_empty_entity_types_returns_none(self) -> None:
        from app.services.sit_recognizers import _build_composite_recognizer

        rec = _build_composite_recognizer(
            entity_type="SIT_TEST",
            name="test_comp",
            entity_types=[],
            min_confidence=0.5,
            min_count=1,
            base_score=0.85,
            context_words=[],
            evidence_regex=[],
            min_evidence_matches=0,
            proximity=300,
            language="en",
        )
        assert rec is None


# ── CompositeSitRecognizer __init__ and load edge cases ───────


@pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
class TestCompositeSitRecognizerInit:
    """Test __init__, load, and edge cases of CompositeSitRecognizer."""

    def test_invalid_primary_pattern_skipped(self) -> None:
        from app.services.sit_recognizers import CompositeSitRecognizer

        rec = CompositeSitRecognizer(
            supported_entity="SIT_TEST",
            name="test",
            primary_patterns=["[invalid(", r"\b\d{3}-\d{2}-\d{4}\b"],
            base_score=0.8,
        )
        # Only the valid pattern should be compiled
        assert len(rec._primary_compiled) == 1

    def test_invalid_evidence_regex_skipped(self) -> None:
        from app.services.sit_recognizers import CompositeSitRecognizer

        rec = CompositeSitRecognizer(
            supported_entity="SIT_TEST",
            name="test",
            primary_patterns=[r"\btest\b"],
            evidence_regex=["[bad(", r"\bgood\b"],
            min_evidence_matches=1,
            base_score=0.8,
        )
        assert len(rec._evidence_regex_compiled) == 1

    def test_load_is_noop(self) -> None:
        from app.services.sit_recognizers import CompositeSitRecognizer

        rec = CompositeSitRecognizer(
            supported_entity="SIT_TEST",
            name="test",
            primary_patterns=[r"\btest\b"],
        )
        # load() should not raise
        rec.load()

    def test_no_evidence_required_flag(self) -> None:
        from app.services.sit_recognizers import CompositeSitRecognizer

        rec = CompositeSitRecognizer(
            supported_entity="SIT_TEST",
            name="test",
            primary_patterns=[r"\btest\b"],
            min_evidence_matches=0,
        )
        assert rec._no_evidence_required is True

        rec2 = CompositeSitRecognizer(
            supported_entity="SIT_TEST",
            name="test2",
            primary_patterns=[r"\btest\b"],
            min_evidence_matches=2,
        )
        assert rec2._no_evidence_required is False

    def test_context_words_lowercased(self) -> None:
        from app.services.sit_recognizers import CompositeSitRecognizer

        rec = CompositeSitRecognizer(
            supported_entity="SIT_TEST",
            name="test",
            primary_patterns=[r"\btest\b"],
            context_words=["Patient", "DIAGNOSIS", "Ssn"],
        )
        assert rec._context_words == ["patient", "diagnosis", "ssn"]

    def test_all_primary_patterns_invalid(self) -> None:
        from app.services.sit_recognizers import CompositeSitRecognizer

        rec = CompositeSitRecognizer(
            supported_entity="SIT_TEST",
            name="test",
            primary_patterns=["[bad(", "(also_bad"],
            base_score=0.8,
        )
        assert len(rec._primary_compiled) == 0
        # analyze should return empty since no patterns can match
        results = rec.analyze("any text 123-45-6789", ["SIT_TEST"])
        assert results == []


# ── CompositeSitRecognizer.analyze additional edge cases ──────


@pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
class TestCompositeSitRecognizerAnalyzeEdgeCases:
    """Additional edge cases for analyze() method."""

    def _make(self, **kwargs):
        from app.services.sit_recognizers import CompositeSitRecognizer
        defaults = dict(
            supported_entity="SIT_TEST",
            name="test",
            primary_patterns=[r"\b\d{3}-\d{2}-\d{4}\b"],
            base_score=0.85,
        )
        defaults.update(kwargs)
        return CompositeSitRecognizer(**defaults)

    def test_regex_evidence_used_when_keywords_insufficient(self) -> None:
        """When keywords don't meet min_evidence, regex evidence fills the gap."""
        rec = self._make(
            context_words=["nonexistent_keyword"],
            evidence_regex=[r"\b\d{2}/\d{2}/\d{4}\b"],
            min_evidence_matches=2,
        )
        # Has one keyword no-match, one regex match → total 1, needs 2 → reduced
        text = "123-45-6789 DOB: 01/15/1990"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        assert results[0].score < 0.85  # reduced

    def test_keyword_evidence_sufficient_skips_regex(self) -> None:
        """When keywords meet min_evidence, regex checking is skipped."""
        rec = self._make(
            context_words=["patient", "diagnosis"],
            evidence_regex=[r"\b\d{2}/\d{2}/\d{4}\b"],
            min_evidence_matches=1,
        )
        text = "patient 123-45-6789"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        assert results[0].score == 0.85

    def test_combined_keyword_and_regex_evidence(self) -> None:
        """Keywords + regex together meet min_evidence threshold."""
        rec = self._make(
            context_words=["patient"],
            evidence_regex=[r"\bMRN\d+\b"],
            min_evidence_matches=2,
        )
        text = "patient 123-45-6789 MRN12345"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        assert results[0].score == 0.85

    def test_reduced_score_floor_at_0_1(self) -> None:
        """Reduced score should not go below 0.1."""
        rec = self._make(
            base_score=0.2,
            context_words=["nonexistent"],
            min_evidence_matches=1,
        )
        text = "123-45-6789"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        # max(0.1, 0.2 - 0.3) == 0.1
        assert results[0].score == pytest.approx(0.1)

    def test_multiple_matches_with_evidence(self) -> None:
        """Multiple primary matches each independently checked for evidence."""
        rec = self._make(
            context_words=["patient"],
            min_evidence_matches=1,
            proximity=20,
        )
        # First SSN has "patient" nearby, second does not
        text = "patient 123-45-6789" + (" " * 500) + "987-65-4321"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 2
        scores = sorted([r.score for r in results])
        # One full, one reduced
        assert scores[0] < 0.85
        assert scores[1] == 0.85

    def test_analyze_positions_correct(self) -> None:
        """Verify start/end positions in results are accurate."""
        rec = self._make(min_evidence_matches=0)
        text = "prefix 123-45-6789 suffix"
        results = rec.analyze(text, ["SIT_TEST"])
        assert len(results) == 1
        assert text[results[0].start:results[0].end] == "123-45-6789"


# ── SitRecognizerFactory.compile additional coverage ──────────


@pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
class TestSitRecognizerFactoryCompileDetails:
    """Additional compile tests for thorough coverage of the compilation loop."""

    def test_entity_primary_with_evidence_regex(self) -> None:
        """Entity-primary with regex evidence passes evidence_regex through."""
        from app.services.sit_recognizers import CompositeSitRecognizer

        rules = {
            "patterns": [{
                "confidence_level": 80,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["US_SSN"],
                    "min_confidence": 0.7,
                    "min_count": 1,
                },
                "corroborative_evidence": {
                    "min_matches": 1,
                    "matches": [
                        {"type": "inline_regex", "patterns": [r"\bMRN\d+\b"]},
                    ],
                },
                "proximity": 200,
            }],
        }
        recognizers = SitRecognizerFactory.compile("MEDICAL", rules)
        assert len(recognizers) == 1
        rec = recognizers[0]
        assert isinstance(rec, CompositeSitRecognizer)
        assert len(rec._evidence_regex_compiled) == 1

    def test_entity_primary_no_evidence(self) -> None:
        """Entity-primary with no corroborative evidence (evidence is None)."""
        from app.services.sit_recognizers import CompositeSitRecognizer

        rules = {
            "patterns": [{
                "confidence_level": 70,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["EMAIL_ADDRESS"],
                    "min_count": 1,
                },
            }],
        }
        recognizers = SitRecognizerFactory.compile("EMAIL_SIT", rules)
        assert len(recognizers) == 1
        rec = recognizers[0]
        assert isinstance(rec, CompositeSitRecognizer)
        assert rec._no_evidence_required is True

    def test_unknown_primary_type_skipped(self) -> None:
        """A pattern with an unknown primary_match type is silently skipped."""
        rules = {
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "unknown_type",
                },
            }],
        }
        recognizers = SitRecognizerFactory.compile("SKIP", rules)
        assert recognizers == []

    def test_regex_primary_all_invalid_returns_empty(self) -> None:
        """Regex-primary where all patterns are invalid produces no recognizer."""
        rules = {
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "regex",
                    "patterns": ["[bad("],
                },
            }],
        }
        recognizers = SitRecognizerFactory.compile("INVALID_ALL", rules)
        assert recognizers == []

    def test_multi_pattern_naming_suffixes(self) -> None:
        """When multiple patterns exist, recognizer names get _cNN suffixes."""
        rules = {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {"type": "regex", "patterns": [r"\bA\d+\b"]},
                },
                {
                    "confidence_level": 65,
                    "primary_match": {"type": "regex", "patterns": [r"\bB\d+\b"]},
                },
            ],
        }
        recognizers = SitRecognizerFactory.compile("MULTI", rules)
        assert len(recognizers) == 2
        names = [r.name for r in recognizers]
        assert "SIT_MULTI_c85" in names
        assert "SIT_MULTI_c65" in names

    def test_single_pattern_no_suffix(self) -> None:
        """When only one pattern exists, recognizer name has no suffix."""
        rules = {
            "patterns": [{
                "confidence_level": 85,
                "primary_match": {"type": "regex", "patterns": [r"\bX\d+\b"]},
            }],
        }
        recognizers = SitRecognizerFactory.compile("SINGLE", rules)
        assert len(recognizers) == 1
        assert recognizers[0].name == "SIT_SINGLE"

    def test_compile_default_values(self) -> None:
        """Test that default confidence, proximity etc. are applied."""
        from app.services.sit_recognizers import CompositeSitRecognizer

        rules = {
            "patterns": [{
                # No confidence_level → defaults to 75
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["US_SSN"],
                    # No min_confidence → defaults to 0.5
                    # No min_count → defaults to 1
                },
                # No proximity → defaults to 300
            }],
        }
        recognizers = SitRecognizerFactory.compile("DEFAULTS", rules)
        assert len(recognizers) == 1
        rec = recognizers[0]
        assert isinstance(rec, CompositeSitRecognizer)
        assert rec._base_score == 0.75
        assert rec._proximity == 300

    def test_compile_with_language(self) -> None:
        """Test that language parameter is passed through."""
        rules = {
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {"type": "regex", "patterns": [r"\btest\b"]},
            }],
        }
        recognizers = SitRecognizerFactory.compile("LANG", rules, language="de")
        assert len(recognizers) == 1
        assert recognizers[0].supported_language == "de"


# ── register_sit_recognizers edge cases ───────────────────────


@pytest.mark.skipif(not _PRESIDIO_AVAILABLE, reason="presidio not installed")
class TestRegisterSitRecognizersEdgeCases:
    """Edge cases for the register_sit_recognizers function."""

    def test_empty_definitions_list(self) -> None:
        from presidio_analyzer import AnalyzerEngine
        from app.services.sit_recognizers import register_sit_recognizers

        analyzer = AnalyzerEngine()
        result = register_sit_recognizers(analyzer, [])
        assert result == []

    def test_missing_name_skipped(self) -> None:
        from presidio_analyzer import AnalyzerEngine
        from app.services.sit_recognizers import register_sit_recognizers

        analyzer = AnalyzerEngine()
        sit_defs = [{
            "rules": {
                "patterns": [{
                    "confidence_level": 75,
                    "primary_match": {"type": "regex", "patterns": [r"\btest\b"]},
                }],
            },
        }]
        result = register_sit_recognizers(analyzer, sit_defs)
        assert result == []

    def test_missing_patterns_skipped(self) -> None:
        from presidio_analyzer import AnalyzerEngine
        from app.services.sit_recognizers import register_sit_recognizers

        analyzer = AnalyzerEngine()
        sit_defs = [{"name": "TEST", "rules": {}}]
        result = register_sit_recognizers(analyzer, sit_defs)
        assert result == []

    def test_empty_patterns_skipped(self) -> None:
        from presidio_analyzer import AnalyzerEngine
        from app.services.sit_recognizers import register_sit_recognizers

        analyzer = AnalyzerEngine()
        sit_defs = [{"name": "TEST", "rules": {"patterns": []}}]
        result = register_sit_recognizers(analyzer, sit_defs)
        assert result == []

    def test_duplicate_entity_types_not_duplicated(self) -> None:
        from presidio_analyzer import AnalyzerEngine
        from app.services.sit_recognizers import register_sit_recognizers

        analyzer = AnalyzerEngine()
        # Two definitions with same name → same entity_type
        sit_defs = [
            {
                "name": "SAME",
                "rules": {
                    "patterns": [{
                        "confidence_level": 75,
                        "primary_match": {"type": "regex", "patterns": [r"\bA\b"]},
                    }],
                },
            },
            {
                "name": "SAME",
                "rules": {
                    "patterns": [{
                        "confidence_level": 85,
                        "primary_match": {"type": "regex", "patterns": [r"\bB\b"]},
                    }],
                },
            },
        ]
        result = register_sit_recognizers(analyzer, sit_defs)
        assert result == ["SIT_SAME"]  # No duplicates

    def test_mixed_valid_invalid_definitions(self) -> None:
        from presidio_analyzer import AnalyzerEngine
        from app.services.sit_recognizers import register_sit_recognizers

        analyzer = AnalyzerEngine()
        sit_defs = [
            {"name": "", "rules": {"patterns": []}},  # skipped: empty name
            {"rules": {"patterns": []}},  # skipped: no name
            {
                "name": "VALID",
                "rules": {
                    "patterns": [{
                        "confidence_level": 75,
                        "primary_match": {"type": "regex", "patterns": [r"\bVALID\b"]},
                    }],
                },
            },
        ]
        result = register_sit_recognizers(analyzer, sit_defs)
        assert result == ["SIT_VALID"]
