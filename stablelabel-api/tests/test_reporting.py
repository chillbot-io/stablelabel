"""Tests for the ReportingService — verifies initialization and URL conversion."""

import asyncio
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.services.reporting import ReportingService


class TestReportingServiceInit:
    def test_converts_asyncpg_url(self) -> None:
        svc = ReportingService(
            database_url="postgresql+asyncpg://user:pass@host:5432/db"
        )
        assert svc._pg_url == "postgresql://user:pass@host:5432/db"

    def test_preserves_plain_postgresql_url(self) -> None:
        svc = ReportingService(database_url="postgresql://user:pass@host/db")
        assert svc._pg_url == "postgresql://user:pass@host/db"

    def test_starts_without_connection(self) -> None:
        svc = ReportingService(database_url="postgresql://localhost/test")
        assert svc._conn is None

    def test_close_without_connection(self) -> None:
        svc = ReportingService(database_url="postgresql://localhost/test")
        svc.close()  # should not raise
        assert svc._conn is None


# ── Helpers ─────────────────────────────────────────────


def _make_service() -> ReportingService:
    return ReportingService(database_url="postgresql://localhost/test")


def _run(coro):
    """Run an async coroutine synchronously."""
    return asyncio.get_event_loop().run_until_complete(coro)


_TENANT = uuid.uuid4()
_MSP = uuid.uuid4()


# ── _get_conn tests ────────────────────────────────────


class TestGetConn:
    def test_creates_duckdb_connection(self) -> None:
        svc = _make_service()
        mock_conn = MagicMock()
        with patch("app.services.reporting.duckdb") as mock_duckdb:
            mock_duckdb.connect.return_value = mock_conn
            conn = svc._get_conn()
            mock_duckdb.connect.assert_called_once_with(":memory:")
            mock_conn.execute.assert_any_call("INSTALL postgres_scanner")
            mock_conn.execute.assert_any_call("LOAD postgres_scanner")
            mock_conn.execute.assert_any_call(
                "CALL postgres_attach($1, source_schema='public', overwrite=true)",
                ["postgresql://localhost/test"],
            )
            assert conn is mock_conn
            assert svc._conn is mock_conn

    def test_returns_existing_connection(self) -> None:
        svc = _make_service()
        mock_conn = MagicMock()
        svc._conn = mock_conn
        with patch("app.services.reporting.duckdb") as mock_duckdb:
            conn = svc._get_conn()
            mock_duckdb.connect.assert_not_called()
            assert conn is mock_conn

    def test_raises_when_duckdb_not_installed(self) -> None:
        svc = _make_service()
        with patch("app.services.reporting.duckdb", None):
            with pytest.raises(RuntimeError, match="DuckDB is not installed"):
                svc._get_conn()


# ── _query tests ───────────────────────────────────────


class TestQuery:
    def _setup_conn(self, svc: ReportingService, rows, columns):
        mock_result = MagicMock()
        mock_result.description = [(c,) for c in columns]
        mock_result.fetchall.return_value = rows
        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_result
        svc._conn = mock_conn
        return mock_conn

    @patch("app.services.reporting.duckdb", new_callable=lambda: MagicMock)
    def test_returns_dict_list(self, _mock_duckdb) -> None:
        svc = _make_service()
        mock_conn = self._setup_conn(svc, [("a", 1), ("b", 2)], ["col1", "col2"])
        result = svc._query("SELECT 1")
        assert result == [{"col1": "a", "col2": 1}, {"col1": "b", "col2": 2}]

    @patch("app.services.reporting.duckdb", new_callable=lambda: MagicMock)
    def test_passes_params(self, _mock_duckdb) -> None:
        svc = _make_service()
        mock_conn = self._setup_conn(svc, [], ["x"])
        svc._query("SELECT $1", ["hello"])
        mock_conn.execute.assert_called_with("SELECT $1", ["hello"])

    @patch("app.services.reporting.duckdb", new_callable=lambda: MagicMock)
    def test_no_params(self, _mock_duckdb) -> None:
        svc = _make_service()
        mock_conn = self._setup_conn(svc, [], ["x"])
        svc._query("SELECT 1")
        mock_conn.execute.assert_called_with("SELECT 1")

    @patch("app.services.reporting.duckdb", new_callable=lambda: MagicMock)
    def test_empty_result(self, _mock_duckdb) -> None:
        svc = _make_service()
        self._setup_conn(svc, [], ["a", "b"])
        assert svc._query("SELECT 1") == []


