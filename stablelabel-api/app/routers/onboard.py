"""Consent callback route — unauthenticated, called by Microsoft redirect.

After an admin grants consent in Microsoft's Entra portal, the browser is
redirected here.  This route is NOT behind auth — the customer admin who
grants consent is not necessarily a StableLabel user.

Success: GET /onboard/callback?tenant={tid}&admin_consent=True
Denied:  GET /onboard/callback?error=access_denied&error_description=...
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import AuditEvent, CustomerTenant
from app.dependencies import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboard", tags=["onboarding"])

_SUCCESS_HTML = """\
<!DOCTYPE html>
<html>
<head><title>StableLabel — Consent Granted</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
  <h1>Consent granted</h1>
  <p>The tenant has been connected to StableLabel. You can close this tab.</p>
</body>
</html>
"""

_DENIED_HTML = """\
<!DOCTYPE html>
<html>
<head><title>StableLabel — Consent Denied</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
  <h1>Consent denied</h1>
  <p>The admin did not grant consent. Please contact your MSP administrator to retry.</p>
</body>
</html>
"""

_NOT_FOUND_HTML = """\
<!DOCTYPE html>
<html>
<head><title>StableLabel — Tenant Not Found</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
  <h1>Tenant not found</h1>
  <p>Consent was received but no matching tenant setup was found. Please reconnect from StableLabel.</p>
</body>
</html>
"""


@router.get("/callback", response_class=HTMLResponse)
async def consent_callback(
    tenant: str | None = Query(None),
    admin_consent: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
    state: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
) -> HTMLResponse:
    """Handle the redirect from Microsoft after admin consent.

    This route is unauthenticated — Microsoft redirects the customer
    admin's browser here after they approve (or deny) consent.
    """
    # ── Consent denied ─────────────────────────────────────
    if error:
        logger.warning(
            "Consent denied for tenant callback: error=%s desc=%s",
            error,
            error_description,
        )
        # Try to find and update the pending tenant row
        if tenant:
            stmt = select(CustomerTenant).where(
                CustomerTenant.entra_tenant_id == tenant,
                CustomerTenant.consent_status == "pending",
            )
            result = await db.execute(stmt)
            ct = result.scalar_one_or_none()
            if ct:
                ct.consent_status = "consent_denied"
                db.add(AuditEvent(
                    msp_tenant_id=ct.msp_tenant_id,
                    customer_tenant_id=ct.id,
                    event_type="tenant.consent_denied",
                    extra={"error": error, "description": error_description},
                ))
                await db.commit()
        return HTMLResponse(_DENIED_HTML)

    # ── Consent granted ────────────────────────────────────
    if not tenant:
        logger.error("Consent callback missing tenant parameter")
        return HTMLResponse(_NOT_FOUND_HTML, status_code=400)

    # Verify the HMAC-signed state token to prevent cross-MSP tenant claim.
    # The state encodes "customer_tenant_id:signature" so we can look up the
    # exact row instead of guessing which MSP's pending row to activate.
    ct = None
    if state and ":" in state:
        ct_id_str, sig = state.rsplit(":", 1)
        settings = get_settings()
        expected_sig = hmac.new(
            settings.session_secret.encode(), ct_id_str.encode(), hashlib.sha256
        ).hexdigest()
        if hmac.compare_digest(sig, expected_sig):
            try:
                stmt = select(CustomerTenant).where(
                    CustomerTenant.id == uuid.UUID(ct_id_str),
                    CustomerTenant.entra_tenant_id == tenant,
                    CustomerTenant.consent_status == "pending",
                )
                result = await db.execute(stmt)
                ct = result.scalar_one_or_none()
            except ValueError:
                pass  # invalid UUID in state

    # Fallback: if no valid state, reject — prevents cross-MSP claims
    if ct is None:
        logger.warning(
            "Consent callback: invalid or missing state token for tenant %s", tenant,
        )
        return HTMLResponse(_NOT_FOUND_HTML, status_code=400)

    if not ct:
        logger.warning("Consent callback: no pending tenant found for %s", tenant)
        return HTMLResponse(_NOT_FOUND_HTML, status_code=404)

    ct.consent_status = "active"
    ct.consented_at = datetime.now(UTC)

    db.add(AuditEvent(
        msp_tenant_id=ct.msp_tenant_id,
        customer_tenant_id=ct.id,
        event_type="tenant.consent_confirmed",
        extra={"source": "callback"},
    ))

    await db.commit()
    logger.info("Consent granted for tenant %s (customer_tenant_id=%s)", tenant, ct.id)

    return HTMLResponse(_SUCCESS_HTML)
