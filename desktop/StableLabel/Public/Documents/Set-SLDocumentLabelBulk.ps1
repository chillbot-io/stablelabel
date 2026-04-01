function Set-SLDocumentLabelBulk {
    <#
    .SYNOPSIS
        Bulk-assigns a sensitivity label to multiple documents via Microsoft Graph API.
    .DESCRIPTION
        Iterates over an array of drive items and assigns the specified sensitivity
        label to each document using Set-SLDocumentLabel. Reports progress via
        Write-Progress and returns a summary of successes and failures.
    .PARAMETER Items
        An array of hashtables, each containing DriveId and ItemId keys.
    .PARAMETER LabelId
        The GUID of the sensitivity label to assign.
    .PARAMETER LabelName
        The display name of the sensitivity label to assign. Resolved to an ID automatically.
    .PARAMETER Justification
        A justification message for the label assignment.
    .PARAMETER BatchSize
        The number of items to process per batch. Defaults to the module configuration value.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        $items = @(
            @{ DriveId = 'b!abc123'; ItemId = '01ABC' },
            @{ DriveId = 'b!abc123'; ItemId = '02DEF' }
        )
        Set-SLDocumentLabelBulk -Items $items -LabelName 'Confidential'
    .EXAMPLE
        Set-SLDocumentLabelBulk -Items $items -LabelId '00000000-0000-0000-0000-000000000001' -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium', DefaultParameterSetName = 'ById')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [hashtable[]]$Items,

        [Parameter(Mandatory, ParameterSetName = 'ById')]
        [ValidateNotNullOrEmpty()]
        [string]$LabelId,

        [Parameter(Mandatory, ParameterSetName = 'ByName')]
        [ValidateNotNullOrEmpty()]
        [string]$LabelName,

        [string]$Justification,

        [int]$BatchSize = $script:SLConfig.DefaultBatchSize,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        # Graph connection is handled lazily by Invoke-SLGraphRequest
    }

    process {
        # Resolve label name to ID once for the entire batch
        if ($PSCmdlet.ParameterSetName -eq 'ByName') {
            $labelId = Resolve-SLLabelName -LabelName $LabelName
        }
        else {
            $labelId = $LabelId
        }

        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $totalItems = $Items.Count
        $successCount = 0
        $failedCount = 0
        $skippedCount = 0
        $itemResults = [System.Collections.Generic.List[object]]::new()

        for ($i = 0; $i -lt $totalItems; $i++) {
            $item = $Items[$i]
            $percentComplete = [math]::Floor(($i / $totalItems) * 100)

            Write-Progress -Activity 'Assigning sensitivity labels' `
                -Status "Processing item $($i + 1) of $totalItems" `
                -PercentComplete $percentComplete
            Write-Output "SL_PROGRESS:{`"phase`":`"labelling`",`"total`":$totalItems,`"processed`":$i,`"success`":$successCount,`"failed`":$failedCount}"

            try {
                $splat = @{
                    DriveId = $item.DriveId
                    ItemId  = $item.ItemId
                    LabelId = $labelId
                }
                if ($Justification) { $splat['Justification'] = $Justification }
                if ($isDryRun)      { $splat['DryRun'] = $true }

                $itemResult = Set-SLDocumentLabel @splat

                if ($isDryRun) {
                    $skippedCount++
                    $itemStatus = 'Skipped'
                }
                else {
                    $successCount++
                    $itemStatus = 'Success'
                }

                $itemResults.Add([PSCustomObject]@{
                    DriveId = $item.DriveId
                    ItemId  = $item.ItemId
                    Status  = $itemStatus
                    Error   = $null
                })
            }
            catch {
                $failedCount++

                $itemResults.Add([PSCustomObject]@{
                    DriveId = $item.DriveId
                    ItemId  = $item.ItemId
                    Status  = 'Failed'
                    Error   = $_.Exception.Message
                })
            }
        }

        Write-Progress -Activity 'Assigning sensitivity labels' -Completed

        $summary = [PSCustomObject]@{
            Action             = 'Set-DocumentLabelBulk'
            TotalCount         = $totalItems
            SuccessCount       = $successCount
            FailedCount        = $failedCount
            SkippedCount       = $skippedCount
            SensitivityLabelId = $labelId
            Items              = $itemResults
            DryRun             = $isDryRun
        }

        Write-SLAuditEntry -Action 'Set-DocumentLabelBulk' -Target "Bulk ($totalItems items)" -Detail @{
            SensitivityLabelId = $labelId
            TotalCount         = $totalItems
            SuccessCount       = $successCount
            FailedCount        = $failedCount
            SkippedCount       = $skippedCount
        } -Result $(if ($isDryRun) { 'dry-run' } elseif ($failedCount -eq 0) { 'success' } else { 'failed' })

        if ($AsJson) {
            return $summary | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        return $summary
    }
}
