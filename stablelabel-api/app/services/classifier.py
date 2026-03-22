"""Content classifier — detects sensitive entities in file content.

Uses presidio-analyzer for PII/PCI detection. Falls back gracefully when
presidio is not installed (it's an optional dependency).

The classifier does NOT download files itself — the executor extracts text
via Graph API and passes it here for scanning.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.policy_engine import ClassificationResult, EntityMatch

logger = logging.getLogger(__name__)

# Lazy-loaded presidio — optional dependency
_analyzer: Any = None
_analyzer_loaded = False

# Default entity types to scan for
DEFAULT_ENTITIES = [
    "CREDIT_CARD",
    "CRYPTO",
    "EMAIL_ADDRESS",
    "IBAN_CODE",
    "IP_ADDRESS",
    "MEDICAL_LICENSE",
    "PERSON",
    "PHONE_NUMBER",
    "US_BANK_NUMBER",
    "US_DRIVER_LICENSE",
    "US_ITIN",
    "US_PASSPORT",
    "US_SSN",
    "UK_NHS",
    "AU_ABN",
    "AU_ACN",
    "AU_TFN",
    "AU_MEDICARE",
]


def _get_analyzer() -> Any:
    """Lazy-load the presidio analyzer engine."""
    global _analyzer, _analyzer_loaded

    if _analyzer_loaded:
        return _analyzer

    _analyzer_loaded = True
    try:
        from presidio_analyzer import AnalyzerEngine

        _analyzer = AnalyzerEngine()
        logger.info("Presidio analyzer loaded successfully")
    except ImportError:
        logger.warning(
            "presidio-analyzer not installed — content classification disabled. "
            "Install with: pip install 'stablelabel-api[classifier]'"
        )
        _analyzer = None

    return _analyzer


def classify_content(
    text: str,
    *,
    filename: str = "",
    entities: list[str] | None = None,
    language: str = "en",
    score_threshold: float = 0.4,
) -> ClassificationResult:
    """Scan text content for sensitive entities.

    Args:
        text: The text content to scan.
        filename: Original filename (included in result for context).
        entities: Entity types to detect. Defaults to DEFAULT_ENTITIES.
        language: Language code for NLP processing.
        score_threshold: Minimum confidence score to include.

    Returns:
        ClassificationResult with detected entities.
    """
    if not text or not text.strip():
        return ClassificationResult(filename=filename)

    analyzer = _get_analyzer()
    if analyzer is None:
        return ClassificationResult(
            filename=filename,
            error="presidio-analyzer not installed",
        )

    scan_entities = entities or DEFAULT_ENTITIES

    try:
        results = analyzer.analyze(
            text=text,
            entities=scan_entities,
            language=language,
            score_threshold=score_threshold,
        )

        entity_matches = [
            EntityMatch(
                entity_type=r.entity_type,
                confidence=r.score,
                start=r.start,
                end=r.end,
            )
            for r in results
        ]

        return ClassificationResult(
            filename=filename,
            entities=entity_matches,
        )

    except (RuntimeError, ValueError, TypeError, OSError) as exc:
        logger.warning("Classification failed for %s: %s", filename, exc)
        return ClassificationResult(
            filename=filename,
            error=str(exc),
        )


def is_available() -> bool:
    """Check if the classifier is available (presidio installed)."""
    return _get_analyzer() is not None
