"""Seed default built-in policies for a newly connected tenant.

Creates one built-in policy per SIT catalog entry, disabled by default.
Users enable them and assign target labels from the Policies page.

Built-in policies use a placeholder target_label_id ("__unassigned__")
until the user picks a real label. They cannot be deleted — only toggled.
"""

from __future__ import annotations

import logging
import uuid

logger = logging.getLogger(__name__)

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Policy
from app.services.sit_catalog import get_sit_catalog

# Sentinel: built-in policies start with no label assigned.
UNASSIGNED_LABEL = "__unassigned__"


async def seed_builtin_policies(
    customer_tenant_id: uuid.UUID,
    db: AsyncSession,
) -> list[Policy]:
    """Create built-in policies from the SIT catalog for a new tenant.

    Policies are created disabled with a placeholder label. Users must
    enable them and assign a real sensitivity label before they take effect.

    Returns the created Policy objects (already flushed but not committed —
    caller is responsible for commit).
    """
    catalog = get_sit_catalog()
    policies: list[Policy] = []

    for i, sit in enumerate(catalog):
        policy = Policy(
            customer_tenant_id=customer_tenant_id,
            name=sit["name"],
            rules=sit["rules"],
            target_label_id=UNASSIGNED_LABEL,
            priority=100 - i,  # higher catalog entries get higher priority
            is_enabled=False,
            is_builtin=True,
        )
        db.add(policy)
        policies.append(policy)

    logger.info("Seeded %d built-in policies for tenant %s", len(policies), customer_tenant_id)
    return policies
