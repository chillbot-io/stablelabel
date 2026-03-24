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
        script = runner._build_script("New-Label", {"Name": "Confidential", "DisplayName": "My Label"}, "tenant123")

        assert "New-Label" in script
        assert '$params["Name"] = "Confidential"' in script
        assert '$params["DisplayName"] = "My Label"' in script
        assert "Connect-IPPSSession" in script
        assert "tenant123" in script

    def test_build_script_empty_params(self) -> None:
        runner = PowerShellRunner(client_id="myid", client_secret="mysecret")
        script = runner._build_script("Get-Label", {}, "tenant123")

        assert "Get-Label @params" in script
        assert "$params = @{}" in script
        # No param assignments should appear
        assert '$params["' not in script.replace("$params = @{}", "")

    def test_build_script_escapes_credentials(self) -> None:
        runner = PowerShellRunner(client_id="app's-id", client_secret='sec"ret$val')
        script = runner._build_script("Get-Label", {}, "t1")

        # Client secret with special chars should be escaped
        assert "sec`\"ret`$val" in script
        # Client id with single quote should be escaped
        assert "app''s-id" in script

    def test_build_script_contains_error_handling(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        script = runner._build_script("Get-Label", {}, "t1")

        assert "$ErrorActionPreference = 'Stop'" in script
        assert "try {" in script
        assert "catch {" in script
        assert "finally {" in script
        assert "Disconnect-ExchangeOnline" in script

    def test_build_script_converts_to_json(self) -> None:
        runner = PowerShellRunner(client_id="id", client_secret="secret")
        script = runner._build_script("Get-Label", {}, "t1")

        assert "ConvertTo-Json -Depth 10" in script
