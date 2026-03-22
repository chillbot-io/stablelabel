function Remove-SLAutoLabelRule {
    <#
    .SYNOPSIS
        Removes an auto-labeling rule from Security & Compliance Center.
    .DESCRIPTION
        Wraps Remove-AutoSensitivityLabelRule. Permanently deletes the specified
        auto-labeling rule. The parent policy remains intact.
    .PARAMETER Identity
        The name or GUID of the rule to remove.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Remove-AutoSensitivityLabelRule' -Target $Identity -Result 'dry-run'
            $dryRunResult = [PSCustomObject]@{
                Action   = 'Remove-AutoSensitivityLabelRule'
                Identity = $Identity
                DryRun   = $true
            }
            if ($AsJson) { return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Remove auto-labeling rule')) {
            return
        }

        try {
            Write-Verbose "Removing auto-labeling rule: $Identity"

            Invoke-SLComplianceCommand -OperationName "Remove-AutoSensitivityLabelRule '$Identity'" -ScriptBlock {
                Remove-AutoSensitivityLabelRule -Identity $Identity -Confirm:$false
            }

            Write-SLAuditEntry -Action 'Remove-AutoSensitivityLabelRule' -Target $Identity -Result 'success'

            $result = [PSCustomObject]@{
                Action   = 'Remove-AutoSensitivityLabelRule'
                Identity = $Identity
                Removed  = $true
            }
            if ($AsJson) { return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth }
            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-AutoSensitivityLabelRule' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
