function Get-SLProtectionConfig {
    <#
    .SYNOPSIS
        Gets the Azure Information Protection service configuration.
    .DESCRIPTION
        Wraps Get-AipServiceConfiguration via Invoke-SLProtectionCommand.
        Returns the current AIP service configuration for the tenant.
        This is a Windows-only function requiring the AIPService module.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLProtectionConfig
    .EXAMPLE
        Get-SLProtectionConfig -AsJson
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
            Write-Verbose 'Retrieving AIP service configuration.'

            $result = Invoke-SLProtectionCommand -OperationName 'Get-AipServiceConfiguration' -ScriptBlock {
                Get-AipServiceConfiguration
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
