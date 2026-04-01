function Remove-SLDocumentLabel {
    <#
    .SYNOPSIS
        Removes the sensitivity label from a document via Microsoft Graph API.
    .DESCRIPTION
        Calls the removeSensitivityLabel endpoint on a specific drive item
        to remove the currently applied sensitivity label.
    .PARAMETER DriveId
        The ID of the drive containing the document.
    .PARAMETER ItemId
        The ID of the document item within the drive.
    .PARAMETER Justification
        A justification message for the label removal.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Remove-SLDocumentLabel -DriveId 'b!abc123' -ItemId '01ABC123DEF'
    .EXAMPLE
        Remove-SLDocumentLabel -DriveId 'b!abc123' -ItemId '01ABC123DEF' -Justification 'No longer needed' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$DriveId,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [string]$Justification,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        # Graph connection is handled lazily by Invoke-SLGraphRequest
    }

    process {
        $target = "drive '$DriveId', item '$ItemId'"
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $detail = @{
            DriveId       = $DriveId
            ItemId        = $ItemId
            Justification = $Justification
        }

        if ($isDryRun) {
            Write-SLAuditEntry -Action 'Remove-DocumentLabel' -Target $target -Detail $detail -Result 'dry-run'

            $dryRunResult = [PSCustomObject]@{
                Action        = 'Remove-DocumentLabel'
                DriveId       = $DriveId
                ItemId        = $ItemId
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
            Write-Verbose "Removing sensitivity label from $target."

            $body = @{
                justificationText = $Justification
            }

            $result = Invoke-SLGraphRequest -Method POST `
                -Uri "/drives/$DriveId/items/$ItemId/removeSensitivityLabel" `
                -Body $body `
                -ApiVersion beta

            Write-SLAuditEntry -Action 'Remove-DocumentLabel' -Target $target -Detail $detail -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Remove-DocumentLabel' -Target $target -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
