function Remove-SLDlpRule {
    <#
    .SYNOPSIS
        Removes a DLP compliance rule from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Remove-DlpComplianceRule cmdlet via Invoke-SLComplianceCommand.
        Permanently deletes the specified DLP rule.
    .PARAMETER Identity
        The name or GUID of the DLP rule to remove.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .EXAMPLE
        Remove-SLDlpRule -Identity 'Old DLP Rule'
    .EXAMPLE
        Remove-SLDlpRule -Identity 'Test DLP Rule' -DryRun
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
            Write-SLAuditEntry -Action 'Remove-DlpComplianceRule' -Target $Identity -Result 'dry-run'

            return [PSCustomObject]@{
                Action   = 'Remove-DlpComplianceRule'
                Identity = $Identity
                DryRun   = $true
            }
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Remove DLP compliance rule')) {
            return
        }

        try {
            Write-Verbose "Removing DLP rule: $Identity"

            Invoke-SLComplianceCommand -OperationName "Remove-DlpComplianceRule '$Identity'" -ScriptBlock {
                Remove-DlpComplianceRule -Identity $Identity -Confirm:$false
            }

            Write-SLAuditEntry -Action 'Remove-DlpComplianceRule' -Target $Identity -Result 'success'

            Write-Verbose "DLP rule '$Identity' removed successfully."
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-DlpComplianceRule' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
