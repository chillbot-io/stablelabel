"""Tests for the policy engine — rule evaluation, priority ordering, match modes."""

import pytest

from app.services.policy_engine import (
    ClassificationResult,
    EntityMatch,
    PolicyMatch,
    PolicyRule,
    evaluate_policies,
    policies_from_db,
)


# ── Fixtures ───────────────────────────────────────────────────


def _rule(
    *,
    policy_id: str = "p1",
    name: str = "Test Policy",
    label_id: str = "label-1",
    priority: int = 10,
    conditions: list | None = None,
    match_mode: str = "any",
) -> PolicyRule:
    return PolicyRule(
        policy_id=policy_id,
        policy_name=name,
        target_label_id=label_id,
        priority=priority,
        conditions=conditions or [],
        match_mode=match_mode,
    )


def _entity(entity_type: str, confidence: float = 0.9) -> EntityMatch:
    return EntityMatch(entity_type=entity_type, confidence=confidence)


def _classification(*entities: EntityMatch, filename: str = "doc.docx") -> ClassificationResult:
    return ClassificationResult(filename=filename, entities=list(entities))


# ── Entity detection condition tests ──────────────────────────


class TestEntityDetectionCondition:
    def test_matches_when_entity_found(self) -> None:
        policy = _rule(conditions=[{
            "type": "entity_detected",
            "entity_types": ["CREDIT_CARD"],
            "min_confidence": 0.8,
            "min_count": 1,
        }])
        classification = _classification(_entity("CREDIT_CARD", 0.95))

        result = evaluate_policies([policy], classification)
        assert result is not None
        assert result.target_label_id == "label-1"

    def test_rejects_low_confidence(self) -> None:
        policy = _rule(conditions=[{
            "type": "entity_detected",
            "entity_types": ["US_SSN"],
            "min_confidence": 0.8,
            "min_count": 1,
        }])
        classification = _classification(_entity("US_SSN", 0.3))

        result = evaluate_policies([policy], classification)
        assert result is None

    def test_requires_min_count(self) -> None:
        policy = _rule(conditions=[{
            "type": "entity_detected",
            "entity_types": ["CREDIT_CARD"],
            "min_confidence": 0.5,
            "min_count": 3,
        }])
        # Only 2 matches
        classification = _classification(
            _entity("CREDIT_CARD", 0.9),
            _entity("CREDIT_CARD", 0.8),
        )

        result = evaluate_policies([policy], classification)
        assert result is None

    def test_meets_min_count(self) -> None:
        policy = _rule(conditions=[{
            "type": "entity_detected",
            "entity_types": ["CREDIT_CARD"],
            "min_confidence": 0.5,
            "min_count": 2,
        }])
        classification = _classification(
            _entity("CREDIT_CARD", 0.9),
            _entity("CREDIT_CARD", 0.8),
        )

        result = evaluate_policies([policy], classification)
        assert result is not None

    def test_matches_any_of_listed_entity_types(self) -> None:
        policy = _rule(conditions=[{
            "type": "entity_detected",
            "entity_types": ["CREDIT_CARD", "US_SSN", "IBAN_CODE"],
            "min_confidence": 0.7,
            "min_count": 1,
        }])
        # Only SSN found, not credit card
        classification = _classification(_entity("US_SSN", 0.85))

        result = evaluate_policies([policy], classification)
        assert result is not None

    def test_ignores_unrelated_entities(self) -> None:
        policy = _rule(conditions=[{
            "type": "entity_detected",
            "entity_types": ["CREDIT_CARD"],
            "min_confidence": 0.5,
            "min_count": 1,
        }])
        classification = _classification(_entity("EMAIL_ADDRESS", 0.95))

        result = evaluate_policies([policy], classification)
        assert result is None

    def test_no_entity_types_specified(self) -> None:
        policy = _rule(conditions=[{
            "type": "entity_detected",
            "entity_types": [],
            "min_confidence": 0.5,
        }])
        classification = _classification(_entity("CREDIT_CARD", 0.9))

        result = evaluate_policies([policy], classification)
        assert result is None


# ── File pattern condition tests ──────────────────────────────


