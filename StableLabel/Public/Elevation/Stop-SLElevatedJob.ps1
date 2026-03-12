function Stop-SLElevatedJob {
    <#
    .SYNOPSIS
        Tears down all elevations from an elevated job and disconnects the GA session.
    .DESCRIPTION
        Reverses all elevations made by Start-SLElevatedJob in the correct order:
        1. Revoke Site Admin from each site (in reverse order)
        2. Disable Super User feature
        3. Disconnect the GA Graph session
        4. Update elevation-state.json to mark the job as completed
        5. Reconnect the original StableLabel Graph session if one was active

        Each cleanup step runs independently — if one fails, the others still execute.
        All failures are collected and reported in the result.
    .PARAMETER JobId
        The ID of the elevated job to stop. If omitted, uses the most recent
        active job from the module scope.
    .PARAMETER Force
        Skip confirmation prompts during cleanup. Use in finally blocks.
    .PARAMETER ReconnectOriginal
        After cleanup, reconnect to Graph with the original StableLabel scopes.
        Requires a new interactive auth prompt for the non-GA account.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Stop-SLElevatedJob
    .EXAMPLE
        Stop-SLElevatedJob -JobId 'SLJob-20260312-143000-a1b2c3d4' -Force
    .EXAMPLE
        Stop-SLElevatedJob -ReconnectOriginal
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [string]$JobId,

        [switch]$Force,

        [switch]$ReconnectOriginal,

        [switch]$AsJson
    )

    process {
        # Resolve the job
        $jobState = $null

        if ($JobId) {
            $statePath = $script:SLConfig.ElevationState
            if (Test-Path -Path $statePath) {
                $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json -AsHashtable
                $jobState = $state['ActiveJobs'] | Where-Object { $_['JobId'] -eq $JobId } | Select-Object -First 1
            }

            # Also check module scope
            if (-not $jobState -and $script:SLActiveJob -and $script:SLActiveJob['JobId'] -eq $JobId) {
                $jobState = $script:SLActiveJob
            }
        }
        else {
            $jobState = $script:SLActiveJob
        }

        if (-not $jobState) {
            Write-Warning "No active elevated job found to stop."
            return
        }

        $currentJobId = $jobState['JobId']

        if (-not $Force -and -not $PSCmdlet.ShouldProcess($currentJobId, 'Stop elevated job and revoke all elevations')) {
            return
        }

        Write-Host "`nStopping elevated job: $currentJobId" -ForegroundColor Cyan

        $cleanupErrors = [System.Collections.Generic.List[string]]::new()
        $cleanupResults = [System.Collections.Generic.List[object]]::new()

        # === Step 1: Revoke Site Admin (reverse order) ===
        $siteAdminElevations = @($jobState['Elevations'] | Where-Object {
            $_['Type'] -eq 'SiteAdmin' -and $_['Status'] -eq 'Active'
        })

        [array]::Reverse($siteAdminElevations)

        foreach ($elevation in $siteAdminElevations) {
            $siteUrl = $elevation['SiteUrl']
            $upn = $elevation['UserPrincipalName']

            try {
                Write-Verbose "[$currentJobId] Revoking Site Admin on: $siteUrl"
                Revoke-SLSiteAdmin -SiteUrl $siteUrl -UserPrincipalName $upn -Confirm:$false
                $elevation['Status'] = 'Revoked'
                $elevation['RevokedAt'] = [datetime]::UtcNow.ToString('o')

                $cleanupResults.Add([PSCustomObject]@{
                    Type    = 'SiteAdmin'
                    SiteUrl = $siteUrl
                    Status  = 'Revoked'
                })

                Write-Host "  Site Admin revoked: $siteUrl" -ForegroundColor Green
            }
            catch {
                $elevation['Status'] = 'RevokeFailed'
                $errorMsg = "Failed to revoke Site Admin on '$siteUrl': $($_.Exception.Message)"
                $cleanupErrors.Add($errorMsg)
                Write-Warning "[$currentJobId] $errorMsg"

                $cleanupResults.Add([PSCustomObject]@{
                    Type    = 'SiteAdmin'
                    SiteUrl = $siteUrl
                    Status  = 'Failed'
                    Error   = $_.Exception.Message
                })
            }
        }

        # === Step 2: Disable Super User ===
        $superUserElevation = $jobState['Elevations'] | Where-Object {
            $_['Type'] -eq 'SuperUser' -and $_['Status'] -eq 'Active'
        } | Select-Object -First 1

        if ($superUserElevation) {
            try {
                Write-Verbose "[$currentJobId] Disabling Super User feature..."
                Disable-SLSuperUser -Confirm:$false
                $superUserElevation['Status'] = 'Disabled'
                $superUserElevation['DisabledAt'] = [datetime]::UtcNow.ToString('o')

                $cleanupResults.Add([PSCustomObject]@{
                    Type   = 'SuperUser'
                    Status = 'Disabled'
                })

                Write-Host "  Super User disabled." -ForegroundColor Green
            }
            catch {
                $superUserElevation['Status'] = 'DisableFailed'
                $errorMsg = "Failed to disable Super User: $($_.Exception.Message)"
                $cleanupErrors.Add($errorMsg)
                Write-Warning "[$currentJobId] $errorMsg"

                $cleanupResults.Add([PSCustomObject]@{
                    Type   = 'SuperUser'
                    Status = 'Failed'
                    Error  = $_.Exception.Message
                })
            }
        }

        # === Step 3: Disconnect GA Graph session ===
        try {
            Write-Verbose "[$currentJobId] Disconnecting GA Graph session..."
            Disconnect-MgGraph -ErrorAction Stop
            $script:SLConnection['GraphConnected'] = $false

            $cleanupResults.Add([PSCustomObject]@{
                Type   = 'GraphAuth'
                Status = 'Disconnected'
            })

            Write-Host "  GA session disconnected." -ForegroundColor Green
        }
        catch {
            $errorMsg = "Failed to disconnect GA session: $($_.Exception.Message)"
            $cleanupErrors.Add($errorMsg)
            Write-Warning "[$currentJobId] $errorMsg"

            $cleanupResults.Add([PSCustomObject]@{
                Type   = 'GraphAuth'
                Status = 'Failed'
                Error  = $_.Exception.Message
            })
        }

        # === Step 4: Update job state ===
        $jobState['Status'] = if ($cleanupErrors.Count -eq 0) { 'Completed' } else { 'CompletedWithErrors' }
        $jobState['CompletedAt'] = [datetime]::UtcNow.ToString('o')
        $jobState['CleanupErrors'] = @($cleanupErrors)

        # Remove from active jobs in state file, add to completed
        $statePath = $script:SLConfig.ElevationState
        if (Test-Path -Path $statePath) {
            try {
                $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json -AsHashtable

                # Remove from active
                if ($state.ContainsKey('ActiveJobs')) {
                    $state['ActiveJobs'] = @($state['ActiveJobs'] | Where-Object { $_['JobId'] -ne $currentJobId })
                }

                # Add to completed history (keep last 20)
                if (-not $state.ContainsKey('CompletedJobs')) {
                    $state['CompletedJobs'] = @()
                }
                $state['CompletedJobs'] = @(@($jobState) + $state['CompletedJobs']) | Select-Object -First 20

                $state | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth |
                    Set-Content -Path $statePath -Encoding utf8
            }
            catch {
                Write-Warning "[$currentJobId] Failed to update state file: $($_.Exception.Message)"
            }
        }

        # Clear module-scoped active job
        $script:SLActiveJob = $null

        Write-SLAuditEntry -Action 'Stop-ElevatedJob' -Target $currentJobId -Detail @{
            CleanupResults = $cleanupResults.Count
            Errors         = $cleanupErrors.Count
        } -Result $(if ($cleanupErrors.Count -eq 0) { 'success' } else { 'partial' })

        # === Step 5: Reconnect original session if requested ===
        if ($ReconnectOriginal) {
            Write-Host "`nReconnecting to Graph with StableLabel scopes..." -ForegroundColor Cyan
            try {
                Connect-SLGraph
            }
            catch {
                Write-Warning "Failed to reconnect: $($_.Exception.Message). Run Connect-SLGraph manually."
            }
        }

        $result = [PSCustomObject]@{
            JobId          = $currentJobId
            Status         = $jobState['Status']
            StartedAt      = $jobState['StartedAt']
            CompletedAt    = $jobState['CompletedAt']
            CleanupResults = $cleanupResults
            Errors         = $cleanupErrors
            HasErrors      = ($cleanupErrors.Count -gt 0)
        }

        if ($cleanupErrors.Count -gt 0) {
            Write-Host "`nJob stopped with $($cleanupErrors.Count) cleanup error(s). Review above warnings." -ForegroundColor Yellow
        }
        else {
            Write-Host "`nElevated job stopped cleanly." -ForegroundColor Green
        }

        if ($AsJson) {
            return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        return $result
    }
}
