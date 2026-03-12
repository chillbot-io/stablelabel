function Remove-SLRetentionPolicy {
    <#
    .SYNOPSIS
        Removes a retention policy from Security & Compliance Center.
    .DESCRIPTION
        Wraps the Remove-RetentionCompliancePolicy cmdlet via Invoke-SLComplianceCommand.
        Permanently deletes the specified retention policy.
    .PARAMETER Identity
        The name or GUID of the retention policy to remove.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .EXAMPLE
        Remove-SLRetentionPolicy -Identity 'Old Policy'
    .EXAMPLE
        Remove-SLRetentionPolicy -Identity 'Test Policy' -DryRun
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
            Write-SLAuditEntry -Action 'Remove-RetentionCompliancePolicy' -Target $Identity -Result 'dry-run'

            return [PSCustomObject]@{
                Action   = 'Remove-RetentionCompliancePolicy'
                Identity = $Identity
                DryRun   = $true
            }
        }

        if (-not $PSCmdlet.ShouldProcess($Identity, 'Remove retention policy')) {
            return
        }

        try {
            Write-Verbose "Removing retention policy: $Identity"

            Invoke-SLComplianceCommand -OperationName "Remove-RetentionCompliancePolicy '$Identity'" -ScriptBlock {
                Remove-RetentionCompliancePolicy -Identity $Identity -Confirm:$false
            }

            Write-SLAuditEntry -Action 'Remove-RetentionCompliancePolicy' -Target $Identity -Result 'success'

            Write-Verbose "Retention policy '$Identity' removed successfully."
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-RetentionCompliancePolicy' -Target $Identity -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
