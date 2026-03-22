"""StableLabel API — FastAPI entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from app.dependencies import get_graph_client
from app.routers import documents, health, labels


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    # Cleanup: close the shared httpx client
    graph = get_graph_client()
    await graph.close()


app = FastAPI(
    title="StableLabel API",
    version="0.1.0",
    description="Autolabelling backend — Graph API-driven sensitivity label management for MSPs",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(labels.router)
app.include_router(documents.router)
