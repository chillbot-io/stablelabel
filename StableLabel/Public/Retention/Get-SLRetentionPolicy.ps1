function Get-SLRetentionPolicy {
    <#
    .SYNOPSIS
        Gets retention policies from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Get-RetentionCompliancePolicy cmdlet via Invoke-SLComplianceCommand.
        Returns all retention policies or a specific policy by identity.
    .PARAMETER Identity
        The name or GUID of a specific retention policy to retrieve.
    .PARAMETER IncludeTestDetails
        Include test details in the output.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLRetentionPolicy
    .EXAMPLE
        Get-SLRetentionPolicy -Identity 'Exchange Retention'
    .EXAMPLE
        Get-SLRetentionPolicy -Identity 'Exchange Retention' -IncludeTestDetails
    #>
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [switch]$IncludeTestDetails,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            if ($Identity -and $IncludeTestDetails) {
                Write-Verbose "Retrieving retention policy: $Identity (with test details)"
                $result = Invoke-SLComplianceCommand -OperationName "Get-RetentionCompliancePolicy '$Identity'" -ScriptBlock {
                    Get-RetentionCompliancePolicy -Identity $Identity -IncludeTestDetails
                }
            }
            elseif ($Identity) {
                Write-Verbose "Retrieving retention policy: $Identity"
                $result = Invoke-SLComplianceCommand -OperationName "Get-RetentionCompliancePolicy '$Identity'" -ScriptBlock {
                    Get-RetentionCompliancePolicy -Identity $Identity
                }
            }
            elseif ($IncludeTestDetails) {
                Write-Verbose 'Retrieving all retention policies (with test details).'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-RetentionCompliancePolicy (all)' -ScriptBlock {
                    Get-RetentionCompliancePolicy -IncludeTestDetails
                }
            }
            else {
                Write-Verbose 'Retrieving all retention policies.'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-RetentionCompliancePolicy (all)' -ScriptBlock {
                    Get-RetentionCompliancePolicy
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
