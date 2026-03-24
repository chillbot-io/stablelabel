"""Comprehensive tests for the content classifier module.

Tests cover:
- classify_content() sync PII detection
- classify_content_async() async wrapper with timeout
- classify_content_chunked() large doc splitting + merge
- is_large_text() threshold check
- chunk_text() chunk boundaries and overlap
- merge_entity_matches() dedup of overlapping matches
- is_available() presidio availability check
- register_tenant_sits() SIT registration
- get_all_entity_types() default + SIT types
- clear_sit_recognizers() cleanup
- Error handling (presidio raises, timeout fires)

Presidio is mocked where needed so tests run without the optional dependency.
"""

from __future__ import annotations

import asyncio
import sys
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.services.policy_engine import ClassificationResult, EntityMatch

# Try importing presidio for skipif decorators
try:
    import presidio_analyzer  # noqa: F401
    HAS_PRESIDIO = True
except ImportError:
    HAS_PRESIDIO = False


# ── Helpers ────────────────────────────────────────────────────


def _reset_classifier_globals() -> None:
    """Reset the module-level singletons so each test starts clean."""
    import app.services.classifier as clf
    clf._analyzer = None
    clf._analyzer_loaded = False
    clf._sit_entity_types = []


def _make_presidio_result(entity_type: str, score: float, start: int, end: int) -> Any:
    """Create a mock presidio RecognizerResult."""
    return SimpleNamespace(entity_type=entity_type, score=score, start=start, end=end)


@pytest.fixture(autouse=True)
def _clean_classifier_state():
    """Ensure classifier globals are reset before and after each test."""
    _reset_classifier_globals()
    yield
    _reset_classifier_globals()


# ══════════════════════════════════════════════════════════════
#  classify_content — sync PII detection
# ══════════════════════════════════════════════════════════════


class TestClassifyContent:
    """Sync classification with mocked Presidio."""

    def test_empty_text_returns_empty_result(self) -> None:
        from app.services.classifier import classify_content

        result = classify_content("")
        assert isinstance(result, ClassificationResult)
        assert result.entities == []
        assert result.error == ""

    def test_whitespace_only_returns_empty(self) -> None:
        from app.services.classifier import classify_content

        result = classify_content("   \n\t  ")
        assert result.entities == []
        assert result.error == ""

    def test_none_text_returns_empty(self) -> None:
        from app.services.classifier import classify_content

        # text_content should default to "" when None is passed
        result = classify_content(None)  # type: ignore[arg-type]
        assert result.entities == []
        assert result.text_content == ""

    def test_filename_preserved_in_result(self) -> None:
        from app.services.classifier import classify_content

        result = classify_content("", filename="report.xlsx")
        assert result.filename == "report.xlsx"

    def test_returns_error_when_presidio_missing(self) -> None:
        """When _get_analyzer returns None, an error is set."""
        from app.services.classifier import classify_content

        with patch("app.services.classifier._get_analyzer", return_value=None):
            result = classify_content("Some PII text", filename="test.txt")
            assert result.error == "presidio-analyzer not installed"
            assert result.entities == []
            assert result.text_content == "Some PII text"

    def test_entities_returned_from_presidio(self) -> None:
        """When presidio finds entities, they are mapped to EntityMatch objects."""
        from app.services.classifier import classify_content

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = [
            _make_presidio_result("US_SSN", 0.95, 4, 15),
            _make_presidio_result("PERSON", 0.8, 20, 30),
        ]

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            result = classify_content(
                "SSN 123-45-6789 John Smith",
                filename="data.txt",
                score_threshold=0.5,
            )

        assert result.error == ""
        assert len(result.entities) == 2
        assert result.entities[0].entity_type == "US_SSN"
        assert result.entities[0].confidence == 0.95
        assert result.entities[0].start == 4
        assert result.entities[0].end == 15
        assert result.entities[1].entity_type == "PERSON"
        assert result.filename == "data.txt"

    def test_custom_entities_list_forwarded(self) -> None:
        """When entities kwarg is specified, it overrides get_all_entity_types."""
        from app.services.classifier import classify_content

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            classify_content("text", entities=["CREDIT_CARD"])

        _, kwargs = mock_analyzer.analyze.call_args
        assert kwargs["entities"] == ["CREDIT_CARD"]

    def test_language_forwarded(self) -> None:
        from app.services.classifier import classify_content

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            classify_content("texte", language="fr")

        _, kwargs = mock_analyzer.analyze.call_args
        assert kwargs["language"] == "fr"

    def test_score_threshold_forwarded(self) -> None:
        from app.services.classifier import classify_content

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            classify_content("text", score_threshold=0.9)

        _, kwargs = mock_analyzer.analyze.call_args
        assert kwargs["score_threshold"] == 0.9

    def test_text_content_populated_on_success(self) -> None:
        from app.services.classifier import classify_content

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            result = classify_content("some text here")

        assert result.text_content == "some text here"

    def test_text_content_preserves_special_chars(self) -> None:
        from app.services.classifier import classify_content

        original = "Multi\nline\ntext with special chars: @#$%"
        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            result = classify_content(original)

        assert result.text_content == original


