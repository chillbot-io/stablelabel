function Get-SLAuditLog {
    <#
    .SYNOPSIS
        Reads the local StableLabel audit log.
    .DESCRIPTION
        Parses the JSONL audit log file maintained by Write-SLAuditEntry and
        returns recent entries. Supports filtering by action name, result
        status, and limiting the number of returned entries.
        No connection is required as the audit log is stored locally.
    .PARAMETER Last
        The number of most recent entries to return. Defaults to 50.
    .PARAMETER Action
        Filter entries by action name (exact match).
    .PARAMETER Result
        Filter entries by result status.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLAuditLog
    .EXAMPLE
        Get-SLAuditLog -Last 10
    .EXAMPLE
        Get-SLAuditLog -Action 'New-DlpCompliancePolicy' -Result success
    .EXAMPLE
        Get-SLAuditLog -Result dry-run -AsJson
    #>
    [CmdletBinding()]
    param(
        [ValidateRange(1, [int]::MaxValue)]
        [int]$Last = 50,

        [ValidateNotNullOrEmpty()]
        [string]$Action,

        [ValidateSet('success', 'failed', 'dry-run', 'skipped', 'partial', 'start', 'complete', 'dry-run-start', 'dry-run-complete')]
        [string]$Result,

        [switch]$AsJson
    )

    process {
        $logPath = $script:SLConfig.AuditLogPath

        if (-not (Test-Path $logPath)) {
            Write-Warning "Audit log file not found at '$logPath'."
            if ($AsJson) {
                return '[]'
            }
            return @()
        }

        try {
            Write-Verbose "Reading audit log from '$logPath'"

            $lines = Get-Content -Path $logPath -Encoding utf8
            $entries = foreach ($line in $lines) {
                if ([string]::IsNullOrWhiteSpace($line)) { continue }
                try {
                    $line | ConvertFrom-Json
                }
                catch {
                    Write-Verbose "Skipping malformed audit log line: $line"
                }
            }

            # Sort newest first — property is lowercase 'timestamp' per Write-SLAuditEntry
            $entries = @($entries | Sort-Object { $_.timestamp } -Descending)

            # Apply filters — properties are lowercase per Write-SLAuditEntry
            if ($Action) {
                $entries = @($entries | Where-Object { $_.action -eq $Action })
            }

            if ($Result) {
                $entries = @($entries | Where-Object { $_.result -eq $Result })
            }

            # Limit to last N entries
            $entries = @($entries | Select-Object -First $Last)

            if ($AsJson) {
                return $entries | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $entries
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
