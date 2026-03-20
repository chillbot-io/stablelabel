function Get-SLLabelReport {
    <#
    .SYNOPSIS
        Generates a summary report of all sensitivity labels and their usage.
    .DESCRIPTION
        Retrieves sensitivity labels from Microsoft Graph and label policies
        from Security & Compliance Center to produce a comprehensive report.
        Includes counts of active, inactive, parent, and sub-labels, as well
        as policy-to-label mappings and labels not assigned to any policy.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLLabelReport
    .EXAMPLE
        Get-SLLabelReport -AsJson
    #>
    [CmdletBinding()]
    param(
        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            Write-Verbose 'Retrieving sensitivity labels from Compliance.'
            $rawLabels = Invoke-SLComplianceCommand -OperationName 'Get-Label (report)' -ScriptBlock {
                Get-Label -ErrorAction Stop
            }
            $labels = @($rawLabels | ForEach-Object { Convert-SLComplianceLabel -Label $_ })

            Write-Verbose 'Retrieving label policies from Compliance.'
            $labelPolicies = Invoke-SLComplianceCommand -OperationName 'Get-LabelPolicy (all)' -ScriptBlock {
                Get-LabelPolicy
            }

            $allLabels = @($labels)
            $activeLabels = @($allLabels | Where-Object { $_.isActive -eq $true })
            $inactiveLabels = @($allLabels | Where-Object { $_.isActive -ne $true })
            $parentLabels = @($allLabels | Where-Object {
                -not $_.parent -and -not $_.parentLabelId
            })
            $subLabels = @($allLabels | Where-Object {
                $_.parent -or $_.parentLabelId
            })

            # Build a set of all label names/IDs referenced by policies
            $assignedLabelIds = @{}
            $policiesUsingLabels = @()

            foreach ($policy in @($labelPolicies)) {
                $policyLabelRefs = @()
                if ($policy.Labels) {
                    $policyLabelRefs = @($policy.Labels)
                }

                foreach ($ref in $policyLabelRefs) {
                    $assignedLabelIds[$ref] = $true
                }

                $policiesUsingLabels += [PSCustomObject]@{
                    PolicyName = $policy.Name
                    LabelCount = $policyLabelRefs.Count
                }
            }

            # Find labels not assigned to any policy
            $unassignedLabels = @()
            foreach ($label in $allLabels) {
                $labelName = $label.displayName ?? $label.name
                $labelId = $label.id
                if (-not $assignedLabelIds.ContainsKey($labelId) -and
                    -not $assignedLabelIds.ContainsKey($labelName)) {
                    $unassignedLabels += $labelName
                }
            }

            $result = [PSCustomObject]@{
                TotalLabels         = $allLabels.Count
                ActiveLabels        = $activeLabels.Count
                InactiveLabels      = $inactiveLabels.Count
                ParentLabels        = $parentLabels.Count
                SubLabels           = $subLabels.Count
                PoliciesUsingLabels = @($policiesUsingLabels)
                UnassignedLabels    = @($unassignedLabels)
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
