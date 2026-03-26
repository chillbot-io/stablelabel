function Import-SLLabelCsv {
    <#
    .SYNOPSIS
        Parses and validates a CSV file for bulk label operations.
    .DESCRIPTION
        Reads a CSV with columns DriveId, ItemId, and LabelName (or LabelId).
        Validates each row and returns a preview of what would be applied.
        Use this to validate input before calling Set-SLDocumentLabelBulk.
    .PARAMETER Path
        Path to the CSV file.
    .PARAMETER CsvText
        Raw CSV text content (alternative to Path).
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Import-SLLabelCsv -Path './labels.csv'
    .EXAMPLE
        Import-SLLabelCsv -CsvText $csvContent
    #>
    [CmdletBinding()]
    param(
        [Parameter(ParameterSetName = 'File')]
        [string]$Path,

        [Parameter(ParameterSetName = 'Text')]
        [string]$CsvText,

        [switch]$AsJson
    )

    process {
        # Read CSV
        $rows = $null
        if ($Path) {
            if (-not (Test-Path $Path)) {
                throw "CSV file not found: $Path"
            }
            $rows = Import-Csv -Path $Path -ErrorAction Stop
        }
        elseif ($CsvText) {
            $rows = $CsvText | ConvertFrom-Csv -ErrorAction Stop
        }
        else {
            throw 'Specify either -Path or -CsvText.'
        }

        if (-not $rows -or @($rows).Count -eq 0) {
            throw 'CSV is empty or could not be parsed.'
        }

        $validRows = [System.Collections.Generic.List[PSCustomObject]]::new()
        $invalidRows = [System.Collections.Generic.List[PSCustomObject]]::new()
        $rowIndex = 0

        foreach ($row in $rows) {
            $rowIndex++
            $errors = [System.Collections.Generic.List[string]]::new()

            $driveId = $row.DriveId
            $itemId = $row.ItemId
            $labelName = $row.LabelName
            $labelId = $row.LabelId

            if ([string]::IsNullOrWhiteSpace($driveId)) {
                $errors.Add('Missing DriveId')
            }
            if ([string]::IsNullOrWhiteSpace($itemId)) {
                $errors.Add('Missing ItemId')
            }
            if ([string]::IsNullOrWhiteSpace($labelName) -and [string]::IsNullOrWhiteSpace($labelId)) {
                $errors.Add('Missing LabelName or LabelId')
            }

            $parsed = [PSCustomObject]@{
                Row       = $rowIndex
                DriveId   = $driveId
                ItemId    = $itemId
                LabelName = $labelName
                LabelId   = $labelId
                Valid     = $errors.Count -eq 0
                Errors    = if ($errors.Count -gt 0) { $errors -join '; ' } else { $null }
            }

            if ($errors.Count -eq 0) {
                $validRows.Add($parsed)
            }
            else {
                $invalidRows.Add($parsed)
            }
        }

        $result = [PSCustomObject]@{
            Action       = 'Import-LabelCsv'
            TotalRows    = $rowIndex
            ValidCount   = $validRows.Count
            InvalidCount = $invalidRows.Count
            ValidRows    = @($validRows)
            InvalidRows  = @($invalidRows)
        }

        Write-SLAuditEntry -Action 'Import-LabelCsv' -Target ($Path ?? 'CsvText') -Detail @{
            TotalRows    = $rowIndex
            ValidCount   = $validRows.Count
            InvalidCount = $invalidRows.Count
        }

        if ($AsJson) {
            return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        $result
    }
}
