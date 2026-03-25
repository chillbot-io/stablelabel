"""Integration tests for jobs router — actions, updates, checkpoints, results, RBAC.

Covers endpoints NOT already tested in test_api_integration.py:
  - PATCH  update job
  - POST   start / pause / resume / cancel / rollback / copy
  - GET    checkpoints
  - GET    results (paginated, filterable)
  - Role enforcement (viewer cannot mutate)
  - Invalid state transition errors
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import AsyncIterator
from unittest.mock import AsyncMock

import httpx
import pytest

from app.db.models import Job, JobCheckpoint, ScanResult
from app.dependencies import get_arq_pool
from tests.conftest import (
    CUSTOMER_TENANT_ID,
    MSP_TENANT_ID,
    OPERATOR_USER,
    OPERATOR_USER_ID,
    VIEWER_USER,
    _build_app,
)

CT = str(CUSTOMER_TENANT_ID)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_arq_pool() -> AsyncMock:
    pool = AsyncMock()
    pool.enqueue_job = AsyncMock(return_value=None)
    # send_job_signal calls pool.publish — mock it too
    pool.publish = AsyncMock(return_value=None)
    return pool


def _make_operator_client(db_session, arq_pool=None):
    """Build an operator client with arq pool override."""
    overrides = {}
    if arq_pool is not None:
        overrides[get_arq_pool] = lambda: arq_pool
    app = _build_app(OPERATOR_USER, db_session, service_overrides=overrides)
    return app


def _make_viewer_client(db_session, arq_pool=None):
    overrides = {}
    if arq_pool is not None:
        overrides[get_arq_pool] = lambda: arq_pool
    app = _build_app(VIEWER_USER, db_session, service_overrides=overrides)
    return app


async def _create_job(client: httpx.AsyncClient, name: str = "Test job") -> dict:
    resp = await client.post(
        f"/tenants/{CT}/jobs",
        json={"name": name, "config": {"scope": "all"}},
    )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
async def arq_pool():
    return _mock_arq_pool()


@pytest.fixture()
async def op_client(db_session, arq_pool) -> AsyncIterator[httpx.AsyncClient]:
    app = _make_operator_client(db_session, arq_pool)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture()
async def vw_client(db_session, arq_pool) -> AsyncIterator[httpx.AsyncClient]:
    app = _make_viewer_client(db_session, arq_pool)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# 1. PATCH /tenants/{id}/jobs/{job_id} — update job
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_job_name(op_client: httpx.AsyncClient):
    job = await _create_job(op_client)
    resp = await op_client.patch(
        f"/tenants/{CT}/jobs/{job['id']}",
        json={"name": "Renamed job"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed job"


@pytest.mark.asyncio
async def test_update_job_config(op_client: httpx.AsyncClient):
    job = await _create_job(op_client)
    new_config = {"scope": "specific", "sites": ["site-a"]}
    resp = await op_client.patch(
        f"/tenants/{CT}/jobs/{job['id']}",
        json={"config": new_config},
    )
    assert resp.status_code == 200
    assert resp.json()["config"] == new_config


@pytest.mark.asyncio
async def test_update_job_schedule(op_client: httpx.AsyncClient):
    job = await _create_job(op_client)
    resp = await op_client.patch(
        f"/tenants/{CT}/jobs/{job['id']}",
        json={"schedule_cron": "0 2 * * *"},
    )
    assert resp.status_code == 200
    assert resp.json()["schedule_cron"] == "0 2 * * *"


@pytest.mark.asyncio
async def test_update_running_job_rejected(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    """Cannot update a job that is running."""
    job = await _create_job(op_client)
    # Start the job to move it to 'enumerating'
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")

    resp = await op_client.patch(
        f"/tenants/{CT}/jobs/{job['id']}",
        json={"name": "Should fail"},
    )
    assert resp.status_code == 400
    assert "Cannot update job" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_update_paused_job_allowed(op_client: httpx.AsyncClient, arq_pool):
    """Paused jobs CAN be updated."""
    job = await _create_job(op_client)
    # pending -> enumerating -> paused
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/pause")

    resp = await op_client.patch(
        f"/tenants/{CT}/jobs/{job['id']}",
        json={"name": "Updated while paused"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated while paused"


# ---------------------------------------------------------------------------
# 2. POST /tenants/{id}/jobs/{job_id}/start
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_job(op_client: httpx.AsyncClient, arq_pool):
    job = await _create_job(op_client)
    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "enumerating"
    assert data["started_at"] is not None
    arq_pool.enqueue_job.assert_called_once_with("run_job", job["id"])


@pytest.mark.asyncio
async def test_start_already_running_job_rejected(op_client: httpx.AsyncClient, arq_pool):
    """Cannot start a job that is already enumerating/running."""
    job = await _create_job(op_client)
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")
    assert resp.status_code == 409
    assert "Cannot start" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 3. POST /tenants/{id}/jobs/{job_id}/pause
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pause_enumerating_job(op_client: httpx.AsyncClient, arq_pool):
    job = await _create_job(op_client)
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/pause")
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"


@pytest.mark.asyncio
async def test_pause_pending_job_rejected(op_client: httpx.AsyncClient, arq_pool):
    """Cannot pause a pending job — it must be enumerating or running first."""
    job = await _create_job(op_client)

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/pause")
    assert resp.status_code == 409
    assert "Cannot pause" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 4. POST /tenants/{id}/jobs/{job_id}/resume
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resume_paused_job_no_checkpoint(op_client: httpx.AsyncClient, arq_pool):
    """Resume with no checkpoints defaults to 'running'."""
    job = await _create_job(op_client)
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/pause")

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/resume")
    assert resp.status_code == 200
    assert resp.json()["status"] == "running"


@pytest.mark.asyncio
async def test_resume_paused_job_with_enumeration_checkpoint(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    """Resume with an enumeration checkpoint goes back to 'enumerating'."""
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/pause")

    # Insert an enumeration checkpoint
    cp = JobCheckpoint(
        job_id=job_id,
        checkpoint_type="enumeration",
        batch_number=1,
        status="completed",
        items_processed=100,
        items_failed=0,
        scope_cursor={"phase": "enumeration"},
    )
    db_session.add(cp)
    await db_session.flush()

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/resume")
    assert resp.status_code == 200
    assert resp.json()["status"] == "enumerating"


@pytest.mark.asyncio
async def test_resume_pending_job_rejected(op_client: httpx.AsyncClient, arq_pool):
    """Cannot resume a pending job."""
    job = await _create_job(op_client)

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/resume")
    assert resp.status_code == 409
    assert "Cannot resume" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 5. POST /tenants/{id}/jobs/{job_id}/cancel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_pending_job(op_client: httpx.AsyncClient, arq_pool):
    job = await _create_job(op_client)

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/cancel")
    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"


@pytest.mark.asyncio
async def test_cancel_enumerating_job_sends_signal(op_client: httpx.AsyncClient, arq_pool):
    """Cancelling a running job should send a cancel signal via Redis."""
    job = await _create_job(op_client)
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/cancel")
    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"
    # send_job_signal uses redis.set() to store the cancel signal
    arq_pool.set.assert_called_once()


@pytest.mark.asyncio
async def test_cancel_completed_job_rejected(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    """Cannot cancel a completed job."""
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    # Manually set job to completed
    from sqlalchemy import update
    from app.db.models import Job

    await db_session.execute(
        update(Job).where(Job.id == job_id).values(status="completed")
    )
    await db_session.flush()

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/cancel")
    assert resp.status_code == 409
    assert "Cannot cancel" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 6. POST /tenants/{id}/jobs/{job_id}/rollback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rollback_completed_job(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    # Set job to completed
    from sqlalchemy import update
    from app.db.models import Job

    await db_session.execute(
        update(Job).where(Job.id == job_id).values(status="completed")
    )
    await db_session.flush()

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/rollback")
    assert resp.status_code == 200
    assert resp.json()["status"] == "rolling_back"
    arq_pool.enqueue_job.assert_called_with("rollback_job", job["id"])


@pytest.mark.asyncio
async def test_rollback_failed_job(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    from sqlalchemy import update
    from app.db.models import Job

    await db_session.execute(
        update(Job).where(Job.id == job_id).values(status="failed")
    )
    await db_session.flush()

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/rollback")
    assert resp.status_code == 200
    assert resp.json()["status"] == "rolling_back"


@pytest.mark.asyncio
async def test_rollback_pending_job_rejected(op_client: httpx.AsyncClient, arq_pool):
    """Cannot rollback a pending job."""
    job = await _create_job(op_client)

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/rollback")
    assert resp.status_code == 409
    assert "Cannot rollback" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 7. POST /tenants/{id}/jobs/{job_id}/copy
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_copy_completed_job(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    job = await _create_job(op_client, name="Original job")
    job_id = uuid.UUID(job["id"])

    from sqlalchemy import update
    from app.db.models import Job

    await db_session.execute(
        update(Job).where(Job.id == job_id).values(status="completed")
    )
    await db_session.flush()

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/copy")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Original job (copy)"
    assert data["status"] == "pending"
    assert data["source_job_id"] == job["id"]
    assert data["config"] == {"scope": "all"}
    # New job should have a different ID
    assert data["id"] != job["id"]


@pytest.mark.asyncio
async def test_copy_failed_job(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    from sqlalchemy import update
    from app.db.models import Job

    await db_session.execute(
        update(Job).where(Job.id == job_id).values(
            status="failed", config={"scope": "all", "error": "something broke"}
        )
    )
    await db_session.flush()

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/copy")
    assert resp.status_code == 200
    # Error key should be stripped from copied config
    assert "error" not in resp.json()["config"]


@pytest.mark.asyncio
async def test_copy_pending_job_rejected(op_client: httpx.AsyncClient, arq_pool):
    """Cannot copy a pending job."""
    job = await _create_job(op_client)

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/copy")
    assert resp.status_code == 409
    assert "Cannot copy" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_copy_running_job_rejected(
    op_client: httpx.AsyncClient, arq_pool
):
    """Cannot copy a running (enumerating) job."""
    job = await _create_job(op_client)
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/copy")
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# 8. GET /tenants/{id}/jobs/{job_id}/checkpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_checkpoints_empty(op_client: httpx.AsyncClient, arq_pool):
    job = await _create_job(op_client)
    resp = await op_client.get(f"/tenants/{CT}/jobs/{job['id']}/checkpoints")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_checkpoints_with_data(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    for i in range(3):
        cp = JobCheckpoint(
            job_id=job_id,
            checkpoint_type="labelling",
            batch_number=i + 1,
            status="completed",
            items_processed=(i + 1) * 50,
            items_failed=i,
            scope_cursor={"batch": i + 1},
        )
        db_session.add(cp)
    await db_session.flush()

    resp = await op_client.get(f"/tenants/{CT}/jobs/{job['id']}/checkpoints")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    assert data[0]["batch_number"] == 1
    assert data[2]["batch_number"] == 3
    assert data[2]["items_processed"] == 150


@pytest.mark.asyncio
async def test_list_checkpoints_nonexistent_job(op_client: httpx.AsyncClient, arq_pool):
    fake_id = str(uuid.uuid4())
    resp = await op_client.get(f"/tenants/{CT}/jobs/{fake_id}/checkpoints")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 9. GET /tenants/{id}/jobs/{job_id}/results
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_results_empty(op_client: httpx.AsyncClient, arq_pool):
    job = await _create_job(op_client)
    resp = await op_client.get(f"/tenants/{CT}/jobs/{job['id']}/results")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_list_results_with_data(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    for i in range(5):
        sr = ScanResult(
            customer_tenant_id=CUSTOMER_TENANT_ID,
            job_id=job_id,
            drive_id=f"drive-{i}",
            item_id=f"item-{i}",
            file_name=f"file-{i}.docx",
            classification="PII" if i < 3 else None,
            confidence=0.9 if i < 3 else None,
            label_applied="label-1" if i < 3 else None,
            outcome="labelled" if i < 3 else "skipped",
        )
        db_session.add(sr)
    await db_session.flush()

    resp = await op_client.get(f"/tenants/{CT}/jobs/{job['id']}/results")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 5


@pytest.mark.asyncio
async def test_list_results_filter_by_outcome(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    outcomes = ["labelled", "labelled", "skipped", "failed", "labelled"]
    for i, outcome in enumerate(outcomes):
        sr = ScanResult(
            customer_tenant_id=CUSTOMER_TENANT_ID,
            job_id=job_id,
            drive_id=f"drive-{i}",
            item_id=f"item-{i}",
            file_name=f"file-{i}.docx",
            outcome=outcome,
        )
        db_session.add(sr)
    await db_session.flush()

    # Filter labelled
    resp = await op_client.get(
        f"/tenants/{CT}/jobs/{job['id']}/results", params={"outcome": "labelled"}
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 3

    # Filter skipped
    resp = await op_client.get(
        f"/tenants/{CT}/jobs/{job['id']}/results", params={"outcome": "skipped"}
    )
    assert resp.json()["total"] == 1

    # Filter failed
    resp = await op_client.get(
        f"/tenants/{CT}/jobs/{job['id']}/results", params={"outcome": "failed"}
    )
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_list_results_pagination(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    for i in range(7):
        sr = ScanResult(
            customer_tenant_id=CUSTOMER_TENANT_ID,
            job_id=job_id,
            drive_id=f"drive-{i}",
            item_id=f"item-{i}",
            file_name=f"file-{i}.docx",
            outcome="labelled",
        )
        db_session.add(sr)
    await db_session.flush()

    resp = await op_client.get(
        f"/tenants/{CT}/jobs/{job['id']}/results",
        params={"page": 1, "page_size": 3},
    )
    data = resp.json()
    assert data["total"] == 7
    assert len(data["items"]) == 3
    assert data["page"] == 1
    assert data["page_size"] == 3

    resp2 = await op_client.get(
        f"/tenants/{CT}/jobs/{job['id']}/results",
        params={"page": 3, "page_size": 3},
    )
    data2 = resp2.json()
    assert len(data2["items"]) == 1  # 7 total, page 3 of 3 = 1 item


# ---------------------------------------------------------------------------
# 10. Role enforcement — viewer cannot create/update/action jobs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_viewer_cannot_update_job(
    op_client: httpx.AsyncClient, vw_client: httpx.AsyncClient
):
    job = await _create_job(op_client)

    resp = await vw_client.patch(
        f"/tenants/{CT}/jobs/{job['id']}",
        json={"name": "Should fail"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_start_job(
    op_client: httpx.AsyncClient, vw_client: httpx.AsyncClient
):
    job = await _create_job(op_client)

    resp = await vw_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_cancel_job(
    op_client: httpx.AsyncClient, vw_client: httpx.AsyncClient
):
    job = await _create_job(op_client)

    resp = await vw_client.post(f"/tenants/{CT}/jobs/{job['id']}/cancel")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_copy_job(
    op_client: httpx.AsyncClient, vw_client: httpx.AsyncClient, db_session
):
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    from sqlalchemy import update
    from app.db.models import Job

    await db_session.execute(
        update(Job).where(Job.id == job_id).values(status="completed")
    )
    await db_session.flush()

    resp = await vw_client.post(f"/tenants/{CT}/jobs/{job['id']}/copy")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_can_list_checkpoints(
    op_client: httpx.AsyncClient, vw_client: httpx.AsyncClient
):
    """Viewers CAN read checkpoints (Viewer role required, not Operator)."""
    job = await _create_job(op_client)

    resp = await vw_client.get(f"/tenants/{CT}/jobs/{job['id']}/checkpoints")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_viewer_can_list_results(
    op_client: httpx.AsyncClient, vw_client: httpx.AsyncClient
):
    """Viewers CAN read results (Viewer role required, not Operator)."""
    job = await _create_job(op_client)

    resp = await vw_client.get(f"/tenants/{CT}/jobs/{job['id']}/results")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 11. Invalid state transitions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_action_rejected(op_client: httpx.AsyncClient, arq_pool):
    job = await _create_job(op_client)
    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/explode")
    assert resp.status_code == 400
    assert "Unknown action" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cannot_pause_paused_job(op_client: httpx.AsyncClient, arq_pool):
    job = await _create_job(op_client)
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/pause")

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/pause")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_cannot_resume_non_paused_job(op_client: httpx.AsyncClient, arq_pool):
    """Resume only valid from paused state."""
    job = await _create_job(op_client)
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")

    # Job is now enumerating, not paused
    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/resume")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_cannot_start_failed_job(
    op_client: httpx.AsyncClient, db_session, arq_pool
):
    """Start only valid from pending."""
    job = await _create_job(op_client)
    job_id = uuid.UUID(job["id"])

    from sqlalchemy import update
    from app.db.models import Job

    await db_session.execute(
        update(Job).where(Job.id == job_id).values(status="failed")
    )
    await db_session.flush()

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")
    assert resp.status_code == 409
    assert "Cannot start" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cannot_rollback_enumerating_job(op_client: httpx.AsyncClient, arq_pool):
    """Rollback not valid from enumerating state."""
    job = await _create_job(op_client)
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/rollback")
    assert resp.status_code == 409
    assert "Cannot rollback" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cancel_then_start_rejected(op_client: httpx.AsyncClient, arq_pool):
    """Once cancelled (failed), cannot start again."""
    job = await _create_job(op_client)
    await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/cancel")

    resp = await op_client.post(f"/tenants/{CT}/jobs/{job['id']}/start")
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# 12. GET /tenants/{id}/jobs — list jobs with status filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_jobs_filter_by_status(op_client: httpx.AsyncClient, arq_pool):
    """Filtering by status should return only jobs with that status."""
    await _create_job(op_client, "Job A")
    await _create_job(op_client, "Job B")

    # Start Job A so it moves to 'enumerating'
    jobs_resp = await op_client.get(f"/tenants/{CT}/jobs")
    all_jobs = jobs_resp.json()["items"]
    # Items are ordered by created_at desc, so oldest is last
    job_a = all_jobs[-1]
    await op_client.post(f"/tenants/{CT}/jobs/{job_a['id']}/start")

    # Filter by pending — should exclude the enumerating job
    resp = await op_client.get(f"/tenants/{CT}/jobs", params={"status": "pending"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert all(j["status"] == "pending" for j in data["items"])
    assert job_a["id"] not in [j["id"] for j in data["items"]]

    # Filter by enumerating — should include only Job A
    resp2 = await op_client.get(f"/tenants/{CT}/jobs", params={"status": "enumerating"})
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert all(j["status"] == "enumerating" for j in data2["items"])
    assert job_a["id"] in [j["id"] for j in data2["items"]]


# ---------------------------------------------------------------------------
# 13. GET /tenants/{id}/jobs/{job_id} — get nonexistent job
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_nonexistent_job(op_client: httpx.AsyncClient):
    """Getting a job that does not exist should return 404."""
    fake_id = str(uuid.uuid4())
    resp = await op_client.get(f"/tenants/{CT}/jobs/{fake_id}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 14. POST /tenants/{id}/jobs — create job on nonexistent tenant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_job_tenant_not_found(db_session, arq_pool):
    """Creating a job on a tenant that doesn't exist in CustomerTenant should 404.

    We mock check_tenant_access to bypass RBAC (since we can't create a
    UserTenantAccess row for a non-existent tenant due to FK constraints),
    then let the job creation code discover the tenant doesn't exist.
    """
    from unittest.mock import AsyncMock, patch

    fake_tenant_id = uuid.uuid4()

    app = _make_operator_client(db_session, arq_pool)
    transport = httpx.ASGITransport(app=app)
    with patch("app.routers.jobs.check_tenant_access", new_callable=AsyncMock):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.post(
                f"/tenants/{fake_tenant_id}/jobs",
                json={"name": "Ghost tenant job", "config": {}},
            )
    assert resp.status_code == 404
    assert "Tenant not found" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 15. POST /tenants/{id}/jobs — create job when consent is not active
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_job_consent_not_active(db_session, arq_pool):
    """Creating a job on a tenant whose consent_status is not 'active' should 400."""
    from app.db.models import CustomerTenant, UserTenantAccess

    inactive_tenant = CustomerTenant(
        msp_tenant_id=MSP_TENANT_ID,
        entra_tenant_id="inactive-entra-id",
        display_name="Inactive Consent Tenant",
        consent_status="pending",
        consent_requested_at=datetime.now(timezone.utc),
    )
    db_session.add(inactive_tenant)
    await db_session.flush()

    db_session.add(UserTenantAccess(
        user_id=OPERATOR_USER_ID,
        customer_tenant_id=inactive_tenant.id,
        created_by="test",
    ))
    await db_session.flush()

    app = _make_operator_client(db_session, arq_pool)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post(
            f"/tenants/{inactive_tenant.id}/jobs",
            json={"name": "Should fail", "config": {}},
        )
    assert resp.status_code == 400
    assert "consent not active" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 16. GET /tenants/{id}/jobs/{job_id}/progress — SSE progress stream
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_progress_stream_nonexistent_job(op_client: httpx.AsyncClient):
    """SSE progress endpoint should return 404 for a nonexistent job."""
    fake_id = str(uuid.uuid4())
    resp = await op_client.get(f"/tenants/{CT}/jobs/{fake_id}/progress")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_progress_stream_terminal_job(op_client: httpx.AsyncClient, arq_pool):
    """SSE stream returns progress event and stops for a job in terminal state.

    We create a job, then cancel it (which moves it to 'failed' — a terminal
    status). The progress endpoint should emit at least one event and close.
    """
    job = await _create_job(op_client)
    job_id = job["id"]

    # Cancel moves pending -> failed (terminal), fully committed via the API
    await op_client.post(f"/tenants/{CT}/jobs/{job_id}/cancel")

    resp = await op_client.get(f"/tenants/{CT}/jobs/{job_id}/progress")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    body = resp.text
    assert "event: progress" in body
    assert '"status": "failed"' in body
