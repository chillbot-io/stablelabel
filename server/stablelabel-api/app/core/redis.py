"""Redis connection helpers and job pause/cancel signaling.

Pause/cancel is cooperative: the API sets a flag, the worker checks it
between batches and stops gracefully (writes a checkpoint first).

Keys:
  job:{job_id}:signal  →  "pause" | "cancel"   (TTL: 24h)

The worker clears the signal after acknowledging it.
"""

from __future__ import annotations

import logging
from enum import StrEnum
from urllib.parse import urlparse

from arq.connections import RedisSettings
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

_SIGNAL_TTL = 86400  # 24 hours — generous; worker clears on ack


def parse_redis_settings(url: str) -> RedisSettings:
    """Parse a redis:// URL into arq RedisSettings."""
    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=int(parsed.path.lstrip("/") or "0"),
        password=parsed.password,
    )


class JobSignal(StrEnum):
    PAUSE = "pause"
    CANCEL = "cancel"


def _signal_key(job_id: str) -> str:
    return f"job:{job_id}:signal"


async def send_job_signal(redis: Redis, job_id: str, signal: JobSignal) -> None:
    """Set a pause or cancel signal for a running job."""
    key = _signal_key(job_id)
    await redis.set(key, signal.value, ex=_SIGNAL_TTL)
    logger.info("Sent %s signal for job %s", signal.value, job_id)


async def check_job_signal(redis: Redis, job_id: str) -> JobSignal | None:
    """Check if there is a pending signal for this job.

    Returns the signal if one exists, otherwise None.
    Does NOT clear the signal — call ack_job_signal after handling.
    """
    key = _signal_key(job_id)
    val = await redis.get(key)
    if val is None:
        return None
    return JobSignal(val.decode() if isinstance(val, bytes) else val)


async def ack_job_signal(redis: Redis, job_id: str) -> None:
    """Clear the signal after the worker has handled it."""
    key = _signal_key(job_id)
    await redis.delete(key)
    logger.info("Acknowledged signal for job %s", job_id)
