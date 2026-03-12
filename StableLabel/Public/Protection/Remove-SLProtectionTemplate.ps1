function Remove-SLProtectionTemplate {
    <#
    .SYNOPSIS
        Removes an Azure Information Protection template.
    .DESCRIPTION
        Wraps Remove-AipServiceTemplate via Invoke-SLProtectionCommand.
        Permanently deletes the specified protection template.
        This is a Windows-only function requiring the AIPService module.
    .PARAMETER TemplateId
        The GUID of the template to remove.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .EXAMPLE
        Remove-SLProtectionTemplate -TemplateId '00000000-0000-0000-0000-000000000001'
    .EXAMPLE
        Remove-SLProtectionTemplate -TemplateId '00000000-0000-0000-0000-000000000001' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$TemplateId,

        [switch]$DryRun
    )

    begin {
        Assert-SLConnected -Require Protection
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Remove-AipServiceTemplate' -Target $TemplateId -Result 'dry-run'

            return [PSCustomObject]@{
                Action     = 'Remove-AipServiceTemplate'
                TemplateId = $TemplateId
                DryRun     = $true
            }
        }

        if (-not $PSCmdlet.ShouldProcess($TemplateId, 'Remove protection template')) {
            return
        }

        try {
            Write-Verbose "Removing protection template: $TemplateId"

            Invoke-SLProtectionCommand -OperationName "Remove-AipServiceTemplate '$TemplateId'" -ScriptBlock {
                Remove-AipServiceTemplate -TemplateId $TemplateId -Confirm:$false
            }

            Write-SLAuditEntry -Action 'Remove-AipServiceTemplate' -Target $TemplateId -Result 'success'

            Write-Verbose "Protection template '$TemplateId' removed successfully."
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-AipServiceTemplate' -Target $TemplateId -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
