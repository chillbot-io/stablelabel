"""Tests for the SIT-aligned policy engine — patterns, proximity, evidence, confidence tiers."""

import pytest

from app.services.policy_engine import (
    ClassificationResult,
    EntityMatch,
    PolicyMatch,
    PolicyRule,
    evaluate_policies,
    policies_from_db,
)


# ── Helpers ────────────────────────────────────────────────────


def _sit_rule(
    *,
    policy_id: str = "p1",
    name: str = "Test SIT Policy",
    label_id: str = "label-1",
    priority: int = 10,
    rules: dict,
) -> PolicyRule:
    """Create a PolicyRule using the new SIT-aligned rules schema."""
    return PolicyRule(
        policy_id=policy_id,
        policy_name=name,
        target_label_id=label_id,
        priority=priority,
        conditions=[],  # empty — SIT uses rules_raw
        rules_raw=rules,
    )


def _entity(entity_type: str, confidence: float = 0.9, start: int = 0, end: int = 10) -> EntityMatch:
    return EntityMatch(entity_type=entity_type, confidence=confidence, start=start, end=end)


def _classification(
    *entities: EntityMatch,
    filename: str = "doc.docx",
    text: str = "",
) -> ClassificationResult:
    return ClassificationResult(filename=filename, entities=list(entities), text_content=text)


# ═══════════════════════════════════════════════════════════════
# Primary match — entity detection
# ═══════════════════════════════════════════════════════════════


class TestSitEntityPrimaryMatch:
    """SIT-aligned: entity as primary match (IdMatch equivalent)."""

    def test_entity_primary_match(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 85,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["CREDIT_CARD"],
                    "min_confidence": 0.8,
                    "min_count": 1,
                },
            }],
        })
        result = evaluate_policies(
            [rule],
            _classification(_entity("CREDIT_CARD", 0.95, start=50, end=66)),
        )
        assert result is not None
        assert result.confidence_level == 85
        assert result.target_label_id == "label-1"

    def test_entity_below_confidence_threshold(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 85,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["US_SSN"],
                    "min_confidence": 0.8,
                    "min_count": 1,
                },
            }],
        })
        result = evaluate_policies(
            [rule],
            _classification(_entity("US_SSN", 0.3)),
        )
        assert result is None

    def test_entity_min_count(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["CREDIT_CARD"],
                    "min_confidence": 0.5,
                    "min_count": 3,
                },
            }],
        })
        # Only 2 matches
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("CREDIT_CARD", 0.9, 0, 16),
                _entity("CREDIT_CARD", 0.8, 50, 66),
            ),
        )
        assert result is None

    def test_multiple_entity_types(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["CREDIT_CARD", "US_SSN"],
                    "min_confidence": 0.7,
                    "min_count": 1,
                },
            }],
        })
        result = evaluate_policies(
            [rule],
            _classification(_entity("US_SSN", 0.85, 10, 21)),
        )
        assert result is not None


# ═══════════════════════════════════════════════════════════════
# Primary match — regex
# ═══════════════════════════════════════════════════════════════


class TestSitRegexPrimaryMatch:
    """SIT-aligned: regex as primary match."""

    def test_regex_primary_match(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "regex",
                    "patterns": [r"\b\d{3}-\d{2}-\d{4}\b"],
                    "min_count": 1,
                },
            }],
        })
        result = evaluate_policies(
            [rule],
            _classification(text="SSN: 123-45-6789 found"),
        )
        assert result is not None

    def test_regex_no_match(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "regex",
                    "patterns": [r"\b\d{3}-\d{2}-\d{4}\b"],
                    "min_count": 1,
                },
            }],
        })
        result = evaluate_policies(
            [rule],
            _classification(text="No sensitive data here"),
        )
        assert result is None


# ═══════════════════════════════════════════════════════════════
# Corroborative evidence with proximity
# ═══════════════════════════════════════════════════════════════


