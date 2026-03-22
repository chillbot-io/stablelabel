function Get-SLLabelPolicy {
    <#
    .SYNOPSIS
        Gets sensitivity label policies from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Get-LabelPolicy cmdlet via Invoke-SLComplianceCommand.
        Returns all label policies or a specific policy by identity.
    .PARAMETER Identity
        The name or GUID of a specific label policy to retrieve.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLLabelPolicy
    .EXAMPLE
        Get-SLLabelPolicy -Identity 'Global Policy'
    #>
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            if ($Identity) {
                Write-Verbose "Retrieving label policy: $Identity"
                $result = Invoke-SLComplianceCommand -OperationName "Get-LabelPolicy '$Identity'" -ScriptBlock {
                    Get-LabelPolicy -Identity $Identity
                }.GetNewClosure()
            }
            else {
                Write-Verbose 'Retrieving all label policies.'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-LabelPolicy (all)' -ScriptBlock {
                    Get-LabelPolicy
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
