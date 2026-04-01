"""Tests for core infrastructure: label_management fallback, RBAC, and Entra auth."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.entra_auth import CurrentUser, _jit_provision, _validate_token
from app.core.exceptions import GraphApiNotSupportedError, StableLabelError
from app.core.rbac import ROLE_HIERARCHY, check_tenant_access, require_role
from app.services.label_management import (
    LabelConfig,
    LabelManagementService,
    PolicyConfig,
)
from app.services.powershell_runner import CmdletResult


# ═══════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════


def _make_service(
    graph_side_effect=None,
    graph_return=None,
    ps_return=None,
) -> tuple[LabelManagementService, AsyncMock, AsyncMock]:
    """Build a LabelManagementService with mocked Graph + PowerShell."""
    graph = AsyncMock()
    ps = AsyncMock()

    if graph_side_effect is not None:
        graph.post.side_effect = graph_side_effect
    elif graph_return is not None:
        graph.post.return_value = graph_return
    else:
        graph.post.return_value = ({}, 200, {})

    if ps_return is not None:
        ps.invoke.return_value = ps_return
    else:
        ps.invoke.return_value = CmdletResult(success=True, data={"id": "ps-id"})

    svc = LabelManagementService(graph=graph, powershell=ps)
    return svc, graph, ps


def _make_user(role: str = "Viewer", user_id: str | None = None) -> CurrentUser:
    uid = user_id or str(uuid.uuid4())
    return CurrentUser(
        id=uid,
        entra_oid="oid-123",
        msp_tenant_id=str(uuid.uuid4()),
        entra_tenant_id="tid-abc",
        email="user@example.com",
        display_name="Test User",
        role=role,
    )


TENANT_ID = "tenant-00000000-0000-0000-0000-000000000001"
LABEL_ID = "label-00000000-0000-0000-0000-000000000001"
POLICY_ID = "policy-00000000-0000-0000-0000-000000000001"
LABEL_CFG = LabelConfig(name="Confidential", display_name="Confidential Label")
POLICY_CFG = PolicyConfig(name="Default Policy", labels=["lbl-1"])


# ═══════════════════════════════════════════════════════════════════
# 1. LabelManagementService — Graph→PowerShell fallback
# ═══════════════════════════════════════════════════════════════════


class TestCreateLabel:
    @pytest.mark.asyncio
    async def test_success_via_graph(self) -> None:
        graph_body = {"id": "graph-label-id", "name": "Confidential"}
        svc, graph, ps = _make_service(graph_return=(graph_body, 201, {}))

        result = await svc.create_label(TENANT_ID, LABEL_CFG)

        assert result == graph_body
        graph.post.assert_awaited_once()
        ps.invoke.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_graph_not_supported_falls_back_to_powershell(self) -> None:
        ps_data = {"id": "ps-label-id", "Name": "Confidential"}
        svc, graph, ps = _make_service(
            graph_side_effect=GraphApiNotSupportedError("notSupported"),
            ps_return=CmdletResult(success=True, data=ps_data),
        )

        result = await svc.create_label(TENANT_ID, LABEL_CFG)

        assert result == ps_data
        ps.invoke.assert_awaited_once()
        # Verify PowerShell was called with New-Label
        call_args = ps.invoke.call_args
        assert call_args[0][0] == "New-Label"

    @pytest.mark.asyncio
    async def test_graph_non_success_status_falls_back(self) -> None:
        """Graph returns 400 (non-success) — should trigger fallback."""
        svc, graph, ps = _make_service(graph_return=({}, 400, {}))

        result = await svc.create_label(TENANT_ID, LABEL_CFG)

        ps.invoke.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_powershell_fallback_returns_empty_dict_for_non_dict_data(self) -> None:
        svc, graph, ps = _make_service(
            graph_side_effect=GraphApiNotSupportedError("nope"),
            ps_return=CmdletResult(success=True, data="string-result"),
        )

        result = await svc.create_label(TENANT_ID, LABEL_CFG)

        assert result == {}


class TestUpdateLabel:
    @pytest.mark.asyncio
    async def test_success_via_graph(self) -> None:
        graph_body = {"id": LABEL_ID, "name": "Updated"}
        svc, graph, ps = _make_service(graph_return=(graph_body, 200, {}))

        result = await svc.update_label(TENANT_ID, LABEL_ID, LABEL_CFG)

        assert result == graph_body
        ps.invoke.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_graph_204_is_success(self) -> None:
        svc, graph, ps = _make_service(graph_return=({}, 204, {}))

        result = await svc.update_label(TENANT_ID, LABEL_ID, LABEL_CFG)

        assert result == {}
        ps.invoke.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_fallback_to_powershell(self) -> None:
        ps_data = {"id": LABEL_ID, "updated": True}
        svc, graph, ps = _make_service(
            graph_side_effect=GraphApiNotSupportedError("not supported"),
            ps_return=CmdletResult(success=True, data=ps_data),
        )

        result = await svc.update_label(TENANT_ID, LABEL_ID, LABEL_CFG)

        assert result == ps_data
        call_args = ps.invoke.call_args
        assert call_args[0][0] == "Set-Label"
        # Identity param should be set to label_id
        assert call_args[0][1]["Identity"] == LABEL_ID


class TestDeleteLabel:
    @pytest.mark.asyncio
    async def test_success_via_graph(self) -> None:
        svc, graph, ps = _make_service(graph_return=({}, 200, {}))

        await svc.delete_label(TENANT_ID, LABEL_ID)

        graph.post.assert_awaited_once()
        ps.invoke.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_fallback_to_powershell(self) -> None:
        svc, graph, ps = _make_service(
            graph_side_effect=GraphApiNotSupportedError("not supported"),
        )

        await svc.delete_label(TENANT_ID, LABEL_ID)

        call_args = ps.invoke.call_args
        assert call_args[0][0] == "Remove-Label"
        assert call_args[0][1]["Identity"] == LABEL_ID
        assert call_args[0][1]["Confirm"] is False


class TestCreatePolicy:
    @pytest.mark.asyncio
    async def test_success_via_graph(self) -> None:
        graph_body = {"id": "graph-policy-id", "name": "Default Policy"}
        svc, graph, ps = _make_service(graph_return=(graph_body, 201, {}))

        result = await svc.create_policy(TENANT_ID, POLICY_CFG)

        assert result == graph_body
        ps.invoke.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_fallback_to_powershell(self) -> None:
        ps_data = {"id": "ps-policy-id"}
        svc, graph, ps = _make_service(
            graph_side_effect=GraphApiNotSupportedError("not supported"),
            ps_return=CmdletResult(success=True, data=ps_data),
        )

        result = await svc.create_policy(TENANT_ID, POLICY_CFG)

        assert result == ps_data
        call_args = ps.invoke.call_args
        assert call_args[0][0] == "New-LabelPolicy"


class TestUpdatePolicy:
    @pytest.mark.asyncio
    async def test_success_via_graph(self) -> None:
        graph_body = {"id": POLICY_ID, "updated": True}
        svc, graph, ps = _make_service(graph_return=(graph_body, 200, {}))

        result = await svc.update_policy(TENANT_ID, POLICY_ID, POLICY_CFG)

        assert result == graph_body
        ps.invoke.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_fallback_to_powershell(self) -> None:
        ps_data = {"id": POLICY_ID, "updated": True}
        svc, graph, ps = _make_service(
            graph_side_effect=GraphApiNotSupportedError("not supported"),
            ps_return=CmdletResult(success=True, data=ps_data),
        )

        result = await svc.update_policy(TENANT_ID, POLICY_ID, POLICY_CFG)

        assert result == ps_data
        call_args = ps.invoke.call_args
        assert call_args[0][0] == "Set-LabelPolicy"
        assert call_args[0][1]["Identity"] == POLICY_ID

    @pytest.mark.asyncio
    async def test_non_graphapi_error_propagates(self) -> None:
        """A StableLabelError without an unsupported-code should NOT fall back."""
        svc, graph, ps = _make_service(
            graph_side_effect=StableLabelError("Connection refused"),
        )

        with pytest.raises(StableLabelError, match="Connection refused"):
            await svc.update_policy(TENANT_ID, POLICY_ID, POLICY_CFG)

        ps.invoke.assert_not_awaited()


# ═══════════════════════════════════════════════════════════════════
# 2. RBAC — role hierarchy + tenant access
# ═══════════════════════════════════════════════════════════════════


class TestRequireRole:
    """require_role() returns a dependency callable that checks role level."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("min_role,user_role", [
        ("Viewer", "Viewer"),
        ("Viewer", "Operator"),
        ("Viewer", "Admin"),
        ("Operator", "Operator"),
        ("Operator", "Admin"),
        ("Admin", "Admin"),
    ])
    async def test_allows_sufficient_role(self, min_role, user_role) -> None:
        check = require_role(min_role)
        user = _make_user(user_role)
        result = await check(user=user)
        assert result is user

    @pytest.mark.asyncio
    @pytest.mark.parametrize("min_role,user_role", [
        ("Operator", "Viewer"),
        ("Admin", "Viewer"),
        ("Admin", "Operator"),
    ])
    async def test_blocks_insufficient_role(self, min_role, user_role) -> None:
        check = require_role(min_role)
        user = _make_user(user_role)
        with pytest.raises(HTTPException) as exc_info:
            await check(user=user)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_unknown_role_treated_as_lowest(self) -> None:
        check = require_role("Viewer")
        user = _make_user("UnknownRole")
        with pytest.raises(HTTPException) as exc_info:
            await check(user=user)
        assert exc_info.value.status_code == 403


