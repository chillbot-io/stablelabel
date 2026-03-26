"""Policy engine — evaluates files against classification-to-label policies.

Supports two rule schemas:

1. **SIT-aligned** (new): patterns with primary match + corroborative evidence
   + proximity + confidence tiers + shared definitions. Mirrors Microsoft
   Sensitive Information Types.

2. **Legacy flat** (old): conditions list with match_mode. Auto-migrated to
   new format at evaluation time for backward compatibility.

A policy has:
  - rules: JSONB with detection patterns (new) or conditions (legacy)
  - target_label_id: the label to apply when rules match
  - priority: higher priority wins when multiple policies match

The engine evaluates all enabled policies against a file's classification
results and returns the highest-priority matching label (or None).
"""

from __future__ import annotations

import fnmatch
import logging
import re
from dataclasses import dataclass, field

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ── Regex safety ─────────────────────────────────────────────────
#
# User-supplied regex patterns can cause catastrophic backtracking (ReDoS).
# We validate patterns at creation time and cap text length at execution time.

# Patterns known to cause catastrophic backtracking: nested quantifiers
_DANGEROUS_REGEX_PATTERNS = re.compile(
    r"""
    # Nested quantifiers: (a+)+ , (a*)*  , (a+|b)+ , etc.
    (\([^)]*[+*][^)]*\)\s*[+*])
    |
    # Overlapping alternations with quantifiers: (a|a)+ , (.*a|.*b)
    (\([^)]*\|[^)]*\)\s*[+*])
    """,
    re.VERBOSE,
)


def validate_regex_pattern(pattern: str) -> str | None:
    """Validate a regex pattern for safety. Returns error message or None if safe."""
    try:
        re.compile(pattern)
    except re.error as e:
        return f"Invalid regex syntax: {e}"

    if len(pattern) > 1000:
        return "Regex pattern too long (max 1000 characters)"

    if _DANGEROUS_REGEX_PATTERNS.search(pattern):
        return (
            f"Regex pattern contains potentially dangerous nested quantifiers "
            f"that could cause catastrophic backtracking: {pattern!r}"
        )

    return None


def _safe_finditer(compiled: re.Pattern, text: str, max_chars: int = 500_000) -> list[re.Match]:
    """Run finditer with a text length cap to limit execution time."""
    # Truncate text to prevent excessive matching time
    search_text = text[:max_chars] if len(text) > max_chars else text
    return list(compiled.finditer(search_text))


def _safe_findall(compiled: re.Pattern, text: str, max_chars: int = 500_000) -> list:
    """Run findall with a text length cap to limit execution time."""
    search_text = text[:max_chars] if len(text) > max_chars else text
    return compiled.findall(search_text)


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


# ── Policy evaluation (legacy flat schema) ────────────────────


@dataclass
class PolicyRule:
    """Parsed representation of a single policy, ready for evaluation.

    Holds either legacy conditions or new-format rules dict.
    """

    policy_id: str
    policy_name: str
    target_label_id: str
    priority: int
    conditions: list[dict]
    match_mode: str = "any"  # "any" or "all"
    rules_raw: dict = field(default_factory=dict)  # full rules JSONB for new schema


@dataclass
class PolicyMatch:
    """Result of evaluating a file against all policies."""

    target_label_id: str
    policy_id: str
    policy_name: str
    priority: int
    confidence_level: int = 75
    matched_conditions: list[str] = field(default_factory=list)


def evaluate_policies(
    policies: list[PolicyRule],
    classification: ClassificationResult,
    filename: str = "",
    current_label_id: str | None = None,
) -> PolicyMatch | None:
    """Evaluate a file against all policies, return highest-priority match.

    Supports both legacy flat conditions and new SIT-aligned patterns.

    Args:
        policies: Pre-sorted by priority (highest first).
        classification: Entity detection results from content classifier.
        filename: Original filename for file_pattern/file_scope matching.
        current_label_id: Current label on the file (for no_label / require_no_existing_label).

    Returns:
        The highest-priority matching PolicyMatch, or None.
    """
    matches: list[PolicyMatch] = []

    for policy in policies:
        matched = _evaluate_single_policy(policy, classification, filename, current_label_id)
        if matched:
            matches.append(matched)

    if not matches:
        return None

    # Sort by priority desc, then confidence_level desc as tiebreaker
    matches.sort(key=lambda m: (m.priority, m.confidence_level), reverse=True)
    return matches[0]