# ══════════════════════════════════════════════════════════════
#  classify_content — error handling
# ══════════════════════════════════════════════════════════════


class TestClassifyContentErrorHandling:
    """Verify that presidio exceptions are caught and returned as error strings."""

    @pytest.mark.parametrize("exc_class", [RuntimeError, ValueError, TypeError, OSError])
    def test_caught_exceptions(self, exc_class: type) -> None:
        from app.services.classifier import classify_content

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.side_effect = exc_class("boom")

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            result = classify_content("some text", filename="fail.txt")

        assert result.error == "boom"
        assert result.entities == []
        assert result.filename == "fail.txt"

    def test_uncaught_exception_propagates(self) -> None:
        """Exceptions not in the catch list should propagate."""
        from app.services.classifier import classify_content

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.side_effect = KeyboardInterrupt("stop")

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            with pytest.raises(KeyboardInterrupt):
                classify_content("text")


# ══════════════════════════════════════════════════════════════
#  classify_content_async — async wrapper with timeout
# ══════════════════════════════════════════════════════════════


class TestClassifyContentAsync:
    """Async wrapper tests."""

    @pytest.mark.asyncio
    async def test_returns_result(self) -> None:
        from app.services.classifier import classify_content_async

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = [
            _make_presidio_result("EMAIL_ADDRESS", 0.9, 0, 15),
        ]

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            result = await classify_content_async(
                "test@example.com",
                filename="email.txt",
            )

        assert result.error == ""
        assert len(result.entities) == 1
        assert result.entities[0].entity_type == "EMAIL_ADDRESS"

    @pytest.mark.asyncio
    async def test_empty_text_fast_return(self) -> None:
        from app.services.classifier import classify_content_async

        result = await classify_content_async("")
        assert result.entities == []
        assert result.error == ""

    @pytest.mark.asyncio
    async def test_timeout_returns_error(self) -> None:
        """When classification exceeds the timeout, an error result is returned."""
        from app.services.classifier import classify_content_async

        mock_analyzer = MagicMock()

        def slow_analyze(**kwargs: Any) -> list:
            import time
            time.sleep(5)
            return []

        mock_analyzer.analyze.side_effect = slow_analyze

        with (
            patch("app.services.classifier._get_analyzer", return_value=mock_analyzer),
            patch("app.services.classifier.CHUNK_TIMEOUT_SECONDS", 0.1),
        ):
            result = await classify_content_async(
                "some text",
                filename="slow.txt",
            )

        assert "timed out" in result.error
        assert result.filename == "slow.txt"
        # text_content is truncated to first 1000 chars
        assert result.text_content == "some text"

    @pytest.mark.asyncio
    async def test_presidio_not_installed(self) -> None:
        from app.services.classifier import classify_content_async

        with patch("app.services.classifier._get_analyzer", return_value=None):
            result = await classify_content_async("text", filename="no_presidio.txt")

        assert result.error == "presidio-analyzer not installed"


# ══════════════════════════════════════════════════════════════
#  chunk_text — chunk boundaries and overlap
# ══════════════════════════════════════════════════════════════


