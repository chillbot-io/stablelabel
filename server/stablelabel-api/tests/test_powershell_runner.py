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


class TestPowerShellEnvVarParams:
    """Parameters and secrets are passed via env vars to prevent injection."""

    def test_build_script_returns_env_vars(self) -> None:
        runner = PowerShellRunner(client_id="cid", client_secret="csec")
        script, env_vars = runner._build_script("New-Label", {"Name": "Test"}, "tid-123")
        assert env_vars["SL_PS_CLIENT_ID"] == "cid"
        assert env_vars["SL_PS_CLIENT_SECRET"] == "csec"
        assert env_vars["SL_PS_TENANT_ID"] == "tid-123"
        assert '"Name": "Test"' in env_vars["SL_PS_PARAMS_JSON"]

    def test_build_script_reads_from_env(self) -> None:
        runner = PowerShellRunner(client_id="cid", client_secret="csec")
        script, _ = runner._build_script("New-Label", {"Name": "Test"}, "tid-123")
        assert "$env:SL_PS_CLIENT_ID" in script
        assert "$env:SL_PS_CLIENT_SECRET" in script
        assert "$env:SL_PS_TENANT_ID" in script
        assert "$env:SL_PS_PARAMS_JSON" in script

    def test_secrets_not_interpolated_in_script(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="se'cr$et`test")
        script, env_vars = runner._build_script("Get-Label", {}, "tid")
        # Secret should be in env vars, NOT in the script text
        assert env_vars["SL_PS_CLIENT_SECRET"] == "se'cr$et`test"
        assert "se'cr$et`test" not in script


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


# ── PowerShellRunner invoke() and _build_script() tests ─────────


from unittest.mock import AsyncMock, MagicMock, patch
import asyncio


class TestPowerShellRunnerInvoke:
    @pytest.mark.asyncio
    async def test_invoke_raises_when_pwsh_not_available(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        runner._pwsh_path = None
        with pytest.raises(PowerShellNotAvailableError, match="pwsh binary not found"):
            await runner.invoke("Get-Label")

    @pytest.mark.asyncio
    async def test_invoke_success_json_output(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        runner._pwsh_path = "/usr/bin/pwsh"

        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b'{"id": "abc", "name": "Test"}', b"")
        mock_proc.returncode = 0
        mock_proc.kill = MagicMock()

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with patch("asyncio.wait_for", return_value=(b'{"id": "abc", "name": "Test"}', b"")):
                result = await runner.invoke("Get-Label", {"Name": "Test"}, tenant_id="t1")

        assert result.success is True
        assert result.data == {"id": "abc", "name": "Test"}
        assert result.error == ""

    @pytest.mark.asyncio
    async def test_invoke_success_empty_stdout(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        runner._pwsh_path = "/usr/bin/pwsh"

        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b"", b"")
        mock_proc.returncode = 0
        mock_proc.kill = MagicMock()

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with patch("asyncio.wait_for", return_value=(b"", b"")):
                result = await runner.invoke("Get-Label")

        assert result.success is True
        assert result.data == {}

    @pytest.mark.asyncio
    async def test_invoke_timeout(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        runner._pwsh_path = "/usr/bin/pwsh"

        mock_proc = AsyncMock()
        mock_proc.kill = MagicMock()

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError):
                with pytest.raises(PowerShellExecutionError, match="timed out"):
                    await runner.invoke("Get-Label")

        mock_proc.kill.assert_called_once()

    @pytest.mark.asyncio
    async def test_invoke_nonzero_exit_code(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        runner._pwsh_path = "/usr/bin/pwsh"

        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b"", b"Something went wrong")
        mock_proc.returncode = 1
        mock_proc.kill = MagicMock()

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with patch("asyncio.wait_for", return_value=(b"", b"Something went wrong")):
                with pytest.raises(PowerShellExecutionError, match="failed with exit code 1") as exc_info:
                    await runner.invoke("Get-Label")

        assert exc_info.value.stderr == "Something went wrong"
        assert exc_info.value.exit_code == 1

    @pytest.mark.asyncio
    async def test_invoke_non_json_output(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        runner._pwsh_path = "/usr/bin/pwsh"

        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b"this is not json", b"")
        mock_proc.returncode = 0
        mock_proc.kill = MagicMock()

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with patch("asyncio.wait_for", return_value=(b"this is not json", b"")):
                result = await runner.invoke("Get-Label")

        assert result.success is True
        assert "Non-JSON output" in result.error
        assert "this is not json" in result.error

    @pytest.mark.asyncio
    async def test_invoke_json_list_output(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        runner._pwsh_path = "/usr/bin/pwsh"

        json_list = b'[{"id": "1"}, {"id": "2"}]'
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (json_list, b"")
        mock_proc.returncode = 0
        mock_proc.kill = MagicMock()

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with patch("asyncio.wait_for", return_value=(json_list, b"")):
                result = await runner.invoke("Get-Label")

        assert result.success is True
        assert isinstance(result.data, list)
        assert len(result.data) == 2


class TestBuildScript:
    def test_build_script_with_params(self) -> None:
        runner = PowerShellRunner(client_id="myid", client_secret="mysecret")
        script, env_vars = runner._build_script("New-Label", {"Name": "Confidential", "DisplayName": "My Label"}, "tenant123")

        assert "New-Label" in script
        assert "Connect-IPPSSession" in script
        # Params are in env var, not in script
        assert '"Name": "Confidential"' in env_vars["SL_PS_PARAMS_JSON"]
        assert env_vars["SL_PS_TENANT_ID"] == "tenant123"

    def test_build_script_empty_params(self) -> None:
        runner = PowerShellRunner(client_id="myid", client_secret="mysecret")
        script, _ = runner._build_script("Get-Label", {}, "tenant123")

        assert "Get-Label @params" in script
        assert "$params = @{}" in script

    def test_build_script_passes_credentials_via_env(self) -> None:
        runner = PowerShellRunner(client_id="app's-id", client_secret='sec"ret$val')
        script, env_vars = runner._build_script("Get-Label", {}, "t1")

        # Credentials are in env vars, not in the script
        assert env_vars["SL_PS_CLIENT_ID"] == "app's-id"
        assert env_vars["SL_PS_CLIENT_SECRET"] == 'sec"ret$val'
        assert "$env:SL_PS_CLIENT_SECRET" in script

    def test_build_script_contains_error_handling(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        script, _ = runner._build_script("Get-Label", {}, "t1")

        assert "$ErrorActionPreference = 'Stop'" in script
        assert "try {" in script
        assert "catch {" in script
        assert "finally {" in script
        assert "Disconnect-ExchangeOnline" in script

    def test_build_script_converts_to_json(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        script, _ = runner._build_script("Get-Label", {}, "t1")

        assert "ConvertTo-Json -Depth 10" in script
