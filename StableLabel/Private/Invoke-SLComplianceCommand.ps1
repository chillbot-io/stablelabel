function Invoke-SLComplianceCommand {
    <#
    .SYNOPSIS
        Wraps Security & Compliance PowerShell cmdlet calls with session management,
        error handling, auto-reconnect, and audit logging.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [scriptblock]$ScriptBlock,

        [string]$OperationName = 'Compliance command',

        [switch]$SkipAudit
    )

    Assert-SLConnected -Require Compliance

    # Check session health - recycle if needed
    $needsRecycle = $false

    if ($script:SLConnection.ComplianceCommandCount -ge $script:SLConfig.ComplianceMaxCommands) {
        Write-Verbose "Session recycling: command count ($($script:SLConnection.ComplianceCommandCount)) reached limit."
        $needsRecycle = $true
    }

    if ($script:SLConnection.ComplianceSessionStart) {
        $sessionAge = (Get-Date) - $script:SLConnection.ComplianceSessionStart
        if ($sessionAge.TotalMinutes -ge $script:SLConfig.ComplianceMaxSessionMinutes) {
            Write-Verbose "Session recycling: session age ($([int]$sessionAge.TotalMinutes) min) reached limit."
            $needsRecycle = $true
        }
    }

    if ($needsRecycle) {
        Write-Verbose "Recycling S&C PowerShell session..."
        try {
            Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
        }
        catch { Write-Verbose "Disconnect-ExchangeOnline during recycle failed: $($_.Exception.Message)" }

        try {
            $ippsParams = @{
                UserPrincipalName = $script:SLConnection.UserPrincipalName
                ErrorAction       = 'Stop'
            }
            # Do NOT use -Device for session recycles — the GUI only shows
            # device-code prompts during the initial ConnectionDialog flow.
            # A mid-operation device-code prompt would be invisible to the user
            # and silently time out.  Omitting -Device allows
            # Connect-IPPSSession to reuse cached credentials from the
            # original interactive sign-in.
            Connect-IPPSSession @ippsParams
            $script:SLConnection.ComplianceCommandCount = 0
            $script:SLConnection.ComplianceSessionStart = Get-Date
            $script:SLConnection.ConnectedAt.Compliance = Get-Date
            Write-Verbose "S&C session recycled successfully."
        }
        catch {
            $script:SLConnection.ComplianceConnected = $false
            throw "Failed to recycle S&C PowerShell session: $_"
        }
    }

    # Execute the command with retry for stale session errors
    try {
        $result = Invoke-SLWithRetry -MaxRetries 2 -OperationName $OperationName -ScriptBlock $ScriptBlock
        $script:SLConnection.ComplianceCommandCount++
        return $result
    }
    catch {
        # If it looks like a session failure, try reconnecting once
        if ($_.Exception.Message -match 'ConnectionClosed|session has expired|Runspace is not open|broken pipe') {
            Write-Verbose "S&C session appears stale. Attempting reconnect..."
            try {
                Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
                $ippsParams = @{
                    UserPrincipalName = $script:SLConnection.UserPrincipalName
                    ErrorAction       = 'Stop'
                }
                # Same as above: no -Device flag for auto-reconnect.
                Connect-IPPSSession @ippsParams
                $script:SLConnection.ComplianceCommandCount = 0
                $script:SLConnection.ComplianceSessionStart = Get-Date
                $script:SLConnection.ConnectedAt.Compliance = Get-Date

                $result = & $ScriptBlock
                $script:SLConnection.ComplianceCommandCount++
                return $result
            }
            catch {
                $script:SLConnection.ComplianceConnected = $false
                throw "S&C PowerShell session failed and reconnect was unsuccessful: $_"
            }
        }
        throw
    }
}