class TestCorroborativeEvidence:
    """SIT-aligned: corroborative evidence (keyword/regex near primary match)."""

    def test_keyword_evidence_within_proximity(self) -> None:
        """Entity detected AND health keyword within 300 chars = HIPAA."""
        rule = _sit_rule(rules={
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
                    "matches": [
                        {"type": "keyword_list", "id": "health_terms"},
                    ],
                },
                "proximity": 300,
            }],
            "definitions": {
                "health_terms": {
                    "type": "keyword_list",
                    "keywords": ["patient", "diagnosis", "medical record"],
                    "case_sensitive": False,
                },
            },
        })
        # SSN at position 20-31, "patient" at position 50-57 — within 300 chars
        text = "Record number: xxx  123-45-6789  the patient was admitted for treatment"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("US_SSN", 0.9, start=20, end=31),
                text=text,
            ),
        )
        assert result is not None
        assert result.confidence_level == 85

    def test_keyword_evidence_outside_proximity(self) -> None:
        """Keyword too far from primary match — should not match high confidence."""
        rule = _sit_rule(rules={
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
                    "matches": [
                        {"type": "keyword_list", "id": "health_terms"},
                    ],
                },
                "proximity": 20,  # very tight proximity
            }],
            "definitions": {
                "health_terms": {
                    "type": "keyword_list",
                    "keywords": ["patient"],
                    "case_sensitive": False,
                },
            },
        })
        # SSN at 0-11, "patient" at 500+ — outside 20-char proximity
        padding = "x" * 500
        text = f"123-45-6789 {padding} the patient was here"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("US_SSN", 0.9, start=0, end=11),
                text=text,
            ),
        )
        assert result is None

    def test_inline_keyword_evidence(self) -> None:
        """Inline keywords (no definition ref) as evidence."""
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["CREDIT_CARD"],
                    "min_confidence": 0.7,
                    "min_count": 1,
                },
                "corroborative_evidence": {
                    "min_matches": 1,
                    "matches": [
                        {
                            "type": "inline_keyword",
                            "keywords": ["expiration", "cvv", "card number"],
                            "case_sensitive": False,
                        },
                    ],
                },
                "proximity": 200,
            }],
        })
        text = "Card number 4111-1111-1111-1111 expiration 12/25"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("CREDIT_CARD", 0.95, start=12, end=31),
                text=text,
            ),
        )
        assert result is not None

    def test_regex_evidence(self) -> None:
        """Regex pattern as corroborative evidence."""
        rule = _sit_rule(rules={
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
                    "matches": [
                        {"type": "regex", "id": "date_pattern"},
                    ],
                },
                "proximity": 300,
            }],
            "definitions": {
                "date_pattern": {
                    "type": "regex",
                    "patterns": [r"\b\d{2}/\d{2}/\d{4}\b"],
                },
            },
        })
        text = "SSN: 123-45-6789 DOB: 01/15/1990"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("US_SSN", 0.9, start=5, end=16),
                text=text,
            ),
        )
        assert result is not None

    def test_multiple_evidence_min_matches(self) -> None:
        """Require min_matches=2 of 3 evidence types."""
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 85,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["US_SSN"],
                    "min_confidence": 0.7,
                    "min_count": 1,
                },
                "corroborative_evidence": {
                    "min_matches": 2,
                    "matches": [
                        {"type": "keyword_list", "id": "health_terms"},
                        {"type": "keyword_list", "id": "hipaa_terms"},
                        {"type": "keyword_list", "id": "date_terms"},
                    ],
                },
                "proximity": 300,
            }],
            "definitions": {
                "health_terms": {
                    "type": "keyword_list",
                    "keywords": ["patient", "diagnosis"],
                    "case_sensitive": False,
                },
                "hipaa_terms": {
                    "type": "keyword_list",
                    "keywords": ["HIPAA", "PHI"],
                    "case_sensitive": False,
                },
                "date_terms": {
                    "type": "keyword_list",
                    "keywords": ["date of birth", "DOB"],
                    "case_sensitive": False,
                },
            },
        })
        # Has "patient" and "HIPAA" but not date terms — meets min_matches=2
        text = "The patient SSN 123-45-6789 HIPAA protected"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("US_SSN", 0.9, start=16, end=27),
                text=text,
            ),
        )
        assert result is not None

    def test_multiple_evidence_not_enough_matches(self) -> None:
        """Fail when fewer than min_matches evidence types match."""
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 85,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["US_SSN"],
                    "min_confidence": 0.7,
                    "min_count": 1,
                },
                "corroborative_evidence": {
                    "min_matches": 2,
                    "matches": [
                        {"type": "keyword_list", "id": "health_terms"},
                        {"type": "keyword_list", "id": "hipaa_terms"},
                    ],
                },
                "proximity": 300,
            }],
            "definitions": {
                "health_terms": {
                    "type": "keyword_list",
                    "keywords": ["patient"],
                    "case_sensitive": False,
                },
                "hipaa_terms": {
                    "type": "keyword_list",
                    "keywords": ["HIPAA"],
                    "case_sensitive": False,
                },
            },
        })
        # Only "patient" present, not "HIPAA" — needs 2
        text = "The patient SSN 123-45-6789 regular checkup"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("US_SSN", 0.9, start=16, end=27),
                text=text,
            ),
        )
        assert result is None


