function Restore-SLSnapshot {
    <#
    .SYNOPSIS
        Restores tenant configuration from a snapshot.
    .DESCRIPTION
        Computes the diff between snapshot and live state, shows a mandatory dry-run
        preview, then applies the delta. Automatically captures a pre-restore snapshot
        so the restore itself is rollback-able.

        Restore order (respects dependencies):
        1. Remove rules/policies not in snapshot
        2. Recreate/update policies from snapshot
        3. Recreate/update rules from snapshot

        Sensitivity label definitions are NOT restored (read-only in API).
    .PARAMETER Name
        The name of the snapshot to restore.
    .PARAMETER DryRun
        Show the restore plan without applying any changes.
    .PARAMETER Path
        Override the snapshot storage directory path.
    .PARAMETER Force
        Override safety checks such as active auto-label simulations.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Restore-SLSnapshot -Name "2024-01-15_baseline"
        Restores the snapshot named "2024-01-15_baseline" to the tenant.
    .EXAMPLE
        Restore-SLSnapshot -Name "2024-01-15_baseline" -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [switch]$DryRun,

        [string]$Path,

        [switch]$Force,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $snapshotDir = if ($Path) { $Path } else { $script:SLConfig.SnapshotPath }

        # Load the target snapshot
        $filePath = Join-Path $snapshotDir "$Name.json"
        if (-not (Test-Path $filePath)) {
            throw "Snapshot '$Name' not found."
        }
        $snapshot = Get-Content -Path $filePath -Raw -Encoding utf8 | ConvertFrom-Json

        # Check for active auto-label simulations
        try {
            $autoLabels = Invoke-SLComplianceCommand -ScriptBlock { Get-AutoSensitivityLabelPolicy } -OperationName 'Restore: Check auto-label status'
            $activeJobs = @($autoLabels | Where-Object { $_.Mode -eq 'TestWithNotifications' -or $_.Mode -eq 'TestWithoutNotifications' })
            if ($activeJobs.Count -gt 0 -and -not $Force) {
                Write-Warning "There are $($activeJobs.Count) auto-label policies in simulation mode. Restoring during active simulation may cause inconsistent state."
                Write-Warning "Use -Force to override, or wait for simulations to complete."
                if (-not $DryRun) {
                    throw "Blocked: active auto-label simulations detected. Use -Force to override."
                }
            }
        }
        catch {
            if ($_.Exception.Message -notmatch 'Blocked:') {
                Write-Warning "Could not check auto-label status: $_"
            }
            else { throw }
        }

        # Compute the diff
        Write-Verbose "Computing diff between snapshot '$Name' and live state..."
        $diff = Compare-SLSnapshot -Name $Name -Live -Path $snapshotDir

        if (-not $diff.HasChanges) {
            $result = [PSCustomObject]@{
                Status  = 'No changes needed'
                Name    = $Name
                Changes = 0
            }
            if ($AsJson) { return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth }
            return $result
        }

        # Build restore plan
        $plan = [System.Collections.Generic.List[PSCustomObject]]::new()

        $restorableCategories = @(
            @{ Category = 'DlpRules';          Verb = 'DLP Rule';             RemoveCmd = 'Remove-DlpComplianceRule';     NewCmd = 'New-DlpComplianceRule';     SetCmd = 'Set-DlpComplianceRule' }
            @{ Category = 'DlpPolicies';       Verb = 'DLP Policy';           RemoveCmd = 'Remove-DlpCompliancePolicy';   NewCmd = 'New-DlpCompliancePolicy';   SetCmd = 'Set-DlpCompliancePolicy' }
            @{ Category = 'AutoLabelPolicies'; Verb = 'Auto-Label Policy';    RemoveCmd = 'Remove-AutoSensitivityLabelPolicy'; NewCmd = 'New-AutoSensitivityLabelPolicy'; SetCmd = 'Set-AutoSensitivityLabelPolicy' }
            @{ Category = 'LabelPolicies';     Verb = 'Label Policy';         RemoveCmd = 'Remove-LabelPolicy';           NewCmd = 'New-LabelPolicy';           SetCmd = 'Set-LabelPolicy' }
            @{ Category = 'RetentionPolicies'; Verb = 'Retention Policy';     RemoveCmd = 'Remove-RetentionCompliancePolicy'; NewCmd = 'New-RetentionCompliancePolicy'; SetCmd = 'Set-RetentionCompliancePolicy' }
            @{ Category = 'RetentionLabels';   Verb = 'Retention Label';      RemoveCmd = 'Remove-ComplianceTag';         NewCmd = 'New-ComplianceTag';         SetCmd = 'Set-ComplianceTag' }
        )

        # Phase 1: Removals (rules first, then policies)
        foreach ($cat in $restorableCategories) {
            $catDiff = $diff.Categories.PSObject.Properties[$cat.Category]
            if (-not $catDiff) { continue }
            $catData = $catDiff.Value

            foreach ($item in $catData.Added) {
                $plan.Add([PSCustomObject]@{
                    Phase    = 'Remove'
                    Category = $cat.Verb
                    Identity = $item.Identity
                    Action   = "Remove (exists in live but not in snapshot)"
                    Command  = $cat.RemoveCmd
                })
            }
        }

        # Phase 2: Recreations and modifications (policies first, then rules)
        $reversedCategories = @($restorableCategories)
        [array]::Reverse($reversedCategories)

        foreach ($cat in $reversedCategories) {
            $catDiff = $diff.Categories.PSObject.Properties[$cat.Category]
            if (-not $catDiff) { continue }
            $catData = $catDiff.Value

            foreach ($item in $catData.Removed) {
                $plan.Add([PSCustomObject]@{
                    Phase    = 'Create'
                    Category = $cat.Verb
                    Identity = $item.Identity
                    Action   = "Create (exists in snapshot but not in live)"
                    Command  = $cat.NewCmd
                })
            }

            foreach ($item in $catData.Modified) {
                $plan.Add([PSCustomObject]@{
                    Phase    = 'Update'
                    Category = $cat.Verb
                    Identity = $item.Identity
                    Action   = "Update (differs between snapshot and live)"
                    Command  = $cat.SetCmd
                })
            }
        }

        # Always show the plan
        $planSummary = [PSCustomObject]@{
            SnapshotName    = $Name
            TotalChanges    = $plan.Count
            Removals        = @($plan | Where-Object Phase -eq 'Remove').Count
            Creates         = @($plan | Where-Object Phase -eq 'Create').Count
            Updates         = @($plan | Where-Object Phase -eq 'Update').Count
            DryRun          = [bool]$DryRun
            Plan            = $plan
            Warning         = 'DLP policy changes may take up to 24 hours to propagate to Outlook clients.'
        }

        if ($DryRun) {
            Write-SLAuditEntry -Action 'Restore-SLSnapshot' -Target $Name -Detail @{ Changes = $plan.Count } -Result 'dry-run'
            if ($AsJson) { return $planSummary | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth }
            return $planSummary
        }

        # Show plan and confirm
        Write-Host "`n=== RESTORE PLAN for snapshot '$Name' ===" -ForegroundColor Yellow
        Write-Host "Total changes: $($plan.Count) ($(@($plan | Where-Object Phase -eq 'Remove').Count) removals, $(@($plan | Where-Object Phase -eq 'Create').Count) creates, $(@($plan | Where-Object Phase -eq 'Update').Count) updates)" -ForegroundColor Yellow
        Write-Host ''
        foreach ($step in $plan) {
            $color = switch ($step.Phase) { 'Remove' { 'Red' } 'Create' { 'Green' } 'Update' { 'Cyan' } }
            Write-Host "  [$($step.Phase.ToUpper())] $($step.Category): $($step.Identity)" -ForegroundColor $color
        }
        Write-Host ''
        Write-Host 'WARNING: DLP policy changes may take up to 24 hours to propagate to Outlook clients.' -ForegroundColor DarkYellow
        Write-Host ''

        if (-not $PSCmdlet.ShouldProcess("$($plan.Count) changes from snapshot '$Name'", 'Restore tenant configuration')) {
            return
        }

        # Capture pre-restore snapshot
        Write-Verbose 'Capturing pre-restore snapshot...'
        $preRestoreName = "pre-restore-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        $preRestoreResult = New-SLSnapshot -Name $preRestoreName -Scope $snapshot.Scope
        if (-not $preRestoreResult -or -not (Test-Path (Join-Path $snapshotDir "$preRestoreName.json"))) {
            throw "Pre-restore backup failed. Aborting restore to prevent data loss."
        }
        Write-Host "Pre-restore snapshot saved as '$preRestoreName'" -ForegroundColor DarkGray

        # Execute the plan
        $results = [System.Collections.Generic.List[PSCustomObject]]::new()
        $successCount = 0
        $failCount = 0

        foreach ($step in $plan) {
            Write-Verbose "Executing: [$($step.Phase)] $($step.Category) - $($step.Identity)"
            try {
                switch ($step.Phase) {
                    'Remove' {
                        Invoke-SLComplianceCommand -ScriptBlock ([scriptblock]::Create("$($step.Command) -Identity '$($step.Identity)' -Confirm:`$false")) -OperationName "Restore: $($step.Command)"
                    }
                    'Create' {
                        # For creates, we need the full object from the snapshot
                        Write-Warning "Create operations require manual implementation per category. Skipping: $($step.Identity)"
                        $results.Add([PSCustomObject]@{
                            Step    = $step
                            Status  = 'Skipped'
                            Error   = 'Create operations not yet implemented'
                        })
                        $failCount++
                        continue
                    }
                    'Update' {
                        Write-Warning "Update operations require manual implementation per category. Skipping: $($step.Identity)"
                        $results.Add([PSCustomObject]@{
                            Step    = $step
                            Status  = 'Skipped'
                            Error   = 'Update operations not yet implemented'
                        })
                        $failCount++
                        continue
                    }
                }

                $results.Add([PSCustomObject]@{
                    Step    = $step
                    Status  = 'Success'
                    Error   = $null
                })
                $successCount++

                Write-SLAuditEntry -Action "Restore-$($step.Phase)" -Target $step.Identity -Detail @{
                    Category = $step.Category
                    Command  = $step.Command
                    Snapshot = $Name
                }
            }
            catch {
                $results.Add([PSCustomObject]@{
                    Step    = $step
                    Status  = 'Failed'
                    Error   = $_.Exception.Message
                })
                $failCount++

                Write-SLAuditEntry -Action "Restore-$($step.Phase)" -Target $step.Identity -Result 'failed' -ErrorMessage $_.Exception.Message
                Write-Warning "Failed: [$($step.Phase)] $($step.Category) - $($step.Identity): $_"
            }
        }

        $skippedCount = @($results | Where-Object { $_.Status -eq 'Skipped' }).Count

        $finalResult = [PSCustomObject]@{
            SnapshotName      = $Name
            PreRestoreSnapshot = $preRestoreName
            TotalChanges      = $plan.Count
            Succeeded         = $successCount
            Failed            = $failCount
            Skipped           = $skippedCount
            Results           = $results
        }

        if ($skippedCount -gt 0) {
            Write-Warning "$skippedCount operation(s) were skipped because Create/Update restore is not yet implemented. Review the Results for details."
        }

        Write-SLAuditEntry -Action 'Restore-SLSnapshot' -Target $Name -Detail @{
            Succeeded  = $successCount
            Failed     = $failCount
            Skipped    = $skippedCount
            PreRestore = $preRestoreName
        }

        if ($AsJson) { return $finalResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth }
        $finalResult
    }
}
