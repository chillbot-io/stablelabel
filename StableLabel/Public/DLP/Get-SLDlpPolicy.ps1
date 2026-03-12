function Get-SLDlpPolicy {
    <#
    .SYNOPSIS
        Gets DLP compliance policies from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Get-DlpCompliancePolicy cmdlet via Invoke-SLComplianceCommand.
        Returns all DLP policies or a specific policy by identity.
    .PARAMETER Identity
        The name or GUID of a specific DLP policy to retrieve.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLDlpPolicy
    .EXAMPLE
        Get-SLDlpPolicy -Identity 'Credit Card Policy'
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
                Write-Verbose "Retrieving DLP policy: $Identity"
                $result = Invoke-SLComplianceCommand -OperationName "Get-DlpCompliancePolicy '$Identity'" -ScriptBlock {
                    Get-DlpCompliancePolicy -Identity $Identity
                }
            }
            else {
                Write-Verbose 'Retrieving all DLP policies.'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-DlpCompliancePolicy (all)' -ScriptBlock {
                    Get-DlpCompliancePolicy
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
