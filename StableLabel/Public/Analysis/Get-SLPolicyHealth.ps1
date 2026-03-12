function Get-SLPolicyHealth {
    <#
    .SYNOPSIS
        Health check across all policy types.
    .DESCRIPTION
        Retrieves label, DLP, and retention policies and evaluates each for
        enabled status, rule or label assignments, distribution status, and
        last modification date. Returns a health status of Healthy, Warning,
        or Error for each policy.
    .PARAMETER PolicyType
        The type of policies to check. Defaults to All.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLPolicyHealth
    .EXAMPLE
        Get-SLPolicyHealth -PolicyType DLP
    .EXAMPLE
        Get-SLPolicyHealth -PolicyType Retention -AsJson
    #>
    [CmdletBinding()]
    param(
        [ValidateSet('Label', 'DLP', 'Retention', 'All')]
        [string]$PolicyType = 'All',

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            $typesToCheck = if ($PolicyType -eq 'All') {
                @('Label', 'DLP', 'Retention')
            }
            else {
                @($PolicyType)
            }

            $healthResults = @()

            if ($typesToCheck -contains 'Label') {
                Write-Verbose 'Checking label policy health.'
                $labelPolicies = Invoke-SLComplianceCommand -OperationName 'Get-LabelPolicy (all)' -ScriptBlock {
                    Get-LabelPolicy
                }

                foreach ($policy in @($labelPolicies)) {
                    $hasLabels = ($policy.Labels -and @($policy.Labels).Count -gt 0)
                    $isEnabled = $policy.Enabled -eq $true
                    $distStatus = $policy.DistributionStatus ?? 'Unknown'

                    $health = if (-not $isEnabled) {
                        'Error'
                    }
                    elseif (-not $hasLabels) {
                        'Warning'
                    }
                    elseif ($distStatus -ne 'Success' -and $distStatus -ne 'Unknown') {
                        'Warning'
                    }
                    else {
                        'Healthy'
                    }

                    $healthResults += [PSCustomObject]@{
                        Name               = $policy.Name
                        Type               = 'Label'
                        Status             = if ($isEnabled) { 'Enabled' } else { 'Disabled' }
                        Mode               = $policy.Mode ?? 'N/A'
                        DistributionStatus = $distStatus
                        HasRules           = $hasLabels
                        LastModified       = $policy.WhenChangedUTC ?? $policy.WhenChanged
                        HealthStatus       = $health
                    }
                }
            }

            if ($typesToCheck -contains 'DLP') {
                Write-Verbose 'Checking DLP policy health.'
                $dlpPolicies = Invoke-SLComplianceCommand -OperationName 'Get-DlpCompliancePolicy (all)' -ScriptBlock {
                    Get-DlpCompliancePolicy
                }

                $dlpRules = Invoke-SLComplianceCommand -OperationName 'Get-DlpComplianceRule (all)' -ScriptBlock {
                    Get-DlpComplianceRule
                }

                foreach ($policy in @($dlpPolicies)) {
                    $policyRules = @($dlpRules | Where-Object { $_.ParentPolicyName -eq $policy.Name })
                    $hasRules = $policyRules.Count -gt 0
                    $isEnabled = $policy.Enabled -eq $true
                    $distStatus = $policy.DistributionStatus ?? 'Unknown'

                    $health = if (-not $isEnabled) {
                        'Error'
                    }
                    elseif (-not $hasRules) {
                        'Warning'
                    }
                    elseif ($distStatus -ne 'Success' -and $distStatus -ne 'Unknown') {
                        'Warning'
                    }
                    else {
                        'Healthy'
                    }

                    $healthResults += [PSCustomObject]@{
                        Name               = $policy.Name
                        Type               = 'DLP'
                        Status             = if ($isEnabled) { 'Enabled' } else { 'Disabled' }
                        Mode               = $policy.Mode ?? 'N/A'
                        DistributionStatus = $distStatus
                        HasRules           = $hasRules
                        LastModified       = $policy.WhenChangedUTC ?? $policy.WhenChanged
                        HealthStatus       = $health
                    }
                }
            }

            if ($typesToCheck -contains 'Retention') {
                Write-Verbose 'Checking retention policy health.'
                $retentionPolicies = Invoke-SLComplianceCommand -OperationName 'Get-RetentionCompliancePolicy (all)' -ScriptBlock {
                    Get-RetentionCompliancePolicy
                }

                foreach ($policy in @($retentionPolicies)) {
                    $isEnabled = $policy.Enabled -eq $true
                    $distStatus = $policy.DistributionStatus ?? 'Unknown'
                    $hasRules = ($policy.RetentionRuleTypes -and @($policy.RetentionRuleTypes).Count -gt 0)

                    $health = if (-not $isEnabled) {
                        'Error'
                    }
                    elseif (-not $hasRules) {
                        'Warning'
                    }
                    elseif ($distStatus -ne 'Success' -and $distStatus -ne 'Unknown') {
                        'Warning'
                    }
                    else {
                        'Healthy'
                    }

                    $healthResults += [PSCustomObject]@{
                        Name               = $policy.Name
                        Type               = 'Retention'
                        Status             = if ($isEnabled) { 'Enabled' } else { 'Disabled' }
                        Mode               = $policy.Mode ?? 'N/A'
                        DistributionStatus = $distStatus
                        HasRules           = $hasRules
                        LastModified       = $policy.WhenChangedUTC ?? $policy.WhenChanged
                        HealthStatus       = $health
                    }
                }
            }

            $result = @($healthResults)

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
