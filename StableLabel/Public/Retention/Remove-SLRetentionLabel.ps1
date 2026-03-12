function Remove-SLRetentionLabel {
    <#
    .SYNOPSIS
        Removes a retention label from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Remove-ComplianceTag cmdlet via Invoke-SLComplianceCommand.
        Permanently deletes the specified retention label.
    .PARAMETER Identity
        The name or GUID of the retention label to remove.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .EXAMPLE
        Remove-SLRetentionLabel -Identity 'Old Label'
    .EXAMPLE
        Remove-SLRetentionLabel -Identity 'Test Label' -DryRun
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
            Write-SLAuditEntry -Action 'Remove-ComplianceTag' -Target $Identity -Result 'dry-run'

            return [PSCustomObject]@{
                Action   = 'Remove-ComplianceTag'
                Identity = $Identity
                DryRun   = $true
            }
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Remove retention label')) {
            return
        }

        try {
            Write-Verbose "Removing retention label: $Identity"

            Invoke-SLComplianceCommand -OperationName "Remove-ComplianceTag '$Identity'" -ScriptBlock {
                Remove-ComplianceTag -Identity $Identity -Confirm:$false
            }

            Write-SLAuditEntry -Action 'Remove-ComplianceTag' -Target $Identity -Result 'success'

            Write-Verbose "Retention label '$Identity' removed successfully."
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-ComplianceTag' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
