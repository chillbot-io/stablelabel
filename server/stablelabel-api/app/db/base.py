"""SQLAlchemy async engine and session factory."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_engine(settings: Settings) -> None:
    """Create the async engine and session factory. Call once at startup."""
    global _engine, _session_factory
    _engine = create_async_engine(
        settings.database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        echo=False,
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def dispose_engine() -> None:
    """Close all connections. Call at shutdown."""
    global _engine
    if _engine:
        await _engine.dispose()


async def get_session() -> AsyncSession:
    """Yield an async session for dependency injection."""
    if _session_factory is None:
        raise RuntimeError("Database not initialised — call init_engine() first")
    async with _session_factory() as session:
        yield session  # type: ignore[misc]
