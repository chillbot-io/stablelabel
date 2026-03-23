"""Content classifier — detects sensitive entities in file content.

Uses presidio-analyzer for PII/PCI detection. Falls back gracefully when
presidio is not installed (it's an optional dependency).

The classifier does NOT download files itself — the executor extracts text
via Graph API and passes it here for scanning.

For large documents (>500 KB of extracted text), use classify_content_chunked()
which splits text into overlapping chunks and merges results, avoiding memory
spikes and enabling parallel classification.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.services.policy_engine import ClassificationResult, EntityMatch

logger = logging.getLogger(__name__)

# Lazy-loaded presidio — optional dependency
_analyzer: Any = None
_analyzer_loaded = False
_analyzer_lock = threading.Lock()

# Thread pool for CPU-bound presidio work so we never block the event loop.
_classifier_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="presidio")

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

# Chunking thresholds (in characters)
LARGE_TEXT_THRESHOLD = 500_000  # ~500 KB — triggers async/chunked classification
CHUNK_SIZE = 50_000  # ~50 KB per chunk
CHUNK_OVERLAP = 1_000  # 1 KB overlap to avoid splitting entities at boundaries


def _get_analyzer() -> Any:
    """Lazy-load the presidio analyzer engine (thread-safe)."""
    global _analyzer, _analyzer_loaded

    if _analyzer_loaded:
        return _analyzer

    with _analyzer_lock:
        # Double-check after acquiring lock
        if _analyzer_loaded:
            return _analyzer

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

        _analyzer_loaded = True

    return _analyzer


# ── Sync classification (runs in thread pool) ─────────────────


def classify_content(
    text: str,
    *,
    filename: str = "",
    entities: list[str] | None = None,
    language: str = "en",
    score_threshold: float = 0.4,
) -> ClassificationResult:
    """Scan text content for sensitive entities (synchronous, CPU-bound).

    For use via asyncio.to_thread() or the async wrappers below.
    """
    if not text or not text.strip():
        return ClassificationResult(filename=filename, text_content=text or "")

    analyzer = _get_analyzer()
    if analyzer is None:
        return ClassificationResult(
            filename=filename,
            text_content=text,
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
            text_content=text,
        )

    except (RuntimeError, ValueError, TypeError, OSError) as exc:
        logger.warning("Classification failed for %s: %s", filename, exc)
        return ClassificationResult(
            filename=filename,
            error=str(exc),
        )


# ── Async wrappers ─────────────────────────────────────────────


async def classify_content_async(
    text: str,
    *,
    filename: str = "",
    entities: list[str] | None = None,
    language: str = "en",
    score_threshold: float = 0.4,
) -> ClassificationResult:
    """Async wrapper — runs presidio in a thread pool to avoid blocking the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _classifier_pool,
        lambda: classify_content(
            text,
            filename=filename,
            entities=entities,
            language=language,
            score_threshold=score_threshold,
        ),
    )


# ── Chunked classification for large documents ─────────────────


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[tuple[int, str]]:
    """Split text into overlapping chunks.

    Returns list of (offset, chunk_text) pairs where offset is the
    character position in the original text.
    """
    if len(text) <= chunk_size:
        return [(0, text)]

    chunks: list[tuple[int, str]] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append((start, text[start:end]))
        if end >= len(text):
            break
        start = end - overlap
    return chunks


def merge_entity_matches(
    chunk_results: list[tuple[int, list[EntityMatch]]],
) -> list[EntityMatch]:
    """Merge entity matches from overlapping chunks, deduplicating the overlap regions.

    Each entry is (chunk_offset, entities_found_in_chunk) where entity start/end
    positions are relative to the chunk. We translate them to absolute positions
    and then deduplicate overlapping detections of the same type.
    """
    all_entities: list[EntityMatch] = []
    for offset, entities in chunk_results:
        for e in entities:
            all_entities.append(EntityMatch(
                entity_type=e.entity_type,
                confidence=e.confidence,
                start=e.start + offset,
                end=e.end + offset,
            ))

    if not all_entities:
        return []

    # Sort by type then position for overlap detection
    all_entities.sort(key=lambda e: (e.entity_type, e.start))

    deduped: list[EntityMatch] = []
    for entity in all_entities:
        if deduped and deduped[-1].entity_type == entity.entity_type:
            prev = deduped[-1]
            if entity.start <= prev.end:
                # Overlapping detection — merge, keep higher confidence
                deduped[-1] = EntityMatch(
                    entity_type=entity.entity_type,
                    confidence=max(prev.confidence, entity.confidence),
                    start=min(prev.start, entity.start),
                    end=max(prev.end, entity.end),
                )
                continue
        deduped.append(entity)

    return deduped


async def classify_content_chunked(
    text: str,
    *,
    filename: str = "",
    entities: list[str] | None = None,
    language: str = "en",
    score_threshold: float = 0.4,
) -> ClassificationResult:
    """Classify a large document by splitting into chunks and processing in parallel.

    Each chunk is classified in the thread pool concurrently, then results
    are merged with overlap deduplication.
    """
    analyzer = _get_analyzer()
    if analyzer is None:
        return ClassificationResult(
            filename=filename,
            text_content=text[:1000],  # truncate for storage
            error="presidio-analyzer not installed",
        )

    chunks = chunk_text(text)
    logger.info(
        "Chunked classification for %s: %d chars → %d chunks",
        filename, len(text), len(chunks),
    )

    loop = asyncio.get_running_loop()

    # Classify each chunk concurrently in the thread pool
    async def _classify_chunk(offset: int, chunk: str) -> tuple[int, list[EntityMatch]]:
        result = await loop.run_in_executor(
            _classifier_pool,
            lambda: classify_content(chunk, filename=filename, entities=entities,
                                     language=language, score_threshold=score_threshold),
        )
        if result.error:
            logger.warning("Chunk at offset %d failed for %s: %s", offset, filename, result.error)
            return offset, []
        return offset, result.entities

    tasks = [_classify_chunk(offset, chunk) for offset, chunk in chunks]
    chunk_results = await asyncio.gather(*tasks)

    merged_entities = merge_entity_matches(list(chunk_results))

    # Store only first 1000 chars of text for very large docs to avoid DB bloat
    stored_text = text[:1000] + f"\n\n[… truncated, {len(text)} chars total]" if len(text) > 1000 else text

    return ClassificationResult(
        filename=filename,
        entities=merged_entities,
        text_content=stored_text,
    )


def is_large_text(text: str) -> bool:
    """Check if text exceeds the threshold for chunked/deferred classification."""
    return len(text) > LARGE_TEXT_THRESHOLD


def is_available() -> bool:
    """Check if the classifier is available (presidio installed)."""
    return _get_analyzer() is not None
