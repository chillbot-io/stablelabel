function Set-SLFileShareLabelBulk {
    <#
    .SYNOPSIS
        Bulk-applies a sensitivity label to files on a CIFS/SMB share with progress tracking.
    .DESCRIPTION
        Enumerates files in a directory on a CIFS/SMB file share, filters to supported
        file types, and applies the specified sensitivity label to each file using
        Set-SLFileShareLabel. Reports progress via Write-Progress and returns a summary
        of successes, failures, and skipped files.
    .PARAMETER Path
        Directory path containing files to label (UNC or mapped drive).
    .PARAMETER LabelId
        The GUID of the sensitivity label to assign.
    .PARAMETER LabelName
        The display name of the sensitivity label to assign. Resolved to an ID automatically.
    .PARAMETER Filter
        File filter patterns for supported types. Defaults to '*.docx','*.xlsx','*.pptx','*.pdf'.
    .PARAMETER Recurse
        Recurse into subdirectories.
    .PARAMETER Justification
        A justification message for label assignments (e.g., when downgrading).
    .PARAMETER Owner
        Owner email for the label. Defaults to the connected user.
    .PARAMETER BatchSize
        The number of items to process per batch. Defaults to the module configuration value.
    .PARAMETER DryRun
        Simulate the operation without making changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Set-SLFileShareLabelBulk -Path '\\server\share\Finance' -LabelName 'Confidential' -Recurse
    .EXAMPLE
        Set-SLFileShareLabelBulk -Path 'Z:\Reports' -LabelId '00000000-0000-0000-0000-000000000001' -Filter '*.pdf'
    .EXAMPLE
        Set-SLFileShareLabelBulk -Path '\\server\share\HR' -LabelName 'Internal' -Recurse -DryRun
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium', DefaultParameterSetName = 'ById')]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [Parameter(Mandatory, ParameterSetName = 'ById')]
        [ValidateNotNullOrEmpty()]
        [string]$LabelId,

        [Parameter(Mandatory, ParameterSetName = 'ByName')]
        [ValidateNotNullOrEmpty()]
        [string]$LabelName,

        [string[]]$Filter = @('*.docx', '*.xlsx', '*.pptx', '*.pdf'),

        [switch]$Recurse,

        [string]$Justification,

        [string]$Owner,

        [int]$BatchSize = $script:SLConfig.DefaultBatchSize,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLAipClient
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

        # Enumerate files matching the filter patterns
        Write-Verbose "Enumerating files in '$Path' (Recurse: $Recurse, Filters: $($Filter -join ', '))."

        $allFiles = [System.Collections.Generic.List[object]]::new()

        foreach ($pattern in $Filter) {
            $matched = Get-ChildItem -Path $Path -File -Recurse:$Recurse -Filter $pattern -ErrorAction SilentlyContinue
            if ($matched) {
                foreach ($f in $matched) {
                    $allFiles.Add($f)
                }
            }
        }

        # Further filter to only supported file types
        $files = [System.Collections.Generic.List[object]]::new()
        $skippedUnsupported = 0

        foreach ($file in $allFiles) {
            $typeCheck = Test-SLFileTypeSupported -FileName $file.Name
            if ($typeCheck.Supported) {
                $files.Add($file)
            }
            else {
                $skippedUnsupported++
                Write-Verbose "Skipping unsupported file: $($file.FullName) ($($typeCheck.Reason))"
            }
        }

        if ($files.Count -eq 0) {
            Write-Warning "No supported files found in '$Path' matching filters: $($Filter -join ', ')."
            return
        }

        $totalFiles = $files.Count
        $successCount = 0
        $failedCount = 0
        $skippedCount = $skippedUnsupported
        $results = [System.Collections.Generic.List[object]]::new()

        Write-Verbose "Processing $totalFiles supported files (skipped $skippedUnsupported unsupported)."

        for ($i = 0; $i -lt $totalFiles; $i++) {
            $file = $files[$i]
            $percentComplete = [math]::Floor(($i / $totalFiles) * 100)

            Write-Progress -Activity 'Assigning sensitivity labels to file share' `
                -Status "Processing file $($i + 1) of ${totalFiles}: $($file.Name)" `
                -PercentComplete $percentComplete

            try {
                $splat = @{
                    Path    = $file.FullName
                    LabelId = $labelId
                }
                if ($Justification) { $splat['Justification'] = $Justification }
                if ($Owner)         { $splat['Owner'] = $Owner }
                if ($isDryRun)      { $splat['DryRun'] = $true }

                $itemResult = Set-SLFileShareLabel @splat
                $successCount++

                $results.Add([PSCustomObject]@{
                    Path   = $file.FullName
                    Status = if ($isDryRun) { 'DryRun' } else { 'Success' }
                    Error  = $null
                })
            }
            catch {
                $failedCount++

                $results.Add([PSCustomObject]@{
                    Path   = $file.FullName
                    Status = 'Failed'
                    Error  = $_.Exception.Message
                })
            }
        }

        Write-Progress -Activity 'Assigning sensitivity labels to file share' -Completed

        $summary = [PSCustomObject]@{
            Action             = 'Set-FileShareLabelBulk'
            Path               = $Path
            TotalFiles         = $totalFiles
            SuccessCount       = $successCount
            FailedCount        = $failedCount
            SkippedCount       = $skippedCount
            SensitivityLabelId = $labelId
            Results            = $results
            DryRun             = $isDryRun
        }

        Write-SLAuditEntry -Action 'Set-FileShareLabelBulk' -Target "Bulk ($totalFiles files in '$Path')" -Detail @{
            SensitivityLabelId = $labelId
            Path               = $Path
            TotalFiles         = $totalFiles
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
