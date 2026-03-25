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

Security notes:
  - JIT-provisioned users always get "Viewer" role regardless of token claims.
    An existing Admin must promote users via the user-management endpoints.
  - PyJWT (not python-jose) is used — python-jose has CVE-2024-33663/33664.
  - JWKS keys are cached with a 1-hour TTL so revoked keys are eventually dropped.
"""

from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass
from typing import Any

import jwt as pyjwt
from jwt import PyJWKClient, PyJWK
from jwt.exceptions import InvalidTokenError
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.base import get_session
from app.db.models import MspTenant, User
from app.dependencies import get_settings

logger = logging.getLogger(__name__)

_security = HTTPBearer()

# JWKS client with built-in caching and key rotation handling.
# lifespan=3600 means keys are re-fetched at most once per hour,
# ensuring revoked keys are eventually dropped.
_jwks_uri = "https://login.microsoftonline.com/common/discovery/v2.0/keys"
_jwk_client = PyJWKClient(_jwks_uri, cache_keys=True, lifespan=3600)


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


def _get_signing_key(token: str) -> PyJWK:
    """Find the signing key for the token's kid header."""
    try:
        return _jwk_client.get_signing_key_from_jwt(token)
    except Exception:
        raise HTTPException(401, "Token signing key not found") from None


def _validate_token(token: str, signing_key: PyJWK, settings: Settings) -> dict[str, Any]:
    """Validate and decode the Entra ID token using PyJWT.

    Issuer validation is performed manually because multi-tenant Entra apps
    accept tokens from any tenant — the issuer contains the tenant ID which
    is only known after decoding.
    """
    try:
        claims = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.entra_auth_client_id,
            options={
                "verify_iss": False,  # manual check below — multi-tenant
                "verify_aud": True,
                "verify_exp": True,
                "require": ["oid", "tid", "iss", "exp", "aud"],
            },
        )
    except InvalidTokenError as e:
        logger.warning("Token validation failed: %s", e)
        raise HTTPException(401, "Invalid or expired token") from None

    # Require essential claims (belt-and-suspenders with "require" above)
    if not claims.get("oid"):
        raise HTTPException(401, "Invalid token claims")
    if not claims.get("tid"):
        raise HTTPException(401, "Invalid token claims")

    # Validate issuer matches the token's tenant.
    # Multi-tenant apps accept tokens from any Entra tenant, but the issuer
    # must follow Microsoft's pattern to prevent token confusion attacks.
    tid = claims["tid"]
    iss = claims.get("iss", "")
    expected_issuers = [
        f"https://login.microsoftonline.com/{tid}/v2.0",
        f"https://sts.windows.net/{tid}/",
    ]
    if iss not in expected_issuers:
        logger.warning("Unexpected issuer %s for tenant %s", iss, tid)
        raise HTTPException(401, "Invalid token issuer")

    return claims


async def _jit_provision(
    claims: dict[str, Any], db: AsyncSession
) -> tuple[User, MspTenant]:
    """Look up or create the user and their MSP tenant on first sign-in.

    New users are always provisioned as Viewer regardless of token role claims.
    Token roles from Entra are untrusted for initial provisioning because
    anyone can create a free Entra tenant and set arbitrary app roles.
    An existing Admin must promote users through the user-management endpoints.
    """
    entra_tid = claims["tid"]
    entra_oid = claims["oid"]
    email = claims.get("preferred_username", claims.get("email", ""))
    display_name = claims.get("name", "")

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
        # Always provision new users as Viewer — token role claims are untrusted.
        user = User(
            msp_tenant_id=msp_tenant.id,
            entra_oid=entra_oid,
            email=email,
            display_name=display_name,
            role="Viewer",
        )
        db.add(user)
        logger.info("JIT provisioned user %s as Viewer", email)
    else:
        # DB role is authoritative — do NOT overwrite from token claims.
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

    signing_key = _get_signing_key(token)
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
