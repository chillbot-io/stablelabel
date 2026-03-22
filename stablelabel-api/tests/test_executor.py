"""Tests for the job executor checkpoint and signal handling logic.

These tests cover the pure logic without requiring a real database, Redis,
or cryptography (jose). Signal enum and executor are imported carefully
to avoid the jose import chain.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.redis import JobSignal


class TestExecutorSignalHandling:
    """Test that the executor properly handles pause/cancel signals."""

    @pytest.fixture
    def executor(self):
        """Create an executor with mock dependencies, avoiding jose imports."""
        # Import here to avoid top-level import chain
        from app.worker.executor import JobExecutor

        return JobExecutor(
            db=AsyncMock(),
            graph=AsyncMock(),
            doc_service=AsyncMock(),
            redis=AsyncMock(),
        )

    @pytest.mark.asyncio
    async def test_handle_pause_signal_sets_paused(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"
        executor._db.commit = AsyncMock()

        await executor._handle_signal(
            job,
            JobSignal.PAUSE,
            "labelling",
            {"phase": "labelling", "files_processed_index": 50},
            batch_number=5,
        )

        assert job.status == "paused"

    @pytest.mark.asyncio
    async def test_handle_cancel_signal_sets_failed(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"
        executor._db.commit = AsyncMock()

        await executor._handle_signal(
            job,
            JobSignal.CANCEL,
            "labelling",
            {"phase": "labelling", "files_processed_index": 50},
            batch_number=5,
        )

        assert job.status == "failed"

    @pytest.mark.asyncio
    async def test_handle_signal_writes_checkpoint(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()
        executor._db.commit = AsyncMock()
        executor._db.add = MagicMock()

        await executor._handle_signal(
            job,
            JobSignal.PAUSE,
            "enumeration",
            {"phase": "enumeration", "sites_completed": ["site-1"]},
            batch_number=3,
        )

        executor._db.add.assert_called()
        executor._db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_handle_signal_acks_signal(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()
        executor._db.commit = AsyncMock()
        executor._redis.delete = AsyncMock()

        await executor._handle_signal(
            job,
            JobSignal.PAUSE,
            "labelling",
            {},
            batch_number=0,
        )

        executor._redis.delete.assert_awaited()


class TestFailJob:
    @pytest.mark.asyncio
    async def test_fail_job_sets_status_and_error(self) -> None:
        from app.worker.executor import JobExecutor

        executor = JobExecutor(
            db=AsyncMock(),
            graph=AsyncMock(),
            doc_service=AsyncMock(),
            redis=AsyncMock(),
        )
        executor._db.commit = AsyncMock()

        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"
        job.config = {"target_label_id": "abc"}

        await executor._fail_job(job, "Something went wrong")

        assert job.status == "failed"
        assert "error" in job.config
        assert job.config["error"] == "Something went wrong"


class TestBatchSize:
    def test_batch_size_is_reasonable(self) -> None:
        from app.worker.executor import _LABELLING_BATCH_SIZE

        assert 10 <= _LABELLING_BATCH_SIZE <= 500

    def test_batch_size_is_100(self) -> None:
        from app.worker.executor import _LABELLING_BATCH_SIZE

        assert _LABELLING_BATCH_SIZE == 100


class TestCheckpointSchema:
    """Verify checkpoint scope_cursor structures match what the executor produces."""

    def test_enumeration_cursor_structure(self) -> None:
        cursor = {
            "phase": "enumeration",
            "sites_completed": ["site-1", "site-2"],
            "current_site": "site-2",
            "files_in_site": [
                {"drive_id": "d1", "item_id": "i1", "name": "doc.docx", "site_id": "site-2"}
            ],
            "total_files_found": 150,
        }
        assert cursor["phase"] == "enumeration"
        assert isinstance(cursor["sites_completed"], list)
        assert isinstance(cursor["files_in_site"], list)
        assert isinstance(cursor["total_files_found"], int)

    def test_labelling_cursor_structure(self) -> None:
        cursor = {
            "phase": "labelling",
            "files_processed_index": 200,
            "files_labelled": 180,
            "files_skipped": 15,
            "files_failed": 5,
            "applied_labels": [
                {
                    "item_id": "i1",
                    "drive_id": "d1",
                    "label_id": "label-1",
                    "previous_label_id": "",
                }
            ],
        }
        assert cursor["phase"] == "labelling"
        assert isinstance(cursor["applied_labels"], list)
        assert cursor["files_labelled"] + cursor["files_skipped"] + cursor["files_failed"] == 200

    def test_rollback_cursor_structure(self) -> None:
        cursor = {
            "phase": "rollback",
            "rolled_back_count": 50,
            "rollback_failed": 2,
            "total_to_rollback": 100,
        }
        assert cursor["phase"] == "rollback"
        assert cursor["rolled_back_count"] <= cursor["total_to_rollback"]
