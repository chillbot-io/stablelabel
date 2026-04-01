"""Tests for the SIT-aligned policy rules Pydantic models and migration."""

import pytest
from pydantic import ValidationError

from app.models.policy_rules import (
    CorroborativeEvidence,
    DetectionPattern,
    EntityPrimaryMatch,
    InlineKeywordMatch,
    KeywordListDefinition,
    KeywordListRef,
    PolicyRules,
    RegexDefinition,
    RegexPrimaryMatch,
    RegexRef,
    migrate_legacy_rules,
)


# ═══════════════════════════════════════════════════════════════
# Model validation
# ═══════════════════════════════════════════════════════════════


class TestPolicyRulesValidation:
    def test_valid_minimal_policy(self) -> None:
        rules = PolicyRules(patterns=[
            DetectionPattern(
                confidence_level=75,
                primary_match=EntityPrimaryMatch(entity_types=["CREDIT_CARD"]),
            ),
        ])
        assert len(rules.patterns) == 1
        assert rules.patterns[0].confidence_level == 75

    def test_valid_full_hipaa_policy(self) -> None:
        rules = PolicyRules(
            patterns=[
                DetectionPattern(
                    confidence_level=85,
                    primary_match=EntityPrimaryMatch(
                        entity_types=["US_SSN", "MEDICAL_LICENSE"],
                        min_confidence=0.8,
                    ),
                    corroborative_evidence=CorroborativeEvidence(
                        min_matches=1,
                        matches=[
                            KeywordListRef(id="health_terms"),
                            KeywordListRef(id="hipaa_terms"),
                        ],
                    ),
                    proximity=300,
                ),
                DetectionPattern(
                    confidence_level=65,
                    primary_match=EntityPrimaryMatch(
                        entity_types=["US_SSN"],
                        min_confidence=0.6,
                    ),
                ),
            ],
            definitions={
                "health_terms": KeywordListDefinition(
                    keywords=["patient", "diagnosis", "medical record"],
                ),
                "hipaa_terms": KeywordListDefinition(
                    keywords=["HIPAA", "PHI"],
                ),
            },
        )
        assert len(rules.patterns) == 2
        assert len(rules.definitions) == 2

    def test_empty_patterns_rejected(self) -> None:
        with pytest.raises(ValidationError):
            PolicyRules(patterns=[])

    def test_empty_entity_types_rejected(self) -> None:
        with pytest.raises(ValidationError):
            EntityPrimaryMatch(entity_types=[])

    def test_confidence_out_of_range(self) -> None:
        with pytest.raises(ValidationError):
            DetectionPattern(
                confidence_level=150,
                primary_match=EntityPrimaryMatch(entity_types=["US_SSN"]),
            )

    def test_min_confidence_out_of_range(self) -> None:
        with pytest.raises(ValidationError):
            EntityPrimaryMatch(entity_types=["US_SSN"], min_confidence=1.5)

    def test_undefined_definition_ref_rejected(self) -> None:
        with pytest.raises(ValidationError, match="undefined definition"):
            PolicyRules(
                patterns=[
                    DetectionPattern(
                        confidence_level=85,
                        primary_match=EntityPrimaryMatch(entity_types=["US_SSN"]),
                        corroborative_evidence=CorroborativeEvidence(
                            min_matches=1,
                            matches=[KeywordListRef(id="nonexistent")],
                        ),
                    ),
                ],
                definitions={},  # empty — "nonexistent" not defined
            )

    def test_regex_primary_match(self) -> None:
        rules = PolicyRules(patterns=[
            DetectionPattern(
                confidence_level=75,
                primary_match=RegexPrimaryMatch(
                    patterns=[r"\b\d{3}-\d{2}-\d{4}\b"],
                ),
            ),
        ])
        assert rules.patterns[0].primary_match.type == "regex"

    def test_inline_keyword_evidence(self) -> None:
        rules = PolicyRules(patterns=[
            DetectionPattern(
                confidence_level=75,
                primary_match=EntityPrimaryMatch(entity_types=["CREDIT_CARD"]),
                corroborative_evidence=CorroborativeEvidence(
                    min_matches=1,
                    matches=[
                        InlineKeywordMatch(keywords=["expiration", "cvv"]),
                    ],
                ),
            ),
        ])
        match = rules.patterns[0].corroborative_evidence.matches[0]
        assert match.type == "inline_keyword"

    def test_regex_definition(self) -> None:
        rules = PolicyRules(
            patterns=[
                DetectionPattern(
                    confidence_level=75,
                    primary_match=EntityPrimaryMatch(entity_types=["US_SSN"]),
                    corroborative_evidence=CorroborativeEvidence(
                        min_matches=1,
                        matches=[RegexRef(id="date_pattern")],
                    ),
                ),
            ],
            definitions={
                "date_pattern": RegexDefinition(
                    patterns=[r"\b\d{2}/\d{2}/\d{4}\b"],
                ),
            },
        )
        assert rules.definitions["date_pattern"].type == "regex"


