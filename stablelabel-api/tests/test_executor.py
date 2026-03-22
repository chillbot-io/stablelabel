"""Tests for the job executor signal handling and failure logic."""

import uuid
from unittest.mock import AsyncMock, MagicMock, call

import pytest

from app.core.redis import JobSignal


class TestExecutorSignalHandling:
    """Test that the executor properly handles pause/cancel signals."""

    @pytest.fixture
    def executor(self):
        from app.worker.executor import JobExecutor

        ex = JobExecutor(
            db=AsyncMock(),
            graph=AsyncMock(),
            doc_service=AsyncMock(),
            redis=AsyncMock(),
        )
        # session.add() is sync — use MagicMock to avoid coroutine warnings
        ex._db.add = MagicMock()
        ex._redis.delete = AsyncMock()
        return ex

    @pytest.mark.asyncio
    async def test_handle_pause_signal_sets_paused(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"

        await executor._handle_signal(
            job, JobSignal.PAUSE, "labelling",
            {"phase": "labelling", "files_processed_index": 50},
            batch_number=5,
        )

        assert job.status == "paused"

    @pytest.mark.asyncio
    async def test_handle_cancel_signal_sets_failed(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"

        await executor._handle_signal(
            job, JobSignal.CANCEL, "labelling",
            {"phase": "labelling", "files_processed_index": 50},
            batch_number=5,
        )

        assert job.status == "failed"

    @pytest.mark.asyncio
    async def test_handle_signal_writes_checkpoint_and_commits(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()

        await executor._handle_signal(
            job, JobSignal.PAUSE, "enumeration",
            {"phase": "enumeration", "sites_completed": ["s1"]},
            batch_number=3,
        )

        # Should write checkpoint + commit
        assert executor._db.add.called
        executor._db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_handle_signal_acks_signal_via_redis_delete(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()

        await executor._handle_signal(
            job, JobSignal.PAUSE, "labelling", {}, batch_number=0,
        )

        # Verify signal was acknowledged (deleted from redis)
        executor._redis.delete.assert_awaited()

    @pytest.mark.asyncio
    async def test_pause_preserves_scope_cursor_data(self, executor) -> None:
        """Verify the checkpoint captures the cursor data passed in."""
        job = MagicMock()
        job.id = uuid.uuid4()
        executor._db.add = MagicMock()

        cursor = {"phase": "labelling", "files_processed_index": 42, "files_labelled": 40}
        await executor._handle_signal(job, JobSignal.PAUSE, "labelling", cursor, batch_number=7)

        # Extract the checkpoint that was added to the session
        added_obj = executor._db.add.call_args_list[0][0][0]
        assert added_obj.scope_cursor == cursor
        assert added_obj.batch_number == 7
        assert added_obj.checkpoint_type == "labelling"


class TestFailJob:
    @pytest.mark.asyncio
    async def test_fail_job_sets_status_and_error(self) -> None:
        from app.worker.executor import JobExecutor

        executor = JobExecutor(
            db=AsyncMock(), graph=AsyncMock(),
            doc_service=AsyncMock(), redis=AsyncMock(),
        )

        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"
        job.config = {"target_label_id": "abc"}

        await executor._fail_job(job, "Something went wrong")

        assert job.status == "failed"
        assert job.config["error"] == "Something went wrong"
        executor._db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_fail_job_stores_error_in_config(self) -> None:
        from app.worker.executor import JobExecutor

        executor = JobExecutor(
            db=AsyncMock(), graph=AsyncMock(),
            doc_service=AsyncMock(), redis=AsyncMock(),
        )

        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"
        job.config = {"target_label_id": "keep-this"}

        await executor._fail_job(job, "disk full")

        # Error is stored alongside existing config (not replacing it)
        assert job.config["error"] == "disk full"
        assert job.config["target_label_id"] == "keep-this"


class TestBatchSize:
    def test_batch_size_within_bounds(self) -> None:
        from app.worker.executor import _LABELLING_BATCH_SIZE
        assert 10 <= _LABELLING_BATCH_SIZE <= 500
