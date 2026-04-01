"""Tests for app.worker.settings — task functions, lifecycle hooks, and config."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ctx(redis=None, arq_pool=None, settings=None):
    """Build a minimal worker context dict."""
    return {
        "redis": redis or AsyncMock(),
        "arq_pool": arq_pool or AsyncMock(),
        "settings": settings or MagicMock(),
    }


def _mock_get_session(mock_db):
    """Return an async-generator factory that yields *mock_db*."""
    async def _gen():
        yield mock_db
    return _gen


def _make_job(**overrides):
    """Create a mock Job with sensible defaults."""
    job = MagicMock()
    job.id = overrides.get("id", uuid.uuid4())
    job.customer_tenant_id = overrides.get("customer_tenant_id", uuid.uuid4())
    job.created_by = overrides.get("created_by", uuid.uuid4())
    job.name = overrides.get("name", "Test Job")
    job.status = overrides.get("status", "completed")
    job.config = overrides.get("config", {"label_id": "abc", "error": "old err"})
    job.schedule_cron = overrides.get("schedule_cron", "*/5 * * * *")
    job.source_job_id = overrides.get("source_job_id", None)
    return job


# ---------------------------------------------------------------------------
# run_job
# ---------------------------------------------------------------------------


class TestRunJob:
    async def test_creates_executor_and_calls_run(self):
        mock_db = AsyncMock()
        mock_redis = AsyncMock()
        mock_arq = AsyncMock()
        mock_graph = MagicMock()
        mock_doc = MagicMock()
        mock_executor_instance = AsyncMock()

        ctx = _make_ctx(redis=mock_redis, arq_pool=mock_arq)

        with (
            patch("app.worker.settings.get_session", _mock_get_session(mock_db)),
            patch("app.worker.settings.get_graph_client", return_value=mock_graph),
            patch("app.worker.settings.get_document_service", return_value=mock_doc),
            patch("app.worker.settings.JobExecutor", return_value=mock_executor_instance) as mock_cls,
        ):
            from app.worker.settings import run_job
            await run_job(ctx, "job-123")

        mock_cls.assert_called_once_with(
            db=mock_db,
            graph=mock_graph,
            doc_service=mock_doc,
            redis=mock_redis,
            arq_pool=mock_arq,
        )
        mock_executor_instance.run.assert_awaited_once_with("job-123")

    async def test_passes_job_id_through(self):
        mock_executor = AsyncMock()
        ctx = _make_ctx()

        with (
            patch("app.worker.settings.get_session", _mock_get_session(AsyncMock())),
            patch("app.worker.settings.get_graph_client", return_value=MagicMock()),
            patch("app.worker.settings.get_document_service", return_value=MagicMock()),
            patch("app.worker.settings.JobExecutor", return_value=mock_executor),
        ):
            from app.worker.settings import run_job
            await run_job(ctx, "some-other-id")

        mock_executor.run.assert_awaited_once_with("some-other-id")


# ---------------------------------------------------------------------------
# rollback_job
# ---------------------------------------------------------------------------


class TestRollbackJob:
    async def test_creates_executor_and_calls_rollback(self):
        mock_db = AsyncMock()
        mock_redis = AsyncMock()
        mock_graph = MagicMock()
        mock_doc = MagicMock()
        mock_executor_instance = AsyncMock()

        ctx = _make_ctx(redis=mock_redis)

        with (
            patch("app.worker.settings.get_session", _mock_get_session(mock_db)),
            patch("app.worker.settings.get_graph_client", return_value=mock_graph),
            patch("app.worker.settings.get_document_service", return_value=mock_doc),
            patch("app.worker.settings.JobExecutor", return_value=mock_executor_instance) as mock_cls,
        ):
            from app.worker.settings import rollback_job
            await rollback_job(ctx, "rb-job-456")

        mock_cls.assert_called_once_with(
            db=mock_db,
            graph=mock_graph,
            doc_service=mock_doc,
            redis=mock_redis,
        )
        mock_executor_instance.run_rollback.assert_awaited_once_with("rb-job-456")

    async def test_does_not_pass_arq_pool(self):
        """rollback_job should NOT include arq_pool in executor kwargs."""
        mock_executor = AsyncMock()
        ctx = _make_ctx()

        with (
            patch("app.worker.settings.get_session", _mock_get_session(AsyncMock())),
            patch("app.worker.settings.get_graph_client", return_value=MagicMock()),
            patch("app.worker.settings.get_document_service", return_value=MagicMock()),
            patch("app.worker.settings.JobExecutor", return_value=mock_executor) as mock_cls,
        ):
            from app.worker.settings import rollback_job
            await rollback_job(ctx, "x")

        # arq_pool must not appear in the call kwargs
        call_kwargs = mock_cls.call_args.kwargs
        assert "arq_pool" not in call_kwargs


# ---------------------------------------------------------------------------
# sync_labels
# ---------------------------------------------------------------------------


class TestSyncLabels:
    async def test_calls_sync_for_all_tenants(self):
        mock_db = AsyncMock()
        mock_label_service = MagicMock()
        mock_sync = AsyncMock()

        ctx = _make_ctx()

        with (
            patch("app.worker.settings.get_session", _mock_get_session(mock_db)),
            patch("app.worker.settings.get_label_service", return_value=mock_label_service),
            patch("app.services.label_sync.sync_labels_for_all_tenants", mock_sync),
        ):
            from app.worker.settings import sync_labels
            await sync_labels(ctx)

        mock_sync.assert_awaited_once_with(mock_db, mock_label_service)


# ---------------------------------------------------------------------------
# trigger_scheduled_jobs
# ---------------------------------------------------------------------------


class TestTriggerScheduledJobs:
    async def test_enqueues_due_job(self):
        """A job whose cron is due and has no recent copy should be triggered."""
        source_job = _make_job(config={"label_id": "abc", "error": "fail"})
        mock_db = AsyncMock()

        # First execute → returns the scheduled jobs list
        result_scalars = MagicMock()
        result_scalars.all.return_value = [source_job]
        first_result = MagicMock()
        first_result.scalars.return_value = result_scalars

        # Second execute → recent guard returns None (no duplicate)
        second_result = MagicMock()
        second_result.scalar_one_or_none.return_value = None

        mock_db.execute = AsyncMock(side_effect=[first_result, second_result])
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        added_jobs = []
        mock_db.add = MagicMock(side_effect=lambda j: added_jobs.append(j))

        mock_arq = AsyncMock()
        ctx = _make_ctx(arq_pool=mock_arq)

        with (
            patch("app.worker.settings.get_session", _mock_get_session(mock_db)),
            patch("app.worker.cron_eval.is_cron_due", return_value=True),
        ):
            from app.worker.settings import trigger_scheduled_jobs
            await trigger_scheduled_jobs(ctx)

        # A new Job was added to db
        assert len(added_jobs) == 1
        new_job = added_jobs[0]
        assert new_job.config == {"label_id": "abc"}  # "error" key stripped
        assert new_job.status == "enumerating"
        assert new_job.source_job_id == source_job.id
        assert new_job.customer_tenant_id == source_job.customer_tenant_id
        assert new_job.created_by == source_job.created_by

        mock_db.commit.assert_awaited_once()
        mock_db.refresh.assert_awaited_once_with(new_job)
        mock_arq.enqueue_job.assert_awaited_once()

    async def test_skips_job_not_due(self):
        """If cron is not due, the job should be skipped."""
        job = _make_job()
        mock_db = AsyncMock()

        result_scalars = MagicMock()
        result_scalars.all.return_value = [job]
        first_result = MagicMock()
        first_result.scalars.return_value = result_scalars
        mock_db.execute = AsyncMock(return_value=first_result)

        mock_arq = AsyncMock()
        ctx = _make_ctx(arq_pool=mock_arq)

        with (
            patch("app.worker.settings.get_session", _mock_get_session(mock_db)),
            patch("app.worker.cron_eval.is_cron_due", return_value=False),
            patch("app.worker.settings.select", return_value=MagicMock()),
        ):
            from app.worker.settings import trigger_scheduled_jobs
            await trigger_scheduled_jobs(ctx)

        mock_arq.enqueue_job.assert_not_awaited()

    async def test_skips_job_with_no_schedule_cron(self):
        """A job with schedule_cron=None (falsy) in the loop should be skipped."""
        job = _make_job(schedule_cron=None)
        mock_db = AsyncMock()

        result_scalars = MagicMock()
        result_scalars.all.return_value = [job]
        first_result = MagicMock()
        first_result.scalars.return_value = result_scalars
        mock_db.execute = AsyncMock(return_value=first_result)

        mock_arq = AsyncMock()
        ctx = _make_ctx(arq_pool=mock_arq)

        with (
            patch("app.worker.settings.get_session", _mock_get_session(mock_db)),
            patch("app.worker.cron_eval.is_cron_due", return_value=True),
            patch("app.worker.settings.select", return_value=MagicMock()),
        ):
            from app.worker.settings import trigger_scheduled_jobs
            await trigger_scheduled_jobs(ctx)

        mock_arq.enqueue_job.assert_not_awaited()

    async def test_skips_recently_triggered_job(self):
        """If a copy was already created this minute, skip to avoid duplicates."""
        job = _make_job()
        mock_db = AsyncMock()

        result_scalars = MagicMock()
        result_scalars.all.return_value = [job]
        first_result = MagicMock()
        first_result.scalars.return_value = result_scalars

        # Recent guard returns an existing recent job
        second_result = MagicMock()
        second_result.scalar_one_or_none.return_value = MagicMock()  # not None

        mock_db.execute = AsyncMock(side_effect=[first_result, second_result])

        mock_arq = AsyncMock()
        ctx = _make_ctx(arq_pool=mock_arq)

        with (
            patch("app.worker.settings.get_session", _mock_get_session(mock_db)),
            patch("app.worker.cron_eval.is_cron_due", return_value=True),
            patch("app.worker.settings.select", return_value=MagicMock()),
        ):
            from app.worker.settings import trigger_scheduled_jobs
            await trigger_scheduled_jobs(ctx)

        mock_arq.enqueue_job.assert_not_awaited()

    async def test_no_scheduled_jobs(self):
        """Empty query result should be a no-op."""
        mock_db = AsyncMock()

        result_scalars = MagicMock()
        result_scalars.all.return_value = []
        first_result = MagicMock()
        first_result.scalars.return_value = result_scalars
        mock_db.execute = AsyncMock(return_value=first_result)

        mock_arq = AsyncMock()
        ctx = _make_ctx(arq_pool=mock_arq)

        with (
            patch("app.worker.settings.get_session", _mock_get_session(mock_db)),
            patch("app.worker.settings.select", return_value=MagicMock()),
        ):
            from app.worker.settings import trigger_scheduled_jobs
            await trigger_scheduled_jobs(ctx)

        mock_arq.enqueue_job.assert_not_awaited()


# ---------------------------------------------------------------------------
# startup
# ---------------------------------------------------------------------------


class TestStartup:
    async def test_initializes_engine_redis_and_arq(self):
        mock_settings = MagicMock()
        mock_settings.redis_url = "redis://localhost:6379/0"

        mock_redis_instance = AsyncMock()
        mock_arq_pool = AsyncMock()

        ctx: dict = {}

        with (
            patch("app.worker.settings.get_settings", return_value=mock_settings),
            patch("app.worker.settings.init_engine") as mock_init,
            patch("app.worker.settings.Redis") as MockRedis,
            patch("app.worker.settings.create_pool", return_value=mock_arq_pool) as mock_create,
            patch("app.worker.settings.parse_redis_settings", return_value="parsed") as mock_parse,
        ):
            MockRedis.from_url.return_value = mock_redis_instance

            from app.worker.settings import startup
            await startup(ctx)

        mock_init.assert_called_once_with(mock_settings)
        MockRedis.from_url.assert_called_once_with(mock_settings.redis_url, decode_responses=True)
        mock_parse.assert_called_once_with(mock_settings.redis_url)
        mock_create.assert_awaited_once_with("parsed")

        assert ctx["settings"] is mock_settings
        assert ctx["redis"] is mock_redis_instance
        assert ctx["arq_pool"] is mock_arq_pool


# ---------------------------------------------------------------------------
# shutdown
# ---------------------------------------------------------------------------


class TestShutdown:
    async def test_closes_all_connections(self):
        mock_arq = AsyncMock()
        mock_redis = AsyncMock()
        mock_graph = AsyncMock()

        ctx = {"arq_pool": mock_arq, "redis": mock_redis}

        with (
            patch("app.worker.settings.dispose_engine") as mock_dispose,
            patch("app.worker.settings.get_graph_client", return_value=mock_graph),
        ):
            from app.worker.settings import shutdown
            await shutdown(ctx)

        mock_arq.aclose.assert_awaited_once()
        mock_redis.aclose.assert_awaited_once()
        mock_dispose.assert_awaited_once()
        mock_graph.close.assert_awaited_once()

    async def test_handles_missing_arq_pool(self):
        """If arq_pool is not in ctx, shutdown should not crash."""
        mock_redis = AsyncMock()
        mock_graph = AsyncMock()

        ctx = {"redis": mock_redis}  # no arq_pool

        with (
            patch("app.worker.settings.dispose_engine"),
            patch("app.worker.settings.get_graph_client", return_value=mock_graph),
        ):
            from app.worker.settings import shutdown
            await shutdown(ctx)

        mock_redis.aclose.assert_awaited_once()

    async def test_handles_missing_redis(self):
        """If redis is not in ctx, shutdown should not crash."""
        mock_arq = AsyncMock()
        mock_graph = AsyncMock()

        ctx = {"arq_pool": mock_arq}  # no redis

        with (
            patch("app.worker.settings.dispose_engine"),
            patch("app.worker.settings.get_graph_client", return_value=mock_graph),
        ):
            from app.worker.settings import shutdown
            await shutdown(ctx)

        mock_arq.aclose.assert_awaited_once()

    async def test_handles_empty_ctx(self):
        """Shutdown with no arq_pool and no redis should still work."""
        mock_graph = AsyncMock()
        ctx: dict = {}

        with (
            patch("app.worker.settings.dispose_engine"),
            patch("app.worker.settings.get_graph_client", return_value=mock_graph),
        ):
            from app.worker.settings import shutdown
            await shutdown(ctx)

        mock_graph.close.assert_awaited_once()


# ---------------------------------------------------------------------------
# _redis_settings
# ---------------------------------------------------------------------------


class TestRedisSettings:
    def test_returns_parsed_settings(self):
        mock_settings = MagicMock()
        mock_settings.redis_url = "redis://myhost:1234/2"

        with (
            patch("app.worker.settings.get_settings", return_value=mock_settings),
            patch("app.worker.settings.parse_redis_settings", return_value="parsed-rs") as mock_parse,
        ):
            from app.worker.settings import _redis_settings
            result = _redis_settings()

        mock_parse.assert_called_once_with("redis://myhost:1234/2")
        assert result == "parsed-rs"


# ---------------------------------------------------------------------------
# WorkerSettings class attributes
# ---------------------------------------------------------------------------


class TestWorkerSettingsConfig:
    def test_max_jobs(self):
        from app.worker.settings import WorkerSettings
        assert WorkerSettings.max_jobs == 4

    def test_job_timeout(self):
        from app.worker.settings import WorkerSettings
        assert WorkerSettings.job_timeout == 3600

    def test_max_tries(self):
        from app.worker.settings import WorkerSettings
        assert WorkerSettings.max_tries == 2

    def test_functions_list(self):
        from app.worker.settings import WorkerSettings, run_job, rollback_job
        from app.worker.deferred_classify import classify_and_label_file

        assert run_job in WorkerSettings.functions
        assert rollback_job in WorkerSettings.functions
        assert classify_and_label_file in WorkerSettings.functions
        assert len(WorkerSettings.functions) == 3

    def test_on_startup_is_startup(self):
        from app.worker.settings import WorkerSettings, startup
        assert WorkerSettings.on_startup is startup

    def test_on_shutdown_is_shutdown(self):
        from app.worker.settings import WorkerSettings, shutdown
        assert WorkerSettings.on_shutdown is shutdown

    def test_cron_jobs_count(self):
        from app.worker.settings import WorkerSettings
        assert len(WorkerSettings.cron_jobs) == 2
