"""StableLabel API — FastAPI entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from arq import create_pool
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.redis import parse_redis_settings
from app.db.base import dispose_engine, init_engine
from app.dependencies import get_graph_client, get_reporting_service, get_settings, set_arq_pool
from app.routers import audit, documents, health, jobs, labels, onboard, policies, reports, sites, tenants, users

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup: initialise database + Redis connection pools
    settings = get_settings()
    init_engine(settings)

    try:
        arq_pool = await create_pool(parse_redis_settings(settings.redis_url))
        set_arq_pool(arq_pool)
        logger.info("Connected to Redis for arq task queue")
    except (OSError, ConnectionError) as exc:
        logger.warning("Redis not available — job dispatch will fail: %s", exc)

    yield

    # Shutdown: close connections
    graph = get_graph_client()
    await graph.close()
    get_reporting_service().close()
    await dispose_engine()


app = FastAPI(
    title="StableLabel API",
    version="0.1.0",
    description="Autolabelling backend — Graph API-driven sensitivity label management for MSPs",
    lifespan=lifespan,
)

# CORS — configured via SL_CORS_ORIGINS (comma-separated)
_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(health.router)
app.include_router(labels.router)
app.include_router(documents.router)
app.include_router(tenants.router)
app.include_router(onboard.router)
app.include_router(users.router)
app.include_router(audit.router)
app.include_router(jobs.router)
app.include_router(policies.router)
app.include_router(policies.sit_router)
app.include_router(reports.router)
app.include_router(sites.router)
