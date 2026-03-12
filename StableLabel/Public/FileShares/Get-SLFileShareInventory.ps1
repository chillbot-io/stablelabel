function Get-SLFileShareInventory {
    <#
    .SYNOPSIS
        Produces a comprehensive inventory of files and their label status on a CIFS/SMB share.
    .DESCRIPTION
        Enumerates files on a CIFS/SMB file share and retrieves sensitivity label
        information for each supported file using the AIP client. Builds a detailed
        inventory with per-file metadata including label status, owner, and size.
        Optionally exports the inventory to CSV and returns a summary with label
        distribution statistics.
    .PARAMETER Path
        Root directory path to inventory. Accepts UNC paths (e.g., \\server\share)
        or mapped drive letters (e.g., Z:\).
    .PARAMETER Recurse
        Include subdirectories in the inventory.
    .PARAMETER Filter
        File filter pattern passed to Get-ChildItem. Defaults to '*' (all files).
    .PARAMETER IncludeUnsupported
        Include files with unsupported extensions in the inventory. These files
        will not have label information but will appear in the output.
    .PARAMETER ExportPath
        Optional file path to export the inventory as a CSV file.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLFileShareInventory -Path '\\server\share' -Recurse
    .EXAMPLE
        Get-SLFileShareInventory -Path 'Z:\finance' -Recurse -ExportPath 'C:\reports\inventory.csv'
    .EXAMPLE
        Get-SLFileShareInventory -Path '\\server\share\data' -IncludeUnsupported -AsJson
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [switch]$Recurse,

        [string]$Filter = '*',

        [switch]$IncludeUnsupported,

        [string]$ExportPath,

        [switch]$AsJson
    )

    begin {
        Assert-SLAipClient
    }

    process {
        try {
            Write-Verbose "Starting file share inventory on '$Path' (Recurse: $Recurse, Filter: $Filter)."

            # Enumerate all files
            $allFiles = @(Get-ChildItem -Path $Path -File -Recurse:$Recurse -Filter $Filter -ErrorAction Stop)
            $totalFiles = $allFiles.Count

            Write-Verbose "Found $totalFiles file(s) to inventory."

            $inventory = [System.Collections.Generic.List[object]]::new()
            $labeledCount = 0
            $unlabeledCount = 0
            $labelDistribution = @{}

            for ($i = 0; $i -lt $totalFiles; $i++) {
                $file = $allFiles[$i]
                $percentComplete = [math]::Floor(($i / [math]::Max($totalFiles, 1)) * 100)

                Write-Progress -Activity 'Building file share inventory' `
                    -Status "Processing file $($i + 1) of $totalFiles" `
                    -PercentComplete $percentComplete

                $isSupported = Test-SLFileTypeSupported -Extension $file.Extension

                if (-not $isSupported -and -not $IncludeUnsupported) {
                    continue
                }

                $item = [PSCustomObject]@{
                    FullPath     = $file.FullName
                    FileName     = $file.Name
                    Extension    = $file.Extension.ToLower()
                    SizeKB       = [math]::Round($file.Length / 1KB, 2)
                    LastModified = $file.LastWriteTime
                    IsSupported  = $isSupported
                    IsLabeled    = $false
                    LabelName    = $null
                    LabelId      = $null
                    SubLabelName = $null
                    SubLabelId   = $null
                    Owner        = $null
                }

                if ($isSupported) {
                    try {
                        $fileStatus = Get-AIPFileStatus -Path $file.FullName

                        $isLabeled = $null -ne $fileStatus.MainLabelName -and $fileStatus.MainLabelName -ne ''
                        $item.IsLabeled    = $isLabeled
                        $item.LabelName    = $fileStatus.MainLabelName
                        $item.LabelId      = $fileStatus.MainLabelId
                        $item.SubLabelName = $fileStatus.SubLabelName
                        $item.SubLabelId   = $fileStatus.SubLabelId
                        $item.Owner        = $fileStatus.Owner

                        if ($isLabeled) {
                            $labeledCount++
                            $lName = $fileStatus.MainLabelName
                            if ($labelDistribution.ContainsKey($lName)) {
                                $labelDistribution[$lName]++
                            }
                            else {
                                $labelDistribution[$lName] = 1
                            }
                        }
                        else {
                            $unlabeledCount++
                        }
                    }
                    catch {
                        Write-Verbose "Failed to get AIP status for '$($file.FullName)': $($_.Exception.Message)"
                        $unlabeledCount++
                    }
                }

                $inventory.Add($item)
            }

            Write-Progress -Activity 'Building file share inventory' -Completed

            # Export to CSV if requested
            $exportedPath = $null
            if ($ExportPath) {
                Write-Verbose "Exporting inventory to '$ExportPath'."
                $inventory | Export-Csv -Path $ExportPath -NoTypeInformation
                $exportedPath = $ExportPath
            }

            $summary = [PSCustomObject]@{
                TotalFiles        = $inventory.Count
                LabeledCount      = $labeledCount
                UnlabeledCount    = $unlabeledCount
                LabelDistribution = $labelDistribution
            }

            $result = [PSCustomObject]@{
                Action     = 'Get-FileShareInventory'
                Summary    = $summary
                Items      = $inventory
                ExportPath = $exportedPath
            }

            Write-SLAuditEntry -Action 'Get-FileShareInventory' -Target $Path -Detail @{
                TotalFiles     = $inventory.Count
                LabeledCount   = $labeledCount
                UnlabeledCount = $unlabeledCount
                ExportPath     = $exportedPath
            } -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Get-FileShareInventory' -Target $Path -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