class TestFilePatternCondition:
    def test_matches_glob_pattern(self) -> None:
        policy = _rule(conditions=[{
            "type": "file_pattern",
            "patterns": ["*.xlsx"],
        }])
        classification = _classification(filename="financials.xlsx")

        result = evaluate_policies([policy], classification, filename="financials.xlsx")
        assert result is not None

    def test_case_insensitive_match(self) -> None:
        policy = _rule(conditions=[{
            "type": "file_pattern",
            "patterns": ["*.DOCX"],
        }])

        result = evaluate_policies([policy], _classification(), filename="Report.docx")
        assert result is not None

    def test_no_match(self) -> None:
        policy = _rule(conditions=[{
            "type": "file_pattern",
            "patterns": ["*.xlsx"],
        }])

        result = evaluate_policies([policy], _classification(), filename="photo.jpg")
        assert result is None

    def test_wildcard_prefix_pattern(self) -> None:
        policy = _rule(conditions=[{
            "type": "file_pattern",
            "patterns": ["financial*"],
        }])

        result = evaluate_policies([policy], _classification(), filename="financial-report.xlsx")
        assert result is not None

    def test_no_patterns(self) -> None:
        policy = _rule(conditions=[{
            "type": "file_pattern",
            "patterns": [],
        }])

        result = evaluate_policies([policy], _classification(), filename="test.docx")
        assert result is None


# ── Match mode tests ──────────────────────────────────────────


class TestMatchMode:
    def test_any_mode_passes_with_one_match(self) -> None:
        """In 'any' mode, a single matching condition is enough."""
        policy = _rule(
            match_mode="any",
            conditions=[
                {"type": "entity_detected", "entity_types": ["CREDIT_CARD"], "min_confidence": 0.8},
                {"type": "file_pattern", "patterns": ["*.pdf"]},
            ],
        )
        # Only entity matches, not file pattern
        classification = _classification(_entity("CREDIT_CARD", 0.95), filename="data.xlsx")

        result = evaluate_policies([policy], classification, filename="data.xlsx")
        assert result is not None

    def test_all_mode_requires_every_condition(self) -> None:
        """In 'all' mode, every condition must match."""
        policy = _rule(
            match_mode="all",
            conditions=[
                {"type": "entity_detected", "entity_types": ["CREDIT_CARD"], "min_confidence": 0.8},
                {"type": "file_pattern", "patterns": ["*.xlsx"]},
            ],
        )
        # Entity matches but file pattern doesn't
        classification = _classification(_entity("CREDIT_CARD", 0.95), filename="data.pdf")

        result = evaluate_policies([policy], classification, filename="data.pdf")
        assert result is None

    def test_all_mode_passes_when_everything_matches(self) -> None:
        policy = _rule(
            match_mode="all",
            conditions=[
                {"type": "entity_detected", "entity_types": ["CREDIT_CARD"], "min_confidence": 0.8},
                {"type": "file_pattern", "patterns": ["*.xlsx"]},
            ],
        )
        classification = _classification(_entity("CREDIT_CARD", 0.95), filename="data.xlsx")

        result = evaluate_policies([policy], classification, filename="data.xlsx")
        assert result is not None


# ── Priority ordering tests ───────────────────────────────────


class TestPriorityOrdering:
    def test_highest_priority_wins(self) -> None:
        low = _rule(policy_id="low", label_id="general", priority=1, conditions=[
            {"type": "entity_detected", "entity_types": ["EMAIL_ADDRESS"], "min_confidence": 0.5},
        ])
        high = _rule(policy_id="high", label_id="confidential", priority=10, conditions=[
            {"type": "entity_detected", "entity_types": ["EMAIL_ADDRESS"], "min_confidence": 0.5},
        ])
        classification = _classification(_entity("EMAIL_ADDRESS", 0.9))

        result = evaluate_policies([low, high], classification)
        assert result is not None
        assert result.target_label_id == "confidential"
        assert result.policy_id == "high"

    def test_only_matching_policies_considered(self) -> None:
        """A high-priority policy that doesn't match shouldn't win."""
        high_no_match = _rule(policy_id="high", label_id="top-secret", priority=100, conditions=[
            {"type": "entity_detected", "entity_types": ["CREDIT_CARD"], "min_confidence": 0.8},
        ])
        low_matches = _rule(policy_id="low", label_id="general", priority=1, conditions=[
            {"type": "entity_detected", "entity_types": ["EMAIL_ADDRESS"], "min_confidence": 0.5},
        ])
        classification = _classification(_entity("EMAIL_ADDRESS", 0.9))

        result = evaluate_policies([high_no_match, low_matches], classification)
        assert result is not None
        assert result.target_label_id == "general"


# ── No-label condition tests ─────────────────────────────────


class TestNoLabelCondition:
    def test_no_label_always_matches(self) -> None:
        policy = _rule(conditions=[{"type": "no_label"}])
        classification = _classification()

        result = evaluate_policies([policy], classification)
        assert result is not None


# ── Empty / edge cases ────────────────────────────────────────


