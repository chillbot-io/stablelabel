"""Policies routes — classification-to-label mapping rules.

Policies define what happens when sensitive data is detected, using a
SIT-aligned (Sensitive Information Type) rules schema:
  - **Patterns** with primary match (entity/regex) + corroborative evidence
  - **Proximity** window: evidence must be within N characters of anchor
  - **Confidence tiers**: 65=low, 75=medium, 85=high
  - **Shared definitions**: reusable keyword lists and regex patterns

Example: "If US_SSN detected AND health keywords within 300 chars → HIPAA → Highly Confidential"

Legacy flat conditions schema is also accepted and auto-validated.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entra_auth import CurrentUser
from app.core.rbac import check_tenant_access, require_role
from app.db.base import get_session
from app.db.models import Policy
from app.models.policy_rules import PolicyRules
from app.services.sit_catalog import get_sit_by_id, get_sit_catalog

router = APIRouter(prefix="/tenants/{customer_tenant_id}/policies", tags=["policies"])


# ── Schemas ─────────────────────────────────────────────────


def _validate_rules(rules: dict) -> dict:
    """Validate rules dict against SIT-aligned schema.

    Accepts both new format (patterns) and legacy format (conditions).
    Returns the rules dict unchanged if valid.
    """
    if "patterns" in rules:
        try:
            PolicyRules.model_validate(rules)
        except ValidationError as e:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid policy rules: {e.errors()}",
            )
    # Legacy format is accepted as-is (backward compat)
    return rules


class CreatePolicyRequest(BaseModel):
    name: str
    rules: dict
    target_label_id: str
    priority: int = 0
    is_enabled: bool = True


class UpdatePolicyRequest(BaseModel):
    name: str | None = None
    rules: dict | None = None
    target_label_id: str | None = None
    priority: int | None = None
    is_enabled: bool | None = None


class PolicyResponse(BaseModel):
    id: str
    name: str
    is_builtin: bool
    is_enabled: bool
    rules: dict
    target_label_id: str
    priority: int
    schema_version: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


def _policy_to_response(p: Policy) -> PolicyResponse:
    rules = p.rules or {}
    schema_version = "sit" if "patterns" in rules else "legacy"
    return PolicyResponse(
        id=str(p.id),
        name=p.name,
        is_builtin=p.is_builtin,
        is_enabled=p.is_enabled,
        rules=rules,
        target_label_id=p.target_label_id,
        priority=p.priority,
        schema_version=schema_version,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    )


# ── Routes ──────────────────────────────────────────────────


@router.get("", response_model=list[PolicyResponse])
async def list_policies(
    customer_tenant_id: str,
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
) -> list[PolicyResponse]:
    """List all policies for a customer tenant, ordered by priority."""
    await check_tenant_access(user, customer_tenant_id, db)

    stmt = (
        select(Policy)
        .where(Policy.customer_tenant_id == uuid.UUID(customer_tenant_id))
        .order_by(Policy.priority.desc(), Policy.name)
    )
    result = await db.execute(stmt)
    return [_policy_to_response(p) for p in result.scalars().all()]


@router.post("", response_model=PolicyResponse, status_code=201)
async def create_policy(
    customer_tenant_id: str,
    body: CreatePolicyRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
) -> PolicyResponse:
    """Create a custom classification-to-label policy.

    Rules can use either the new SIT-aligned schema (with ``patterns``,
    ``definitions``, ``file_scope``) or the legacy flat conditions schema.
    New SIT-aligned rules are validated against the Pydantic model.
    """
    await check_tenant_access(user, customer_tenant_id, db)
    _validate_rules(body.rules)

    policy = Policy(
        customer_tenant_id=uuid.UUID(customer_tenant_id),
        name=body.name,
        rules=body.rules,
        target_label_id=body.target_label_id,
        priority=body.priority,
        is_enabled=body.is_enabled,
        is_builtin=False,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)

    return _policy_to_response(policy)


@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(
    customer_tenant_id: str,
    policy_id: str,
    user: CurrentUser = Depends(require_role("Viewer")),
    db: AsyncSession = Depends(get_session),
) -> PolicyResponse:
    """Get a single policy by ID."""
    await check_tenant_access(user, customer_tenant_id, db)

    stmt = select(Policy).where(
        Policy.id == uuid.UUID(policy_id),
        Policy.customer_tenant_id == uuid.UUID(customer_tenant_id),
    )
    result = await db.execute(stmt)
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Policy not found")

    return _policy_to_response(policy)


@router.patch("/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    customer_tenant_id: str,
    policy_id: str,
    body: UpdatePolicyRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
) -> PolicyResponse:
    """Update a policy. Built-in policies can only toggle is_enabled."""
    await check_tenant_access(user, customer_tenant_id, db)

    stmt = select(Policy).where(
        Policy.id == uuid.UUID(policy_id),
        Policy.customer_tenant_id == uuid.UUID(customer_tenant_id),
    )
    result = await db.execute(stmt)
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Policy not found")

    if policy.is_builtin:
        # Built-in policies: only allow toggling enabled state
        if any(v is not None for v in [body.name, body.rules, body.target_label_id, body.priority]):
            raise HTTPException(400, "Built-in policies can only toggle is_enabled")
        if body.is_enabled is not None:
            policy.is_enabled = body.is_enabled
    else:
        if body.name is not None:
            policy.name = body.name
        if body.rules is not None:
            _validate_rules(body.rules)
            policy.rules = body.rules
        if body.target_label_id is not None:
            policy.target_label_id = body.target_label_id
        if body.priority is not None:
            policy.priority = body.priority
        if body.is_enabled is not None:
            policy.is_enabled = body.is_enabled

    await db.commit()
    await db.refresh(policy)

    return _policy_to_response(policy)


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(
    customer_tenant_id: str,
    policy_id: str,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Delete a custom policy. Built-in policies cannot be deleted."""
    await check_tenant_access(user, customer_tenant_id, db)

    stmt = select(Policy).where(
        Policy.id == uuid.UUID(policy_id),
        Policy.customer_tenant_id == uuid.UUID(customer_tenant_id),
    )
    result = await db.execute(stmt)
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(404, "Policy not found")

    if policy.is_builtin:
        raise HTTPException(400, "Built-in policies cannot be deleted — disable instead")

    await db.delete(policy)
    await db.commit()