class TestCheckTenantAccess:
    """check_tenant_access() enforces tenant-scoped authorization."""

    @pytest.mark.asyncio
    async def test_admin_has_implicit_access_within_msp(self) -> None:
        user = _make_user("Admin")
        db = AsyncMock()

        # First query checks MSP ownership (returns a tenant), Admin skips second query
        msp_check_result = MagicMock()
        msp_check_result.scalar_one_or_none.return_value = MagicMock()  # tenant belongs to MSP
        db.execute.return_value = msp_check_result

        await check_tenant_access(user, str(uuid.uuid4()), db)

        # Should have queried once (MSP ownership check only)
        assert db.execute.await_count == 1

    @pytest.mark.asyncio
    async def test_admin_blocked_from_other_msp_tenant(self) -> None:
        user = _make_user("Admin")
        db = AsyncMock()

        # MSP ownership check returns None — tenant belongs to a different MSP
        msp_check_result = MagicMock()
        msp_check_result.scalar_one_or_none.return_value = None
        db.execute.return_value = msp_check_result

        with pytest.raises(HTTPException) as exc_info:
            await check_tenant_access(user, str(uuid.uuid4()), db)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_non_admin_with_access_row_allowed(self) -> None:
        user_id = str(uuid.uuid4())
        user = _make_user("Operator", user_id=user_id)
        customer_tid = str(uuid.uuid4())

        db = AsyncMock()
        # First call: MSP ownership check (passes)
        msp_result = MagicMock()
        msp_result.scalar_one_or_none.return_value = MagicMock()
        # Second call: user_tenant_access check (passes)
        access_result = MagicMock()
        access_result.scalar_one_or_none.return_value = MagicMock()
        db.execute.side_effect = [msp_result, access_result]

        await check_tenant_access(user, customer_tid, db)

        assert db.execute.await_count == 2

    @pytest.mark.asyncio
    async def test_non_admin_without_access_row_403(self) -> None:
        user = _make_user("Viewer")
        customer_tid = str(uuid.uuid4())

        db = AsyncMock()
        # MSP ownership passes
        msp_result = MagicMock()
        msp_result.scalar_one_or_none.return_value = MagicMock()
        # No access row
        access_result = MagicMock()
        access_result.scalar_one_or_none.return_value = None
        db.execute.side_effect = [msp_result, access_result]

        with pytest.raises(HTTPException) as exc_info:
            await check_tenant_access(user, customer_tid, db)
        assert exc_info.value.status_code == 403
        assert "No access" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_operator_without_access_row_403(self) -> None:
        user = _make_user("Operator")
        customer_tid = str(uuid.uuid4())

        db = AsyncMock()
        # MSP ownership passes
        msp_result = MagicMock()
        msp_result.scalar_one_or_none.return_value = MagicMock()
        # No access row
        access_result = MagicMock()
        access_result.scalar_one_or_none.return_value = None
        db.execute.side_effect = [msp_result, access_result]

        with pytest.raises(HTTPException) as exc_info:
            await check_tenant_access(user, customer_tid, db)
        assert exc_info.value.status_code == 403


