function Get-SLSuperUserStatus {
    <#
    .SYNOPSIS
        Gets the current AIP Service super user feature status and super user list.
    .DESCRIPTION
        Wraps Get-AipServiceSuperUserFeature and Get-AipServiceSuperUser to
        return the current feature state and the list of configured super users.
        This is a read-only operation.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLSuperUserStatus
    .EXAMPLE
        Get-SLSuperUserStatus -AsJson
    #>
    [CmdletBinding()]
    param(
        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        try {
            Write-Verbose "Retrieving AIP Service super user feature status."

            $featureEnabled = Invoke-SLProtectionCommand -OperationName 'Get-AipServiceSuperUserFeature' -ScriptBlock {
                Get-AipServiceSuperUserFeature
            }

            Write-Verbose "Retrieving AIP Service super user list."

            $superUsers = Invoke-SLProtectionCommand -OperationName 'Get-AipServiceSuperUser' -ScriptBlock {
                Get-AipServiceSuperUser
            }

            $result = [PSCustomObject]@{
                FeatureEnabled = [bool]$featureEnabled
                SuperUsers     = @($superUsers)
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
