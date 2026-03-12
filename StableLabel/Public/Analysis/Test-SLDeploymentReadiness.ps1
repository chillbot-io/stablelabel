function Test-SLDeploymentReadiness {
    <#
    .SYNOPSIS
        Pre-deployment checklist for label and DLP rollout.
    .DESCRIPTION
        Runs a series of readiness checks to verify the environment is
        prepared for deploying sensitivity labels and DLP policies. Validates
        connection status, label existence, policy configuration, and
        snapshot availability.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Test-SLDeploymentReadiness
    .EXAMPLE
        Test-SLDeploymentReadiness -AsJson
    #>
    [CmdletBinding()]
    param(
        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Graph
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            $checks = @()
            $overallReady = $true

            # Check 1: Connection status (Graph + Compliance connected)
            Write-Verbose 'Checking Graph connection.'
            try {
                $null = Invoke-SLGraphRequest -Method GET -Uri '/me'
                $checks += [PSCustomObject]@{
                    Name    = 'GraphConnection'
                    Status  = 'Pass'
                    Message = 'Microsoft Graph connection is active.'
                }
            }
            catch {
                $checks += [PSCustomObject]@{
                    Name    = 'GraphConnection'
                    Status  = 'Fail'
                    Message = "Microsoft Graph connection failed: $($_.Exception.Message)"
                }
                $overallReady = $false
            }

            Write-Verbose 'Checking Compliance connection.'
            try {
                $null = Invoke-SLComplianceCommand -OperationName 'Test-ComplianceConnection' -ScriptBlock {
                    Get-LabelPolicy -ErrorAction Stop | Select-Object -First 1
                }
                $checks += [PSCustomObject]@{
                    Name    = 'ComplianceConnection'
                    Status  = 'Pass'
                    Message = 'Security & Compliance Center connection is active.'
                }
            }
            catch {
                $checks += [PSCustomObject]@{
                    Name    = 'ComplianceConnection'
                    Status  = 'Fail'
                    Message = "Compliance connection failed: $($_.Exception.Message)"
                }
                $overallReady = $false
            }

            # Check 2: Labels exist and are active
            Write-Verbose 'Checking sensitivity labels.'
            try {
                $labels = Invoke-SLGraphRequest -Method GET `
                    -Uri '/security/informationProtection/sensitivityLabels' `
                    -ApiVersion beta -AutoPaginate

                $activeLabels = @($labels | Where-Object { $_.isActive -eq $true })

                if (@($labels).Count -eq 0) {
                    $checks += [PSCustomObject]@{
                        Name    = 'LabelsExist'
                        Status  = 'Fail'
                        Message = 'No sensitivity labels found. Create labels before deployment.'
                    }
                    $overallReady = $false
                }
                elseif ($activeLabels.Count -eq 0) {
                    $checks += [PSCustomObject]@{
                        Name    = 'LabelsExist'
                        Status  = 'Fail'
                        Message = "Found $(@($labels).Count) label(s) but none are active."
                    }
                    $overallReady = $false
                }
                else {
                    $checks += [PSCustomObject]@{
                        Name    = 'LabelsExist'
                        Status  = 'Pass'
                        Message = "Found $($activeLabels.Count) active sensitivity label(s)."
                    }
                }
            }
            catch {
                $checks += [PSCustomObject]@{
                    Name    = 'LabelsExist'
                    Status  = 'Fail'
                    Message = "Failed to retrieve labels: $($_.Exception.Message)"
                }
                $overallReady = $false
            }

            # Check 3: At least one label policy exists and is enabled
            Write-Verbose 'Checking label policies.'
            try {
                $labelPolicies = Invoke-SLComplianceCommand -OperationName 'Get-LabelPolicy (all)' -ScriptBlock {
                    Get-LabelPolicy
                }

                $enabledPolicies = @($labelPolicies | Where-Object { $_.Enabled -eq $true })

                if (@($labelPolicies).Count -eq 0) {
                    $checks += [PSCustomObject]@{
                        Name    = 'LabelPolicyExists'
                        Status  = 'Fail'
                        Message = 'No label policies found. Create a label policy to publish labels.'
                    }
                    $overallReady = $false
                }
                elseif ($enabledPolicies.Count -eq 0) {
                    $checks += [PSCustomObject]@{
                        Name    = 'LabelPolicyExists'
                        Status  = 'Fail'
                        Message = "Found $(@($labelPolicies).Count) label policy/policies but none are enabled."
                    }
                    $overallReady = $false
                }
                else {
                    $checks += [PSCustomObject]@{
                        Name    = 'LabelPolicyExists'
                        Status  = 'Pass'
                        Message = "Found $($enabledPolicies.Count) enabled label policy/policies."
                    }
                }
            }
            catch {
                $checks += [PSCustomObject]@{
                    Name    = 'LabelPolicyExists'
                    Status  = 'Fail'
                    Message = "Failed to retrieve label policies: $($_.Exception.Message)"
                }
                $overallReady = $false
            }

            # Check 4: DLP policies exist (optional warning if none)
            Write-Verbose 'Checking DLP policies.'
            try {
                $dlpPolicies = Invoke-SLComplianceCommand -OperationName 'Get-DlpCompliancePolicy (all)' -ScriptBlock {
                    Get-DlpCompliancePolicy
                }

                if (@($dlpPolicies).Count -eq 0) {
                    $checks += [PSCustomObject]@{
                        Name    = 'DlpPoliciesExist'
                        Status  = 'Warn'
                        Message = 'No DLP policies found. Consider creating DLP policies to protect labeled content.'
                    }
                }
                else {
                    $checks += [PSCustomObject]@{
                        Name    = 'DlpPoliciesExist'
                        Status  = 'Pass'
                        Message = "Found $(@($dlpPolicies).Count) DLP policy/policies."
                    }
                }
            }
            catch {
                $checks += [PSCustomObject]@{
                    Name    = 'DlpPoliciesExist'
                    Status  = 'Warn'
                    Message = "Could not verify DLP policies: $($_.Exception.Message)"
                }
            }

            # Check 5: Snapshot exists (optional warning if none)
            Write-Verbose 'Checking for existing snapshots.'
            $snapshotPath = $script:SLConfig.SnapshotPath
            if ($snapshotPath -and (Test-Path $snapshotPath)) {
                $snapshots = @(Get-ChildItem -Path $snapshotPath -Filter '*.json' -ErrorAction SilentlyContinue)
                if ($snapshots.Count -gt 0) {
                    $checks += [PSCustomObject]@{
                        Name    = 'SnapshotExists'
                        Status  = 'Pass'
                        Message = "Found $($snapshots.Count) snapshot(s) in '$snapshotPath'."
                    }
                }
                else {
                    $checks += [PSCustomObject]@{
                        Name    = 'SnapshotExists'
                        Status  = 'Warn'
                        Message = 'No snapshots found. Consider creating a snapshot before deployment for rollback capability.'
                    }
                }
            }
            else {
                $checks += [PSCustomObject]@{
                    Name    = 'SnapshotExists'
                    Status  = 'Warn'
                    Message = 'Snapshot path not configured or does not exist. Consider creating a snapshot before deployment.'
                }
            }

            $failCount = @($checks | Where-Object { $_.Status -eq 'Fail' }).Count
            $warnCount = @($checks | Where-Object { $_.Status -eq 'Warn' }).Count
            $passCount = @($checks | Where-Object { $_.Status -eq 'Pass' }).Count

            $summary = if ($overallReady) {
                "Deployment ready: $passCount passed, $warnCount warning(s)."
            }
            else {
                "Not ready for deployment: $failCount failure(s), $warnCount warning(s), $passCount passed."
            }

            $result = [PSCustomObject]@{
                Ready   = $overallReady
                Checks  = @($checks)
                Summary = $summary
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
