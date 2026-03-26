"""Tests for chunked classification, text splitting, and entity merging.

These tests exercise the pure logic functions (chunk_text, merge_entity_matches,
is_large_text) and the async wrappers. They do NOT require presidio to be installed.
"""

import asyncio

import pytest

from app.services.classifier import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    LARGE_TEXT_THRESHOLD,
    chunk_text,
    is_large_text,
    merge_entity_matches,
)
from app.services.policy_engine import EntityMatch


# ── chunk_text ──────────────────────────────────────────────────


class TestChunkText:
    def test_small_text_single_chunk(self) -> None:
        text = "Hello world"
        chunks = chunk_text(text, chunk_size=100, overlap=10)
        assert len(chunks) == 1
        assert chunks[0] == (0, "Hello world")

    def test_exact_chunk_size_single_chunk(self) -> None:
        text = "x" * 100
        chunks = chunk_text(text, chunk_size=100, overlap=10)
        assert len(chunks) == 1
        assert chunks[0] == (0, text)

    def test_two_chunks_with_overlap(self) -> None:
        text = "A" * 150
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        assert len(chunks) == 2
        # First chunk: offset 0, length 100
        assert chunks[0] == (0, "A" * 100)
        # Second chunk starts at 100 - 20 = 80
        assert chunks[1][0] == 80
        assert chunks[1][1] == "A" * 70  # chars 80..149

    def test_overlap_region_covered(self) -> None:
        """Verify that the overlap region is present in both adjacent chunks."""
        text = "0123456789" * 20  # 200 chars
        chunks = chunk_text(text, chunk_size=100, overlap=20)

        # The overlap region (chars 80-99) should be in both chunks
        overlap_text = text[80:100]
        assert overlap_text in chunks[0][1]  # end of first chunk
        assert chunks[1][1].startswith(overlap_text)  # start of second chunk

    def test_many_chunks(self) -> None:
        text = "x" * 1000
        chunks = chunk_text(text, chunk_size=100, overlap=10)
        # All text should be covered
        reconstructed = set()
        for offset, chunk in chunks:
            for i, c in enumerate(chunk):
                reconstructed.add(offset + i)
        assert reconstructed == set(range(1000))

    def test_default_params(self) -> None:
        text = "x" * (CHUNK_SIZE + 1)
        chunks = chunk_text(text)
        assert len(chunks) == 2
        # Second chunk starts at CHUNK_SIZE - CHUNK_OVERLAP
        assert chunks[1][0] == CHUNK_SIZE - CHUNK_OVERLAP

    def test_empty_text(self) -> None:
        chunks = chunk_text("")
        assert len(chunks) == 1
        assert chunks[0] == (0, "")


# ── merge_entity_matches ───────────────────────────────────────


class TestMergeEntityMatches:
    def test_no_entities(self) -> None:
        result = merge_entity_matches([])
        assert result == []

    def test_no_overlap(self) -> None:
        """Entities from separate chunks with no position overlap."""
        chunk_results = [
            (0, [EntityMatch(entity_type="SSN", confidence=0.9, start=10, end=20)]),
            (100, [EntityMatch(entity_type="SSN", confidence=0.85, start=50, end=60)]),
        ]
        result = merge_entity_matches(chunk_results)
        assert len(result) == 2
        # Positions should be absolute
        assert result[0].start == 10
        assert result[0].end == 20
        assert result[1].start == 150  # 100 + 50
        assert result[1].end == 160  # 100 + 60

    def test_overlapping_same_type_deduplicates(self) -> None:
        """Same entity detected in overlap region of two chunks → merged."""
        chunk_results = [
            # Chunk 1 (offset 0): SSN at chars 90-100
            (0, [EntityMatch(entity_type="SSN", confidence=0.9, start=90, end=100)]),
            # Chunk 2 (offset 80, 20-char overlap): same SSN at chars 10-20 (abs: 90-100)
            (80, [EntityMatch(entity_type="SSN", confidence=0.95, start=10, end=20)]),
        ]
        result = merge_entity_matches(chunk_results)
        assert len(result) == 1
        # Should keep higher confidence
        assert result[0].confidence == 0.95
        assert result[0].start == 90
        assert result[0].end == 100

    def test_overlapping_different_types_not_merged(self) -> None:
        """Different entity types at same position are NOT merged."""
        chunk_results = [
            (0, [
                EntityMatch(entity_type="SSN", confidence=0.9, start=10, end=20),
                EntityMatch(entity_type="PHONE_NUMBER", confidence=0.8, start=10, end=20),
            ]),
        ]
        result = merge_entity_matches(chunk_results)
        assert len(result) == 2

    def test_adjacent_same_type_not_merged(self) -> None:
        """Same type but non-overlapping positions stay separate."""
        chunk_results = [
            (0, [
                EntityMatch(entity_type="EMAIL", confidence=0.9, start=0, end=20),
                EntityMatch(entity_type="EMAIL", confidence=0.85, start=30, end=50),
            ]),
        ]
        result = merge_entity_matches(chunk_results)
        assert len(result) == 2

    def test_merge_extends_range(self) -> None:
        """When merging overlapping detections, range is extended to cover both."""
        chunk_results = [
            (0, [EntityMatch(entity_type="PERSON", confidence=0.7, start=10, end=25)]),
            (20, [EntityMatch(entity_type="PERSON", confidence=0.8, start=0, end=10)]),
            # Abs positions: (10, 25) and (20, 30) — overlap at 20-25
        ]
        result = merge_entity_matches(chunk_results)
        assert len(result) == 1
        assert result[0].start == 10
        assert result[0].end == 30
        assert result[0].confidence == 0.8

    def test_empty_chunk_results(self) -> None:
        """Chunks that found nothing."""
        chunk_results = [
            (0, []),
            (100, []),
        ]
        result = merge_entity_matches(chunk_results)
        assert result == []


# ── is_large_text ──────────────────────────────────────────────


class TestIsLargeText:
    def test_small_text(self) -> None:
        assert is_large_text("x" * 100) is False

    def test_at_threshold(self) -> None:
        assert is_large_text("x" * LARGE_TEXT_THRESHOLD) is False

    def test_above_threshold(self) -> None:
        assert is_large_text("x" * (LARGE_TEXT_THRESHOLD + 1)) is True

    def test_empty(self) -> None:
        assert is_large_text("") is False
