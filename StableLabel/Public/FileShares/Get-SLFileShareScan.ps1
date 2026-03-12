function Get-SLFileShareScan {
    <#
    .SYNOPSIS
        Scans a CIFS/SMB file share directory for sensitive content using AIP scanner functionality.
    .DESCRIPTION
        Enumerates files on a CIFS/SMB share and retrieves their AIP file status to
        identify labeled and unlabeled files, group results by label and extension,
        and produce a comprehensive scan summary. Only files with supported extensions
        are inspected; unsupported file types are counted but skipped.
    .PARAMETER Path
        Directory path to scan. Accepts UNC paths (e.g., \\server\share\folder)
        or mapped drive letters (e.g., Z:\folder).
    .PARAMETER Recurse
        Include subdirectories in the scan.
    .PARAMETER Filter
        File filter pattern passed to Get-ChildItem. Defaults to '*' (all files).
    .PARAMETER SensitiveInfoTypes
        Optional list of sensitive information type names to scan for. When specified,
        only findings matching these types are included in the results.
    .PARAMETER ReportOnly
        Only report findings without recommending labels. This is the default behavior.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLFileShareScan -Path '\\server\share\documents' -Recurse
    .EXAMPLE
        Get-SLFileShareScan -Path 'Z:\finance' -Filter '*.docx' -AsJson
    .EXAMPLE
        Get-SLFileShareScan -Path '\\server\share' -Recurse -SensitiveInfoTypes 'Credit Card Number','U.S. Social Security Number'
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [switch]$Recurse,

        [string]$Filter = '*',

        [string[]]$SensitiveInfoTypes,

        [switch]$ReportOnly,

        [switch]$AsJson
    )

    begin {
        Assert-SLAipClient
    }

    process {
        try {
            Write-Verbose "Starting file share scan on '$Path' (Recurse: $Recurse, Filter: $Filter)."

            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

            # Enumerate all files
            $allFiles = @(Get-ChildItem -Path $Path -File -Recurse:$Recurse -Filter $Filter -ErrorAction Stop)
            $totalFiles = $allFiles.Count

            Write-Verbose "Found $totalFiles file(s) to evaluate."

            # Separate supported and unsupported files
            $supportedFiles = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
            $unsupportedFiles = [System.Collections.Generic.List[System.IO.FileInfo]]::new()

            foreach ($file in $allFiles) {
                if (Test-SLFileTypeSupported -Extension $file.Extension) {
                    $supportedFiles.Add($file)
                }
                else {
                    $unsupportedFiles.Add($file)
                }
            }

            $supportedCount = $supportedFiles.Count
            $unsupportedCount = $unsupportedFiles.Count

            Write-Verbose "Supported: $supportedCount, Unsupported: $unsupportedCount."

            # Scan supported files
            $details = [System.Collections.Generic.List[object]]::new()
            $labeledCount = 0
            $unlabeledCount = 0
            $labelGroups = @{}
            $extensionGroups = @{}

            for ($i = 0; $i -lt $supportedCount; $i++) {
                $file = $supportedFiles[$i]
                $percentComplete = [math]::Floor(($i / [math]::Max($supportedCount, 1)) * 100)

                Write-Progress -Activity 'Scanning file share' `
                    -Status "Scanning file $($i + 1) of $supportedCount" `
                    -PercentComplete $percentComplete

                try {
                    $fileStatus = Get-AIPFileStatus -Path $file.FullName

                    $isLabeled = $null -ne $fileStatus.MainLabelName -and $fileStatus.MainLabelName -ne ''
                    $labelName = if ($isLabeled) { $fileStatus.MainLabelName } else { $null }

                    if ($isLabeled) {
                        $labeledCount++

                        if ($labelGroups.ContainsKey($labelName)) {
                            $labelGroups[$labelName]++
                        }
                        else {
                            $labelGroups[$labelName] = 1
                        }
                    }
                    else {
                        $unlabeledCount++
                    }

                    # Track by extension
                    $ext = $file.Extension.ToLower()
                    if ($extensionGroups.ContainsKey($ext)) {
                        $extensionGroups[$ext]++
                    }
                    else {
                        $extensionGroups[$ext] = 1
                    }

                    $detail = [PSCustomObject]@{
                        FullPath       = $file.FullName
                        FileName       = $file.Name
                        Extension      = $ext
                        SizeKB         = [math]::Round($file.Length / 1KB, 2)
                        IsLabeled      = $isLabeled
                        LabelName      = $labelName
                        SubLabelName   = $fileStatus.SubLabelName
                        IsProtected    = $fileStatus.IsRMSProtected
                        ScanStatus     = 'Success'
                        Error          = $null
                    }

                    # Filter by sensitive info types if specified
                    if ($SensitiveInfoTypes) {
                        $matchedTypes = @()
                        if ($fileStatus.SensitiveInformationTypes) {
                            $matchedTypes = $fileStatus.SensitiveInformationTypes |
                                Where-Object { $SensitiveInfoTypes -contains $_.Name }
                        }
                        $detail | Add-Member -NotePropertyName SensitiveInfoTypes -NotePropertyValue $matchedTypes
                    }

                    $details.Add($detail)
                }
                catch {
                    $details.Add([PSCustomObject]@{
                        FullPath       = $file.FullName
                        FileName       = $file.Name
                        Extension      = $file.Extension.ToLower()
                        SizeKB         = [math]::Round($file.Length / 1KB, 2)
                        IsLabeled      = $false
                        LabelName      = $null
                        SubLabelName   = $null
                        IsProtected    = $false
                        ScanStatus     = 'Failed'
                        Error          = $_.Exception.Message
                    })
                }
            }

            Write-Progress -Activity 'Scanning file share' -Completed

            $stopwatch.Stop()

            $result = [PSCustomObject]@{
                Action           = 'Get-FileShareScan'
                Path             = $Path
                TotalFiles       = $totalFiles
                SupportedFiles   = $supportedCount
                UnsupportedFiles = $unsupportedCount
                LabeledFiles     = $labeledCount
                UnlabeledFiles   = $unlabeledCount
                FilesByLabel     = $labelGroups
                FilesByExtension = $extensionGroups
                ScanDuration     = $stopwatch.Elapsed.ToString()
                Details          = $details
            }

            Write-SLAuditEntry -Action 'Get-FileShareScan' -Target $Path -Detail @{
                TotalFiles       = $totalFiles
                SupportedFiles   = $supportedCount
                UnsupportedFiles = $unsupportedCount
                LabeledFiles     = $labeledCount
                UnlabeledFiles   = $unlabeledCount
                ScanDuration     = $stopwatch.Elapsed.ToString()
            } -Result 'success'

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            Write-SLAuditEntry -Action 'Get-FileShareScan' -Target $Path -Result 'failed' -ErrorMessage $_.Exception.Message
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