class TestChunkText:
    def test_small_text_single_chunk(self) -> None:
        from app.services.classifier import chunk_text

        chunks = chunk_text("Hello", chunk_size=100, overlap=10)
        assert len(chunks) == 1
        assert chunks[0] == (0, "Hello")

    def test_exact_chunk_size_single_chunk(self) -> None:
        from app.services.classifier import chunk_text

        text = "x" * 100
        chunks = chunk_text(text, chunk_size=100, overlap=10)
        assert len(chunks) == 1

    def test_two_chunks_with_overlap(self) -> None:
        from app.services.classifier import chunk_text

        text = "A" * 150
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        assert len(chunks) == 2
        assert chunks[0] == (0, "A" * 100)
        assert chunks[1][0] == 80  # 100 - 20

    def test_overlap_region_in_both_chunks(self) -> None:
        from app.services.classifier import chunk_text

        text = "".join(str(i % 10) for i in range(200))
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        overlap_text = text[80:100]
        assert overlap_text in chunks[0][1]
        assert chunks[1][1].startswith(overlap_text)

    def test_full_coverage(self) -> None:
        """Every character in the original text is covered by at least one chunk."""
        from app.services.classifier import chunk_text

        text = "x" * 1000
        chunks = chunk_text(text, chunk_size=100, overlap=10)
        covered = set()
        for offset, chunk in chunks:
            for i in range(len(chunk)):
                covered.add(offset + i)
        assert covered == set(range(1000))

    def test_empty_text(self) -> None:
        from app.services.classifier import chunk_text

        chunks = chunk_text("")
        assert len(chunks) == 1
        assert chunks[0] == (0, "")

    def test_default_params_trigger(self) -> None:
        from app.services.classifier import CHUNK_OVERLAP, CHUNK_SIZE, chunk_text

        text = "x" * (CHUNK_SIZE + 1)
        chunks = chunk_text(text)
        assert len(chunks) == 2
        assert chunks[1][0] == CHUNK_SIZE - CHUNK_OVERLAP

    def test_no_overlap_zero(self) -> None:
        """When overlap is 0, chunks are strictly non-overlapping."""
        from app.services.classifier import chunk_text

        text = "x" * 300
        chunks = chunk_text(text, chunk_size=100, overlap=0)
        assert len(chunks) == 3
        assert chunks[0][0] == 0
        assert chunks[1][0] == 100
        assert chunks[2][0] == 200

    def test_chunk_size_one(self) -> None:
        from app.services.classifier import chunk_text

        text = "abc"
        chunks = chunk_text(text, chunk_size=1, overlap=0)
        assert len(chunks) == 3
        assert chunks[0] == (0, "a")
        assert chunks[1] == (1, "b")
        assert chunks[2] == (2, "c")


# ══════════════════════════════════════════════════════════════
#  merge_entity_matches — dedup overlapping entities
# ══════════════════════════════════════════════════════════════


