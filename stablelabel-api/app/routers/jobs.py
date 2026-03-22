"""Jobs routes — create, list, monitor, and control labelling jobs.

Jobs are the central unit of work. Operators can create/run jobs on tenants
they have access to. Viewers can see job status and history.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser
from app.core.rbac import check_tenant_access, require_role
from app.db.base import get_session
from app.db.models import AuditEvent, CustomerTenant, Job, JobCheckpoint

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
    batch_number: int
    status: str
    file_count: int
    created_at: str


# ── Helpers ─────────────────────────────────────────────────


def _job_to_response(job: Job) -> JobResponse:
    return JobResponse(
        id=str(job.id),
        name=job.name,
        status=job.status,
        config=job.config,
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

VALID_TRANSITIONS = {
    "start": {"from": ("pending", "paused"), "to": "enumerating"},
    "pause": {"from": ("enumerating", "running"), "to": "paused"},
    "resume": {"from": ("paused",), "to": "running"},
    "cancel": {"from": ("pending", "enumerating", "running", "paused"), "to": "failed"},
    "rollback": {"from": ("completed", "failed", "paused"), "to": "rolled_back"},
}


@router.post("/{job_id}/{action}", response_model=JobResponse)
async def job_action(
    customer_tenant_id: str,
    job_id: str,
    action: str,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
) -> JobResponse:
    """Control a job: start, pause, resume, cancel, rollback."""
    await check_tenant_access(user, customer_tenant_id, db)

    if action not in VALID_TRANSITIONS:
        raise HTTPException(400, f"Unknown action: {action}")

    job = await _get_job(job_id, customer_tenant_id, db)
    transition = VALID_TRANSITIONS[action]

    if job.status not in transition["from"]:
        raise HTTPException(
            409,
            f"Cannot {action} job in '{job.status}' state "
            f"(requires: {', '.join(transition['from'])})",
        )

    job.status = transition["to"]

    db.add(AuditEvent(
        msp_tenant_id=uuid.UUID(user.msp_tenant_id),
        customer_tenant_id=uuid.UUID(customer_tenant_id),
        job_id=job.id,
        actor_id=uuid.UUID(user.id),
        event_type=f"job.{action}",
    ))

    await db.commit()
    await db.refresh(job)

    # TODO: dispatch to arq worker queue for start/resume/rollback

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
            batch_number=cp.batch_number,
            status=cp.status,
            file_count=len(cp.file_ids) if isinstance(cp.file_ids, list) else 0,
            created_at=cp.created_at.isoformat(),
        )
        for cp in checkpoints
    ]
