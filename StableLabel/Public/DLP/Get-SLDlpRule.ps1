function Get-SLDlpRule {
    <#
    .SYNOPSIS
        Gets DLP compliance rules from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Get-DlpComplianceRule cmdlet via Invoke-SLComplianceCommand.
        Returns all DLP rules, a specific rule by identity, or rules filtered by policy name.
    .PARAMETER Identity
        The name or GUID of a specific DLP rule to retrieve.
    .PARAMETER Policy
        Filter results to only rules belonging to the specified policy name.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLDlpRule
    .EXAMPLE
        Get-SLDlpRule -Identity 'Block Credit Cards'
    .EXAMPLE
        Get-SLDlpRule -Policy 'PII Protection'
    #>
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [string]$Policy,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        try {
            if ($Identity) {
                Write-Verbose "Retrieving DLP rule: $Identity"
                $result = Invoke-SLComplianceCommand -OperationName "Get-DlpComplianceRule '$Identity'" -ScriptBlock {
                    Get-DlpComplianceRule -Identity $Identity
                }
            }
            else {
                Write-Verbose 'Retrieving all DLP rules.'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-DlpComplianceRule (all)' -ScriptBlock {
                    Get-DlpComplianceRule
                }
            }

            if ($Policy) {
                $result = $result | Where-Object { $_.ParentPolicyName -eq $Policy }
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