# ── SIT Catalog routes ────────────────────────────────────────

sit_router = APIRouter(prefix="/sit-catalog", tags=["sit-catalog"])


@sit_router.get("")
async def list_sit_catalog(
    user: CurrentUser = Depends(require_role("Viewer")),
) -> list[dict]:
    """Return the full catalog of pre-built Sensitive Information Types.

    Each entry includes id, name, description, category, regulations,
    and the full SIT-aligned rules definition.
    """
    return get_sit_catalog()


@sit_router.get("/{sit_id}")
async def get_sit_definition(
    sit_id: str,
    user: CurrentUser = Depends(require_role("Viewer")),
) -> dict:
    """Get a single SIT definition by ID."""
    sit = get_sit_by_id(sit_id)
    if not sit:
        raise HTTPException(404, f"SIT '{sit_id}' not found")
    return sit


class CreateFromSitRequest(BaseModel):
    sit_id: str
    target_label_id: str
    name: str | None = None
    priority: int = 0
    is_enabled: bool = True


@router.post("/from-sit", response_model=PolicyResponse, status_code=201)
async def create_policy_from_sit(
    customer_tenant_id: str,
    body: CreateFromSitRequest,
    user: CurrentUser = Depends(require_role("Operator")),
    db: AsyncSession = Depends(get_session),
) -> PolicyResponse:
    """Create a policy from a pre-built SIT catalog entry.

    Copies the SIT's rules into a new policy and associates it
    with the specified target label.
    """
    await check_tenant_access(user, customer_tenant_id, db)

    sit = get_sit_by_id(body.sit_id)
    if not sit:
        raise HTTPException(404, f"SIT '{body.sit_id}' not found in catalog")

    policy = Policy(
        customer_tenant_id=uuid.UUID(customer_tenant_id),
        name=body.name or sit["name"],
        rules=sit["rules"],
        target_label_id=body.target_label_id,
        priority=body.priority,
        is_enabled=body.is_enabled,
        is_builtin=False,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)

    return _policy_to_response(policy)
