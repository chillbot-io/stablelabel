"""Compile SIT policy definitions into Presidio recognizers.

Each SIT definition (from PolicyRules) becomes one or more Presidio
EntityRecognizer instances registered in the AnalyzerEngine. This means
Presidio itself outputs composite SIT classifications like ``SIT_HIPAA_PHI``
alongside raw entities like ``US_SSN``.

Two compilation strategies:

1. **Regex-primary SITs** → ``PatternRecognizer`` with ``context`` words.
   Presidio natively boosts confidence when context appears near the match.

2. **Entity-primary SITs** → ``CompositeSitRecognizer`` (custom
   ``EntityRecognizer``) that runs known regex patterns for the target
   entity types, then checks for corroborative evidence within proximity.

The factory reads the same ``PolicyRules`` schema used by the policy engine,
so there's a single source of truth for detection rules.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Lazy-import presidio types — classifier.py already guards the import
try:
    from presidio_analyzer import EntityRecognizer, Pattern, PatternRecognizer, RecognizerResult
    from presidio_analyzer.nlp_engine import NlpArtifacts

    _PRESIDIO_AVAILABLE = True
except ImportError:
    _PRESIDIO_AVAILABLE = False


# ── Known regex patterns for built-in entity types ─────────────
# These are simplified versions of Presidio's built-in recognizer patterns,
# used when a SIT has entity_types as primary match so we can detect the
# anchor position ourselves without depending on other recognizer results.

ENTITY_PATTERNS: dict[str, list[str]] = {
    # ── Global / Universal ────────────────────────────────────
    "CREDIT_CARD": [
        r"\b(?:4\d{3}|5[1-5]\d{2}|6(?:011|5\d{2})|3[47]\d{2}|3(?:0[0-5]|[68]\d)\d)[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
        r"\b(?:4\d{3}|5[1-5]\d{2}|6(?:011|5\d{2})|3[47]\d{2})[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
    ],
    "IBAN_CODE": [
        r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16}\b",
    ],
    "EMAIL_ADDRESS": [
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    ],
    "PHONE_NUMBER": [
        r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
        r"\b\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}\b",
    ],
    "IP_ADDRESS": [
        r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
    ],
    "MEDICAL_LICENSE": [
        r"\b[A-Z]{1,2}\d{5,10}\b",
    ],
    # ── United States ─────────────────────────────────────────
    "US_SSN": [
        r"\b\d{3}-\d{2}-\d{4}\b",
        r"\b\d{9}\b",
    ],
    "US_ITIN": [
        r"\b9\d{2}-[7-9]\d-\d{4}\b",
    ],
    "US_BANK_NUMBER": [
        r"\b\d{8,17}\b",
    ],
    "US_DRIVER_LICENSE": [
        r"\b[A-Z]\d{7,8}\b",
    ],
    "US_PASSPORT": [
        r"\b[A-Z]?\d{8,9}\b",
    ],
    # ── United Kingdom ────────────────────────────────────────
    "UK_NHS": [
        r"\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b",
    ],
    "UK_NINO": [
        r"\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b",
    ],
    # ── European Union ────────────────────────────────────────
    "ES_NIF": [
        r"\b\d{8}[A-Z]\b",
        r"\b[XYZ]\d{7}[A-Z]\b",
    ],
    "IT_FISCAL_CODE": [
        r"\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b",
    ],
    "PL_PESEL": [
        r"\b\d{11}\b",
    ],
    "DE_TAX_ID": [
        r"\b\d{11}\b",
    ],
    # ── Australia ─────────────────────────────────────────────
    "AU_TFN": [
        r"\b\d{3}[\s]?\d{3}[\s]?\d{3}\b",
    ],
    "AU_ABN": [
        r"\b\d{2}[\s]?\d{3}[\s]?\d{3}[\s]?\d{3}\b",
    ],
    "AU_MEDICARE": [
        r"\b\d{4}[\s]?\d{5}[\s]?\d{1}\b",
    ],
    # ── Canada ────────────────────────────────────────────────
    "CA_SIN": [
        r"\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b",
    ],
    # ── India ─────────────────────────────────────────────────
    "IN_PAN": [
        r"\b[A-Z]{5}\d{4}[A-Z]\b",
    ],
    "IN_AADHAAR": [
        r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
    ],
    # ── Singapore ─────────────────────────────────────────────
    "SG_NRIC_FIN": [
        r"\b[STFGM]\d{7}[A-Z]\b",
    ],
    # ── New Zealand ───────────────────────────────────────────
    "NZ_IRD": [
        r"\b\d{2,3}[\s-]?\d{3}[\s-]?\d{3}\b",
    ],
    "NZ_NHI": [
        r"\b[A-Z]{3}\d{4}\b",
    ],
}


def _collect_context_words(
    evidence: dict | None,
    definitions: dict,
) -> list[str]:
    """Extract all keywords from corroborative evidence (for Presidio context)."""
    if not evidence:
        return []

    words: list[str] = []
    for match in evidence.get("matches", []):
        match_type = match.get("type", "")

        if match_type == "keyword_list":
            ref_id = match.get("id", "")
            defn = definitions.get(ref_id, {})
            words.extend(defn.get("keywords", []))

        elif match_type == "inline_keyword":
            words.extend(match.get("keywords", []))

    return words


def _collect_evidence_regex(
    evidence: dict | None,
    definitions: dict,
) -> list[str]:
    """Extract all regex patterns from corroborative evidence."""
    if not evidence:
        return []

    patterns: list[str] = []
    for match in evidence.get("matches", []):
        match_type = match.get("type", "")

        if match_type == "regex":
            ref_id = match.get("id", "")
            defn = definitions.get(ref_id, {})
            patterns.extend(defn.get("patterns", []))

        elif match_type == "inline_regex":
            patterns.extend(match.get("patterns", []))

    return patterns


# ── SIT Recognizer Factory ─────────────────────────────────────


class SitRecognizerFactory:
    """Compiles SIT policy definitions into Presidio recognizers."""

    @staticmethod
    def compile(
        sit_name: str,
        rules: dict,
        language: str = "en",
    ) -> list[Any]:
        """Compile a SIT definition into Presidio recognizer(s).

        Args:
            sit_name: The SIT name, used as entity_type prefix (e.g. "HIPAA_PHI").
            rules: The PolicyRules dict (with patterns, definitions, file_scope).
            language: Language code for the recognizer.

        Returns:
            List of Presidio recognizer instances ready to register.
        """
        if not _PRESIDIO_AVAILABLE:
            logger.warning("presidio not available — cannot compile SIT recognizers")
            return []

        patterns = rules.get("patterns", [])
        definitions = rules.get("definitions", {})

        if not patterns:
            return []

        recognizers: list[Any] = []
        entity_type = f"SIT_{sit_name.upper().replace(' ', '_').replace('-', '_')}"

        for i, pattern in enumerate(patterns):
            confidence = pattern.get("confidence_level", 75)
            primary = pattern.get("primary_match", {})
            evidence = pattern.get("corroborative_evidence")
            proximity = pattern.get("proximity", 300)
            primary_type = primary.get("type", "")

            # Collect context words from evidence for Presidio's native boosting
            context_words = _collect_context_words(evidence, definitions)
            evidence_regex = _collect_evidence_regex(evidence, definitions)

            suffix = f"_c{confidence}" if len(patterns) > 1 else ""
            recognizer_name = f"{entity_type}{suffix}"

            if primary_type == "regex":
                # Regex-primary → use PatternRecognizer directly
                recognizer = _build_regex_recognizer(
                    entity_type=entity_type,
                    name=recognizer_name,
                    primary_patterns=primary.get("patterns", []),
                    base_score=confidence / 100.0,
                    context_words=context_words,
                    language=language,
                )
                if recognizer:
                    recognizers.append(recognizer)

            elif primary_type == "entity":
                # Entity-primary → CompositeSitRecognizer
                recognizer = _build_composite_recognizer(
                    entity_type=entity_type,
                    name=recognizer_name,
                    entity_types=primary.get("entity_types", []),
                    min_confidence=primary.get("min_confidence", 0.5),
                    min_count=primary.get("min_count", 1),
                    base_score=confidence / 100.0,
                    context_words=context_words,
                    evidence_regex=evidence_regex,
                    min_evidence_matches=evidence.get("min_matches", 1) if evidence else 0,
                    proximity=proximity,
                    language=language,
                )
                if recognizer:
                    recognizers.append(recognizer)

        return recognizers


def _build_regex_recognizer(
    *,
    entity_type: str,
    name: str,
    primary_patterns: list[str],
    base_score: float,
    context_words: list[str],
    language: str,
) -> Any | None:
    """Build a PatternRecognizer for regex-primary SITs."""
    if not _PRESIDIO_AVAILABLE or not primary_patterns:
        return None

    presidio_patterns = []
    for i, pat in enumerate(primary_patterns):
        try:
            re.compile(pat)  # validate
            presidio_patterns.append(Pattern(
                name=f"{name}_pat{i}",
                regex=pat,
                score=base_score,
            ))
        except re.error:
            logger.warning("Invalid SIT regex pattern '%s' in %s — skipping", pat, name)

    if not presidio_patterns:
        return None

    return PatternRecognizer(
        supported_entity=entity_type,
        name=name,
        patterns=presidio_patterns,
        context=context_words or None,
        supported_language=language,
    )


def _build_composite_recognizer(
    *,
    entity_type: str,
    name: str,
    entity_types: list[str],
    min_confidence: float,
    min_count: int,
    base_score: float,
    context_words: list[str],
    evidence_regex: list[str],
    min_evidence_matches: int,
    proximity: int,
    language: str,
) -> Any | None:
    """Build a CompositeSitRecognizer for entity-primary SITs."""
    if not _PRESIDIO_AVAILABLE:
        return None

    # Gather regex patterns for the requested entity types
    all_patterns: list[str] = []
    for et in entity_types:
        pats = ENTITY_PATTERNS.get(et, [])
        all_patterns.extend(pats)

    if not all_patterns:
        logger.warning(
            "No known regex patterns for entity types %s in SIT %s — "
            "the SIT will still work via the policy engine but won't produce "
            "a Presidio entity type",
            entity_types, name,
        )
        return None

    return CompositeSitRecognizer(
        supported_entity=entity_type,
        name=name,
        primary_patterns=all_patterns,
        min_count=min_count,
        base_score=base_score,
        context_words=context_words,
        evidence_regex=evidence_regex,
        min_evidence_matches=min_evidence_matches,
        proximity=proximity,
        supported_language=language,
    )


# ── Composite SIT Recognizer (entity-primary) ─────────────────


if _PRESIDIO_AVAILABLE:

    class CompositeSitRecognizer(EntityRecognizer):
        """Custom Presidio recognizer for entity-primary SIT definitions.

        Runs regex patterns for the target entity types, then checks for
        corroborative evidence (keywords + regex) within the proximity window.
        Emits a composite SIT entity type with confidence based on evidence found.

        This is the Presidio equivalent of:
            <Entity>
              <Pattern confidenceLevel="85">
                <IdMatch idRef="Func_ssn" />
                <Any minMatches="1">
                  <Match idRef="health_keywords" />
                </Any>
              </Pattern>
            </Entity>
        """

        def __init__(
            self,
            supported_entity: str,
            name: str,
            primary_patterns: list[str],
            min_count: int = 1,
            base_score: float = 0.75,
            context_words: list[str] | None = None,
            evidence_regex: list[str] | None = None,
            min_evidence_matches: int = 0,
            proximity: int = 300,
            supported_language: str = "en",
        ) -> None:
            super().__init__(
                supported_entities=[supported_entity],
                name=name,
                supported_language=supported_language,
            )
            self._primary_compiled = []
            for pat in primary_patterns:
                try:
                    self._primary_compiled.append(re.compile(pat, re.IGNORECASE))
                except re.error:
                    logger.warning("Invalid primary pattern '%s' in %s", pat, name)

            self._min_count = min_count
            self._base_score = base_score
            self._context_words = [w.lower() for w in (context_words or [])]
            self._evidence_regex_compiled = []
            for pat in (evidence_regex or []):
                try:
                    self._evidence_regex_compiled.append(re.compile(pat, re.IGNORECASE))
                except re.error:
                    logger.warning("Invalid evidence regex '%s' in %s", pat, name)
            self._min_evidence = min_evidence_matches
            self._proximity = proximity
            self._no_evidence_required = min_evidence_matches == 0

        def load(self) -> None:
            pass

        _MAX_RECOGNIZER_TEXT = 500_000

        def analyze(
            self,
            text: str,
            entities: list[str],
            nlp_artifacts: NlpArtifacts = None,
        ) -> list[RecognizerResult]:
            """Detect composite SIT entity in text.

            Phase 1: Find primary entity matches via regex.
            Phase 2: For each primary match, check if corroborative evidence
                     exists within the proximity window.
            """
            text = text[:self._MAX_RECOGNIZER_TEXT] if len(text) > self._MAX_RECOGNIZER_TEXT else text

            if self.supported_entities[0] not in entities:
                return []

            # Phase 1: primary detection
            primary_hits: list[tuple[int, int]] = []
            for compiled in self._primary_compiled:
                for m in compiled.finditer(text):
                    primary_hits.append((m.start(), m.end()))

            if len(primary_hits) < self._min_count:
                return []

            # Phase 2: corroborative evidence check
            results: list[RecognizerResult] = []

            for p_start, p_end in primary_hits:
                if self._no_evidence_required:
                    # No evidence needed — emit at base score
                    results.append(RecognizerResult(
                        entity_type=self.supported_entities[0],
                        start=p_start,
                        end=p_end,
                        score=self._base_score,
                    ))
                    continue

                # Check evidence within proximity window
                window_start = max(0, p_start - self._proximity)
                window_end = min(len(text), p_end + self._proximity)
                window_text = text[window_start:window_end].lower()

                evidence_count = 0

                # Keyword evidence
                for kw in self._context_words:
                    if kw in window_text:
                        evidence_count += 1
                        if evidence_count >= self._min_evidence:
                            break

                # Regex evidence (only if keywords weren't enough)
                if evidence_count < self._min_evidence:
                    for compiled in self._evidence_regex_compiled:
                        if compiled.search(window_text):
                            evidence_count += 1
                            if evidence_count >= self._min_evidence:
                                break

                if evidence_count >= self._min_evidence:
                    # Evidence found — emit at full confidence
                    results.append(RecognizerResult(
                        entity_type=self.supported_entities[0],
                        start=p_start,
                        end=p_end,
                        score=self._base_score,
                    ))
                else:
                    # Primary match found but evidence insufficient — emit at reduced score
                    reduced = max(0.1, self._base_score - 0.3)
                    results.append(RecognizerResult(
                        entity_type=self.supported_entities[0],
                        start=p_start,
                        end=p_end,
                        score=reduced,
                    ))

            return results

else:
    # Stub when presidio not installed
    class CompositeSitRecognizer:  # type: ignore[no-redef]
        def __init__(self, **kwargs: Any) -> None:
            pass


# ── Registration helper ────────────────────────────────────────


def register_sit_recognizers(
    analyzer: Any,
    sit_definitions: list[dict],
) -> list[str]:
    """Register SIT definitions as Presidio recognizers on an AnalyzerEngine.

    Args:
        analyzer: A ``presidio_analyzer.AnalyzerEngine`` instance.
        sit_definitions: List of dicts, each with ``name`` and ``rules`` keys.
            ``rules`` follows the PolicyRules schema.

    Returns:
        List of registered entity type names (e.g. ["SIT_HIPAA_PHI", "SIT_PCI_DSS"]).
    """
    if not _PRESIDIO_AVAILABLE:
        return []

    registered: list[str] = []

    for sit_def in sit_definitions:
        name = sit_def.get("name", "")
        rules = sit_def.get("rules", {})

        if not name or not rules.get("patterns"):
            continue

        recognizers = SitRecognizerFactory.compile(name, rules)
        for recognizer in recognizers:
            analyzer.registry.add_recognizer(recognizer)
            entity_type = recognizer.supported_entities[0]
            if entity_type not in registered:
                registered.append(entity_type)
            logger.info("Registered SIT recognizer: %s → %s", name, entity_type)

    return registered
