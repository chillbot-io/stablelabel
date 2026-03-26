function Remove-SLDocumentLabelBulk {
    <#
    .SYNOPSIS
        Removes sensitivity labels and/or encryption from multiple documents.
    .DESCRIPTION
        Iterates over an array of items and removes labels, encryption, or both.
        Supports three modes:
        - LabelOnly: Remove the sensitivity label, keep encryption
        - EncryptionOnly: Remove RMS encryption, keep label
        - Both: Remove both label and encryption
    .PARAMETER Items
        Array of hashtables, each with DriveId and ItemId.
    .PARAMETER Mode
        Removal mode: LabelOnly, EncryptionOnly, or Both.
    .PARAMETER Justification
        A justification message for the removal.
    .PARAMETER BatchSize
        Number of items to process per batch (default 50).
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Remove-SLDocumentLabelBulk -Items @(@{DriveId='b!abc';ItemId='01A'}) -Mode LabelOnly
    .EXAMPLE
        Remove-SLDocumentLabelBulk -Items $items -Mode Both -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNull()]
        [array]$Items,

        [Parameter(Mandatory)]
        [ValidateSet('LabelOnly', 'EncryptionOnly', 'Both')]
        [string]$Mode,

        [string]$Justification,

        [int]$BatchSize = 50,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        # Graph connection is handled lazily by Invoke-SLGraphRequest
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun
        $total = @($Items).Count

        if ($total -eq 0) {
            throw 'No items provided.'
        }

        if (-not $isDryRun -and -not $PSCmdlet.ShouldProcess("$total documents (mode: $Mode)", 'Remove labels/encryption')) {
            return
        }

        $results = [System.Collections.Generic.List[PSCustomObject]]::new()
        $successCount = 0
        $failedCount = 0
        $index = 0

        foreach ($item in $Items) {
            $index++
            $driveId = $item.DriveId
            $itemId = $item.ItemId

            if (-not $driveId -or -not $itemId) {
                $results.Add([PSCustomObject]@{
                    DriveId = $driveId
                    ItemId  = $itemId
                    Status  = 'Failed'
                    Error   = 'Missing DriveId or ItemId'
                })
                $failedCount++
                continue
            }

            Write-Progress -Activity "Removing ($Mode)" -Status "$index of $total" -PercentComplete ([int]($index / $total * 100))
            Write-Output "SL_PROGRESS:{`"phase`":`"removing`",`"total`":$total,`"processed`":$($index - 1),`"success`":$successCount,`"failed`":$failedCount}"

            if ($isDryRun) {
                $results.Add([PSCustomObject]@{
                    DriveId = $driveId
                    ItemId  = $itemId
                    Status  = 'DryRun'
                    Error   = $null
                })
                $successCount++
                continue
            }

            try {
                switch ($Mode) {
                    'LabelOnly' {
                        Invoke-SLGraphRequest -Method POST `
                            -Uri "/drives/$driveId/items/$itemId/removeSensitivityLabel" `
                            -Body @{ justificationText = $Justification } `
                            -ApiVersion beta
                    }
                    'EncryptionOnly' {
                        # Remove encryption by extracting current label and re-applying without protection
                        # This uses the Graph API to modify the item's protection settings
                        Invoke-SLGraphRequest -Method POST `
                            -Uri "/drives/$driveId/items/$itemId/removeProtection" `
                            -ApiVersion beta
                    }
                    'Both' {
                        # Remove label first (which may also remove encryption in some configs)
                        Invoke-SLGraphRequest -Method POST `
                            -Uri "/drives/$driveId/items/$itemId/removeSensitivityLabel" `
                            -Body @{ justificationText = $Justification } `
                            -ApiVersion beta

                        # Then explicitly remove any remaining protection
                        try {
                            Invoke-SLGraphRequest -Method POST `
                                -Uri "/drives/$driveId/items/$itemId/removeProtection" `
                                -ApiVersion beta
                        }
                        catch {
                            # Protection may already be removed with the label
                            Write-Verbose "Protection removal returned: $_"
                        }
                    }
                }

                $results.Add([PSCustomObject]@{
                    DriveId = $driveId
                    ItemId  = $itemId
                    Status  = 'Success'
                    Error   = $null
                })
                $successCount++
            }
            catch {
                $results.Add([PSCustomObject]@{
                    DriveId = $driveId
                    ItemId  = $itemId
                    Status  = 'Failed'
                    Error   = $_.Exception.Message
                })
                $failedCount++

                Write-Warning "Failed to process $driveId/$itemId : $_"
            }
        }

        Write-Progress -Activity "Removing ($Mode)" -Completed

        $summary = [PSCustomObject]@{
            Action       = "Remove-DocumentLabel-$Mode"
            Mode         = $Mode
            TotalItems   = $total
            SuccessCount = $successCount
            FailedCount  = $failedCount
            DryRun       = $isDryRun
            Results      = @($results)
        }

        Write-SLAuditEntry -Action "Remove-DocumentLabel-Bulk" -Target "$total items" -Detail @{
            Mode         = $Mode
            TotalItems   = $total
            SuccessCount = $successCount
            FailedCount  = $failedCount
        } -Result $(if ($isDryRun) { 'dry-run' } elseif ($failedCount -gt 0) { 'partial' } else { 'success' })

        if ($AsJson) {
            return $summary | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        $summary
    }
}
