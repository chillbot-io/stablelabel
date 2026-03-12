function Get-SLRetentionLabel {
    <#
    .SYNOPSIS
        Gets retention labels from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Get-ComplianceTag cmdlet via Invoke-SLComplianceCommand.
        Returns all retention labels or a specific label by identity.
    .PARAMETER Identity
        The name or GUID of a specific retention label to retrieve.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLRetentionLabel
    .EXAMPLE
        Get-SLRetentionLabel -Identity 'Financial Records'
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
                Write-Verbose "Retrieving retention label: $Identity"
                $result = Invoke-SLComplianceCommand -OperationName "Get-ComplianceTag '$Identity'" -ScriptBlock {
                    Get-ComplianceTag -Identity $Identity
                }
            }
            else {
                Write-Verbose 'Retrieving all retention labels.'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-ComplianceTag (all)' -ScriptBlock {
                    Get-ComplianceTag
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
