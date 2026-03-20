function Test-SLLabelDlpAlignment {
    <#
    .SYNOPSIS
        Compares sensitivity labels with DLP policy rules to find mismatches.
    .DESCRIPTION
        Retrieves all sensitivity labels from Graph and all DLP policies and
        rules from Security & Compliance Center. For each label, checks
        whether a corresponding DLP rule references it. Reports aligned
        labels, unprotected labels (those without DLP rules), and
        recommendations for improving coverage.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Test-SLLabelDlpAlignment
    .EXAMPLE
        Test-SLLabelDlpAlignment -AsJson
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
            $rawLabels = Invoke-SLComplianceCommand -OperationName 'Get-Label (DLP alignment)' -ScriptBlock {
                Get-Label -ErrorAction Stop
            }
            $labels = @($rawLabels | ForEach-Object { Convert-SLComplianceLabel -Label $_ })

            Write-Verbose 'Retrieving DLP policies from Compliance.'
            $dlpPolicies = Invoke-SLComplianceCommand -OperationName 'Get-DlpCompliancePolicy (all)' -ScriptBlock {
                Get-DlpCompliancePolicy
            }

            Write-Verbose 'Retrieving DLP rules from Compliance.'
            $dlpRules = Invoke-SLComplianceCommand -OperationName 'Get-DlpComplianceRule (all)' -ScriptBlock {
                Get-DlpComplianceRule
            }

            # Collect all label IDs and names referenced by DLP rules
            $referencedLabelIds = @{}
            foreach ($rule in $dlpRules) {
                if ($rule.ContentContainsSensitivityLabels) {
                    foreach ($labelRef in $rule.ContentContainsSensitivityLabels) {
                        $referencedLabelIds[$labelRef] = $rule.Name
                    }
                }
                if ($rule.HeaderContainsSensitivityLabels) {
                    foreach ($labelRef in $rule.HeaderContainsSensitivityLabels) {
                        $referencedLabelIds[$labelRef] = $rule.Name
                    }
                }
            }

            $aligned = @()
            $unprotected = @()

            foreach ($label in $labels) {
                $labelId = $label.id
                $labelName = $label.displayName ?? $label.name

                if ($referencedLabelIds.ContainsKey($labelId)) {
                    $aligned += [PSCustomObject]@{
                        LabelId   = $labelId
                        LabelName = $labelName
                        DlpRule   = $referencedLabelIds[$labelId]
                    }
                }
                else {
                    $unprotected += [PSCustomObject]@{
                        LabelId   = $labelId
                        LabelName = $labelName
                    }
                }
            }

            $recommendations = @()
            if ($unprotected.Count -gt 0) {
                $recommendations += "Create DLP rules for $($unprotected.Count) unprotected label(s) to enforce data loss prevention."
            }
            if ($dlpPolicies.Count -eq 0) {
                $recommendations += 'No DLP policies exist. Consider creating DLP policies to protect labeled content.'
            }
            if ($dlpRules.Count -eq 0) {
                $recommendations += 'No DLP rules exist. DLP policies require rules to enforce protection.'
            }
            if ($unprotected.Count -eq 0 -and $aligned.Count -gt 0) {
                $recommendations += 'All labels are covered by DLP rules. No action needed.'
            }

            $result = [PSCustomObject]@{
                LabelsChecked    = @($labels).Count
                AlignedLabels    = @($aligned)
                UnprotectedLabels = @($unprotected)
                Recommendations  = @($recommendations)
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
