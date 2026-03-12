function Remove-SLDlpPolicy {
    <#
    .SYNOPSIS
        Removes a DLP compliance policy from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Remove-DlpCompliancePolicy cmdlet via Invoke-SLComplianceCommand.
        Permanently deletes the specified DLP policy.
    .PARAMETER Identity
        The name or GUID of the DLP policy to remove.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .EXAMPLE
        Remove-SLDlpPolicy -Identity 'Old DLP Policy'
    .EXAMPLE
        Remove-SLDlpPolicy -Identity 'Test DLP Policy' -DryRun
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
            Write-SLAuditEntry -Action 'Remove-DlpCompliancePolicy' -Target $Identity -Result 'dry-run'

            return [PSCustomObject]@{
                Action   = 'Remove-DlpCompliancePolicy'
                Identity = $Identity
                DryRun   = $true
            }
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Remove DLP compliance policy')) {
            return
        }

        try {
            Write-Verbose "Removing DLP policy: $Identity"

            Invoke-SLComplianceCommand -OperationName "Remove-DlpCompliancePolicy '$Identity'" -ScriptBlock {
                Remove-DlpCompliancePolicy -Identity $Identity -Confirm:$false
            }

            Write-SLAuditEntry -Action 'Remove-DlpCompliancePolicy' -Target $Identity -Result 'success'

            Write-Verbose "DLP policy '$Identity' removed successfully."
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-DlpCompliancePolicy' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
