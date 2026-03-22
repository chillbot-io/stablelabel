function Get-SLAutoLabelRule {
    <#
    .SYNOPSIS
        Gets auto-labeling rules from Security & Compliance Center.
    .DESCRIPTION
        Wraps Get-AutoSensitivityLabelRule to retrieve rules associated with
        auto-labeling policies. Rules define the SIT-based conditions that
        trigger automatic label application.
    .PARAMETER Identity
        Name or GUID of a specific rule to retrieve.
    .PARAMETER Policy
        Filter rules belonging to a specific auto-label policy name.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLAutoLabelRule
    .EXAMPLE
        Get-SLAutoLabelRule -Policy 'PII Auto-Label'
    .EXAMPLE
        Get-SLAutoLabelRule -Identity 'PII Auto-Label Rule'
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
                Write-Verbose "Retrieving auto-label rule: $Identity"
                $result = Invoke-SLComplianceCommand -OperationName "Get-AutoSensitivityLabelRule '$Identity'" -ScriptBlock {
                    Get-AutoSensitivityLabelRule -Identity $Identity
                }
            }
            else {
                Write-Verbose 'Retrieving all auto-label rules.'
                $result = Invoke-SLComplianceCommand -OperationName 'Get-AutoSensitivityLabelRule (all)' -ScriptBlock {
                    Get-AutoSensitivityLabelRule
                }
            }

            if ($Policy) {
                $result = @($result) | Where-Object { $_.ParentPolicyName -eq $Policy -or $_.Policy -eq $Policy }
            }

            # Normalize to a consistent shape with parsed conditions
            $rules = @($result) | ForEach-Object {
                $rule = $_
                [PSCustomObject]@{
                    Name                = $rule.Name
                    Guid                = if ($rule.Guid) { $rule.Guid.ToString() } else { $null }
                    ParentPolicyName    = $rule.ParentPolicyName
                    Policy              = $rule.Policy
                    Disabled            = $rule.Disabled
                    Priority            = $rule.Priority
                    WhenCreated         = $rule.WhenCreated
                    WhenChanged         = $rule.WhenChanged
                    Comment             = $rule.Comment
                    Workload            = $rule.Workload
                    ContentContainsSensitiveInformation  = $rule.ContentContainsSensitiveInformation
                    HeaderMatchesPatterns               = $rule.HeaderMatchesPatterns
                    ContentPropertyContainsWords         = $rule.ContentPropertyContainsWords
                    DocumentSizeOver                     = $rule.DocumentSizeOver
                    ContentExtensionMatchesWords         = $rule.ContentExtensionMatchesWords
                    ProcessingLimitExceeded               = $rule.ProcessingLimitExceeded
                }
            }

            if ($AsJson) {
                return $rules | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $rules
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
