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

        script, env_vars = self._build_script(cmdlet, params or {}, tenant_id)

        try:
            import os

            # Pass secrets via environment variables to avoid injection.
            # Script reads from env vars — no string interpolation of secrets.
            run_env = {**os.environ, **env_vars}

            # Pass script via stdin to avoid secrets appearing in process listing.
            # Using "-Command -" reads the script from stdin.
            proc = await asyncio.create_subprocess_exec(
                self._pwsh_path,
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "-",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=run_env,
            )

            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=script.encode("utf-8")),
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
    ) -> tuple[str, dict[str, str]]:
        """Build a PowerShell script and environment variables.

        Returns (script, env_vars). Secrets and parameters are passed via
        environment variables to completely avoid string interpolation
        injection. The cmdlet name is the only value interpolated into the
        script, and it's validated against the allowlist before reaching here.
        """
        env_vars = {
            "SL_PS_CLIENT_ID": self._client_id,
            "SL_PS_CLIENT_SECRET": self._client_secret,
            "SL_PS_TENANT_ID": tenant_id,
            "SL_PS_PARAMS_JSON": json.dumps(params),
        }

        script = f"""
$ErrorActionPreference = 'Stop'

try {{
    # Read secrets from environment variables (no string interpolation)
    $clientId = $env:SL_PS_CLIENT_ID
    $clientSecret = $env:SL_PS_CLIENT_SECRET
    $tenantId = $env:SL_PS_TENANT_ID
    $paramsJson = $env:SL_PS_PARAMS_JSON

    # Create credential
    $secureSecret = ConvertTo-SecureString -String $clientSecret -AsPlainText -Force
    $credential = New-Object System.Management.Automation.PSCredential($clientId, $secureSecret)

    # Connect to Security & Compliance Center
    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    Connect-IPPSSession -AppId $clientId -Organization $tenantId -CertificateThumbprint '' -Credential $credential -ErrorAction Stop

    # Build parameters from JSON env var — no string interpolation
    $params = @{{}}
    if ($paramsJson -and $paramsJson -ne '{{}}') {{
        $parsed = $paramsJson | ConvertFrom-Json
        $parsed.PSObject.Properties | ForEach-Object {{
            $params[$_.Name] = $_.Value
        }}
    }}

    # Execute cmdlet (name is validated against allowlist before reaching here)
    $result = {cmdlet} @params

    # Output as JSON
    $result | ConvertTo-Json -Depth 10

}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}} finally {{
    # Clear secrets from environment
    $env:SL_PS_CLIENT_SECRET = $null
    Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
}}
"""
        return script, env_vars
