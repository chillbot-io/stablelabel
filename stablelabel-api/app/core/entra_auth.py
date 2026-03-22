"""Entra ID authentication middleware.

Validates ID tokens from the "StableLabel" auth app registration.
JIT-provisions users on first sign-in.  Extracts roles from token claims.

Token flow:
  1. SPA authenticates via MSAL.js → gets ID token
  2. SPA sends ID token in Authorization header (Bearer <token>)
  3. This middleware validates the token signature against Entra JWKS
  4. Extracts user identity + app roles
  5. Looks up / creates user in database
  6. Attaches user to request state
"""

from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.base import get_session
from app.db.models import MspTenant, User
from app.dependencies import get_settings

logger = logging.getLogger(__name__)

_security = HTTPBearer()

# JWKS cache — refreshed if key not found
_jwks_cache: dict[str, Any] = {}
_jwks_uri = "https://login.microsoftonline.com/common/discovery/v2.0/keys"


@dataclass
class CurrentUser:
    """Authenticated user attached to request state."""

    id: str  # UUID primary key
    entra_oid: str
    msp_tenant_id: str  # UUID primary key of msp_tenants
    entra_tenant_id: str
    email: str
    display_name: str
    role: str  # Admin | Operator | Viewer


async def _fetch_jwks() -> dict[str, Any]:
    """Fetch Microsoft's JWKS (JSON Web Key Set) for token verification."""
    global _jwks_cache
    async with httpx.AsyncClient() as client:
        resp = await client.get(_jwks_uri)
        resp.raise_for_status()
        _jwks_cache = resp.json()
    return _jwks_cache


async def _get_signing_key(token: str) -> dict[str, Any]:
    """Find the signing key for the token's kid header."""
    headers = jwt.get_unverified_header(token)
    kid = headers.get("kid")
    if not kid:
        raise HTTPException(401, "Token missing kid header")

    jwks = _jwks_cache or await _fetch_jwks()
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key

    # Key not found — refresh JWKS (key rotation)
    jwks = await _fetch_jwks()
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key

    raise HTTPException(401, "Token signing key not found")


def _validate_token(token: str, signing_key: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """Validate and decode the Entra ID token."""
    try:
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.entra_auth_client_id,
            issuer=None,  # multi-tenant: issuer varies per tenant
            options={
                "verify_iss": False,  # multi-tenant app — issuer varies
                "verify_aud": True,
                "verify_exp": True,
            },
        )
    except JWTError as e:
        raise HTTPException(401, f"Invalid token: {e}") from None

    # Require essential claims
    if not claims.get("oid"):
        raise HTTPException(401, "Token missing oid claim")
    if not claims.get("tid"):
        raise HTTPException(401, "Token missing tid claim")

    return claims


async def _jit_provision(
    claims: dict[str, Any], db: AsyncSession
) -> tuple[User, MspTenant]:
    """Look up or create the user and their MSP tenant on first sign-in."""
    entra_tid = claims["tid"]
    entra_oid = claims["oid"]
    email = claims.get("preferred_username", claims.get("email", ""))
    display_name = claims.get("name", "")
    roles = claims.get("roles", [])
    role = roles[0] if roles else "Viewer"

    # Validate role
    if role not in ("Admin", "Operator", "Viewer"):
        role = "Viewer"

    # Find or create MSP tenant
    stmt = select(MspTenant).where(MspTenant.entra_tenant_id == entra_tid)
    result = await db.execute(stmt)
    msp_tenant = result.scalar_one_or_none()

    if not msp_tenant:
        msp_tenant = MspTenant(
            entra_tenant_id=entra_tid,
            display_name=email.split("@")[-1] if "@" in email else entra_tid,
        )
        db.add(msp_tenant)
        await db.flush()

    # Find or create user
    stmt = select(User).where(
        User.msp_tenant_id == msp_tenant.id,
        User.entra_oid == entra_oid,
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            msp_tenant_id=msp_tenant.id,
            entra_oid=entra_oid,
            email=email,
            display_name=display_name,
            role=role,
        )
        db.add(user)
        logger.info("JIT provisioned user %s (%s) role=%s", email, entra_oid, role)
    else:
        # Update role from token (Entra is source of truth)
        user.role = role
        user.last_seen = datetime.datetime.now(datetime.UTC)
        if display_name:
            user.display_name = display_name

    await db.commit()
    await db.refresh(user)
    await db.refresh(msp_tenant)

    return user, msp_tenant


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_security),
    settings: Settings = Depends(get_settings),
    db: AsyncSession = Depends(get_session),
) -> CurrentUser:
    """FastAPI dependency: validate Entra ID token and return the current user."""
    token = credentials.credentials

    signing_key = await _get_signing_key(token)
    claims = _validate_token(token, signing_key, settings)

    user, msp_tenant = await _jit_provision(claims, db)

    return CurrentUser(
        id=str(user.id),
        entra_oid=user.entra_oid,
        msp_tenant_id=str(msp_tenant.id),
        entra_tenant_id=msp_tenant.entra_tenant_id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
    )