def _evaluate_single_policy(
    policy: PolicyRule,
    classification: ClassificationResult,
    filename: str,
    current_label_id: str | None,
) -> PolicyMatch | None:
    """Check if a single policy's conditions are met.

    Routes to SIT-aligned evaluation if rules contain 'patterns',
    otherwise falls back to legacy flat evaluation.
    """
    rules = policy.rules_raw or {}

    # New SIT-aligned schema
    if "patterns" in rules:
        return _evaluate_sit_policy(policy, rules, classification, filename, current_label_id)

    # Legacy flat schema
    return _evaluate_legacy_policy(policy, classification, filename)


# ═══════════════════════════════════════════════════════════════
# SIT-ALIGNED EVALUATION (new schema)
# ═══════════════════════════════════════════════════════════════


def _evaluate_sit_policy(
    policy: PolicyRule,
    rules: dict,
    classification: ClassificationResult,
    filename: str,
    current_label_id: str | None,
) -> PolicyMatch | None:
    """Evaluate a policy using the SIT-aligned patterns schema."""
    patterns = rules.get("patterns", [])
    definitions = rules.get("definitions", {})
    file_scope = rules.get("file_scope")

    if not patterns:
        return None

    # Check file_scope first (cheap, no content scanning needed)
    if file_scope:
        if not _check_file_scope(file_scope, filename, current_label_id):
            return None

    # Evaluate patterns from highest confidence to lowest
    sorted_patterns = sorted(patterns, key=lambda p: p.get("confidence_level", 75), reverse=True)

    for pattern in sorted_patterns:
        result = _evaluate_pattern(pattern, definitions, classification)
        if result is not None:
            confidence_level, matched_descs = result
            return PolicyMatch(
                target_label_id=policy.target_label_id,
                policy_id=policy.policy_id,
                policy_name=policy.policy_name,
                priority=policy.priority,
                confidence_level=confidence_level,
                matched_conditions=matched_descs,
            )

    return None


def _check_file_scope(
    file_scope: dict,
    filename: str,
    current_label_id: str | None,
) -> bool:
    """Check if the file passes the scope filters."""
    file_patterns = file_scope.get("file_patterns", [])
    if file_patterns and filename:
        lower_name = filename.lower()
        if not any(fnmatch.fnmatch(lower_name, p.lower()) for p in file_patterns):
            return False

    if file_scope.get("require_no_existing_label", False):
        if current_label_id is not None:
            return False

    return True


def _evaluate_pattern(
    pattern: dict,
    definitions: dict,
    classification: ClassificationResult,
) -> tuple[int, list[str]] | None:
    """Evaluate a single detection pattern against classification results.

    Returns (confidence_level, matched_descriptions) or None if no match.
    """
    confidence_level = pattern.get("confidence_level", 75)
    primary_match = pattern.get("primary_match")
    evidence = pattern.get("corroborative_evidence")
    proximity = pattern.get("proximity", 300)

    if not primary_match:
        return None

    # Step 1: evaluate primary match — get the matching positions
    primary_result = _evaluate_primary_match(primary_match, classification)
    if primary_result is None:
        return None

    primary_desc, primary_positions = primary_result
    matched_descs = [primary_desc]

    # Step 2: if corroborative evidence required, check it within proximity
    if evidence:
        evidence_result = _evaluate_evidence(
            evidence, definitions, classification, primary_positions, proximity,
        )
        if evidence_result is None:
            return None
        matched_descs.extend(evidence_result)

    return confidence_level, matched_descs


def _evaluate_primary_match(
    primary: dict,
    classification: ClassificationResult,
) -> tuple[str, list[tuple[int, int]]] | None:
    """Evaluate the primary match (anchor detection).

    Returns (description, list_of_(start,end)_positions) or None.
    """
    match_type = primary.get("type", "")

    if match_type == "entity":
        return _primary_entity_match(primary, classification)
    elif match_type == "regex":
        return _primary_regex_match(primary, classification)

    logger.warning("Unknown primary match type: %s", match_type)
    return None