# ═══════════════════════════════════════════════════════════════
# Confidence tiers — multi-pattern with fallback
# ═══════════════════════════════════════════════════════════════


class TestConfidenceTiers:
    """Multiple patterns at different confidence levels on the same policy."""

    def test_high_confidence_when_evidence_present(self) -> None:
        """SSN + health keyword → confidence 85."""
        rule = _sit_rule(rules={
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [{"type": "keyword_list", "id": "health"}],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.5,
                        "min_count": 1,
                    },
                },
            ],
            "definitions": {
                "health": {
                    "type": "keyword_list",
                    "keywords": ["patient", "diagnosis"],
                    "case_sensitive": False,
                },
            },
        })

        text = "patient record: SSN 123-45-6789"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("US_SSN", 0.9, start=20, end=31),
                text=text,
            ),
        )
        assert result is not None
        assert result.confidence_level == 85

    def test_low_confidence_fallback_when_no_evidence(self) -> None:
        """SSN alone, no health keyword → falls back to confidence 65."""
        rule = _sit_rule(rules={
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [{"type": "keyword_list", "id": "health"}],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.5,
                        "min_count": 1,
                    },
                },
            ],
            "definitions": {
                "health": {
                    "type": "keyword_list",
                    "keywords": ["patient", "diagnosis"],
                    "case_sensitive": False,
                },
            },
        })

        text = "The number is 123-45-6789 in the invoice"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("US_SSN", 0.8, start=14, end=25),
                text=text,
            ),
        )
        assert result is not None
        assert result.confidence_level == 65

    def test_no_match_when_entity_missing(self) -> None:
        """No SSN detected at all → no match at any confidence level."""
        rule = _sit_rule(rules={
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.7,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [{"type": "keyword_list", "id": "health"}],
                    },
                    "proximity": 300,
                },
                {
                    "confidence_level": 65,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.5,
                        "min_count": 1,
                    },
                },
            ],
            "definitions": {
                "health": {
                    "type": "keyword_list",
                    "keywords": ["patient"],
                    "case_sensitive": False,
                },
            },
        })

        text = "patient record with no SSN here"
        result = evaluate_policies(
            [rule],
            _classification(text=text),
        )
        assert result is None


# ═══════════════════════════════════════════════════════════════
# File scope
# ═══════════════════════════════════════════════════════════════


