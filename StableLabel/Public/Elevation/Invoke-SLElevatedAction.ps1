function Invoke-SLElevatedAction {
    <#
    .SYNOPSIS
        Executes a scriptblock within an elevated job context with automatic cleanup.
    .DESCRIPTION
        Runs the specified operation within the context of an active elevated job
        (created by Start-SLElevatedJob). The operation runs in a try/finally block
        that guarantees cleanup via Stop-SLElevatedJob, even on failure.

        The scriptblock receives the job state as $args[0], giving access to
        the authenticated account, site URLs, and elevation details.
    .PARAMETER ScriptBlock
        The operation to execute under elevated privileges. Receives the job
        state object as $args[0].
    .PARAMETER JobId
        The ID of the elevated job to use. If omitted, uses the most recent
        active job from the module scope.
    .PARAMETER NoAutoCleanup
        Skip automatic cleanup after the action completes. Use this when you
        want to run multiple actions within the same job, then call
        Stop-SLElevatedJob manually.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        # Single action with auto-cleanup
        $job = Start-SLElevatedJob -SiteUrls 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'ga@contoso.com'
        Invoke-SLElevatedAction -ScriptBlock {
            $job = $args[0]
            Set-SLDocumentLabelBulk -Items $items -LabelName 'Confidential'
        }

    .EXAMPLE
        # Multiple actions, manual cleanup
        $job = Start-SLElevatedJob -SiteUrls 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'ga@contoso.com'
        Invoke-SLElevatedAction -NoAutoCleanup -ScriptBlock {
            Get-SLDocumentLabel -DriveId $driveId -ItemId $itemId
        }
        Invoke-SLElevatedAction -NoAutoCleanup -ScriptBlock {
            Set-SLDocumentLabel -DriveId $driveId -ItemId $itemId -LabelName 'Internal'
        }
        Stop-SLElevatedJob
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [scriptblock]$ScriptBlock,

        [string]$JobId,

        [switch]$NoAutoCleanup,

        [switch]$AsJson
    )

    process {
        # Resolve the active job
        $jobState = $null

        if ($JobId) {
            # Look up from state file
            $statePath = $script:SLConfig.ElevationState
            if (Test-Path -Path $statePath) {
                $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json -AsHashtable
                $jobState = $state['ActiveJobs'] | Where-Object { $_['JobId'] -eq $JobId } | Select-Object -First 1
            }
        }
        else {
            # Use module-scoped active job
            $jobState = $script:SLActiveJob
        }

        if (-not $jobState) {
            throw "No active elevated job found. Run Start-SLElevatedJob first."
        }

        $currentJobId = $jobState['JobId']

        if ($jobState['Status'] -ne 'Active' -and $jobState['Status'] -ne 'DryRun') {
            throw "Elevated job '$currentJobId' is not active (status: $($jobState['Status'])). Start a new job."
        }

        if (-not $PSCmdlet.ShouldProcess($currentJobId, 'Execute elevated action')) {
            return
        }

        Write-Verbose "[$currentJobId] Executing elevated action..."
        Write-SLAuditEntry -Action 'Invoke-ElevatedAction' -Target $currentJobId -Detail @{
            ScriptBlock = $ScriptBlock.ToString().Substring(0, [math]::Min(200, $ScriptBlock.ToString().Length))
        } -Result 'success'

        $actionResult = $null
        $actionError = $null

        try {
            # Execute the scriptblock, passing job state as argument
            $actionResult = & $ScriptBlock $jobState

            Write-SLAuditEntry -Action 'Invoke-ElevatedAction-Complete' -Target $currentJobId -Result 'success'
        }
        catch {
            $actionError = $_
            Write-SLAuditEntry -Action 'Invoke-ElevatedAction-Complete' -Target $currentJobId `
                -Result 'failed' -ErrorMessage $_.Exception.Message
            Write-Warning "[$currentJobId] Elevated action failed: $($_.Exception.Message)"
        }
        finally {
            # Automatic cleanup unless suppressed
            if (-not $NoAutoCleanup) {
                Write-Verbose "[$currentJobId] Auto-cleanup: tearing down elevations..."
                try {
                    Stop-SLElevatedJob -JobId $currentJobId -Force -Confirm:$false
                }
                catch {
                    Write-Warning "[$currentJobId] Cleanup failed: $($_.Exception.Message). Run Stop-SLElevatedJob -JobId '$currentJobId' -Force manually."
                }
            }
        }

        # Re-throw if the action failed
        if ($actionError) {
            $PSCmdlet.ThrowTerminatingError($actionError)
        }

        if ($AsJson -and $null -ne $actionResult) {
            return $actionResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        return $actionResult
    }
}
