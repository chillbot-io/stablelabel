function Test-SLPolicyConflict {
    <#
    .SYNOPSIS
        Detects conflicting policy settings across compliance policies.
    .DESCRIPTION
        Analyzes label, DLP, and retention policies for overlapping scopes
        and contradictory rules. Checks for multiple policies targeting the
        same locations and flags potential conflicts that could cause
        unexpected behavior.
    .PARAMETER PolicyType
        The type of policies to check. Defaults to All.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Test-SLPolicyConflict
    .EXAMPLE
        Test-SLPolicyConflict -PolicyType DLP
    .EXAMPLE
        Test-SLPolicyConflict -PolicyType Label -AsJson
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
            $allPolicies = @()
            $typesToCheck = if ($PolicyType -eq 'All') {
                @('Label', 'DLP', 'Retention')
            }
            else {
                @($PolicyType)
            }

            if ($typesToCheck -contains 'Label') {
                Write-Verbose 'Retrieving label policies.'
                $labelPolicies = Invoke-SLComplianceCommand -OperationName 'Get-LabelPolicy (all)' -ScriptBlock {
                    Get-LabelPolicy
                }
                foreach ($p in @($labelPolicies)) {
                    $allPolicies += [PSCustomObject]@{
                        Name      = $p.Name
                        Type      = 'Label'
                        Locations = @($p.ExchangeLocation) + @($p.SharePointLocation) + @($p.OneDriveLocation)
                        Enabled   = $p.Enabled
                        Policy    = $p
                    }
                }
            }

            if ($typesToCheck -contains 'DLP') {
                Write-Verbose 'Retrieving DLP policies.'
                $dlpPolicies = Invoke-SLComplianceCommand -OperationName 'Get-DlpCompliancePolicy (all)' -ScriptBlock {
                    Get-DlpCompliancePolicy
                }
                foreach ($p in @($dlpPolicies)) {
                    $allPolicies += [PSCustomObject]@{
                        Name      = $p.Name
                        Type      = 'DLP'
                        Locations = @($p.ExchangeLocation) + @($p.SharePointLocation) + @($p.OneDriveLocation)
                        Enabled   = $p.Enabled
                        Policy    = $p
                    }
                }
            }

            if ($typesToCheck -contains 'Retention') {
                Write-Verbose 'Retrieving retention policies.'
                $retentionPolicies = Invoke-SLComplianceCommand -OperationName 'Get-RetentionCompliancePolicy (all)' -ScriptBlock {
                    Get-RetentionCompliancePolicy
                }
                foreach ($p in @($retentionPolicies)) {
                    $allPolicies += [PSCustomObject]@{
                        Name      = $p.Name
                        Type      = 'Retention'
                        Locations = @($p.ExchangeLocation) + @($p.SharePointLocation) + @($p.OneDriveLocation)
                        Enabled   = $p.Enabled
                        Policy    = $p
                    }
                }
            }

            $conflicts = @()

            # Check for overlapping location scopes across policies of the same type
            foreach ($type in $typesToCheck) {
                $typedPolicies = @($allPolicies | Where-Object { $_.Type -eq $type })

                for ($i = 0; $i -lt $typedPolicies.Count; $i++) {
                    for ($j = $i + 1; $j -lt $typedPolicies.Count; $j++) {
                        $policyA = $typedPolicies[$i]
                        $policyB = $typedPolicies[$j]

                        # Find overlapping locations
                        $locationsA = @($policyA.Locations | Where-Object { $_ })
                        $locationsB = @($policyB.Locations | Where-Object { $_ })

                        # Check for 'All' locations or direct overlap
                        $hasAllA = $locationsA -contains 'All'
                        $hasAllB = $locationsB -contains 'All'
                        $overlap = @($locationsA | Where-Object { $_ -in $locationsB })

                        if ($hasAllA -and $hasAllB) {
                            $conflicts += [PSCustomObject]@{
                                PolicyA      = $policyA.Name
                                PolicyB      = $policyB.Name
                                ConflictType = 'OverlappingScope'
                                Detail       = "Both $type policies target all locations."
                            }
                        }
                        elseif ($hasAllA -or $hasAllB) {
                            $broadPolicy = if ($hasAllA) { $policyA.Name } else { $policyB.Name }
                            $narrowPolicy = if ($hasAllA) { $policyB.Name } else { $policyA.Name }
                            $conflicts += [PSCustomObject]@{
                                PolicyA      = $broadPolicy
                                PolicyB      = $narrowPolicy
                                ConflictType = 'OverlappingScope'
                                Detail       = "$type policy '$broadPolicy' targets all locations, overlapping with '$narrowPolicy'."
                            }
                        }
                        elseif ($overlap.Count -gt 0) {
                            $conflicts += [PSCustomObject]@{
                                PolicyA      = $policyA.Name
                                PolicyB      = $policyB.Name
                                ConflictType = 'OverlappingScope'
                                Detail       = "$type policies share $($overlap.Count) location(s): $($overlap -join ', ')."
                            }
                        }
                    }
                }
            }

            $result = [PSCustomObject]@{
                PoliciesChecked = $allPolicies.Count
                Conflicts       = @($conflicts)
                HasConflicts    = $conflicts.Count -gt 0
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
