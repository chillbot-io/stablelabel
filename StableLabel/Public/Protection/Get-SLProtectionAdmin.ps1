function Get-SLProtectionAdmin {
    <#
    .SYNOPSIS
        Gets role-based administrators for Azure Information Protection.
    .DESCRIPTION
        Wraps Get-AipServiceRoleBasedAdministrator via Invoke-SLProtectionCommand.
        Returns the role-based administrators configured for the AIP service.
        Optionally filters results by role.
        This is a Windows-only function requiring the AIPService module.
    .PARAMETER Role
        Filter results by the specified role. Valid values are GlobalAdministrator
        and ConnectorAdministrator.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLProtectionAdmin
    .EXAMPLE
        Get-SLProtectionAdmin -Role GlobalAdministrator
    .EXAMPLE
        Get-SLProtectionAdmin -Role ConnectorAdministrator -AsJson
    #>
    [CmdletBinding()]
    param(
        [ValidateSet('GlobalAdministrator', 'ConnectorAdministrator')]
        [string]$Role,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        try {
            Write-Verbose 'Retrieving AIP role-based administrators.'

            $result = Invoke-SLProtectionCommand -OperationName 'Get-AipServiceRoleBasedAdministrator' -ScriptBlock {
                Get-AipServiceRoleBasedAdministrator
            }

            if ($Role) {
                Write-Verbose "Filtering administrators by role: $Role"
                $result = $result | Where-Object { $_.Role -eq $Role }
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
