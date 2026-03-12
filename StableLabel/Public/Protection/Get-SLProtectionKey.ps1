function Get-SLProtectionKey {
    <#
    .SYNOPSIS
        Gets tenant key information from Azure Information Protection.
    .DESCRIPTION
        Wraps Get-AipServiceKeys via Invoke-SLProtectionCommand.
        Returns the tenant key information for the Azure Information Protection service.
        This is a Windows-only function requiring the AIPService module.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLProtectionKey
    .EXAMPLE
        Get-SLProtectionKey -AsJson
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
            Write-Verbose 'Retrieving AIP tenant key information.'

            $result = Invoke-SLProtectionCommand -OperationName 'Get-AipServiceKeys' -ScriptBlock {
                Get-AipServiceKeys
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