def _primary_entity_match(
    primary: dict,
    classification: ClassificationResult,
) -> tuple[str, list[tuple[int, int]]] | None:
    """Check if required entities are detected above threshold. Returns positions."""
    entity_types = set(primary.get("entity_types", []))
    min_confidence = primary.get("min_confidence", 0.5)
    min_count = primary.get("min_count", 1)

    if not entity_types:
        return None

    qualifying = [
        e for e in classification.entities
        if e.entity_type in entity_types and e.confidence >= min_confidence
    ]

    if len(qualifying) < min_count:
        return None

    positions = [(e.start, e.end) for e in qualifying]
    found_types = {e.entity_type for e in qualifying}
    desc = f"entity: {found_types} (count={len(qualifying)})"
    return desc, positions


def _primary_regex_match(
    primary: dict,
    classification: ClassificationResult,
) -> tuple[str, list[tuple[int, int]]] | None:
    """Check if regex patterns match text content. Returns match positions."""
    patterns = primary.get("patterns", [])
    min_count = primary.get("min_count", 1)
    text = classification.text_content

    if not patterns or not text:
        return None

    all_positions: list[tuple[int, int]] = []
    matched_patterns: list[str] = []

    for pattern in patterns:
        try:
            compiled = re.compile(pattern, re.IGNORECASE | re.MULTILINE)
            for m in _safe_finditer(compiled, text):
                all_positions.append((m.start(), m.end()))
                if pattern not in matched_patterns:
                    matched_patterns.append(pattern)
        except re.error:
            logger.warning("Invalid regex pattern '%s' — skipping", pattern)

    if len(all_positions) < min_count:
        return None

    desc = f"regex: {matched_patterns} (count={len(all_positions)})"
    return desc, all_positions


def _evaluate_evidence(
    evidence: dict,
    definitions: dict,
    classification: ClassificationResult,
    primary_positions: list[tuple[int, int]],
    proximity: int,
) -> list[str] | None:
    """Evaluate corroborative evidence within proximity of primary matches.

    Returns list of matched evidence descriptions, or None if min_matches not met.
    """
    min_matches = evidence.get("min_matches", 1)
    max_matches = evidence.get("max_matches")
    matches_list = evidence.get("matches", [])

    if not matches_list:
        return None

    satisfied: list[str] = []

    for match_def in matches_list:
        match_type = match_def.get("type", "")

        if match_type == "keyword_list":
            ref_id = match_def.get("id", "")
            defn = definitions.get(ref_id, {})
            result = _evidence_keyword_check(
                defn.get("keywords", []),
                defn.get("case_sensitive", False),
                classification.text_content,
                primary_positions,
                proximity,
            )
            if result:
                satisfied.append(f"keyword_list({ref_id}): {result}")

        elif match_type == "regex":
            ref_id = match_def.get("id", "")
            defn = definitions.get(ref_id, {})
            result = _evidence_regex_check(
                defn.get("patterns", []),
                classification.text_content,
                primary_positions,
                proximity,
            )
            if result:
                satisfied.append(f"regex({ref_id}): {result}")

        elif match_type == "inline_keyword":
            result = _evidence_keyword_check(
                match_def.get("keywords", []),
                match_def.get("case_sensitive", False),
                classification.text_content,
                primary_positions,
                proximity,
            )
            if result:
                satisfied.append(f"inline_keyword: {result}")

        elif match_type == "inline_regex":
            result = _evidence_regex_check(
                match_def.get("patterns", []),
                classification.text_content,
                primary_positions,
                proximity,
            )
            if result:
                satisfied.append(f"inline_regex: {result}")

        else:
            logger.warning("Unknown evidence match type: %s", match_type)

        # Early exit if max_matches reached
        if max_matches is not None and len(satisfied) >= max_matches:
            break

    if len(satisfied) < min_matches:
        return None

    return satisfied


