"""Scheduled label sync — Option B polling strategy.

Periodically refreshes sensitivity label inventory for all active tenants.
This keeps the label_definitions DB table and in-memory LabelCache fresh
so users never see stale data and jobs always work with current labels.

Schedule: every label_sync_interval_seconds (default 15 min).

Why polling over webhooks:
  - Graph change notifications for sensitivity labels are beta-only.
  - Polling is reliable, simple, and the cost is negligible:
    ~1 Graph API call per active tenant per interval.
  - Webhooks can be added later as an optimization (replace polling
    for individual tenants when supported).
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import StableLabelError
from app.db.models import CustomerTenant, LabelDefinition
from app.services.label_service import LabelService

logger = logging.getLogger(__name__)


async def sync_labels_for_all_tenants(
    db: AsyncSession,
    label_service: LabelService,
) -> dict[str, int]:
    """Refresh label inventory for every active customer tenant.

    Returns a summary dict: {"synced": N, "failed": M, "skipped": K}.
    """
    stmt = select(CustomerTenant).where(CustomerTenant.consent_status == "active")
    result = await db.execute(stmt)
    tenants = result.scalars().all()

    summary = {"synced": 0, "failed": 0, "skipped": 0}

    for tenant in tenants:
        tid = tenant.entra_tenant_id
        try:
            labels = await label_service.get_labels(tid, force=True)

            # Upsert into label_definitions table for durable cache
            await _upsert_label_definitions(db, tenant.id, labels)

            summary["synced"] += 1
            logger.debug(
                "Synced %d labels for tenant %s (%s)",
                len(labels),
                tenant.display_name,
                tid,
            )
        except Exception as exc:
            # Roll back the failed tenant's changes so the session stays usable
            await db.rollback()
            summary["failed"] += 1
            logger.warning("Failed to sync labels for tenant %s: %s", tid, exc)

    # Commit all successful tenant syncs in one transaction
    await db.commit()

    logger.info(
        "Label sync complete: %d synced, %d failed, %d skipped",
        summary["synced"],
        summary["failed"],
        summary["skipped"],
    )
    return summary


async def _upsert_label_definitions(
    db: AsyncSession,
    customer_tenant_id: uuid.UUID,
    labels: list,
) -> None:
    """Upsert parsed labels into the label_definitions table.

    Existing rows are updated, new labels are inserted, and labels
    that no longer appear in Graph are marked inactive.
    """
    now = datetime.now(UTC)

    # Load existing rows keyed by graph_label_id
    stmt = select(LabelDefinition).where(
        LabelDefinition.customer_tenant_id == customer_tenant_id
    )
    result = await db.execute(stmt)
    existing = {ld.graph_label_id: ld for ld in result.scalars().all()}

    seen_ids: set[str] = set()

    for label in labels:
        seen_ids.add(label.id)
        ld = existing.get(label.id)
        if ld:
            # Update existing
            ld.name = label.name
            ld.display_name = label.display_name
            ld.priority = label.priority
            ld.color = label.color
            ld.is_active = label.is_active
            ld.has_protection = label.has_protection
            ld.applicable_to = label.applicable_to
            ld.parent_id = label.parent_id
            ld.is_parent = label.is_parent
            ld.fetched_at = now
        else:
            # Insert new
            db.add(LabelDefinition(
                customer_tenant_id=customer_tenant_id,
                graph_label_id=label.id,
                name=label.name,
                display_name=label.display_name,
                priority=label.priority,
                color=label.color,
                is_active=label.is_active,
                has_protection=label.has_protection,
                applicable_to=label.applicable_to,
                parent_id=label.parent_id,
                is_parent=label.is_parent,
                fetched_at=now,
            ))

    # Mark removed labels as inactive
    for graph_id, ld in existing.items():
        if graph_id not in seen_ids:
            ld.is_active = False
            ld.fetched_at = now

    # Flush changes — the caller's savepoint or commit handles persistence.
    await db.flush()
