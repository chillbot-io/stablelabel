function Get-SLLabelMismatch {
    <#
    .SYNOPSIS
        Finds labels that exist in policies but not in Graph, or vice versa.
    .DESCRIPTION
        Compares sensitivity labels retrieved from Microsoft Graph against
        label references in Compliance Center label policies. Identifies
        labels that exist only in Graph (not referenced by any policy),
        labels referenced by policies but not found in Graph, and labels
        that are properly matched.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLLabelMismatch
    .EXAMPLE
        Get-SLLabelMismatch -AsJson
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
            $rawLabels = Invoke-SLComplianceCommand -OperationName 'Get-Label (mismatch)' -ScriptBlock {
                Get-Label -ErrorAction Stop
            }
            $graphLabels = @($rawLabels | ForEach-Object { Convert-SLComplianceLabel -Label $_ })

            Write-Verbose 'Retrieving label policies from Compliance.'
            $labelPolicies = Invoke-SLComplianceCommand -OperationName 'Get-LabelPolicy (all)' -ScriptBlock {
                Get-LabelPolicy
            }

            # Build lookup of Graph labels by ID and name
            $graphLabelById = @{}
            $graphLabelByName = @{}
            foreach ($label in @($graphLabels)) {
                $graphLabelById[$label.id] = $label
                $labelName = $label.displayName ?? $label.name
                if ($labelName) {
                    $graphLabelByName[$labelName] = $label
                }
            }

            # Collect all unique label references from policies
            $policyLabelRefs = @{}
            foreach ($policy in @($labelPolicies)) {
                if ($policy.Labels) {
                    foreach ($ref in @($policy.Labels)) {
                        if ($ref -and -not $policyLabelRefs.ContainsKey($ref)) {
                            $policyLabelRefs[$ref] = $policy.Name
                        }
                    }
                }
            }

            # Determine matched and policy-only references
            $matchedCount = 0
            $inPolicyOnly = @()

            foreach ($ref in $policyLabelRefs.Keys) {
                if ($graphLabelById.ContainsKey($ref) -or $graphLabelByName.ContainsKey($ref)) {
                    $matchedCount++
                }
                else {
                    $inPolicyOnly += [PSCustomObject]@{
                        Reference  = $ref
                        PolicyName = $policyLabelRefs[$ref]
                    }
                }
            }

            # Determine labels in Graph but not referenced by any policy
            $inGraphOnly = @()
            foreach ($label in @($graphLabels)) {
                $labelName = $label.displayName ?? $label.name
                $labelId = $label.id
                if (-not $policyLabelRefs.ContainsKey($labelId) -and
                    -not $policyLabelRefs.ContainsKey($labelName)) {
                    $inGraphOnly += [PSCustomObject]@{
                        LabelId   = $labelId
                        LabelName = $labelName
                    }
                }
            }

            $result = [PSCustomObject]@{
                InGraphOnly          = @($inGraphOnly)
                InPolicyOnly         = @($inPolicyOnly)
                Matched              = $matchedCount
                TotalGraphLabels     = @($graphLabels).Count
                TotalPolicyReferences = $policyLabelRefs.Count
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