class TestRoleHierarchy:
    def test_admin_is_highest(self) -> None:
        assert ROLE_HIERARCHY["Admin"] > ROLE_HIERARCHY["Operator"]
        assert ROLE_HIERARCHY["Admin"] > ROLE_HIERARCHY["Viewer"]

    def test_operator_is_middle(self) -> None:
        assert ROLE_HIERARCHY["Operator"] > ROLE_HIERARCHY["Viewer"]
        assert ROLE_HIERARCHY["Operator"] < ROLE_HIERARCHY["Admin"]

    def test_viewer_is_lowest(self) -> None:
        assert ROLE_HIERARCHY["Viewer"] < ROLE_HIERARCHY["Operator"]


# ═══════════════════════════════════════════════════════════════════
# 3. Entra Auth — token validation + JIT provisioning
# ═══════════════════════════════════════════════════════════════════


def _make_claims(
    oid: str = "oid-aaa",
    tid: str = "tid-bbb",
    email: str = "alice@contoso.com",
    name: str = "Alice",
    roles: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "oid": oid,
        "tid": tid,
        "preferred_username": email,
        "name": name,
        "roles": roles or [],
        "iss": f"https://login.microsoftonline.com/{tid}/v2.0",
    }


class TestValidateToken:
    """_validate_token: JWT decoding + claim validation."""

    def test_extracts_claims_from_valid_token(self) -> None:
        claims = _make_claims(roles=["Admin"])
        settings = MagicMock()
        settings.entra_auth_client_id = "test-client-id"

        mock_key = MagicMock()
        with patch("app.core.entra_auth.pyjwt.decode", return_value=claims):
            result = _validate_token("fake.jwt.token", mock_key, settings)

        assert result["oid"] == "oid-aaa"
        assert result["tid"] == "tid-bbb"
        assert result["preferred_username"] == "alice@contoso.com"
        assert result["roles"] == ["Admin"]

    def test_missing_oid_raises_401(self) -> None:
        claims = _make_claims()
        claims["oid"] = ""
        settings = MagicMock()
        settings.entra_auth_client_id = "test-client-id"

        mock_key = MagicMock()
        with patch("app.core.entra_auth.pyjwt.decode", return_value=claims):
            with pytest.raises(HTTPException) as exc_info:
                _validate_token("fake.jwt.token", mock_key, settings)
            assert exc_info.value.status_code == 401

    def test_missing_tid_raises_401(self) -> None:
        claims = _make_claims()
        claims["tid"] = ""
        settings = MagicMock()
        settings.entra_auth_client_id = "test-client-id"

        mock_key = MagicMock()
        with patch("app.core.entra_auth.pyjwt.decode", return_value=claims):
            with pytest.raises(HTTPException) as exc_info:
                _validate_token("fake.jwt.token", mock_key, settings)
            assert exc_info.value.status_code == 401

    def test_invalid_issuer_raises_401(self) -> None:
        claims = _make_claims()
        claims["iss"] = "https://evil.example.com/v2.0"
        settings = MagicMock()
        settings.entra_auth_client_id = "test-client-id"

        mock_key = MagicMock()
        with patch("app.core.entra_auth.pyjwt.decode", return_value=claims):
            with pytest.raises(HTTPException) as exc_info:
                _validate_token("fake.jwt.token", mock_key, settings)
            assert exc_info.value.status_code == 401

    def test_jwt_error_raises_401(self) -> None:
        settings = MagicMock()
        settings.entra_auth_client_id = "test-client-id"

        from jwt.exceptions import InvalidTokenError as _InvalidTokenError

        mock_key = MagicMock()
        with patch("app.core.entra_auth.pyjwt.decode", side_effect=_InvalidTokenError("bad token")):
            with pytest.raises(HTTPException) as exc_info:
                _validate_token("bad.jwt.token", mock_key, settings)
            assert exc_info.value.status_code == 401
            assert "Invalid or expired" in str(exc_info.value.detail)

    def test_v1_issuer_format_accepted(self) -> None:
        tid = "tid-ccc"
        claims = _make_claims(tid=tid)
        claims["iss"] = f"https://sts.windows.net/{tid}/"
        settings = MagicMock()
        settings.entra_auth_client_id = "test-client-id"

        mock_key = MagicMock()
        with patch("app.core.entra_auth.pyjwt.decode", return_value=claims):
            result = _validate_token("fake.jwt.token", mock_key, settings)
            assert result["tid"] == tid


