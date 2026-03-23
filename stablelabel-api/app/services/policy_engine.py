"""Policy engine — evaluates files against classification-to-label policies.

A policy has:
  - rules: JSONB with conditions (entity types, confidence thresholds, file patterns)
  - target_label_id: the label to apply when rules match
  - priority: higher priority wins when multiple policies match

The engine evaluates all enabled policies against a file's classification
results and returns the highest-priority matching label (or None).

Rule schema (stored in Policy.rules JSONB):
  {
    "conditions": [
      {
        "type": "entity_detected",
        "entity_types": ["CREDIT_CARD", "US_SSN"],
        "min_confidence": 0.8,
        "min_count": 1
      },
      {
        "type": "file_pattern",
        "patterns": ["*.xlsx", "financial*"]
      }
    ],
    "match_mode": "any"  // "any" = OR, "all" = AND
  }

Each condition evaluates independently. match_mode controls how conditions
are combined within a single policy.
"""

from __future__ import annotations

import fnmatch
import logging
import re
from dataclasses import dataclass, field

from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ── Classification result (from content classifier) ───────────


class EntityMatch(BaseModel):
    """A single PII/PCI entity detected in a file."""

    entity_type: str  # e.g. "CREDIT_CARD", "US_SSN", "EMAIL_ADDRESS"
    confidence: float  # 0.0–1.0
    start: int = 0
    end: int = 0


class ClassificationResult(BaseModel):
    """Output from scanning a file's content for sensitive entities."""

    filename: str = ""
    entities: list[EntityMatch] = []
    error: str = ""
    text_content: str = ""  # raw text for regex/keyword matching

    @property
    def entity_types(self) -> set[str]:
        return {e.entity_type for e in self.entities}


# ── Policy evaluation ─────────────────────────────────────────


@dataclass
class PolicyRule:
    """Parsed representation of a single policy, ready for evaluation."""

    policy_id: str
    policy_name: str
    target_label_id: str
    priority: int
    conditions: list[dict]
    match_mode: str = "any"  # "any" or "all"


@dataclass
class PolicyMatch:
    """Result of evaluating a file against all policies."""

    target_label_id: str
    policy_id: str
    policy_name: str
    priority: int
    matched_conditions: list[str] = field(default_factory=list)


def evaluate_policies(
    policies: list[PolicyRule],
    classification: ClassificationResult,
    filename: str = "",
) -> PolicyMatch | None:
    """Evaluate a file against all policies, return highest-priority match.

    Args:
        policies: Pre-sorted by priority (highest first).
        classification: Entity detection results from content classifier.
        filename: Original filename for file_pattern matching.

    Returns:
        The highest-priority matching PolicyMatch, or None.
    """
    matches: list[PolicyMatch] = []

    for policy in policies:
        matched = _evaluate_single_policy(policy, classification, filename)
        if matched:
            matches.append(matched)

    if not matches:
        return None

    # Highest priority wins
    matches.sort(key=lambda m: m.priority, reverse=True)
    return matches[0]


def _evaluate_single_policy(
    policy: PolicyRule,
    classification: ClassificationResult,
    filename: str,
) -> PolicyMatch | None:
    """Check if a single policy's conditions are met."""
    if not policy.conditions:
        return None

    condition_results: list[tuple[bool, str]] = []

    for cond in policy.conditions:
        cond_type = cond.get("type", "")

        if cond_type == "entity_detected":
            matched, desc = _check_entity_condition(cond, classification)
            condition_results.append((matched, desc))

        elif cond_type == "file_pattern":
            matched, desc = _check_file_pattern(cond, filename)
            condition_results.append((matched, desc))

        elif cond_type == "keyword_match":
            matched, desc = _check_keyword_condition(cond, classification)
            condition_results.append((matched, desc))

        elif cond_type == "regex_match":
            matched, desc = _check_regex_condition(cond, classification)
            condition_results.append((matched, desc))

        elif cond_type == "no_label":
            # Matches files that currently have no label
            condition_results.append((True, "no_label"))

        else:
            logger.warning(
                "Unknown condition type '%s' in policy %s",
                cond_type, policy.policy_id,
            )

    if not condition_results:
        return None

    passed = [desc for ok, desc in condition_results if ok]
    failed = [desc for ok, desc in condition_results if not ok]

    if policy.match_mode == "all":
        if failed:
            return None
    else:  # "any"
        if not passed:
            return None

    return PolicyMatch(
        target_label_id=policy.target_label_id,
        policy_id=policy.policy_id,
        policy_name=policy.policy_name,
        priority=policy.priority,
        matched_conditions=passed,
    )


