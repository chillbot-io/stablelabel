function Set-SLLabelPolicy {
    <#
    .SYNOPSIS
        Modifies an existing sensitivity label policy in Security & Compliance Center.
    .DESCRIPTION
        Wraps the Set-LabelPolicy cmdlet via Invoke-SLComplianceCommand.
        Updates a label policy with the specified settings.
    .PARAMETER Identity
        The name or GUID of the label policy to modify.
    .PARAMETER Labels
        Replace the full list of sensitivity labels in the policy.
    .PARAMETER AddLabels
        Labels to add to the policy.
    .PARAMETER RemoveLabels
        Labels to remove from the policy.
    .PARAMETER Comment
        An updated comment for the policy.
    .PARAMETER AdvancedSettings
        A hashtable of advanced settings to apply.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLLabelPolicy -Identity 'Global Policy' -Comment 'Updated comment'
    .EXAMPLE
        Set-SLLabelPolicy -Identity 'Finance Policy' -AddLabels 'Highly Confidential' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [string[]]$Labels,

        [string[]]$AddLabels,

        [string[]]$RemoveLabels,

        [string]$Comment,

        [hashtable]$AdvancedSettings,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Labels           = $Labels
            AddLabels        = $AddLabels
            RemoveLabels     = $RemoveLabels
            Comment          = $Comment
            AdvancedSettings = $AdvancedSettings
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Set-LabelPolicy' -Target $Identity -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action           = 'Set-LabelPolicy'
                Identity         = $Identity
                Labels           = $Labels
                AddLabels        = $AddLabels
                RemoveLabels     = $RemoveLabels
                Comment          = $Comment
                AdvancedSettings = $AdvancedSettings
                DryRun           = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Modify label policy')) {
            return
        }

        try {
            Write-Verbose "Updating label policy: $Identity"

            $params = @{ Identity = $Identity }
            if ($Labels)           { $params['Labels']           = $Labels }
            if ($AddLabels)        { $params['AddLabels']        = $AddLabels }
            if ($RemoveLabels)     { $params['RemoveLabels']     = $RemoveLabels }
            if ($Comment)          { $params['Comment']          = $Comment }
            if ($AdvancedSettings) { $params['AdvancedSettings'] = $AdvancedSettings }

            $result = Invoke-SLComplianceCommand -OperationName "Set-LabelPolicy '$Identity'" -ScriptBlock {
                Set-LabelPolicy @params
            }

            Write-SLAuditEntry -Action 'Set-LabelPolicy' -Target $Identity -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Set-LabelPolicy' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