class TestEdgeCases:
    def test_no_policies_returns_none(self) -> None:
        result = evaluate_policies([], _classification())
        assert result is None

    def test_empty_conditions_returns_none(self) -> None:
        policy = _rule(conditions=[])
        result = evaluate_policies([policy], _classification())
        assert result is None

    def test_unknown_condition_type_skipped(self) -> None:
        policy = _rule(conditions=[{"type": "future_condition_v2"}])
        result = evaluate_policies([policy], _classification())
        assert result is None

    def test_empty_classification(self) -> None:
        policy = _rule(conditions=[{
            "type": "entity_detected",
            "entity_types": ["CREDIT_CARD"],
            "min_confidence": 0.5,
        }])
        result = evaluate_policies([policy], ClassificationResult())
        assert result is None


# ── policies_from_db helper ───────────────────────────────────


class TestPoliciesFromDb:
    def test_filters_disabled(self) -> None:
        class FakePolicy:
            id = "p1"
            name = "Test"
            target_label_id = "label-1"
            priority = 5
            is_enabled = False
            rules = {"conditions": [{"type": "no_label"}]}

        result = policies_from_db([FakePolicy()])
        assert len(result) == 0

    def test_sorts_by_priority_desc(self) -> None:
        class P:
            def __init__(self, pid: str, priority: int):
                self.id = pid
                self.name = pid
                self.target_label_id = "l"
                self.priority = priority
                self.is_enabled = True
                self.rules = {"conditions": [{"type": "no_label"}], "match_mode": "any"}

        result = policies_from_db([P("low", 1), P("high", 10), P("mid", 5)])
        assert [r.policy_id for r in result] == ["high", "mid", "low"]

    def test_extracts_match_mode(self) -> None:
        class FakePolicy:
            id = "p1"
            name = "Test"
            target_label_id = "label-1"
            priority = 5
            is_enabled = True
            rules = {"conditions": [], "match_mode": "all"}

        result = policies_from_db([FakePolicy()])
        assert result[0].match_mode == "all"


# ── ClassificationResult model tests ─────────────────────────


class TestClassificationResult:
    def test_entity_types_property(self) -> None:
        cr = _classification(
            _entity("CREDIT_CARD"),
            _entity("US_SSN"),
            _entity("CREDIT_CARD"),
        )
        assert cr.entity_types == {"CREDIT_CARD", "US_SSN"}

    def test_empty_entity_types(self) -> None:
        cr = ClassificationResult()
        assert cr.entity_types == set()

    def test_text_content_field(self) -> None:
        cr = ClassificationResult(text_content="hello world")
        assert cr.text_content == "hello world"


# ── Keyword match condition tests ─────────────────────────────


class TestKeywordMatchCondition:
    """Tests for the keyword_match condition type."""

    def test_matches_keyword_in_text(self) -> None:
        policy = _rule(conditions=[{
            "type": "keyword_match",
            "keywords": ["confidential"],
            "case_sensitive": False,
            "min_count": 1,
        }])
        classification = ClassificationResult(
            text_content="This document is confidential and private.",
        )
        result = evaluate_policies([policy], classification)
        assert result is not None
        assert result.target_label_id == "label-1"

    def test_case_insensitive_by_default(self) -> None:
        policy = _rule(conditions=[{
            "type": "keyword_match",
            "keywords": ["confidential"],
            "min_count": 1,
        }])
        classification = ClassificationResult(
            text_content="This is CONFIDENTIAL data.",
        )
        result = evaluate_policies([policy], classification)
        assert result is not None

    def test_case_sensitive_mode(self) -> None:
        policy = _rule(conditions=[{
            "type": "keyword_match",
            "keywords": ["Confidential"],
            "case_sensitive": True,
            "min_count": 1,
        }])
        classification = ClassificationResult(
            text_content="This is CONFIDENTIAL data.",
        )
        result = evaluate_policies([policy], classification)
        assert result is None

    def test_min_count_check(self) -> None:
        policy = _rule(conditions=[{
            "type": "keyword_match",
            "keywords": ["secret"],
            "case_sensitive": False,
            "min_count": 3,
        }])
        # Only 2 occurrences
        classification = ClassificationResult(
            text_content="secret plans and secret operations",
        )
        result = evaluate_policies([policy], classification)
        assert result is None

    def test_min_count_met(self) -> None:
        policy = _rule(conditions=[{
            "type": "keyword_match",
            "keywords": ["secret"],
            "case_sensitive": False,
            "min_count": 2,
        }])
        classification = ClassificationResult(
            text_content="secret plans and secret operations",
        )
        result = evaluate_policies([policy], classification)
        assert result is not None

    def test_no_text_content_returns_false(self) -> None:
        policy = _rule(conditions=[{
            "type": "keyword_match",
            "keywords": ["confidential"],
            "min_count": 1,
        }])
        classification = ClassificationResult(text_content="")
        result = evaluate_policies([policy], classification)
        assert result is None

    def test_no_keywords_returns_false(self) -> None:
        policy = _rule(conditions=[{
            "type": "keyword_match",
            "keywords": [],
            "min_count": 1,
        }])
        classification = ClassificationResult(
            text_content="This has some text.",
        )
        result = evaluate_policies([policy], classification)
        assert result is None