class TestJitProvisioning:
    """_jit_provision: create User + MspTenant on first sign-in."""

    @pytest.mark.asyncio
    async def test_creates_user_and_tenant_on_first_signin(self) -> None:
        claims = _make_claims(roles=["Operator"])

        # Simulate: no existing tenant, no existing user
        db = MagicMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = None
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[tenant_result, user_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        added_objects = []

        def capture_add(obj):
            added_objects.append(obj)
            if hasattr(obj, "entra_tenant_id"):
                obj.id = uuid.uuid4()

        db.add = MagicMock(side_effect=capture_add)

        user, msp_tenant = await _jit_provision(claims, db)

        # Two objects should have been added (tenant + user)
        assert len(added_objects) == 2
        assert db.commit.await_count == 1

    @pytest.mark.asyncio
    async def test_reuses_existing_user_on_subsequent_signin(self) -> None:
        claims = _make_claims(roles=["Viewer"])

        existing_tenant = MagicMock()
        existing_tenant.id = uuid.uuid4()
        existing_tenant.entra_tenant_id = claims["tid"]

        existing_user = MagicMock()
        existing_user.id = uuid.uuid4()
        existing_user.entra_oid = claims["oid"]
        existing_user.email = claims["preferred_username"]
        existing_user.display_name = claims["name"]
        existing_user.role = "Viewer"

        db = MagicMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = existing_tenant
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = existing_user
        db.execute = AsyncMock(side_effect=[tenant_result, user_result])
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        user, msp_tenant = await _jit_provision(claims, db)

        # Should NOT have called db.add (no new objects)
        db.add.assert_not_called()
        assert user is existing_user
        assert msp_tenant is existing_tenant

    @pytest.mark.asyncio
    async def test_new_user_always_provisioned_as_viewer(self) -> None:
        """Token role claims are ignored for new users — always Viewer."""
        claims = _make_claims(roles=["Admin"])

        db = MagicMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = None
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[tenant_result, user_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        added_objects = []

        def capture_add(obj):
            added_objects.append(obj)
            if hasattr(obj, "entra_tenant_id"):
                obj.id = uuid.uuid4()

        db.add = MagicMock(side_effect=capture_add)

        await _jit_provision(claims, db)

        # Even though token says "Admin", new user should be "Viewer"
        user_obj = [o for o in added_objects if hasattr(o, "entra_oid")][0]
        assert user_obj.role == "Viewer"

    @pytest.mark.asyncio
    async def test_defaults_to_viewer_when_no_roles_in_token(self) -> None:
        claims = _make_claims(roles=[])

        db = MagicMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = None
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[tenant_result, user_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        added_objects = []

        def capture_add(obj):
            added_objects.append(obj)
            if hasattr(obj, "entra_tenant_id"):
                obj.id = uuid.uuid4()

        db.add = MagicMock(side_effect=capture_add)

        await _jit_provision(claims, db)

        user_obj = [o for o in added_objects if hasattr(o, "entra_oid")][0]
        assert user_obj.role == "Viewer"

    @pytest.mark.asyncio
    async def test_invalid_role_in_token_defaults_to_viewer(self) -> None:
        claims = _make_claims(roles=["SuperAdmin"])

        db = MagicMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = None
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(side_effect=[tenant_result, user_result])
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        added_objects = []

        def capture_add(obj):
            added_objects.append(obj)
            if hasattr(obj, "entra_tenant_id"):
                obj.id = uuid.uuid4()

        db.add = MagicMock(side_effect=capture_add)

        await _jit_provision(claims, db)

        user_obj = [o for o in added_objects if hasattr(o, "entra_oid")][0]
        assert user_obj.role == "Viewer"

    @pytest.mark.asyncio
    async def test_db_role_is_authoritative_over_token_role(self) -> None:
        """On subsequent sign-in, DB role should be kept even if token says different."""
        claims = _make_claims(roles=["Admin"])

        existing_tenant = MagicMock()
        existing_tenant.id = uuid.uuid4()

        existing_user = MagicMock()
        existing_user.id = uuid.uuid4()
        existing_user.role = "Viewer"  # DB says Viewer
        existing_user.entra_oid = claims["oid"]
        existing_user.email = claims["preferred_username"]
        existing_user.display_name = claims["name"]

        db = MagicMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = existing_tenant
        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = existing_user
        db.execute = AsyncMock(side_effect=[tenant_result, user_result])
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        user, _ = await _jit_provision(claims, db)

        # Role should remain "Viewer" (DB authoritative), not "Admin" (token)
        assert existing_user.role == "Viewer"


class TestGetCurrentUserMissingToken:
    """get_current_user rejects missing/malformed bearer tokens."""

    def test_missing_kid_header_raises_401(self) -> None:
        from app.core.entra_auth import _get_signing_key

        with patch("app.core.entra_auth._jwk_client.get_signing_key_from_jwt", side_effect=Exception("no kid")):
            with pytest.raises(HTTPException) as exc_info:
                _get_signing_key("token.without.kid")
            assert exc_info.value.status_code == 401