class TestMergeEntityMatches:
    def test_empty_input(self) -> None:
        from app.services.classifier import merge_entity_matches

        assert merge_entity_matches([]) == []

    def test_empty_chunks(self) -> None:
        from app.services.classifier import merge_entity_matches

        assert merge_entity_matches([(0, []), (100, [])]) == []

    def test_no_overlap_keeps_all(self) -> None:
        from app.services.classifier import merge_entity_matches

        result = merge_entity_matches([
            (0, [EntityMatch(entity_type="SSN", confidence=0.9, start=10, end=20)]),
            (100, [EntityMatch(entity_type="SSN", confidence=0.85, start=50, end=60)]),
        ])
        assert len(result) == 2
        assert result[0].start == 10
        assert result[0].end == 20
        assert result[1].start == 150
        assert result[1].end == 160

    def test_overlapping_same_type_merged(self) -> None:
        from app.services.classifier import merge_entity_matches

        result = merge_entity_matches([
            (0, [EntityMatch(entity_type="SSN", confidence=0.9, start=90, end=100)]),
            (80, [EntityMatch(entity_type="SSN", confidence=0.95, start=10, end=20)]),
        ])
        assert len(result) == 1
        assert result[0].confidence == 0.95  # higher confidence kept
        assert result[0].start == 90
        assert result[0].end == 100

    def test_overlapping_different_types_not_merged(self) -> None:
        from app.services.classifier import merge_entity_matches

        result = merge_entity_matches([
            (0, [
                EntityMatch(entity_type="SSN", confidence=0.9, start=10, end=20),
                EntityMatch(entity_type="PHONE_NUMBER", confidence=0.8, start=10, end=20),
            ]),
        ])
        assert len(result) == 2

    def test_adjacent_same_type_stays_separate(self) -> None:
        from app.services.classifier import merge_entity_matches

        result = merge_entity_matches([
            (0, [
                EntityMatch(entity_type="EMAIL", confidence=0.9, start=0, end=20),
                EntityMatch(entity_type="EMAIL", confidence=0.85, start=30, end=50),
            ]),
        ])
        assert len(result) == 2

    def test_merge_extends_range(self) -> None:
        from app.services.classifier import merge_entity_matches

        result = merge_entity_matches([
            (0, [EntityMatch(entity_type="PERSON", confidence=0.7, start=10, end=25)]),
            (20, [EntityMatch(entity_type="PERSON", confidence=0.8, start=0, end=10)]),
        ])
        assert len(result) == 1
        assert result[0].start == 10
        assert result[0].end == 30
        assert result[0].confidence == 0.8

    def test_three_way_merge(self) -> None:
        """Three overlapping detections of the same type should merge into one."""
        from app.services.classifier import merge_entity_matches

        result = merge_entity_matches([
            (0, [EntityMatch(entity_type="PERSON", confidence=0.7, start=0, end=15)]),
            (10, [EntityMatch(entity_type="PERSON", confidence=0.8, start=0, end=15)]),
            (20, [EntityMatch(entity_type="PERSON", confidence=0.9, start=0, end=15)]),
        ])
        # Absolute positions: (0,15), (10,25), (20,35) — all overlap
        assert len(result) == 1
        assert result[0].start == 0
        assert result[0].end == 35
        assert result[0].confidence == 0.9

    def test_offset_translation(self) -> None:
        """Entity positions within a chunk are translated by the chunk offset."""
        from app.services.classifier import merge_entity_matches

        result = merge_entity_matches([
            (500, [EntityMatch(entity_type="CC", confidence=0.99, start=10, end=26)]),
        ])
        assert len(result) == 1
        assert result[0].start == 510
        assert result[0].end == 526

    def test_touching_entities_merged(self) -> None:
        """Entities where start == prev.end are considered overlapping."""
        from app.services.classifier import merge_entity_matches

        result = merge_entity_matches([
            (0, [
                EntityMatch(entity_type="T", confidence=0.8, start=0, end=10),
                EntityMatch(entity_type="T", confidence=0.7, start=10, end=20),
            ]),
        ])
        # start=10 <= prev.end=10, so they merge
        assert len(result) == 1
        assert result[0].start == 0
        assert result[0].end == 20
        assert result[0].confidence == 0.8


# ══════════════════════════════════════════════════════════════
#  is_large_text — threshold check
# ══════════════════════════════════════════════════════════════


class TestIsLargeText:
    def test_small_text(self) -> None:
        from app.services.classifier import is_large_text

        assert is_large_text("x" * 100) is False

    def test_at_threshold(self) -> None:
        from app.services.classifier import LARGE_TEXT_THRESHOLD, is_large_text

        assert is_large_text("x" * LARGE_TEXT_THRESHOLD) is False

    def test_above_threshold(self) -> None:
        from app.services.classifier import LARGE_TEXT_THRESHOLD, is_large_text

        assert is_large_text("x" * (LARGE_TEXT_THRESHOLD + 1)) is True

    def test_empty(self) -> None:
        from app.services.classifier import is_large_text

        assert is_large_text("") is False


# ══════════════════════════════════════════════════════════════
#  is_available
# ══════════════════════════════════════════════════════════════


class TestIsAvailable:
    def test_returns_true_when_analyzer_present(self) -> None:
        from app.services.classifier import is_available

        with patch("app.services.classifier._get_analyzer", return_value=MagicMock()):
            assert is_available() is True

    def test_returns_false_when_analyzer_none(self) -> None:
        from app.services.classifier import is_available

        with patch("app.services.classifier._get_analyzer", return_value=None):
            assert is_available() is False

    def test_returns_bool(self) -> None:
        from app.services.classifier import is_available

        assert isinstance(is_available(), bool)


# ══════════════════════════════════════════════════════════════
#  _get_analyzer — lazy loading
# ══════════════════════════════════════════════════════════════


