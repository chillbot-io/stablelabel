function Remove-SLAutoLabelPolicy {
    <#
    .SYNOPSIS
        Removes an auto-labeling policy from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Remove-AutoSensitivityLabelPolicy cmdlet via Invoke-SLComplianceCommand.
        Permanently deletes the specified auto-labeling policy.
    .PARAMETER Identity
        The name or GUID of the auto-labeling policy to remove.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .EXAMPLE
        Remove-SLAutoLabelPolicy -Identity 'Old Auto-Label Policy'
    .EXAMPLE
        Remove-SLAutoLabelPolicy -Identity 'Test Auto-Label' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Identity,

        [switch]$DryRun
    )

    begin {
        Assert-SLConnected -Require Compliance
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Remove-AutoSensitivityLabelPolicy' -Target $Identity -Result 'dry-run'

            return [PSCustomObject]@{
                Action   = 'Remove-AutoSensitivityLabelPolicy'
                Identity = $Identity
                DryRun   = $true
            }
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Remove auto-labeling policy')) {
            return
        }

        try {
            Write-Verbose "Removing auto-labeling policy: $Identity"

            Invoke-SLComplianceCommand -OperationName "Remove-AutoSensitivityLabelPolicy '$Identity'" -ScriptBlock {
                Remove-AutoSensitivityLabelPolicy -Identity $Identity -Confirm:$false
            }.GetNewClosure()

            Write-SLAuditEntry -Action 'Remove-AutoSensitivityLabelPolicy' -Target $Identity -Result 'success'

            Write-Verbose "Auto-labeling policy '$Identity' removed successfully."
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-AutoSensitivityLabelPolicy' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
