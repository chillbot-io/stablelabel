"""DuckDB-powered reporting engine — analytical queries over PostgreSQL data.

DuckDB runs embedded in the API process (no separate server). It reads
directly from PostgreSQL via the postgres_scanner extension — no ETL
needed. This gives us fast OLAP queries without loading all data into
memory.

Usage:
    reporting = ReportingService(database_url="postgresql://...")
    summary = await reporting.job_summary(tenant_id)
    detections = await reporting.entity_detections(tenant_id, days=30)
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

try:
    import duckdb
except ImportError:
    duckdb = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


@dataclass
class ReportRow:
    """A single row from a reporting query."""
    data: dict[str, Any]


class ReportingService:
    """Analytical reporting via DuckDB + postgres_scanner."""

    def __init__(self, database_url: str) -> None:
        # Convert asyncpg URL to psycopg-style for DuckDB postgres_scanner
        self._pg_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
        self._conn: duckdb.DuckDBPyConnection | None = None

    def _get_conn(self):
        """Lazy-init DuckDB connection with postgres_scanner."""
        if duckdb is None:
            raise RuntimeError(
                "DuckDB is not installed. Install with: pip install duckdb"
            )
        if self._conn is None:
            self._conn = duckdb.connect(":memory:")
            self._conn.execute("INSTALL postgres_scanner")
            self._conn.execute("LOAD postgres_scanner")
            self._conn.execute(
                f"CALL postgres_attach('{self._pg_url}', "
                f"source_schema='public', overwrite=true)"
            )
        return self._conn

    def _query(self, sql: str, params: dict | None = None) -> list[dict[str, Any]]:
        """Execute a SQL query and return results as dicts."""
        conn = self._get_conn()
        if params:
            result = conn.execute(sql, list(params.values()))
        else:
            result = conn.execute(sql)
        columns = [desc[0] for desc in result.description]
        return [dict(zip(columns, row)) for row in result.fetchall()]

    async def _async_query(self, sql: str, params: dict | None = None) -> list[dict[str, Any]]:
        """Run query in thread pool to avoid blocking the event loop."""
        return await asyncio.to_thread(self._query, sql, params)

    # ── Report queries ──────────────────────────────────────

    async def job_summary(
        self,
        customer_tenant_id: uuid.UUID,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """Job execution summary — counts by status over time."""
        return await self._async_query(
            """
            SELECT
                date_trunc('day', completed_at) AS day,
                status,
                count(*) AS job_count,
                sum(total_files) AS total_files,
                sum(processed_files) AS processed_files,
                sum(failed_files) AS failed_files,
                sum(skipped_files) AS skipped_files
            FROM jobs
            WHERE customer_tenant_id = $1
              AND created_at >= now() - INTERVAL '1 day' * $2
            GROUP BY 1, 2
            ORDER BY 1 DESC
            """,
            {"tenant": str(customer_tenant_id), "days": days},
        )

    async def entity_detections(
        self,
        customer_tenant_id: uuid.UUID,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """Entity type detection counts over time — for PII trend charts."""
        return await self._async_query(
            """
            SELECT
                date_trunc('day', ts) AS day,
                entity_type,
                sum(entity_count) AS total_detections,
                count(DISTINCT file_name) AS files_affected,
                max(max_confidence) AS peak_confidence
            FROM classification_events
            WHERE customer_tenant_id = $1
              AND ts >= now() - INTERVAL '1 day' * $2
            GROUP BY 1, 2
            ORDER BY 1 DESC, total_detections DESC
            """,
            {"tenant": str(customer_tenant_id), "days": days},
        )

    async def label_distribution(
        self,
        customer_tenant_id: uuid.UUID,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """Label application distribution — for pie/bar charts."""
        return await self._async_query(
            """
            SELECT
                label_applied,
                outcome,
                count(*) AS file_count
            FROM scan_results
            WHERE customer_tenant_id = $1
              AND ts >= now() - INTERVAL '1 day' * $2
              AND label_applied IS NOT NULL
            GROUP BY 1, 2
            ORDER BY file_count DESC
            """,
            {"tenant": str(customer_tenant_id), "days": days},
        )

    async def throughput_stats(
        self,
        customer_tenant_id: uuid.UUID,
        days: int = 7,
    ) -> list[dict[str, Any]]:
        """Throughput metrics — files/sec over time for performance monitoring."""
        return await self._async_query(
            """
            SELECT
                date_trunc('hour', ts) AS hour,
                avg(files_per_second) AS avg_fps,
                max(files_per_second) AS max_fps,
                sum(files_processed) AS total_processed,
                sum(files_failed) AS total_failed,
                avg(duration_ms) AS avg_batch_ms
            FROM job_metrics
            WHERE customer_tenant_id = $1
              AND ts >= now() - INTERVAL '1 day' * $2
            GROUP BY 1
            ORDER BY 1 DESC
            """,
            {"tenant": str(customer_tenant_id), "days": days},
        )

    async def tenant_overview(
        self,
        customer_tenant_id: uuid.UUID,
    ) -> dict[str, Any]:
        """High-level tenant dashboard stats — single row summary."""
        rows = await self._async_query(
            """
            SELECT
                (SELECT count(*) FROM jobs WHERE customer_tenant_id = $1)
                    AS total_jobs,
                (SELECT count(*) FROM jobs
                 WHERE customer_tenant_id = $1 AND status = 'completed')
                    AS completed_jobs,
                (SELECT count(*) FROM scan_results
                 WHERE customer_tenant_id = $1 AND outcome = 'labelled')
                    AS files_labelled,
                (SELECT count(*) FROM scan_results
                 WHERE customer_tenant_id = $1 AND outcome = 'failed')
                    AS files_failed,
                (SELECT count(DISTINCT entity_type) FROM classification_events
                 WHERE customer_tenant_id = $1)
                    AS entity_types_detected,
                (SELECT sum(entity_count) FROM classification_events
                 WHERE customer_tenant_id = $1)
                    AS total_detections
            """,
            {"tenant": str(customer_tenant_id)},
        )
        return rows[0] if rows else {}

    def close(self) -> None:
        """Close the DuckDB connection."""
        if self._conn:
            self._conn.close()
            self._conn = None