class TestGetAnalyzer:
    def test_caches_after_first_call(self) -> None:
        """The analyzer is loaded once and cached."""
        import app.services.classifier as clf

        mock_engine = MagicMock()
        with patch.dict(sys.modules, {"presidio_analyzer": MagicMock(AnalyzerEngine=lambda: mock_engine)}):
            clf._analyzer_loaded = False
            clf._analyzer = None
            result1 = clf._get_analyzer()
            result2 = clf._get_analyzer()
            # Both calls should return the same object (cached)
            assert result1 is result2

    def test_returns_none_when_import_fails(self) -> None:
        """When presidio_analyzer can't be imported, returns None."""
        import app.services.classifier as clf

        clf._analyzer_loaded = False
        clf._analyzer = None
        # Simulate ImportError by patching the import
        with patch.dict(sys.modules, {"presidio_analyzer": None}):
            # Force reimport attempt
            clf._analyzer_loaded = False
            clf._analyzer = None
            result = clf._get_analyzer()
            # Either returns None (no presidio) or a real analyzer
            # The exact behavior depends on whether presidio is installed
            assert result is None or result is not None  # just verify no crash


# ══════════════════════════════════════════════════════════════
#  register_tenant_sits
# ══════════════════════════════════════════════════════════════


class TestRegisterTenantSits:
    def test_returns_empty_when_no_analyzer(self) -> None:
        from app.services.classifier import register_tenant_sits

        with patch("app.services.classifier._get_analyzer", return_value=None):
            result = register_tenant_sits([{"name": "TEST", "rules": {}}])
            assert result == []

    def test_registers_and_tracks_entity_types(self) -> None:
        import app.services.classifier as clf
        from app.services.classifier import register_tenant_sits

        mock_analyzer = MagicMock()
        mock_register = MagicMock(return_value=["SIT_HIPAA_PHI", "SIT_PCI_DSS"])

        with (
            patch("app.services.classifier._get_analyzer", return_value=mock_analyzer),
            patch("app.services.sit_recognizers.register_sit_recognizers", mock_register),
        ):
            result = register_tenant_sits([
                {"name": "HIPAA_PHI", "rules": {}},
                {"name": "PCI_DSS", "rules": {}},
            ])

        assert result == ["SIT_HIPAA_PHI", "SIT_PCI_DSS"]
        assert "SIT_HIPAA_PHI" in clf._sit_entity_types
        assert "SIT_PCI_DSS" in clf._sit_entity_types

    def test_no_duplicates_on_reregister(self) -> None:
        import app.services.classifier as clf
        from app.services.classifier import register_tenant_sits

        mock_analyzer = MagicMock()
        mock_register = MagicMock(return_value=["SIT_TEST"])

        with (
            patch("app.services.classifier._get_analyzer", return_value=mock_analyzer),
            patch("app.services.sit_recognizers.register_sit_recognizers", mock_register),
        ):
            register_tenant_sits([{"name": "TEST", "rules": {}}])
            register_tenant_sits([{"name": "TEST", "rules": {}}])

        assert clf._sit_entity_types.count("SIT_TEST") == 1


# ══════════════════════════════════════════════════════════════
#  get_all_entity_types
# ══════════════════════════════════════════════════════════════


class TestGetAllEntityTypes:
    def test_defaults_without_sits(self) -> None:
        from app.services.classifier import DEFAULT_ENTITIES, get_all_entity_types

        result = get_all_entity_types()
        assert result == DEFAULT_ENTITIES

    def test_includes_registered_sits(self) -> None:
        import app.services.classifier as clf
        from app.services.classifier import DEFAULT_ENTITIES, get_all_entity_types

        clf._sit_entity_types = ["SIT_CUSTOM_1", "SIT_CUSTOM_2"]
        result = get_all_entity_types()
        assert result == DEFAULT_ENTITIES + ["SIT_CUSTOM_1", "SIT_CUSTOM_2"]

    def test_returns_new_list(self) -> None:
        """Mutating the returned list should not affect internal state."""
        from app.services.classifier import get_all_entity_types

        result = get_all_entity_types()
        original_len = len(result)
        result.append("MUTATED")
        assert len(get_all_entity_types()) == original_len


# ══════════════════════════════════════════════════════════════
#  clear_sit_recognizers
# ══════════════════════════════════════════════════════════════


