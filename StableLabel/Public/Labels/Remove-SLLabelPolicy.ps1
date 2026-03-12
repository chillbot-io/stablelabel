function Remove-SLLabelPolicy {
    <#
    .SYNOPSIS
        Removes a sensitivity label policy from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Remove-LabelPolicy cmdlet via Invoke-SLComplianceCommand.
        Permanently deletes the specified label policy.
    .PARAMETER Identity
        The name or GUID of the label policy to remove.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .EXAMPLE
        Remove-SLLabelPolicy -Identity 'Old Policy'
    .EXAMPLE
        Remove-SLLabelPolicy -Identity 'Test Policy' -DryRun
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
            Write-SLAuditEntry -Action 'Remove-LabelPolicy' -Target $Identity -Result 'dry-run'

            return [PSCustomObject]@{
                Action   = 'Remove-LabelPolicy'
                Identity = $Identity
                DryRun   = $true
            }
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Remove label policy')) {
            return
        }

        try {
            Write-Verbose "Removing label policy: $Identity"

            Invoke-SLComplianceCommand -OperationName "Remove-LabelPolicy '$Identity'" -ScriptBlock {
                Remove-LabelPolicy -Identity $Identity -Confirm:$false
            }

            Write-SLAuditEntry -Action 'Remove-LabelPolicy' -Target $Identity -Result 'success'

            Write-Verbose "Label policy '$Identity' removed successfully."
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-LabelPolicy' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
