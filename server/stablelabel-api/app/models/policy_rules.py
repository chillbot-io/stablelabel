"""Pydantic models for SIT-aligned classification policy rules.

Mirrors the Microsoft Sensitive Information Type (SIT) schema concepts:
  - Pattern: a detection rule at a specific confidence level
  - Primary match: the anchor detection (entity/regex) — like SIT's IdMatch
  - Corroborative evidence: supporting matches (keywords/regex) within proximity — like SIT's Match
  - Definitions: reusable keyword lists and regex patterns — like SIT's idRef

Example rule (HIPAA PHI detection):
  {
    "patterns": [
      {
        "confidence_level": 85,
        "primary_match": {
          "type": "entity",
          "entity_types": ["US_SSN", "MEDICAL_LICENSE"],
          "min_confidence": 0.8,
          "min_count": 1
        },
        "corroborative_evidence": {
          "min_matches": 1,
          "matches": [
            {"type": "keyword_list", "id": "health_terms"},
            {"type": "keyword_list", "id": "hipaa_terms"}
          ]
        },
        "proximity": 300
      },
      {
        "confidence_level": 65,
        "primary_match": {
          "type": "entity",
          "entity_types": ["US_SSN"],
          "min_confidence": 0.6,
          "min_count": 1
        },
        "corroborative_evidence": null,
        "proximity": 300
      }
    ],
    "definitions": {
      "health_terms": {
        "type": "keyword_list",
        "keywords": ["patient", "diagnosis", "medical record"],
        "case_sensitive": false
      }
    }
  }
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ── Primary match (anchor detection — SIT IdMatch) ────────────


class EntityPrimaryMatch(BaseModel):
    """Primary match on Presidio entity detections."""

    type: Literal["entity"] = "entity"
    entity_types: list[str] = Field(min_length=1)
    min_confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    min_count: int = Field(default=1, ge=1)


class RegexPrimaryMatch(BaseModel):
    """Primary match on regex patterns in text content."""

    type: Literal["regex"] = "regex"
    patterns: list[str] = Field(min_length=1)
    min_count: int = Field(default=1, ge=1)


PrimaryMatch = EntityPrimaryMatch | RegexPrimaryMatch


# ── Corroborative evidence matches (SIT Match elements) ───────


class KeywordListRef(BaseModel):
    """Reference to a keyword list defined in the definitions block."""

    type: Literal["keyword_list"] = "keyword_list"
    id: str = Field(description="Key into the definitions block")


class RegexRef(BaseModel):
    """Reference to a regex pattern defined in the definitions block."""

    type: Literal["regex"] = "regex"
    id: str = Field(description="Key into the definitions block")


class InlineKeywordMatch(BaseModel):
    """Inline keyword match (no definition reference)."""

    type: Literal["inline_keyword"] = "inline_keyword"
    keywords: list[str] = Field(min_length=1)
    case_sensitive: bool = False


class InlineRegexMatch(BaseModel):
    """Inline regex match (no definition reference)."""

    type: Literal["inline_regex"] = "inline_regex"
    patterns: list[str] = Field(min_length=1)


EvidenceMatch = KeywordListRef | RegexRef | InlineKeywordMatch | InlineRegexMatch


class CorroborativeEvidence(BaseModel):
    """Supporting evidence that must appear near the primary match.

    Mirrors SIT's <Any minMatches="1"> grouping. The matches are OR'd
    together: at least min_matches of them must be satisfied.
    """

    min_matches: int = Field(default=1, ge=1)
    max_matches: int | None = Field(
        default=None,
        description="Optional upper bound on matches (null = no limit)",
    )
    matches: list[EvidenceMatch] = Field(min_length=1)


# ── Pattern (one detection rule at a confidence level) ─────────


class DetectionPattern(BaseModel):
    """A single detection pattern — SIT Pattern equivalent.

    Each pattern has a confidence level (65=low, 75=medium, 85=high).
    The primary_match is the anchor; corroborative_evidence is optional
    supporting evidence that must appear within `proximity` characters.
    """

    confidence_level: int = Field(
        default=75,
        ge=1,
        le=100,
        description="Confidence tier: 65=low, 75=medium, 85=high",
    )
    primary_match: PrimaryMatch
    corroborative_evidence: CorroborativeEvidence | None = None
    proximity: int = Field(
        default=300,
        ge=0,
        description="Character window around primary match to search for evidence",
    )


# ── Shared definitions (reusable keyword/regex lists) ──────────


class KeywordListDefinition(BaseModel):
    """A reusable keyword list, referenced by ID from evidence matches."""

    type: Literal["keyword_list"] = "keyword_list"
    keywords: list[str] = Field(min_length=1)
    case_sensitive: bool = False


class RegexDefinition(BaseModel):
    """A reusable regex pattern set, referenced by ID from evidence matches."""

    type: Literal["regex"] = "regex"
    patterns: list[str] = Field(min_length=1)


Definition = KeywordListDefinition | RegexDefinition


# ── File scope conditions (orthogonal to SIT patterns) ─────────


class FileScope(BaseModel):
    """Optional file-level filters applied before classification.

    These are evaluated without content scanning — they filter which
    files even get classified.
    """

    file_patterns: list[str] = Field(
        default_factory=list,
        description="Glob patterns for filename matching (e.g. '*.xlsx')",
    )
    require_no_existing_label: bool = Field(
        default=False,
        description="Only match files that have no current label",
    )


# ── Top-level rules schema ─────────────────────────────────────


class PolicyRules(BaseModel):
    """Top-level rules schema stored in Policy.rules JSONB.

    This is the SIT-aligned replacement for the old flat conditions schema.
    """

    patterns: list[DetectionPattern] = Field(min_length=1)
    definitions: dict[str, Definition] = Field(default_factory=dict)
    file_scope: FileScope | None = None

    @model_validator(mode="after")
    def validate_definition_refs(self) -> PolicyRules:
        """Ensure all evidence match refs point to existing definitions."""
        defined_ids = set(self.definitions.keys())
        for pattern in self.patterns:
            if pattern.corroborative_evidence is None:
                continue
            for match in pattern.corroborative_evidence.matches:
                if isinstance(match, (KeywordListRef, RegexRef)):
                    if match.id not in defined_ids:
                        raise ValueError(
                            f"Evidence match references undefined definition '{match.id}'. "
                            f"Available: {defined_ids or '{}'}"
                        )
        return self


# ── Legacy schema migration ────────────────────────────────────


def migrate_legacy_rules(rules: dict) -> dict:
    """Convert old flat conditions schema to new SIT-aligned format.

    Old format:
      {"conditions": [...], "match_mode": "any"}

    New format:
      {"patterns": [...], "definitions": {}, "file_scope": {...}}

    Returns the rules dict as-is if already in new format.
    """
    if "patterns" in rules:
        return rules  # already new format

    conditions = rules.get("conditions", [])
    if not conditions:
        return rules

    match_mode = rules.get("match_mode", "any")

    # Separate entity/regex conditions (potential primaries) from others
    entity_conditions = []
    keyword_conditions = []
    regex_conditions = []
    file_patterns = []
    has_no_label = False

    for cond in conditions:
        cond_type = cond.get("type", "")
        if cond_type == "entity_detected":
            entity_conditions.append(cond)
        elif cond_type == "keyword_match":
            keyword_conditions.append(cond)
        elif cond_type == "regex_match":
            regex_conditions.append(cond)
        elif cond_type == "file_pattern":
            file_patterns.extend(cond.get("patterns", []))
        elif cond_type == "no_label":
            has_no_label = True

    patterns = []
    definitions: dict[str, dict] = {}

    if match_mode == "all" and entity_conditions and keyword_conditions:
        # AND mode with entities + keywords → entity is primary, keywords are evidence
        for ec in entity_conditions:
            evidence_matches = []
            for i, kc in enumerate(keyword_conditions):
                def_id = f"legacy_keywords_{i}"
                definitions[def_id] = {
                    "type": "keyword_list",
                    "keywords": kc.get("keywords", []),
                    "case_sensitive": kc.get("case_sensitive", False),
                }
                evidence_matches.append({"type": "keyword_list", "id": def_id})

            for i, rc in enumerate(regex_conditions):
                def_id = f"legacy_regex_{i}"
                definitions[def_id] = {
                    "type": "regex",
                    "patterns": rc.get("patterns", []),
                }
                evidence_matches.append({"type": "regex", "id": def_id})

            pattern: dict = {
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ec.get("entity_types", []),
                    "min_confidence": ec.get("min_confidence", 0.5),
                    "min_count": ec.get("min_count", 1),
                },
                "proximity": 300,
            }
            if evidence_matches:
                pattern["corroborative_evidence"] = {
                    "min_matches": len(evidence_matches),
                    "matches": evidence_matches,
                }
            patterns.append(pattern)
    else:
        # OR mode or single-type conditions → each becomes its own pattern
        for ec in entity_conditions:
            patterns.append({
                "confidence_level": 75,
                "primary_match": {
                    "type": "entity",
                    "entity_types": ec.get("entity_types", []),
                    "min_confidence": ec.get("min_confidence", 0.5),
                    "min_count": ec.get("min_count", 1),
                },
                "proximity": 300,
            })

        for rc in regex_conditions:
            patterns.append({
                "confidence_level": 75,
                "primary_match": {
                    "type": "regex",
                    "patterns": rc.get("patterns", []),
                    "min_count": rc.get("min_count", 1),
                },
                "proximity": 300,
            })

        # Keywords without a primary become their own entity-less patterns
        # wrapped as inline for backward compat
        for kc in keyword_conditions:
            patterns.append({
                "confidence_level": 65,
                "primary_match": {
                    "type": "regex",
                    "patterns": [
                        r"\b" + kw.replace(" ", r"\s+") + r"\b"
                        for kw in kc.get("keywords", [])
                    ],
                    "min_count": kc.get("min_count", 1),
                },
                "proximity": 300,
            })

    # If no patterns were created, make a catch-all no-label pattern
    if not patterns and has_no_label:
        patterns.append({
            "confidence_level": 65,
            "primary_match": {
                "type": "regex",
                "patterns": ["."],  # match anything
                "min_count": 1,
            },
            "proximity": 0,
        })

    result: dict = {"patterns": patterns}
    if definitions:
        result["definitions"] = definitions

    file_scope: dict = {}
    if file_patterns:
        file_scope["file_patterns"] = file_patterns
    if has_no_label:
        file_scope["require_no_existing_label"] = True
    if file_scope:
        result["file_scope"] = file_scope

    return result if patterns else rules