# ── _async_query tests ─────────────────────────────────


class TestAsyncQuery:
    def test_delegates_to_query(self) -> None:
        svc = _make_service()
        expected = [{"col": "val"}]
        with patch.object(svc, "_query", return_value=expected) as mock_q:
            result = _run(svc._async_query("SQL", ["p1"]))
            mock_q.assert_called_once_with("SQL", ["p1"])
            assert result == expected


# ── Report method tests ────────────────────────────────


class TestJobSummary:
    def test_calls_async_query_with_correct_params(self) -> None:
        svc = _make_service()
        expected = [{"day": "2025-01-01", "status": "completed", "job_count": 5}]
        with patch.object(svc, "_async_query", return_value=expected) as mock_aq:
            result = _run(svc.job_summary(_TENANT, _MSP, days=14))
            assert result == expected
            mock_aq.assert_called_once()
            sql, params = mock_aq.call_args[0]
            assert "jobs" in sql
            assert params == [str(_TENANT), str(_MSP), 14]

    def test_returns_empty_list_when_no_data(self) -> None:
        svc = _make_service()
        with patch.object(svc, "_async_query", return_value=[]):
            result = _run(svc.job_summary(_TENANT, _MSP, days=7))
            assert result == []


class TestEntityDetections:
    def test_calls_async_query_with_correct_params(self) -> None:
        svc = _make_service()
        expected = [{"entity_type": "SSN", "total_detections": 10}]
        with patch.object(svc, "_async_query", return_value=expected) as mock_aq:
            result = _run(svc.entity_detections(_TENANT, _MSP, days=7))
            assert result == expected
            mock_aq.assert_called_once()
            sql, params = mock_aq.call_args[0]
            assert "classification_events" in sql
            assert params == [str(_TENANT), str(_MSP), 7]

    def test_returns_empty_list_when_no_data(self) -> None:
        svc = _make_service()
        with patch.object(svc, "_async_query", return_value=[]):
            result = _run(svc.entity_detections(_TENANT, _MSP, days=30))
            assert result == []


class TestLabelDistribution:
    def test_calls_async_query_with_correct_params(self) -> None:
        svc = _make_service()
        expected = [{"label_applied": "Confidential", "file_count": 42}]
        with patch.object(svc, "_async_query", return_value=expected) as mock_aq:
            result = _run(svc.label_distribution(_TENANT, _MSP, days=60))
            assert result == expected
            mock_aq.assert_called_once()
            sql, params = mock_aq.call_args[0]
            assert "scan_results" in sql
            assert params == [str(_TENANT), str(_MSP), 60]


class TestThroughputStats:
    def test_calls_async_query_with_correct_params(self) -> None:
        svc = _make_service()
        expected = [{"hour": "2025-01-01T00:00", "avg_fps": 12.5}]
        with patch.object(svc, "_async_query", return_value=expected) as mock_aq:
            result = _run(svc.throughput_stats(_TENANT, _MSP, days=3))
            assert result == expected
            mock_aq.assert_called_once()
            sql, params = mock_aq.call_args[0]
            assert "job_metrics" in sql
            assert params == [str(_TENANT), str(_MSP), 3]


class TestTenantOverview:
    def test_returns_first_row(self) -> None:
        svc = _make_service()
        row = {"total_jobs": 10, "completed_jobs": 8, "files_labelled": 100}
        with patch.object(svc, "_async_query", return_value=[row]) as mock_aq:
            result = _run(svc.tenant_overview(_TENANT, _MSP))
            assert result == row
            mock_aq.assert_called_once()
            sql, params = mock_aq.call_args[0]
            assert "total_jobs" in sql
            assert params == [str(_TENANT), str(_MSP)]

    def test_returns_empty_dict_when_no_rows(self) -> None:
        svc = _make_service()
        with patch.object(svc, "_async_query", return_value=[]):
            result = _run(svc.tenant_overview(_TENANT, _MSP))
            assert result == {}


# ── close with active connection ───────────────────────


class TestCloseWithConnection:
    def test_closes_and_clears_connection(self) -> None:
        svc = _make_service()
        mock_conn = MagicMock()
        svc._conn = mock_conn
        svc.close()
        mock_conn.close.assert_called_once()
        assert svc._conn is None