class TestFileScope:
    """SIT-aligned: file_scope pre-filters before pattern evaluation."""

    def test_file_pattern_scope_match(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["CREDIT_CARD"],
                    "min_confidence": 0.5,
                    "min_count": 1,
                },
            }],
            "file_scope": {
                "file_patterns": ["*.xlsx", "*.csv"],
            },
        })
        result = evaluate_policies(
            [rule],
            _classification(_entity("CREDIT_CARD", 0.9, 0, 16), filename="data.xlsx"),
            filename="data.xlsx",
        )
        assert result is not None

    def test_file_pattern_scope_reject(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["CREDIT_CARD"],
                    "min_confidence": 0.5,
                    "min_count": 1,
                },
            }],
            "file_scope": {
                "file_patterns": ["*.xlsx"],
            },
        })
        result = evaluate_policies(
            [rule],
            _classification(_entity("CREDIT_CARD", 0.9, 0, 16), filename="photo.jpg"),
            filename="photo.jpg",
        )
        assert result is None

    def test_require_no_existing_label(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["CREDIT_CARD"],
                    "min_confidence": 0.5,
                    "min_count": 1,
                },
            }],
            "file_scope": {
                "require_no_existing_label": True,
            },
        })
        # File already has a label
        result = evaluate_policies(
            [rule],
            _classification(_entity("CREDIT_CARD", 0.9, 0, 16)),
            current_label_id="existing-label-123",
        )
        assert result is None

    def test_no_label_passes_scope(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["CREDIT_CARD"],
                    "min_confidence": 0.5,
                    "min_count": 1,
                },
            }],
            "file_scope": {
                "require_no_existing_label": True,
            },
        })
        # No existing label
        result = evaluate_policies(
            [rule],
            _classification(_entity("CREDIT_CARD", 0.9, 0, 16)),
            current_label_id=None,
        )
        assert result is not None


# ═══════════════════════════════════════════════════════════════
# Priority ordering with SIT policies
# ═══════════════════════════════════════════════════════════════


class TestSitPriorityOrdering:
    def test_higher_priority_wins(self) -> None:
        low = _sit_rule(policy_id="low", label_id="general", priority=1, rules={
            "patterns": [{
                "confidence_level": 65,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["EMAIL_ADDRESS"],
                    "min_confidence": 0.5,
                    "min_count": 1,
                },
            }],
        })
        high = _sit_rule(policy_id="high", label_id="confidential", priority=10, rules={
            "patterns": [{
                "confidence_level": 85,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["EMAIL_ADDRESS"],
                    "min_confidence": 0.5,
                    "min_count": 1,
                },
            }],
        })

        result = evaluate_policies(
            [low, high],
            _classification(_entity("EMAIL_ADDRESS", 0.9)),
        )
        assert result is not None
        assert result.target_label_id == "confidential"
        assert result.policy_id == "high"


# ═══════════════════════════════════════════════════════════════
# Real-world composite: HIPAA PHI detection
# ═══════════════════════════════════════════════════════════════


class TestHipaaScenario:
    """End-to-end: PII + health terms = HIPAA → Highly Confidential."""

    def _hipaa_rule(self) -> PolicyRule:
        return _sit_rule(
            name="HIPAA PHI",
            label_id="highly-confidential",
            priority=20,
            rules={
                "patterns": [
                    {
                        "confidence_level": 85,
                        "primary_match": {
                            "type": "entity",
                            "entity_types": ["US_SSN", "MEDICAL_LICENSE"],
                            "min_confidence": 0.8,
                            "min_count": 1,
                        },
                        "corroborative_evidence": {
                            "min_matches": 1,
                            "matches": [
                                {"type": "keyword_list", "id": "health_terms"},
                                {"type": "keyword_list", "id": "hipaa_terms"},
                            ],
                        },
                        "proximity": 300,
                    },
                    {
                        "confidence_level": 65,
                        "primary_match": {
                            "type": "entity",
                            "entity_types": ["US_SSN", "MEDICAL_LICENSE"],
                            "min_confidence": 0.6,
                            "min_count": 1,
                        },
                    },
                ],
                "definitions": {
                    "health_terms": {
                        "type": "keyword_list",
                        "keywords": ["patient", "diagnosis", "medical record", "treatment", "prescription"],
                        "case_sensitive": False,
                    },
                    "hipaa_terms": {
                        "type": "keyword_list",
                        "keywords": ["HIPAA", "protected health information", "PHI", "covered entity"],
                        "case_sensitive": False,
                    },
                },
            },
        )

    def test_ssn_plus_health_keyword_matches_high(self) -> None:
        text = "Patient: John Doe, SSN: 123-45-6789, diagnosis: Type 2 diabetes"
        result = evaluate_policies(
            [self._hipaa_rule()],
            _classification(
                _entity("US_SSN", 0.95, start=24, end=35),
                text=text,
            ),
        )
        assert result is not None
        assert result.confidence_level == 85
        assert result.target_label_id == "highly-confidential"

    def test_ssn_alone_matches_low(self) -> None:
        text = "Form data: 123-45-6789 submitted on 2024-01-15"
        result = evaluate_policies(
            [self._hipaa_rule()],
            _classification(
                _entity("US_SSN", 0.85, start=11, end=22),
                text=text,
            ),
        )
        assert result is not None
        assert result.confidence_level == 65

    def test_no_ssn_no_match(self) -> None:
        text = "Patient John Doe visited for annual checkup, diagnosis pending"
        result = evaluate_policies(
            [self._hipaa_rule()],
            _classification(text=text),
        )
        assert result is None


