function Set-SLAutoLabelRule {
    <#
    .SYNOPSIS
        Modifies an existing auto-labeling rule.
    .DESCRIPTION
        Wraps Set-AutoSensitivityLabelRule. Updates the conditions or properties
        of an existing rule under an auto-label policy.
    .PARAMETER Identity
        The name or GUID of the rule to modify.
    .PARAMETER ContentContainsSensitiveInformation
        JSON string defining updated SIT conditions.
    .PARAMETER DocumentSizeOver
        Updated minimum document size in bytes.
    .PARAMETER ContentExtensionMatchesWords
        Updated file extensions to match.
    .PARAMETER Comment
        Updated description.
    .PARAMETER Disabled
        Enable or disable the rule.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [string]$ContentContainsSensitiveInformation,

        [long]$DocumentSizeOver,

        [string[]]$ContentExtensionMatchesWords,

        [string]$Comment,

        [bool]$Disabled,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            ContentContainsSensitiveInformation = $ContentContainsSensitiveInformation
            DocumentSizeOver                    = $DocumentSizeOver
            ContentExtensionMatchesWords        = $ContentExtensionMatchesWords
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-AutoSensitivityLabelRule' -Target $Identity -Detail $detail -Result 'dry-run'
            $dryRunResult = [PSCustomObject]@{
                Action   = 'Set-AutoSensitivityLabelRule'
                Identity = $Identity
                DryRun   = $true
            }
            if ($AsJson) { return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Modify auto-labeling rule')) {
            return
        }

        try {
            Write-Verbose "Updating auto-labeling rule: $Identity"

            $params = @{ Identity = $Identity }

            if ($ContentContainsSensitiveInformation) {
                $sitConditions = $ContentContainsSensitiveInformation | ConvertFrom-Json
                $conditionArray = @()
                foreach ($sit in @($sitConditions)) {
                    $condition = @{
                        Name          = $sit.Name
                        minCount      = if ($sit.MinCount) { $sit.MinCount } else { 1 }
                        maxCount      = if ($sit.MaxCount) { $sit.MaxCount } else { -1 }
                        minConfidence = if ($sit.MinConfidence) { $sit.MinConfidence } else { 75 }
                        maxConfidence = if ($sit.MaxConfidence) { $sit.MaxConfidence } else { 100 }
                    }
                    $conditionArray += $condition
                }
                $params['ContentContainsSensitiveInformation'] = $conditionArray
            }

            if ($DocumentSizeOver -gt 0) { $params['DocumentSizeOver'] = $DocumentSizeOver }
            if ($ContentExtensionMatchesWords) { $params['ContentExtensionMatchesWords'] = $ContentExtensionMatchesWords }
            if ($Comment) { $params['Comment'] = $Comment }
            if ($PSBoundParameters.ContainsKey('Disabled')) { $params['Disabled'] = $Disabled }

            $result = Invoke-SLComplianceCommand -OperationName "Set-AutoSensitivityLabelRule '$Identity'" -ScriptBlock {
                Set-AutoSensitivityLabelRule @params
            }

            Write-SLAuditEntry -Action 'Set-AutoSensitivityLabelRule' -Target $Identity -Detail $detail -Result 'success'

            if ($AsJson) { return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth }
            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-AutoSensitivityLabelRule' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