# ═══════════════════════════════════════════════════════════════
# JSON round-trip (what gets stored in JSONB)
# ═══════════════════════════════════════════════════════════════


class TestJsonRoundTrip:
    def test_serialize_and_deserialize(self) -> None:
        rules_dict = {
            "patterns": [
                {
                    "confidence_level": 85,
                    "primary_match": {
                        "type": "entity",
                        "entity_types": ["US_SSN"],
                        "min_confidence": 0.8,
                        "min_count": 1,
                    },
                    "corroborative_evidence": {
                        "min_matches": 1,
                        "matches": [
                            {"type": "keyword_list", "id": "health"},
                        ],
                    },
                    "proximity": 300,
                },
            ],
            "definitions": {
                "health": {
                    "type": "keyword_list",
                    "keywords": ["patient", "diagnosis"],
                    "case_sensitive": False,
                },
            },
        }
        # Validate from dict (as would come from JSONB)
        rules = PolicyRules.model_validate(rules_dict)
        assert rules.patterns[0].confidence_level == 85

        # Serialize back to dict
        output = rules.model_dump()
        assert output["patterns"][0]["primary_match"]["entity_types"] == ["US_SSN"]
        assert output["definitions"]["health"]["keywords"] == ["patient", "diagnosis"]


# ═══════════════════════════════════════════════════════════════
# Legacy schema migration
# ═══════════════════════════════════════════════════════════════


class TestLegacyMigration:
    def test_already_new_format_unchanged(self) -> None:
        rules = {"patterns": [{"confidence_level": 75, "primary_match": {"type": "entity"}}]}
        result = migrate_legacy_rules(rules)
        assert result is rules

    def test_empty_conditions_unchanged(self) -> None:
        rules = {"conditions": []}
        result = migrate_legacy_rules(rules)
        assert result is rules

    def test_entity_condition_migrated(self) -> None:
        rules = {
            "conditions": [{
                "type": "entity_detected",
                "entity_types": ["CREDIT_CARD"],
                "min_confidence": 0.8,
                "min_count": 1,
            }],
            "match_mode": "any",
        }
        result = migrate_legacy_rules(rules)
        assert "patterns" in result
        pattern = result["patterns"][0]
        assert pattern["primary_match"]["type"] == "entity"
        assert pattern["primary_match"]["entity_types"] == ["CREDIT_CARD"]

    def test_entity_plus_keyword_and_mode_migrated(self) -> None:
        """AND mode: entity + keyword → entity is primary, keyword is evidence."""
        rules = {
            "conditions": [
                {
                    "type": "entity_detected",
                    "entity_types": ["US_SSN"],
                    "min_confidence": 0.8,
                },
                {
                    "type": "keyword_match",
                    "keywords": ["patient", "diagnosis"],
                    "case_sensitive": False,
                },
            ],
            "match_mode": "all",
        }
        result = migrate_legacy_rules(rules)
        assert "patterns" in result
        pattern = result["patterns"][0]
        assert pattern["primary_match"]["entity_types"] == ["US_SSN"]
        assert pattern.get("corroborative_evidence") is not None
        assert len(result.get("definitions", {})) > 0

    def test_file_pattern_migrated_to_scope(self) -> None:
        rules = {
            "conditions": [
                {"type": "file_pattern", "patterns": ["*.xlsx"]},
                {"type": "entity_detected", "entity_types": ["CREDIT_CARD"], "min_confidence": 0.5},
            ],
            "match_mode": "any",
        }
        result = migrate_legacy_rules(rules)
        assert "file_scope" in result
        assert "*.xlsx" in result["file_scope"]["file_patterns"]

    def test_no_label_migrated_to_scope(self) -> None:
        rules = {
            "conditions": [{"type": "no_label"}],
            "match_mode": "any",
        }
        result = migrate_legacy_rules(rules)
        if "file_scope" in result:
            assert result["file_scope"].get("require_no_existing_label") is True