def _is_within_proximity(
    hit_start: int,
    hit_end: int,
    primary_positions: list[tuple[int, int]],
    proximity: int,
) -> bool:
    """Check if a hit position is within proximity of any primary match position."""
    if proximity <= 0:
        return True  # proximity=0 means no proximity check
    for p_start, p_end in primary_positions:
        # Evidence can be before or after the primary match
        if hit_start >= p_start - proximity and hit_end <= p_end + proximity:
            return True
        # Also check overlap
        if hit_start <= p_end + proximity and hit_end >= p_start - proximity:
            return True
    return False


def _evidence_keyword_check(
    keywords: list[str],
    case_sensitive: bool,
    text: str,
    primary_positions: list[tuple[int, int]],
    proximity: int,
) -> str | None:
    """Check if keywords appear within proximity of primary matches."""
    if not keywords or not text:
        return None

    search_text = text if case_sensitive else text.lower()
    matched_keywords: list[str] = []

    for kw in keywords:
        search_kw = kw if case_sensitive else kw.lower()
        start = 0
        while True:
            idx = search_text.find(search_kw, start)
            if idx == -1:
                break
            hit_end = idx + len(search_kw)
            if _is_within_proximity(idx, hit_end, primary_positions, proximity):
                if kw not in matched_keywords:
                    matched_keywords.append(kw)
                break  # one match per keyword is enough
            start = idx + 1

    if matched_keywords:
        return f"found {matched_keywords}"
    return None


def _evidence_regex_check(
    patterns: list[str],
    text: str,
    primary_positions: list[tuple[int, int]],
    proximity: int,
) -> str | None:
    """Check if regex patterns match within proximity of primary matches."""
    if not patterns or not text:
        return None

    matched_patterns: list[str] = []

    for pattern in patterns:
        try:
            compiled = re.compile(pattern, re.IGNORECASE | re.MULTILINE)
            for m in _safe_finditer(compiled, text):
                if _is_within_proximity(m.start(), m.end(), primary_positions, proximity):
                    if pattern not in matched_patterns:
                        matched_patterns.append(pattern)
                    break
        except re.error:
            logger.warning("Invalid evidence regex '%s' — skipping", pattern)

    if matched_patterns:
        return f"matched {matched_patterns}"
    return None


# ═══════════════════════════════════════════════════════════════
# LEGACY FLAT EVALUATION (backward compat)
# ═══════════════════════════════════════════════════════════════


def _evaluate_legacy_policy(
    policy: PolicyRule,
    classification: ClassificationResult,
    filename: str,
) -> PolicyMatch | None:
    """Evaluate using the old flat conditions schema."""
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
            matches = _safe_findall(compiled, text)
            if matches:
                total_matches += len(matches)
                matched_patterns.append(pattern)
        except re.error:
            logger.warning("Invalid regex pattern '%s' — skipping", pattern)

    if total_matches >= min_count:
        return True, f"regex_match: {matched_patterns} matched (count={total_matches})"

    return False, f"regex_match: need {min_count} matches, found {total_matches}"


# ═══════════════════════════════════════════════════════════════
# DB CONVERSION
# ═══════════════════════════════════════════════════════════════


def policies_from_db(db_policies: list) -> list[PolicyRule]:
    """Convert DB Policy objects to PolicyRule evaluation objects.

    Filters to enabled policies and sorts by priority (highest first).
    Detects schema format (legacy vs SIT-aligned) per policy.
    """
    rules = []
    for p in db_policies:
        if not p.is_enabled:
            continue
        # Skip policies with no label assigned (built-in placeholder)
        if p.target_label_id == "__unassigned__":
            continue

        raw_rules = p.rules or {}

        # Legacy schema
        conditions = raw_rules.get("conditions", [])
        match_mode = raw_rules.get("match_mode", "any")

        rules.append(PolicyRule(
            policy_id=str(p.id),
            policy_name=p.name,
            target_label_id=p.target_label_id,
            priority=p.priority,
            conditions=conditions,
            match_mode=match_mode,
            rules_raw=raw_rules,
        ))

    rules.sort(key=lambda r: r.priority, reverse=True)
    return rules
