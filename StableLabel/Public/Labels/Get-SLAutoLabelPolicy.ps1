function Get-SLAutoLabelPolicy {
    <#
    .SYNOPSIS
        Gets auto-labeling policies from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Get-AutoSensitivityLabelPolicy cmdlet via Invoke-SLComplianceCommand.
        Returns all auto-labeling policies or a specific policy by identity.
    .PARAMETER Identity
        The name or GUID of a specific auto-labeling policy to retrieve.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLAutoLabelPolicy
    .EXAMPLE
        Get-SLAutoLabelPolicy -Identity 'Credit Card Auto-Label'
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
                Write-Verbose "Retrieving auto-labeling policy: $Identity"
                $result = Invoke-SLComplianceCommand -OperationName "Get-AutoSensitivityLabelPolicy '$Identity'" -ScriptBlock {
                    Get-AutoSensitivityLabelPolicy -Identity $Identity
                }.GetNewClosure()
            }
            else {
                Write-Verbose 'Retrieving all auto-labeling policies.'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-AutoSensitivityLabelPolicy (all)' -ScriptBlock {
                    Get-AutoSensitivityLabelPolicy
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
