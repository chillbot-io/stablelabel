function Get-SLProtectionTemplate {
    <#
    .SYNOPSIS
        Gets Azure Information Protection templates.
    .DESCRIPTION
        Wraps Get-AipServiceTemplate via Invoke-SLProtectionCommand.
        Retrieves one or all protection templates configured for the tenant.
        This is a Windows-only function requiring the AIPService module.
    .PARAMETER TemplateId
        The GUID of a specific template to retrieve. If omitted, all templates are returned.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLProtectionTemplate
    .EXAMPLE
        Get-SLProtectionTemplate -TemplateId '00000000-0000-0000-0000-000000000001'
    .EXAMPLE
        Get-SLProtectionTemplate -AsJson
    #>
    [CmdletBinding()]
    param(
        [string]$TemplateId,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        try {
            if ($TemplateId) {
                Write-Verbose "Retrieving protection template with ID: $TemplateId"

                $result = Invoke-SLProtectionCommand -OperationName 'Get-AipServiceTemplate' -ScriptBlock {
                    Get-AipServiceTemplate -TemplateId $TemplateId
                }
            }
            else {
                Write-Verbose 'Retrieving all protection templates.'

                $result = Invoke-SLProtectionCommand -OperationName 'Get-AipServiceTemplate' -ScriptBlock {
                    Get-AipServiceTemplate
                }
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
