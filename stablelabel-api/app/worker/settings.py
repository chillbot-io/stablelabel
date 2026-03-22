"""arq worker settings — run with: arq app.worker.settings.WorkerSettings

This module defines the arq worker configuration, task functions, and
startup/shutdown hooks. The worker connects to Redis for the task queue
and to PostgreSQL for job state.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from arq import cron
from arq.connections import ArqRedis
from redis.asyncio import Redis
from sqlalchemy import select

from app.config import Settings
from app.core.redis import parse_redis_settings
from app.db.base import dispose_engine, get_session, init_engine
from app.db.models import Job
from app.dependencies import get_document_service, get_graph_client, get_label_service, get_settings
from app.worker.executor import JobExecutor

logger = logging.getLogger(__name__)


# ── Task functions ─────────────────────────────────────────────


async def run_job(ctx: dict, job_id: str) -> None:
    """arq task: execute a labelling job (start or resume)."""
    redis: Redis = ctx["redis"]
    settings: Settings = ctx["settings"]

    async for db in get_session():
        executor = JobExecutor(
            db=db,
            graph=get_graph_client(),
            doc_service=get_document_service(),
            redis=redis,
        )
        await executor.run(job_id)


async def rollback_job(ctx: dict, job_id: str) -> None:
    """arq task: roll back a labelling job."""
    redis: Redis = ctx["redis"]

    async for db in get_session():
        executor = JobExecutor(
            db=db,
            graph=get_graph_client(),
            doc_service=get_document_service(),
            redis=redis,
        )
        await executor.run_rollback(job_id)


async def sync_labels(ctx: dict) -> None:
    """arq cron task: refresh label inventory for all active tenants."""
    from app.services.label_sync import sync_labels_for_all_tenants

    label_service = get_label_service()
    async for db in get_session():
        await sync_labels_for_all_tenants(db, label_service)


async def trigger_scheduled_jobs(ctx: dict) -> None:
    """arq cron task: find jobs with schedule_cron that are due and enqueue them.

    For each completed/pending job with a schedule_cron, create a copy
    with status='enumerating' and dispatch it. The original stays as-is
    to preserve history.

    Runs every minute; the cron expression is evaluated against the current time.
    """
    from app.worker.cron_eval import is_cron_due

    arq_pool: ArqRedis = ctx["redis"]
    now = datetime.now(UTC)

    async for db in get_session():
        # Find jobs with a schedule that have completed (or never ran)
        stmt = (
            select(Job)
            .where(
                Job.schedule_cron.isnot(None),
                Job.status.in_(("completed", "pending")),
            )
        )
        result = await db.execute(stmt)
        scheduled_jobs = result.scalars().all()

        for job in scheduled_jobs:
            if not job.schedule_cron:
                continue

            if not is_cron_due(job.schedule_cron, now):
                continue

            # Create a new job instance for this scheduled run
            new_job = Job(
                customer_tenant_id=job.customer_tenant_id,
                created_by=job.created_by,
                name=f"{job.name} (scheduled {now.strftime('%Y-%m-%d %H:%M')})",
                config=job.config,
                source_job_id=job.id,
                status="enumerating",
                started_at=now,
            )
            db.add(new_job)
            await db.commit()
            await db.refresh(new_job)

            # Dispatch to worker
            await arq_pool.enqueue_job("run_job", str(new_job.id))
            logger.info(
                "Triggered scheduled job %s → new job %s",
                job.id, new_job.id,
            )


# ── Lifecycle hooks ────────────────────────────────────────────


async def startup(ctx: dict) -> None:
    """Called once when the worker starts."""
    settings = get_settings()
    init_engine(settings)
    ctx["settings"] = settings
    ctx["redis"] = Redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Worker started — connected to Redis and PostgreSQL")


async def shutdown(ctx: dict) -> None:
    """Called once when the worker shuts down."""
    redis: Redis | None = ctx.get("redis")
    if redis:
        await redis.aclose()
    await dispose_engine()
    graph = get_graph_client()
    await graph.close()
    logger.info("Worker shut down")


# ── Worker configuration ───────────────────────────────────────


def _redis_settings():
    """Get arq RedisSettings from app config."""
    return parse_redis_settings(get_settings().redis_url)


class WorkerSettings:
    """arq worker configuration — run with: arq app.worker.settings.WorkerSettings"""

    functions = [run_job, rollback_job]

    cron_jobs = [
        cron(
            sync_labels,
            minute={0, 15, 30, 45},  # every 15 minutes
            unique=True,
        ),
        cron(
            trigger_scheduled_jobs,
            minute=set(range(60)),  # every minute
            unique=True,
        ),
    ]

    on_startup = startup
    on_shutdown = shutdown

    redis_settings = _redis_settings()

    # Job execution limits
    max_jobs = 4  # max concurrent jobs per worker
    job_timeout = 3600  # 1 hour per job (enumeration of large tenants can be slow)
    max_tries = 2  # retry once on crash
