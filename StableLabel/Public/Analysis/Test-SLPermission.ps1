function Test-SLPermission {
    <#
    .SYNOPSIS
        Checks if the current user has required permissions for common operations.
    .DESCRIPTION
        Tests whether the authenticated user has the necessary access for
        StableLabel operations across Labels, DLP, Retention, and Protection
        scopes. For each scope, a lightweight read operation is attempted to
        determine access. Uses the Compliance Center as the primary backend.
    .PARAMETER Scope
        The permission scope to check. Defaults to All.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Test-SLPermission
    .EXAMPLE
        Test-SLPermission -Scope Labels
    .EXAMPLE
        Test-SLPermission -Scope DLP -AsJson
    #>
    [CmdletBinding()]
    param(
        [ValidateSet('Labels', 'DLP', 'Retention', 'Protection', 'All')]
        [string]$Scope = 'All',

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            $upn = $script:SLConnection['UserPrincipalName']
            if (-not $upn) { $upn = '(unknown)' }

            $scopesToCheck = if ($Scope -eq 'All') {
                @('Labels', 'DLP', 'Retention', 'Protection')
            }
            else {
                @($Scope)
            }

            $results = foreach ($s in $scopesToCheck) {
                $hasAccess = $false
                $details = ''

                switch ($s) {
                    'Labels' {
                        try {
                            $null = Invoke-SLComplianceCommand -OperationName 'Test-LabelsAccess' -ScriptBlock {
                                Get-Label -ErrorAction Stop | Select-Object -First 1
                            }
                            $hasAccess = $true
                            $details = 'Successfully read sensitivity labels via Compliance.'
                        }
                        catch {
                            $details = "Cannot read sensitivity labels: $($_.Exception.Message)"
                        }
                    }
                    'DLP' {
                        try {
                            $null = Invoke-SLComplianceCommand -OperationName 'Test-DlpAccess' -ScriptBlock {
                                Get-DlpCompliancePolicy -ErrorAction Stop | Select-Object -First 1
                            }
                            $hasAccess = $true
                            $details = 'Successfully read DLP policies via Compliance.'
                        }
                        catch {
                            $details = "Cannot read DLP policies: $($_.Exception.Message)"
                        }
                    }
                    'Retention' {
                        try {
                            $null = Invoke-SLComplianceCommand -OperationName 'Test-RetentionAccess' -ScriptBlock {
                                Get-RetentionCompliancePolicy -ErrorAction Stop | Select-Object -First 1
                            }
                            $hasAccess = $true
                            $details = 'Successfully read retention policies via Compliance.'
                        }
                        catch {
                            $details = "Cannot read retention policies: $($_.Exception.Message)"
                        }
                    }
                    'Protection' {
                        try {
                            $null = Invoke-SLComplianceCommand -OperationName 'Test-ProtectionAccess' -ScriptBlock {
                                Get-Label -ErrorAction Stop | Select-Object -First 1
                            }
                            $hasAccess = $true
                            $details = 'Successfully read information protection configuration.'
                        }
                        catch {
                            $details = "Cannot read protection configuration: $($_.Exception.Message)"
                        }
                    }
                }

                [PSCustomObject]@{
                    Scope     = $s
                    HasAccess = $hasAccess
                    Details   = $details
                }
            }

            $result = [PSCustomObject]@{
                UserPrincipalName = $upn
                ScopesChecked     = $scopesToCheck
                Results           = @($results)
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
