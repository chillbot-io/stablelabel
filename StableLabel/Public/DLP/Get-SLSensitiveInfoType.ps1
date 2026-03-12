function Get-SLSensitiveInfoType {
    <#
    .SYNOPSIS
        Gets sensitive information types from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Get-DlpSensitiveInformationType cmdlet via Invoke-SLComplianceCommand.
        Returns all sensitive information types, a specific type by identity, or only custom types.
    .PARAMETER Identity
        The name or GUID of a specific sensitive information type to retrieve.
    .PARAMETER CustomOnly
        Filter results to only custom sensitive information types (excludes Microsoft built-in types).
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLSensitiveInfoType
    .EXAMPLE
        Get-SLSensitiveInfoType -Identity 'Credit Card Number'
    .EXAMPLE
        Get-SLSensitiveInfoType -CustomOnly
    #>
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [switch]$CustomOnly,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            if ($Identity) {
                Write-Verbose "Retrieving sensitive information type: $Identity"
                $result = Invoke-SLComplianceCommand -OperationName "Get-DlpSensitiveInformationType '$Identity'" -ScriptBlock {
                    Get-DlpSensitiveInformationType -Identity $Identity
                }
            }
            else {
                Write-Verbose 'Retrieving all sensitive information types.'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-DlpSensitiveInformationType (all)' -ScriptBlock {
                    Get-DlpSensitiveInformationType
                }
            }

            if ($CustomOnly) {
                $result = $result | Where-Object { $_.Publisher -ne 'Microsoft Corporation' }
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