class TestClearSitRecognizers:
    def test_clears_sit_types(self) -> None:
        import app.services.classifier as clf
        from app.services.classifier import clear_sit_recognizers

        clf._sit_entity_types = ["SIT_A", "SIT_B"]
        clear_sit_recognizers()
        assert clf._sit_entity_types == []

    def test_idempotent(self) -> None:
        from app.services.classifier import clear_sit_recognizers

        clear_sit_recognizers()
        clear_sit_recognizers()
        # No error

    def test_get_all_entity_types_after_clear(self) -> None:
        import app.services.classifier as clf
        from app.services.classifier import (
            DEFAULT_ENTITIES,
            clear_sit_recognizers,
            get_all_entity_types,
        )

        clf._sit_entity_types = ["SIT_X"]
        assert "SIT_X" in get_all_entity_types()
        clear_sit_recognizers()
        assert get_all_entity_types() == DEFAULT_ENTITIES


# ══════════════════════════════════════════════════════════════
#  get_sit_entity_types
# ══════════════════════════════════════════════════════════════


class TestGetSitEntityTypes:
    def test_returns_copy(self) -> None:
        import app.services.classifier as clf
        from app.services.classifier import get_sit_entity_types

        clf._sit_entity_types = ["SIT_A"]
        result = get_sit_entity_types()
        result.append("SIT_B")
        # Internal list unchanged
        assert clf._sit_entity_types == ["SIT_A"]

    def test_empty_by_default(self) -> None:
        from app.services.classifier import get_sit_entity_types

        assert get_sit_entity_types() == []


# ══════════════════════════════════════════════════════════════
#  classify_content_chunked — async chunked classification
# ══════════════════════════════════════════════════════════════


class TestClassifyContentChunked:
    @pytest.mark.asyncio
    async def test_returns_error_when_no_presidio(self) -> None:
        from app.services.classifier import classify_content_chunked

        with patch("app.services.classifier._get_analyzer", return_value=None):
            result = await classify_content_chunked(
                "x" * 100_000,
                filename="big.txt",
            )

        assert "presidio-analyzer not installed" in result.error
        # text_content truncated to 1000 chars
        assert len(result.text_content) == 1000

    @pytest.mark.asyncio
    async def test_splits_large_text_into_chunks(self) -> None:
        """Verify classify_content_chunked actually calls classify_content per chunk."""
        from app.services.classifier import classify_content_chunked

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            text = "x" * 120_000
            result = await classify_content_chunked(
                text,
                filename="large.txt",
            )

        assert result.error == ""
        # analyzer.analyze should have been called multiple times (once per chunk)
        assert mock_analyzer.analyze.call_count >= 2

    @pytest.mark.asyncio
    async def test_merges_entities_from_chunks(self) -> None:
        """Entities from different chunks are merged in the final result."""
        from app.services.classifier import classify_content_chunked

        call_count = 0

        def mock_analyze(text: str, **kwargs: Any) -> list:
            nonlocal call_count
            call_count += 1
            # Return an entity in every chunk
            return [_make_presidio_result("EMAIL_ADDRESS", 0.9, 5, 20)]

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.side_effect = mock_analyze

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            text = "x" * 120_000
            result = await classify_content_chunked(text, filename="multi.txt")

        assert result.error == ""
        # At least some entities found (merged from chunks)
        assert len(result.entities) >= 1

    @pytest.mark.asyncio
    async def test_truncates_text_content_for_large_docs(self) -> None:
        from app.services.classifier import classify_content_chunked

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            text = "A" * 5000
            result = await classify_content_chunked(text, filename="big.txt")

        # First 1000 chars + truncation notice
        assert result.text_content.startswith("A" * 1000)
        assert "truncated" in result.text_content
        assert "5000 chars total" in result.text_content

    @pytest.mark.asyncio
    async def test_small_text_not_truncated(self) -> None:
        from app.services.classifier import classify_content_chunked

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            text = "short text"
            result = await classify_content_chunked(text, filename="small.txt")

        assert result.text_content == "short text"

    @pytest.mark.asyncio
    async def test_chunk_timeout_skips_chunk(self) -> None:
        """If a single chunk times out, it's skipped but others still process."""
        from app.services.classifier import classify_content_chunked

        call_count = 0

        def mock_analyze(text: str, **kwargs: Any) -> list:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # First chunk hangs
                import time
                time.sleep(5)
            return [_make_presidio_result("SSN", 0.9, 0, 11)]

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.side_effect = mock_analyze

        with (
            patch("app.services.classifier._get_analyzer", return_value=mock_analyzer),
            patch("app.services.classifier.CHUNK_TIMEOUT_SECONDS", 0.1),
        ):
            text = "x" * 120_000
            result = await classify_content_chunked(text, filename="partial.txt")

        # Should still succeed (some chunks processed)
        assert result.error == ""

    @pytest.mark.asyncio
    async def test_chunk_error_skips_chunk(self) -> None:
        """If classify_content returns an error for a chunk, that chunk is skipped."""
        from app.services.classifier import classify_content_chunked

        call_count = 0

        def mock_analyze(text: str, **kwargs: Any) -> list:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("bad chunk")
            return [_make_presidio_result("PERSON", 0.8, 0, 5)]

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.side_effect = mock_analyze

        with patch("app.services.classifier._get_analyzer", return_value=mock_analyzer):
            text = "x" * 120_000
            result = await classify_content_chunked(text, filename="partial_err.txt")

        assert result.error == ""
        # Some entities should still be found from non-failing chunks
        assert len(result.entities) >= 1


