function Test-SLPermission {
    <#
    .SYNOPSIS
        Checks if the current user has required permissions for common operations.
    .DESCRIPTION
        Tests whether the authenticated user has the necessary access for
        StableLabel operations across Labels, DLP, Retention, and Protection
        scopes. For each scope, a lightweight read operation is attempted to
        determine access.
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
        Assert-SLConnected -Require Graph
    }

    process {
        try {
            Write-Verbose 'Retrieving current user information from Graph.'
            $userInfo = Invoke-SLGraphRequest -Method GET -Uri '/me'
            $upn = $userInfo.userPrincipalName

            Write-Verbose 'Retrieving group memberships.'
            $memberOf = Invoke-SLGraphRequest -Method GET -Uri '/me/memberOf' -AutoPaginate

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
                            $null = Invoke-SLGraphRequest -Method GET `
                                -Uri '/security/informationProtection/sensitivityLabels' `
                                -ApiVersion beta
                            $hasAccess = $true
                            $details = 'Successfully read sensitivity labels via Graph.'
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
                            $null = Invoke-SLGraphRequest -Method GET `
                                -Uri '/security/informationProtection/sensitivityLabels' `
                                -ApiVersion beta
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

            $groupNames = @($memberOf | Where-Object { $_.displayName } | ForEach-Object { $_.displayName })

            $result = [PSCustomObject]@{
                UserPrincipalName = $upn
                ScopesChecked     = $scopesToCheck
                GroupMemberships  = $groupNames
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
