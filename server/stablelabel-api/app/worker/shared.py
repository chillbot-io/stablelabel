"""Shared helpers used by both the main executor and deferred classification tasks."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Policy
from app.services.policy_engine import ClassificationResult, PolicyRule, policies_from_db


def top_classification(
    classification: ClassificationResult | None,
) -> tuple[str | None, float | None]:
    """Extract the highest-confidence entity type from a classification result.

    Returns (entity_type, confidence) or (None, None) if no entities.
    """
    if not classification or not classification.entities:
        return None, None
    best = max(classification.entities, key=lambda e: e.confidence)
    return best.entity_type, best.confidence


async def load_tenant_policies(
    db: AsyncSession, customer_tenant_id: uuid.UUID
) -> list[PolicyRule]:
    """Load enabled policies for a tenant, sorted by priority."""
    stmt = (
        select(Policy)
        .where(
            Policy.customer_tenant_id == customer_tenant_id,
            Policy.is_enabled.is_(True),
        )
        .order_by(Policy.priority.desc())
    )
    result = await db.execute(stmt)
    return policies_from_db(result.scalars().all())