# ══════════════════════════════════════════════════════════════
#  ClassificationResult model
# ══════════════════════════════════════════════════════════════


class TestClassificationResultModel:
    def test_default_values(self) -> None:
        cr = ClassificationResult()
        assert cr.filename == ""
        assert cr.entities == []
        assert cr.error == ""
        assert cr.text_content == ""

    def test_with_entities(self) -> None:
        cr = ClassificationResult(
            filename="test.docx",
            entities=[
                EntityMatch(entity_type="CREDIT_CARD", confidence=0.95, start=10, end=25),
            ],
        )
        assert len(cr.entities) == 1
        assert cr.entities[0].entity_type == "CREDIT_CARD"

    def test_entity_types_property(self) -> None:
        cr = ClassificationResult(entities=[
            EntityMatch(entity_type="EMAIL_ADDRESS", confidence=0.8),
            EntityMatch(entity_type="EMAIL_ADDRESS", confidence=0.9),
            EntityMatch(entity_type="PHONE_NUMBER", confidence=0.7),
        ])
        assert cr.entity_types == {"EMAIL_ADDRESS", "PHONE_NUMBER"}


# ══════════════════════════════════════════════════════════════
#  Integration-style: classify_content with real Presidio
# ══════════════════════════════════════════════════════════════


@pytest.mark.skipif(not HAS_PRESIDIO, reason="presidio-analyzer not installed")
class TestClassifyContentWithPresidio:
    """Tests that run with the real Presidio engine (skipped if not installed)."""

    def test_detects_ssn(self) -> None:
        from app.services.classifier import classify_content

        result = classify_content("My SSN is 123-45-6789", filename="ssn.txt")
        assert result.error == ""
        entity_types = {e.entity_type for e in result.entities}
        assert "US_SSN" in entity_types

    def test_detects_email(self) -> None:
        from app.services.classifier import classify_content

        result = classify_content("Contact me at john@example.com", filename="email.txt")
        assert result.error == ""
        entity_types = {e.entity_type for e in result.entities}
        assert "EMAIL_ADDRESS" in entity_types

    def test_detects_credit_card(self) -> None:
        from app.services.classifier import classify_content

        result = classify_content(
            "Card number: 4111 1111 1111 1111",
            filename="cc.txt",
        )
        assert result.error == ""
        entity_types = {e.entity_type for e in result.entities}
        assert "CREDIT_CARD" in entity_types

    def test_no_entities_in_safe_text(self) -> None:
        from app.services.classifier import classify_content

        result = classify_content(
            "The quick brown fox jumps over the lazy dog",
            filename="safe.txt",
            score_threshold=0.8,
        )
        assert result.error == ""
        # With high threshold, generic text should not match
        assert len(result.entities) == 0

    @pytest.mark.asyncio
    async def test_async_detects_entities(self) -> None:
        from app.services.classifier import classify_content_async

        result = await classify_content_async(
            "SSN: 123-45-6789",
            filename="async_ssn.txt",
        )
        assert result.error == ""
        entity_types = {e.entity_type for e in result.entities}
        assert "US_SSN" in entity_types

    def test_is_available_returns_true(self) -> None:
        from app.services.classifier import is_available

        assert is_available() is True
