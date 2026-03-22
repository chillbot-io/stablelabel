"""Tests for the ReportingService — verifies initialization and URL conversion."""

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