def _check_entity_condition(
    cond: dict, classification: ClassificationResult
) -> tuple[bool, str]:
    """Check if required entity types were detected above threshold."""
    required_types = set(cond.get("entity_types", []))
    min_confidence = cond.get("min_confidence", 0.5)
    min_count = cond.get("min_count", 1)

    if not required_types:
        return False, "entity_detected: no entity_types specified"

    # Find qualifying entities
    qualifying = [
        e for e in classification.entities
        if e.entity_type in required_types and e.confidence >= min_confidence
    ]

    if len(qualifying) >= min_count:
        found_types = {e.entity_type for e in qualifying}
        return True, f"entity_detected: {found_types} (count={len(qualifying)})"

    return False, f"entity_detected: need {min_count} of {required_types}, found {len(qualifying)}"


def _check_file_pattern(
    cond: dict, filename: str
) -> tuple[bool, str]:
    """Check if filename matches any of the glob patterns."""
    patterns = cond.get("patterns", [])
    if not patterns or not filename:
        return False, "file_pattern: no patterns or filename"

    lower_name = filename.lower()
    for pattern in patterns:
        if fnmatch.fnmatch(lower_name, pattern.lower()):
            return True, f"file_pattern: matched '{pattern}'"

    return False, f"file_pattern: no match in {patterns}"


def _check_keyword_condition(
    cond: dict, classification: ClassificationResult
) -> tuple[bool, str]:
    """Check if any of the specified keywords appear in the file's text content."""
    keywords = cond.get("keywords", [])
    case_sensitive = cond.get("case_sensitive", False)
    min_count = cond.get("min_count", 1)

    if not keywords:
        return False, "keyword_match: no keywords specified"

    text = classification.text_content
    if not text:
        return False, "keyword_match: no text content available"

    if not case_sensitive:
        text = text.lower()

    total_matches = 0
    matched_keywords: list[str] = []
    for kw in keywords:
        search_kw = kw if case_sensitive else kw.lower()
        count = text.count(search_kw)
        if count > 0:
            total_matches += count
            matched_keywords.append(kw)

    if total_matches >= min_count:
        return True, f"keyword_match: found {matched_keywords} (count={total_matches})"

    return False, f"keyword_match: need {min_count} of {keywords}, found {total_matches}"


def _check_regex_condition(
    cond: dict, classification: ClassificationResult
) -> tuple[bool, str]:
    """Check if any regex patterns match the file's text content."""
    patterns = cond.get("patterns", [])
    min_count = cond.get("min_count", 1)

    if not patterns:
        return False, "regex_match: no patterns specified"

    text = classification.text_content
    if not text:
        return False, "regex_match: no text content available"

    total_matches = 0
    matched_patterns: list[str] = []
    for pattern in patterns:
        try:
            compiled = re.compile(pattern, re.IGNORECASE | re.MULTILINE)
            matches = compiled.findall(text)
            if matches:
                total_matches += len(matches)
                matched_patterns.append(pattern)
        except re.error:
            logger.warning("Invalid regex pattern '%s' — skipping", pattern)

    if total_matches >= min_count:
        return True, f"regex_match: {matched_patterns} matched (count={total_matches})"

    return False, f"regex_match: need {min_count} matches, found {total_matches}"


def policies_from_db(db_policies: list) -> list[PolicyRule]:
    """Convert DB Policy objects to PolicyRule evaluation objects.

    Filters to enabled policies and sorts by priority (highest first).
    """
    rules = []
    for p in db_policies:
        if not p.is_enabled:
            continue
        conditions = p.rules.get("conditions", [])
        match_mode = p.rules.get("match_mode", "any")
        rules.append(PolicyRule(
            policy_id=str(p.id),
            policy_name=p.name,
            target_label_id=p.target_label_id,
            priority=p.priority,
            conditions=conditions,
            match_mode=match_mode,
        ))

    rules.sort(key=lambda r: r.priority, reverse=True)
    return rules
