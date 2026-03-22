"""PowerShell runner — thin async wrapper for Compliance Center cmdlets.

Shells out to `pwsh` for operations that the Graph API does not support:
  - New-Label / Set-Label
  - New-LabelPolicy / Set-LabelPolicy

Design:
  - Connects to Security & Compliance Center via app-only auth
  - Executes a single cmdlet per invocation (no persistent session)
  - Parses JSON output from ConvertTo-Json
  - Raises on non-zero exit code or PowerShell errors

As Graph API coverage improves, delete fallbacks one by one until
pwsh can be removed from the container entirely.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from dataclasses import dataclass, field
from typing import Any

from app.core.exceptions import StableLabelError

logger = logging.getLogger(__name__)

# Maximum time for a single PowerShell invocation
_TIMEOUT_SECONDS = 120

# Allowed cmdlets — anything else is rejected to prevent injection
_ALLOWED_CMDLETS = frozenset({
    "New-Label",
    "Set-Label",
    "Remove-Label",
    "Get-Label",
    "New-LabelPolicy",
    "Set-LabelPolicy",
    "Remove-LabelPolicy",
    "Get-LabelPolicy",
})


class PowerShellNotAvailableError(StableLabelError):
    """pwsh binary not found in PATH."""


class PowerShellExecutionError(StableLabelError):
    """PowerShell cmdlet returned a non-zero exit code or error."""

    def __init__(self, message: str, stderr: str = "", exit_code: int = 1) -> None:
        self.stderr = stderr
        self.exit_code = exit_code
        super().__init__(message)


@dataclass
class CmdletResult:
    """Result of a PowerShell cmdlet invocation."""

    success: bool
    data: dict[str, Any] | list[dict[str, Any]] = field(default_factory=dict)
    error: str = ""


class PowerShellRunner:
    """Async PowerShell runner for Security & Compliance Center.

    Usage:
        runner = PowerShellRunner(client_id="...", client_secret="...", tenant_id="...")
        result = await runner.invoke("New-Label", {"Name": "Confidential", ...})
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
    ) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._pwsh_path = shutil.which("pwsh")

    def is_available(self) -> bool:
        """Check if pwsh is installed and in PATH."""
        return self._pwsh_path is not None

    async def invoke(
        self,
        cmdlet: str,
        params: dict[str, Any] | None = None,
        tenant_id: str = "",
    ) -> CmdletResult:
        """Execute a Compliance Center cmdlet and return parsed output.

        Args:
            cmdlet: The cmdlet name (e.g., "New-Label").
            params: Dictionary of parameters to pass to the cmdlet.
            tenant_id: The Entra tenant ID (for connecting to the right tenant).

        Returns:
            CmdletResult with parsed JSON output.

        Raises:
            PowerShellNotAvailableError: pwsh not found.
            PowerShellExecutionError: Cmdlet failed.
        """
        if not self.is_available():
            raise PowerShellNotAvailableError(
                "pwsh binary not found. Install PowerShell or add it to PATH."
            )

        if cmdlet not in _ALLOWED_CMDLETS:
            raise PowerShellExecutionError(
                f"Cmdlet '{cmdlet}' not in allowlist: {sorted(_ALLOWED_CMDLETS)}"
            )

        script = self._build_script(cmdlet, params or {}, tenant_id)

        try:
            proc = await asyncio.create_subprocess_exec(
                self._pwsh_path,
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                script,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            proc.kill()
            raise PowerShellExecutionError(
                f"PowerShell timed out after {_TIMEOUT_SECONDS}s running {cmdlet}",
                exit_code=-1,
            )

        stdout_str = stdout.decode("utf-8", errors="replace").strip()
        stderr_str = stderr.decode("utf-8", errors="replace").strip()

        if proc.returncode != 0:
            logger.warning(
                "PowerShell %s failed (exit %d): %s",
                cmdlet, proc.returncode, stderr_str,
            )
            raise PowerShellExecutionError(
                f"{cmdlet} failed with exit code {proc.returncode}: {stderr_str}",
                stderr=stderr_str,
                exit_code=proc.returncode or 1,
            )

        # Parse JSON output
        data: dict | list = {}
        if stdout_str:
            try:
                data = json.loads(stdout_str)
            except json.JSONDecodeError:
                logger.warning(
                    "PowerShell %s returned non-JSON output: %s",
                    cmdlet, stdout_str[:200],
                )
                return CmdletResult(success=True, error=f"Non-JSON output: {stdout_str[:200]}")

        logger.info("PowerShell %s completed successfully for tenant %s", cmdlet, tenant_id)
        return CmdletResult(success=True, data=data)

    def _build_script(
        self,
        cmdlet: str,
        params: dict[str, Any],
        tenant_id: str,
    ) -> str:
        """Build a PowerShell script that connects and runs the cmdlet.

        The script:
          1. Creates a PSCredential from client_id/client_secret
          2. Connects to Exchange Online (Security & Compliance endpoint)
          3. Runs the cmdlet with parameters
          4. Outputs result as JSON
          5. Disconnects
        """
        # Build parameter string — PowerShell splatting style
        param_assignments = []
        for key, value in params.items():
            ps_value = self._to_ps_value(value)
            param_assignments.append(f'$params["{key}"] = {ps_value}')

        params_block = "\n".join(param_assignments) if param_assignments else ""

        # Use app-only auth via certificate or client secret
        # ExchangeOnline module supports CBA (Certificate-Based Auth)
        # For client secret, we use Connect-IPPSSession with credential
        return f"""
$ErrorActionPreference = 'Stop'

try {{
    # Create credential
    $secureSecret = ConvertTo-SecureString -String '{self._escape_ps_string(self._client_secret)}' -AsPlainText -Force
    $credential = New-Object System.Management.Automation.PSCredential('{self._escape_ps_string(self._client_id)}', $secureSecret)

    # Connect to Security & Compliance Center
    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    Connect-IPPSSession -AppId '{self._escape_ps_string(self._client_id)}' -Organization '{self._escape_ps_string(tenant_id)}' -CertificateThumbprint '' -Credential $credential -ErrorAction Stop

    # Build parameters
    $params = @{{}}
    {params_block}

    # Execute cmdlet
    $result = {cmdlet} @params

    # Output as JSON
    $result | ConvertTo-Json -Depth 10

}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}} finally {{
    Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
}}
"""

    @staticmethod
    def _to_ps_value(value: Any) -> str:
        """Convert a Python value to a PowerShell literal."""
        if isinstance(value, bool):
            return "$true" if value else "$false"
        if isinstance(value, (int, float)):
            return str(value)
        if isinstance(value, list):
            items = ", ".join(
                f'"{PowerShellRunner._escape_ps_string(str(v))}"' for v in value
            )
            return f"@({items})"
        if isinstance(value, dict):
            pairs = []
            for k, v in value.items():
                pairs.append(f'"{PowerShellRunner._escape_ps_string(str(k))}" = {PowerShellRunner._to_ps_value(v)}')
            return "@{" + "; ".join(pairs) + "}"
        # String
        return f'"{PowerShellRunner._escape_ps_string(str(value))}"'

    @staticmethod
    def _escape_ps_string(s: str) -> str:
        """Escape a string for use in PowerShell double-quoted strings."""
        return s.replace("\\", "\\\\").replace('"', '`"').replace("'", "''").replace("$", "`$")
