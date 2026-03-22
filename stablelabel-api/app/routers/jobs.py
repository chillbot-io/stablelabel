"""Jobs routes — create, list, monitor, and control labelling jobs.

Jobs are the central unit of work. Operators can create/run jobs on tenants
they have access to. Viewers can see job status and history.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime

from arq import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser
from app.core.rbac import check_tenant_access, require_role
from app.core.redis import JobSignal, send_job_signal
from app.db.base import get_session
from app.db.models import AuditEvent, CustomerTenant, Job, JobCheckpoint
from app.dependencies import get_arq_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenants/{customer_tenant_id}/jobs", tags=["jobs"])


# ── Schemas ─────────────────────────────────────────────────


class CreateJobRequest(BaseModel):
    name: str
    config: dict = {}
    schedule_cron: str | None = None


class UpdateJobRequest(BaseModel):
    name: str | None = None
    config: dict | None = None
    schedule_cron: str | None = None


class JobResponse(BaseModel):
    id: str
    name: str
    status: str
    config: dict
    source_job_id: str | None = None
    total_files: int
    processed_files: int
    failed_files: int
    skipped_files: int
    schedule_cron: str | None
    created_by: str
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None

    model_config = {"from_attributes": True}


class JobListPage(BaseModel):
    items: list[JobResponse]
    total: int
    page: int
    page_size: int


class CheckpointResponse(BaseModel):
    id: str
    checkpoint_type: str
    batch_number: int
    status: str
    items_processed: int
    items_failed: int
    scope_cursor: dict
    created_at: str


# ── Helpers ─────────────────────────────────────────────────


def _job_to_response(job: Job) -> JobResponse:
    return JobResponse(
        id=str(job.id),
        name=job.name,
        status=job.status,
        config=job.config,
        source_job_id=str(job.source_job_id) if job.source_job_id else None,
        total_files=job.total_files,
        processed_files=job.processed_files,
        failed_files=job.failed_files,
        skipped_files=job.skipped_files,
        schedule_cron=job.schedule_cron,
        created_by=str(job.created_by),
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
    )


async def _get_job(
    job_id: str, customer_tenant_id: str, db: AsyncSession
) -> Job:
    stmt = select(Job).where(
        Job.id == uuid.UUID(job_id),
        Job.customer_tenant_id == uuid.UUID(customer_tenant_id),
    )
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


# ── Routes ──────────────────────────────────────────────────


@router.get("", response_model=JobListPage)
async def list_jobs(
    customer_tenant_id: str,
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
) -> JobListPage:
    """List jobs for a customer tenant. Supports filtering by status."""
    await check_tenant_access(user, customer_tenant_id, db)

    base = select(Job).where(
        Job.customer_tenant_id == uuid.UUID(customer_tenant_id)
    )
    if status:
        base = base.where(Job.status == status)

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        base.order_by(Job.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    jobs = result.scalars().all()

    return JobListPage(
        items=[_job_to_response(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(
    customer_tenant_id: str,
    body: CreateJobRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
) -> JobResponse:
    """Create a new labelling job."""
    await check_tenant_access(user, customer_tenant_id, db)

    # Verify tenant exists and is active
    stmt = select(CustomerTenant).where(
        CustomerTenant.id == uuid.UUID(customer_tenant_id)
    )
    result = await db.execute(stmt)
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if tenant.consent_status != "active":
        raise HTTPException(400, "Tenant consent not active")

    job = Job(
        customer_tenant_id=uuid.UUID(customer_tenant_id),
        created_by=uuid.UUID(user.id),
        name=body.name,
        config=body.config,
        schedule_cron=body.schedule_cron,
    )
    db.add(job)

    db.add(AuditEvent(
        msp_tenant_id=uuid.UUID(user.msp_tenant_id),
        customer_tenant_id=uuid.UUID(customer_tenant_id),
        actor_id=uuid.UUID(user.id),
        event_type="job.created",
        extra={"job_name": body.name},
    ))

    await db.commit()
    await db.refresh(job)

    return _job_to_response(job)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    customer_tenant_id: str,
    job_id: str,
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
) -> JobResponse:
    """Get a single job by ID."""
    await check_tenant_access(user, customer_tenant_id, db)
    job = await _get_job(job_id, customer_tenant_id, db)
    return _job_to_response(job)


@router.patch("/{job_id}", response_model=JobResponse)
async def update_job(
    customer_tenant_id: str,
    job_id: str,
    body: UpdateJobRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
) -> JobResponse:
    """Update job name, config, or schedule. Only pending/paused jobs."""
    await check_tenant_access(user, customer_tenant_id, db)
    job = await _get_job(job_id, customer_tenant_id, db)

    if job.status not in ("pending", "paused"):
        raise HTTPException(400, f"Cannot update job in '{job.status}' state")

    if body.name is not None:
        job.name = body.name
    if body.config is not None:
        job.config = body.config
    if body.schedule_cron is not None:
        job.schedule_cron = body.schedule_cron

    await db.commit()
    await db.refresh(job)

    return _job_to_response(job)


# ── Job control actions ─────────────────────────────────────
#
# State machine with transitions, guards, and who triggers each:
#
#   PENDING  ──start──►  ENUMERATING  ──(worker)──►  RUNNING
#      │                     │                          │
#      │cancel         pause │                    pause │
#      ▼                     ▼                          ▼
#   FAILED ◄── cancel ── PAUSED ── resume ──►  ENUMERATING or RUNNING
#      │                     │                  (depends on checkpoint phase)
#      │                     │rollback
#      │rollback             ▼
#      └──────────────►  ROLLING_BACK  ──(worker)──►  ROLLED_BACK
#                            │
#                        (failure)──►  FAILED
#
#   COMPLETED  ──rollback──►  ROLLING_BACK
#
# User-triggered actions: start, pause, resume, cancel, rollback, copy
# Worker-triggered transitions: enumeration_complete, all_files_done,
#     unrecoverable_error, rollback_complete, rollback_failed
# These internal transitions are NOT API endpoints — workers update DB directly.

VALID_TRANSITIONS: dict[str, dict[str, tuple[str, ...] | str]] = {
    "start":    {"from": ("pending",),                                    "to": "enumerating"},
    "pause":    {"from": ("enumerating", "running"),                      "to": "paused"},
    "resume":   {"from": ("paused",),                                     "to": "_from_checkpoint"},
    "cancel":   {"from": ("pending", "enumerating", "running", "paused"), "to": "failed"},
    "rollback": {"from": ("completed", "failed", "paused"),               "to": "rolling_back"},
}

# Actions that should not be a state transition (handled specially)
SPECIAL_ACTIONS = {"copy"}


@router.post("/{job_id}/{action}", response_model=JobResponse)
async def job_action(
    customer_tenant_id: str,
    job_id: str,
    action: str,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
    arq_pool: ArqRedis = Depends(get_arq_pool),
) -> JobResponse:
    """Control a job: start, pause, resume, cancel, rollback, copy.

    - copy: creates a new PENDING job with the same config (for retrying
      failed or re-running completed jobs). Returns the new job.
    """
    await check_tenant_access(user, customer_tenant_id, db)

    if action not in VALID_TRANSITIONS and action not in SPECIAL_ACTIONS:
        raise HTTPException(400, f"Unknown action: {action}")

    job = await _get_job(job_id, customer_tenant_id, db)

    # ── Special action: copy (retry-as-new-job) ────────────
    if action == "copy":
        if job.status not in ("completed", "failed", "rolled_back"):
            raise HTTPException(
                409,
                f"Cannot copy job in '{job.status}' state "
                f"(requires: completed, failed, or rolled_back)",
            )

        new_job = Job(
            customer_tenant_id=job.customer_tenant_id,
            created_by=uuid.UUID(user.id),
            name=f"{job.name} (copy)",
            config=job.config,
            source_job_id=job.id,
            schedule_cron=job.schedule_cron,
        )
        db.add(new_job)

        db.add(AuditEvent(
            msp_tenant_id=uuid.UUID(user.msp_tenant_id),
            customer_tenant_id=job.customer_tenant_id,
            job_id=new_job.id,
            actor_id=uuid.UUID(user.id),
            event_type="job.copied",
            extra={"source_job_id": str(job.id)},
        ))

        await db.commit()
        await db.refresh(new_job)
        return _job_to_response(new_job)

    # ── Standard state transitions ─────────────────────────
    transition = VALID_TRANSITIONS[action]

    if job.status not in transition["from"]:
        raise HTTPException(
            409,
            f"Cannot {action} job in '{job.status}' state "
            f"(requires: {', '.join(transition['from'])})",
        )

    # Capture previous status before transition (needed for cancel signal)
    previous_status = job.status

    # Resume goes back to the phase the job was in when paused.
    # The latest checkpoint tells us whether we were enumerating or labelling.
    if action == "resume":
        latest_cp = (
            await db.execute(
                select(JobCheckpoint)
                .where(JobCheckpoint.job_id == job.id)
                .order_by(JobCheckpoint.batch_number.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if latest_cp and latest_cp.checkpoint_type == "enumeration":
            job.status = "enumerating"
        else:
            job.status = "running"
    else:
        job.status = transition["to"]

    db.add(AuditEvent(
        msp_tenant_id=uuid.UUID(user.msp_tenant_id),
        customer_tenant_id=uuid.UUID(customer_tenant_id),
        job_id=job.id,
        actor_id=uuid.UUID(user.id),
        event_type=f"job.{action}",
    ))

    if action == "start":
        job.started_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(job)

    # Dispatch to arq worker or send signal
    if action in ("start", "resume"):
        await arq_pool.enqueue_job("run_job", str(job.id))
        logger.info("Dispatched run_job for %s (action=%s)", job.id, action)
    elif action == "rollback":
        await arq_pool.enqueue_job("rollback_job", str(job.id))
        logger.info("Dispatched rollback_job for %s", job.id)
    elif action == "pause":
        await send_job_signal(arq_pool, str(job.id), JobSignal.PAUSE)
    elif action == "cancel" and previous_status in ("enumerating", "running"):
        # Send cancel signal so the worker stops gracefully
        await send_job_signal(arq_pool, str(job.id), JobSignal.CANCEL)

    return _job_to_response(job)


@router.get("/{job_id}/checkpoints", response_model=list[CheckpointResponse])
async def list_checkpoints(
    customer_tenant_id: str,
    job_id: str,
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
) -> list[CheckpointResponse]:
    """List checkpoints for a job (progress markers for resume)."""
    await check_tenant_access(user, customer_tenant_id, db)
    await _get_job(job_id, customer_tenant_id, db)  # 404 if not found

    stmt = (
        select(JobCheckpoint)
        .where(JobCheckpoint.job_id == uuid.UUID(job_id))
        .order_by(JobCheckpoint.batch_number)
    )
    result = await db.execute(stmt)
    checkpoints = result.scalars().all()

    return [
        CheckpointResponse(
            id=str(cp.id),
            checkpoint_type=cp.checkpoint_type,
            batch_number=cp.batch_number,
            status=cp.status,
            items_processed=cp.items_processed,
            items_failed=cp.items_failed,
            scope_cursor=cp.scope_cursor,
            created_at=cp.created_at.isoformat(),
        )
        for cp in checkpoints
    ]


# ── SSE progress stream ────────────────────────────────────────

_TERMINAL_STATUSES = frozenset({"completed", "failed", "rolled_back", "paused"})
_SSE_POLL_INTERVAL = 2.0  # seconds between DB polls


@router.get("/{job_id}/progress")
async def job_progress_stream(
    customer_tenant_id: str,
    job_id: str,
    request: Request,
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream job progress as Server-Sent Events (SSE).

    Events:
      - data: {"status": "running", "total_files": 500, "processed_files": 120, ...}
      - data: {"status": "completed", ...}   ← stream closes after terminal state

    The client connects with EventSource and receives updates every 2s
    until the job reaches a terminal state.
    """
    await check_tenant_access(user, customer_tenant_id, db)
    await _get_job(job_id, customer_tenant_id, db)  # 404 if not found

    async def event_generator():
        last_progress = None

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            # Reload job state from DB
            stmt = select(Job).where(
                Job.id == uuid.UUID(job_id),
                Job.customer_tenant_id == uuid.UUID(customer_tenant_id),
            )
            result = await db.execute(stmt)
            job = result.scalar_one_or_none()

            if not job:
                yield _sse_event({"error": "Job not found"}, event="error")
                break

            progress = {
                "status": job.status,
                "total_files": job.total_files,
                "processed_files": job.processed_files,
                "failed_files": job.failed_files,
                "skipped_files": job.skipped_files,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            }

            # Only send if changed
            if progress != last_progress:
                yield _sse_event(progress)
                last_progress = progress

            # Stop streaming on terminal states
            if job.status in _TERMINAL_STATUSES:
                break

            # Expire SQLAlchemy's identity map so next query gets fresh data
            db.expire_all()
            await asyncio.sleep(_SSE_POLL_INTERVAL)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )


def _sse_event(data: dict, event: str = "progress") -> str:
    """Format a dict as an SSE event string."""
    payload = json.dumps(data, default=str)
    return f"event: {event}\ndata: {payload}\n\n"
