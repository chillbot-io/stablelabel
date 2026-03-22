"""arq worker settings — run with: arq app.worker.settings.WorkerSettings

This module defines the arq worker configuration, task functions, and
startup/shutdown hooks. The worker connects to Redis for the task queue
and to PostgreSQL for job state.
"""

from __future__ import annotations

import logging

from arq import cron
from arq.connections import RedisSettings
from redis.asyncio import Redis

from app.config import Settings
from app.db.base import dispose_engine, get_session, init_engine
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


def _redis_settings() -> RedisSettings:
    """Parse Redis URL into arq RedisSettings."""
    settings = get_settings()
    url = settings.redis_url
    # arq expects RedisSettings, not a URL string
    # Parse redis://host:port/db
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=int(parsed.path.lstrip("/") or "0"),
        password=parsed.password,
    )


class WorkerSettings:
    """arq worker configuration — run with: arq app.worker.settings.WorkerSettings"""

    functions = [run_job, rollback_job]

    cron_jobs = [
        cron(
            sync_labels,
            minute={0, 15, 30, 45},  # every 15 minutes
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
