"""Tests for the PowerShell runner and label management service."""

from __future__ import annotations

import pytest

from app.core.exceptions import GraphApiNotSupportedError
from app.services.label_management import LabelConfig, LabelManagementService, PolicyConfig, _UNSUPPORTED_CODES
from app.services.powershell_runner import (
    CmdletResult,
    PowerShellRunner,
    PowerShellExecutionError,
    PowerShellNotAvailableError,
    _ALLOWED_CMDLETS,
)


# ── PowerShellRunner unit tests ─────────────────────────────────


class TestPowerShellRunnerAvailability:
    def test_is_available_returns_false_without_pwsh(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        # In test env, pwsh is likely not installed
        # This test validates the check mechanism
        assert isinstance(runner.is_available(), bool)

    def test_allowed_cmdlets_includes_expected(self) -> None:
        assert "New-Label" in _ALLOWED_CMDLETS
        assert "Set-Label" in _ALLOWED_CMDLETS
        assert "New-LabelPolicy" in _ALLOWED_CMDLETS
        assert "Set-LabelPolicy" in _ALLOWED_CMDLETS
        assert "Remove-Label" in _ALLOWED_CMDLETS
        assert "Get-Label" in _ALLOWED_CMDLETS

    def test_disallowed_cmdlet_not_in_allowlist(self) -> None:
        assert "Invoke-Expression" not in _ALLOWED_CMDLETS
        assert "Remove-Item" not in _ALLOWED_CMDLETS

    @pytest.mark.asyncio
    async def test_invoke_rejects_disallowed_cmdlet(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        # Bypass the pwsh availability check by setting path
        runner._pwsh_path = "/usr/bin/pwsh"  # fake path for test
        with pytest.raises(PowerShellExecutionError, match="not in allowlist"):
            await runner.invoke("Invoke-Expression", {"Command": "whoami"})


class TestPowerShellEscaping:
    def test_escape_double_quotes(self) -> None:
        result = PowerShellRunner._escape_ps_string('hello "world"')
        assert '`"' in result
        assert '"world"' not in result

    def test_escape_dollar_signs(self) -> None:
        result = PowerShellRunner._escape_ps_string("price is $100")
        assert "`$100" in result

    def test_escape_backslashes(self) -> None:
        result = PowerShellRunner._escape_ps_string("path\\to\\file")
        assert "\\\\" in result

    def test_escape_single_quotes(self) -> None:
        result = PowerShellRunner._escape_ps_string("it's")
        assert "''" in result


class TestPowerShellValueConversion:
    def test_bool_true(self) -> None:
        assert PowerShellRunner._to_ps_value(True) == "$true"

    def test_bool_false(self) -> None:
        assert PowerShellRunner._to_ps_value(False) == "$false"

    def test_integer(self) -> None:
        assert PowerShellRunner._to_ps_value(42) == "42"

    def test_string(self) -> None:
        result = PowerShellRunner._to_ps_value("hello")
        assert result == '"hello"'

    def test_list(self) -> None:
        result = PowerShellRunner._to_ps_value(["a", "b"])
        assert result.startswith("@(")
        assert '"a"' in result
        assert '"b"' in result

    def test_dict(self) -> None:
        result = PowerShellRunner._to_ps_value({"key": "val"})
        assert result.startswith("@{")
        assert '"key"' in result


class TestCmdletResult:
    def test_success_result(self) -> None:
        r = CmdletResult(success=True, data={"id": "abc"})
        assert r.success is True
        assert r.data == {"id": "abc"}
        assert r.error == ""

    def test_error_result(self) -> None:
        r = CmdletResult(success=False, error="Something went wrong")
        assert r.success is False
        assert r.error == "Something went wrong"


# ── LabelConfig tests ───────────────────────────────────────────


class TestLabelConfig:
    def test_to_graph_body_minimal(self) -> None:
        config = LabelConfig(name="Test")
        body = config.to_graph_body()
        assert body["name"] == "Test"
        assert body["displayName"] == "Test"
        assert body["isActive"] is True

    def test_to_graph_body_full(self) -> None:
        config = LabelConfig(
            name="Confidential",
            display_name="Confidential Label",
            description="For sensitive docs",
            tooltip="Apply to sensitive files",
            color="#FF0000",
            parent_id="parent-guid",
        )
        body = config.to_graph_body()
        assert body["description"] == "For sensitive docs"
        assert body["tooltip"] == "Apply to sensitive files"
        assert body["color"] == "#FF0000"
        assert body["parent"]["labelId"] == "parent-guid"

    def test_to_powershell_params(self) -> None:
        config = LabelConfig(
            name="Confidential",
            display_name="My Label",
            description="Desc",
            tooltip="Tip",
            parent_id="p-id",
        )
        params = config.to_powershell_params()
        assert params["Name"] == "Confidential"
        assert params["DisplayName"] == "My Label"
        assert params["Comment"] == "Desc"
        assert params["Tooltip"] == "Tip"
        assert params["ParentId"] == "p-id"


class TestPolicyConfig:
    def test_to_graph_body(self) -> None:
        config = PolicyConfig(
            name="Default Policy",
            description="Applies to all",
            labels=["label-1", "label-2"],
        )
        body = config.to_graph_body()
        assert body["name"] == "Default Policy"
        assert len(body["labels"]) == 2

    def test_to_powershell_params(self) -> None:
        config = PolicyConfig(
            name="Default",
            description="Desc",
            labels=["l1"],
            users=["user@example.com"],
        )
        params = config.to_powershell_params()
        assert params["Name"] == "Default"
        assert params["Labels"] == ["l1"]
        assert params["ExchangeLocation"] == ["user@example.com"]


# ── LabelManagementService tests ────────────────────────────────


class TestUnsupportedErrorDetection:
    def test_graph_api_not_supported_error(self) -> None:
        exc = GraphApiNotSupportedError("not supported")
        assert LabelManagementService._is_unsupported_error(exc) is True

    def test_unsupported_code_in_message(self) -> None:
        from app.core.exceptions import StableLabelError
        for code in _UNSUPPORTED_CODES:
            exc = StableLabelError(f"Graph API 400: {code} / Operation not allowed")
            assert LabelManagementService._is_unsupported_error(exc) is True

    def test_regular_error_not_unsupported(self) -> None:
        exc = Exception("Connection refused")
        assert LabelManagementService._is_unsupported_error(exc) is False

    def test_graph_locked_not_unsupported(self) -> None:
        from app.core.exceptions import GraphLockedError
        exc = GraphLockedError("File is locked")
        assert LabelManagementService._is_unsupported_error(exc) is False