# ═══════════════════════════════════════════════════════════════
# Real-world composite: PCI-DSS detection
# ═══════════════════════════════════════════════════════════════


class TestPciScenario:
    """PCI: credit card + financial keywords → PCI/Confidential."""

    def test_credit_card_with_financial_keywords(self) -> None:
        rule = _sit_rule(
            name="PCI-DSS",
            label_id="confidential-pci",
            priority=15,
            rules={
                "patterns": [{
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["CREDIT_CARD"],
                        "min_confidence": 0.8,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "inline_keyword", "keywords": ["expiration", "cvv", "cardholder", "billing"]},
                        ],
                    },
                    "proximity": 200,
                }],
            },
        )
        text = "Cardholder: Jane Smith, card 4111111111111111 expiration 12/25"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("CREDIT_CARD", 0.98, start=28, end=44),
                text=text,
            ),
        )
        assert result is not None
        assert result.confidence_level == 85


# ═══════════════════════════════════════════════════════════════
# Edge cases
# ═══════════════════════════════════════════════════════════════


class TestSitEdgeCases:
    def test_empty_patterns_returns_none(self) -> None:
        rule = _sit_rule(rules={"patterns": []})
        # patterns is empty, so PolicyRules validation would fail,
        # but the engine should still handle it gracefully
        result = evaluate_policies(
            [rule],
            _classification(_entity("CREDIT_CARD", 0.9)),
        )
        assert result is None

    def test_unknown_primary_match_type(self) -> None:
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {"type": "future_type"},
            }],
        })
        result = evaluate_policies(
            [rule],
            _classification(_entity("CREDIT_CARD", 0.9)),
        )
        assert result is None

    def test_proximity_zero_means_no_check(self) -> None:
        """proximity=0 means evidence can be anywhere in the document."""
        rule = _sit_rule(rules={
            "patterns": [{
                "confidence_level": 85,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["US_SSN"],
                    "min_confidence": 0.5,
                    "min_count": 1,
                },
                "corroborative_evidence": {
                    "min_matches": 1,
                    "matches": [
                        {"type": "inline_keyword", "keywords": ["patient"]},
                    ],
                },
                "proximity": 0,
            }],
        })
        # SSN at start, keyword at end — far apart
        text = "123-45-6789" + ("x" * 10000) + "patient"
        result = evaluate_policies(
            [rule],
            _classification(
                _entity("US_SSN", 0.9, start=0, end=11),
                text=text,
            ),
        )
        assert result is not None

    def test_mixed_sit_and_legacy_policies(self) -> None:
        """Engine handles both SIT and legacy policies in the same evaluation."""
        sit_rule = _sit_rule(policy_id="sit", label_id="sit-label", priority=5, rules={
            "patterns": [{
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ["CREDIT_CARD"],
                    "min_confidence": 0.5,
                    "min_count": 1,
                },
            }],
        })
        legacy_rule = PolicyRule(
            policy_id="legacy",
            policy_name="Legacy",
            target_label_id="legacy-label",
            priority=10,
            conditions=[{
                "type": "entity_detected",
                "entity_types": ["CREDIT_CARD"],
                "min_confidence": 0.5,
                "min_count": 1,
            }],
            match_mode="any",
        )

        result = evaluate_policies(
            [sit_rule, legacy_rule],
            _classification(_entity("CREDIT_CARD", 0.9)),
        )
        assert result is not None
        # Legacy has higher priority (10 > 5)
        assert result.policy_id == "legacy"
        assert result.target_label_id == "legacy-label"