# ── Regex match condition tests ───────────────────────────────


class TestRegexMatchCondition:
    """Tests for the regex_match condition type."""

    def test_matches_regex_pattern(self) -> None:
        policy = _rule(conditions=[{
            "type": "regex_match",
            "patterns": [r"\b\d{3}-\d{2}-\d{4}\b"],
            "min_count": 1,
        }])
        classification = ClassificationResult(
            text_content="SSN: 123-45-6789 found in document.",
        )
        result = evaluate_policies([policy], classification)
        assert result is not None

    def test_multiple_patterns_any_match(self) -> None:
        policy = _rule(conditions=[{
            "type": "regex_match",
            "patterns": [
                r"\b\d{3}-\d{2}-\d{4}\b",  # SSN pattern
                r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16}\b",  # IBAN-ish
            ],
            "min_count": 1,
        }])
        # Only SSN pattern matches
        classification = ClassificationResult(
            text_content="SSN: 123-45-6789 is here.",
        )
        result = evaluate_policies([policy], classification)
        assert result is not None

    def test_min_count_check(self) -> None:
        policy = _rule(conditions=[{
            "type": "regex_match",
            "patterns": [r"\b\d{3}-\d{2}-\d{4}\b"],
            "min_count": 3,
        }])
        # Only 2 SSN matches
        classification = ClassificationResult(
            text_content="SSN: 123-45-6789 and 987-65-4321",
        )
        result = evaluate_policies([policy], classification)
        assert result is None

    def test_invalid_regex_skipped(self) -> None:
        policy = _rule(conditions=[{
            "type": "regex_match",
            "patterns": [
                r"[invalid(",        # bad regex — should be skipped
                r"\b\d{3}-\d{2}-\d{4}\b",  # valid SSN pattern
            ],
            "min_count": 1,
        }])
        classification = ClassificationResult(
            text_content="SSN: 123-45-6789 is here.",
        )
        # Should succeed because the valid pattern still matches
        result = evaluate_policies([policy], classification)
        assert result is not None

    def test_no_text_content_returns_false(self) -> None:
        policy = _rule(conditions=[{
            "type": "regex_match",
            "patterns": [r"\b\d{3}-\d{2}-\d{4}\b"],
            "min_count": 1,
        }])
        classification = ClassificationResult(text_content="")
        result = evaluate_policies([policy], classification)
        assert result is None

    def test_all_invalid_regex_returns_none(self) -> None:
        """When every regex pattern is invalid, the condition should not match."""
        policy = _rule(conditions=[{
            "type": "regex_match",
            "patterns": ["[invalid(", "(unclosed"],
            "min_count": 1,
        }])
        classification = ClassificationResult(
            text_content="This text has some content.",
        )
        result = evaluate_policies([policy], classification)
        assert result is None


# ── Edge case tests ──────────────────────────────────────────


class TestEdgeCases:
    """Edge cases for policy evaluation."""

    def test_overlapping_entity_detections(self) -> None:
        """Multiple entities at the same position should each count independently."""
        policy = _rule(conditions=[{
            "type": "entity_detected",
            "entity_types": ["US_SSN", "PHONE_NUMBER"],
            "min_confidence": 0.5,
            "min_count": 2,
        }])
        classification = ClassificationResult(
            entities=[
                _entity("US_SSN", 0.9),
                _entity("PHONE_NUMBER", 0.8),
            ],
        )
        result = evaluate_policies([policy], classification)
        assert result is not None
        assert result.target_label_id == "label-1"

    def test_none_text_content_rejected_by_model(self) -> None:
        """ClassificationResult should reject None text_content at construction."""
        from pydantic import ValidationError
        with pytest.raises(ValidationError, match="text_content"):
            ClassificationResult(text_content=None)

    def test_empty_conditions_no_match(self) -> None:
        """Policy with empty conditions list should not match anything."""
        policy = _rule(conditions=[])
        classification = ClassificationResult(
            entities=[_entity("US_SSN", 0.9)],
            text_content="some text",
        )
        result = evaluate_policies([policy], classification)
        assert result is None

    def test_unknown_condition_type_ignored(self) -> None:
        """Unknown condition types should be skipped gracefully."""
        policy = _rule(conditions=[{
            "type": "nonexistent_type",
            "foo": "bar",
        }])
        classification = ClassificationResult(text_content="some text")
        result = evaluate_policies([policy], classification)
        assert result is None
