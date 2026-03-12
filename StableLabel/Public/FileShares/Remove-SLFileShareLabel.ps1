function Remove-SLFileShareLabel {
    <#
    .SYNOPSIS
        Removes the sensitivity label from a file on a CIFS/SMB share.
    .DESCRIPTION
        Uses the AIP unified labeling client to remove the currently applied
        sensitivity label from a single file on a CIFS/SMB file share. Supports
        an optional justification message for audit compliance.
    .PARAMETER Path
        File path (single file) on a UNC or mapped drive.
    .PARAMETER Justification
        A justification message for the label removal.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Remove-SLFileShareLabel -Path '\\server\share\document.docx'
    .EXAMPLE
        Remove-SLFileShareLabel -Path 'Z:\Finance\budget.xlsx' -Justification 'Label no longer required'
    .EXAMPLE
        Remove-SLFileShareLabel -Path '\\server\share\report.pdf' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [string]$Justification,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLAipClient
    }

    process {
        $target = $Path
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            Path          = $Path
            Justification = $Justification
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Remove-FileShareLabel' -Target $target -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action        = 'Remove-FileShareLabel'
                Path          = $Path
                Justification = $Justification
                DryRun        = $true
            }

            if ($AsJson) {
                return $dryRunResult | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            return $dryRunResult
        }

        if (-not $PSCmdlet.ShouldProcess($target, 'Remove sensitivity label')) {
            return
        }

        try {
            Write-Verbose "Removing sensitivity label from '$Path'."

            $splat = @{
                Path = $Path
            }
            if ($Justification) { $splat['JustificationMessage'] = $Justification }

            $result = Remove-AIPFileLabel @splat

            Write-SLAuditEntry -Action 'Remove-FileShareLabel' -Target $target -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-FileShareLabel' -Target $target -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
