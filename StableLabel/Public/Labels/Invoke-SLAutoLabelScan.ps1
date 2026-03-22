function Invoke-SLAutoLabelScan {
    <#
    .SYNOPSIS
        Scans a SharePoint/OneDrive location and applies sensitivity labels
        based on matching conditions.
    .DESCRIPTION
        The core auto-labeling execution engine for E3 tenants. Enumerates files
        in the target location via Graph API, evaluates each file against the
        provided conditions, and applies the specified sensitivity label to
        matching files.

        Conditions (all optional, AND logic — all specified conditions must match):
        - File extensions (e.g., docx, pdf, xlsx)
        - Minimum file size in bytes
        - Maximum file size in bytes
        - Filename patterns (wildcard match, e.g., "*confidential*")
        - Content keywords (downloads file, searches for keywords — slower)

        Can run interactively from the GUI or headless on a Windows server
        via scheduled tasks.
    .PARAMETER SiteId
        SharePoint site ID to scan.
    .PARAMETER DriveId
        Drive ID to scan. If not specified, uses the site's default drive.
    .PARAMETER FolderId
        Specific folder item ID to scan (non-recursive by default).
    .PARAMETER Recursive
        Scan subfolders recursively.
    .PARAMETER LabelId
        The sensitivity label GUID to apply to matching files.
    .PARAMETER LabelName
        The sensitivity label name to apply (resolved to ID via cache).
    .PARAMETER Extensions
        File extensions to match (without dot, e.g., 'docx','pdf').
    .PARAMETER MinSizeBytes
        Minimum file size in bytes to match.
    .PARAMETER MaxSizeBytes
        Maximum file size in bytes to match.
    .PARAMETER FilenamePatterns
        Wildcard patterns to match against filenames (e.g., '*report*','*confidential*').
    .PARAMETER ContentKeywords
        Keywords to search for in file content. Requires downloading files — use sparingly.
    .PARAMETER SkipAlreadyLabeled
        Skip files that already have any sensitivity label applied.
    .PARAMETER Justification
        Justification text for the label application.
    .PARAMETER BatchSize
        Number of files to process in each batch (default 50).
    .PARAMETER DryRun
        Preview what would be labeled without applying changes.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Invoke-SLAutoLabelScan -SiteId $siteId -LabelName 'Confidential' -Extensions 'docx','pdf' -DryRun
    .EXAMPLE
        Invoke-SLAutoLabelScan -DriveId $driveId -FolderId $folderId -LabelId $labelGuid -MinSizeBytes 1048576 -Recursive
    .EXAMPLE
        # Headless scheduled task usage:
        Connect-SLGraph -UseDeviceCode
        Connect-SLCompliance
        Invoke-SLAutoLabelScan -SiteId $siteId -LabelName 'Internal' -Extensions 'xlsx' -FilenamePatterns '*finance*' -AsJson
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [string]$SiteId,

        [string]$DriveId,

        [string]$FolderId,

        [switch]$Recursive,

        [string]$LabelId,

        [string]$LabelName,

        [string[]]$Extensions,

        [long]$MinSizeBytes,

        [long]$MaxSizeBytes,

        [string[]]$FilenamePatterns,

        [string[]]$ContentKeywords,

        [switch]$SkipAlreadyLabeled,

        [string]$Justification,

        [int]$BatchSize = 50,

        [switch]$DryRun,

        [switch]$AsJson
    )

    begin {
        Assert-SLConnected -Require Graph

        # Resolve label
        if (-not $LabelId -and -not $LabelName) {
            throw 'Either -LabelId or -LabelName must be specified.'
        }
        if ($LabelName -and -not $LabelId) {
            $LabelId = Resolve-SLLabelName -LabelName $LabelName
            if (-not $LabelId) {
                throw "Could not resolve label name '$LabelName' to a GUID."
            }
        }

        # Need at least SiteId or DriveId
        if (-not $SiteId -and -not $DriveId) {
            throw 'Either -SiteId or -DriveId must be specified.'
        }
    }

    process {
        $isDryRun = Test-SLDryRun -DryRun:$DryRun

        $scanDetail = @{
            SiteId           = $SiteId
            DriveId          = $DriveId
            FolderId         = $FolderId
            Recursive        = [bool]$Recursive
            LabelId          = $LabelId
            Extensions       = $Extensions
            MinSizeBytes     = $MinSizeBytes
            MaxSizeBytes     = $MaxSizeBytes
            FilenamePatterns = $FilenamePatterns
            ContentKeywords  = $ContentKeywords
        }

        Write-SLAuditEntry -Action 'Invoke-SLAutoLabelScan' -Target ($SiteId ?? $DriveId) -Detail $scanDetail -Result $(if ($isDryRun) { 'dry-run-start' } else { 'start' })

        # Resolve DriveId from SiteId if needed
        if ($SiteId -and -not $DriveId) {
            Write-Verbose "Resolving default drive for site: $SiteId"
            $driveResponse = Invoke-SLGraphRequest -Uri "/sites/$SiteId/drive" -Method GET
            $DriveId = $driveResponse.id
            if (-not $DriveId) {
                throw "Could not resolve drive for site '$SiteId'."
            }
        }

        # Enumerate files
        Write-Verbose "Enumerating files in drive: $DriveId"
        $allFiles = @()
        $foldersToScan = @()

        if ($FolderId) {
            $foldersToScan += $FolderId
        }
        else {
            $foldersToScan += 'root'
        }

        while ($foldersToScan.Count -gt 0) {
            $currentFolder = $foldersToScan[0]
            $foldersToScan = @($foldersToScan | Select-Object -Skip 1)

            $uri = if ($currentFolder -eq 'root') {
                "/drives/$DriveId/root/children"
            }
            else {
                "/drives/$DriveId/items/$currentFolder/children"
            }

            $items = Invoke-SLGraphRequest -Uri $uri -Method GET

            $children = @()
            if ($items.value) {
                $children = @($items.value)
            }
            elseif ($items -is [array]) {
                $children = @($items)
            }

            foreach ($item in $children) {
                if ($item.folder) {
                    if ($Recursive) {
                        $foldersToScan += $item.id
                    }
                }
                elseif ($item.file) {
                    $allFiles += $item
                }
            }

            # Handle pagination
            $nextLink = $items.'@odata.nextLink'
            while ($nextLink) {
                # Strip the base URL to get the relative path for our helper
                $relativeUri = $nextLink -replace '^https://graph\.microsoft\.com/v1\.0', ''
                $nextPage = Invoke-SLGraphRequest -Uri $relativeUri -Method GET
                if ($nextPage.value) {
                    foreach ($item in @($nextPage.value)) {
                        if ($item.folder -and $Recursive) {
                            $foldersToScan += $item.id
                        }
                        elseif ($item.file) {
                            $allFiles += $item
                        }
                    }
                }
                $nextLink = $nextPage.'@odata.nextLink'
            }
        }

        Write-Verbose "Found $($allFiles.Count) files to evaluate."

        # Evaluate conditions
        $matchingFiles = @()
        $skippedFiles = @()

        foreach ($file in $allFiles) {
            $fileName = $file.name
            $fileSize = $file.size
            $fileExt = if ($fileName -match '\.([^.]+)$') { $Matches[1].ToLower() } else { '' }

            $match = $true
            $skipReason = $null

            # Extension filter
            if ($Extensions -and $Extensions.Count -gt 0) {
                $extLower = $Extensions | ForEach-Object { $_.ToLower().TrimStart('.') }
                if ($fileExt -notin $extLower) {
                    $match = $false
                    $skipReason = "Extension '$fileExt' not in filter"
                }
            }

            # Size filters
            if ($match -and $MinSizeBytes -gt 0 -and $fileSize -lt $MinSizeBytes) {
                $match = $false
                $skipReason = "Size $fileSize below minimum $MinSizeBytes"
            }
            if ($match -and $MaxSizeBytes -gt 0 -and $fileSize -gt $MaxSizeBytes) {
                $match = $false
                $skipReason = "Size $fileSize above maximum $MaxSizeBytes"
            }

            # Filename pattern filter
            if ($match -and $FilenamePatterns -and $FilenamePatterns.Count -gt 0) {
                $nameMatch = $false
                foreach ($pattern in $FilenamePatterns) {
                    if ($fileName -like $pattern) {
                        $nameMatch = $true
                        break
                    }
                }
                if (-not $nameMatch) {
                    $match = $false
                    $skipReason = "Filename '$fileName' does not match any pattern"
                }
            }

            if ($match) {
                $matchingFiles += $file
            }
            else {
                $skippedFiles += [PSCustomObject]@{
                    Name   = $fileName
                    ItemId = $file.id
                    Reason = $skipReason
                }
            }
        }

        Write-Verbose "$($matchingFiles.Count) files match conditions, $($skippedFiles.Count) skipped."

        # Content keyword check (expensive — only for matched files)
        if ($ContentKeywords -and $ContentKeywords.Count -gt 0 -and $matchingFiles.Count -gt 0) {
            Write-Verbose "Checking content keywords for $($matchingFiles.Count) files..."
            $contentMatched = @()

            foreach ($file in $matchingFiles) {
                try {
                    # Download file content via Graph
                    $contentUri = "/drives/$DriveId/items/$($file.id)/content"
                    $content = Invoke-SLGraphRequest -Uri $contentUri -Method GET -RawContent

                    $keywordFound = $false
                    foreach ($keyword in $ContentKeywords) {
                        if ($content -match [regex]::Escape($keyword)) {
                            $keywordFound = $true
                            break
                        }
                    }

                    if ($keywordFound) {
                        $contentMatched += $file
                    }
                    else {
                        $skippedFiles += [PSCustomObject]@{
                            Name   = $file.name
                            ItemId = $file.id
                            Reason = 'No content keyword match'
                        }
                    }
                }
                catch {
                    Write-Warning "Could not check content for $($file.name): $($_.Exception.Message)"
                    $skippedFiles += [PSCustomObject]@{
                        Name   = $file.name
                        ItemId = $file.id
                        Reason = "Content check failed: $($_.Exception.Message)"
                    }
                }
            }
            $matchingFiles = $contentMatched
        }

        # Check for existing labels if SkipAlreadyLabeled
        if ($SkipAlreadyLabeled -and $matchingFiles.Count -gt 0) {
            Write-Verbose "Checking existing labels for $($matchingFiles.Count) files..."
            $unlabeledFiles = @()

            foreach ($file in $matchingFiles) {
                try {
                    $labelInfo = Invoke-SLGraphRequest -Uri "/drives/$DriveId/items/$($file.id)/extractSensitivityLabels" -Method POST -ApiVersion beta
                    $hasLabel = $labelInfo.labels -and $labelInfo.labels.Count -gt 0

                    if ($hasLabel) {
                        $skippedFiles += [PSCustomObject]@{
                            Name   = $file.name
                            ItemId = $file.id
                            Reason = 'Already labeled'
                        }
                    }
                    else {
                        $unlabeledFiles += $file
                    }
                }
                catch {
                    # If we can't check, include it
                    $unlabeledFiles += $file
                }
            }
            $matchingFiles = $unlabeledFiles
        }

        Write-Verbose "Final: $($matchingFiles.Count) files to label."

        # Apply labels (or dry-run)
        $results = @()
        $successCount = 0
        $failedCount = 0

        foreach ($file in $matchingFiles) {
            if ($isDryRun) {
                $results += [PSCustomObject]@{
                    Name   = $file.name
                    ItemId = $file.id
                    DriveId = $DriveId
                    Size   = $file.size
                    Status = 'WouldLabel'
                    Error  = $null
                }
                $successCount++
                continue
            }

            if (-not $PSCmdlet.ShouldProcess($file.name, "Apply label $LabelId")) {
                continue
            }

            try {
                $body = @{
                    sensitivityLabelId = $LabelId
                }
                if ($Justification) {
                    $body['justificationText'] = $Justification
                }

                Invoke-SLGraphRequest -Uri "/drives/$DriveId/items/$($file.id)/assignSensitivityLabel" -Method POST -Body $body -ApiVersion beta

                $results += [PSCustomObject]@{
                    Name    = $file.name
                    ItemId  = $file.id
                    DriveId = $DriveId
                    Size    = $file.size
                    Status  = 'Labeled'
                    Error   = $null
                }
                $successCount++

                Write-SLAuditEntry -Action 'AutoLabel-Apply' -Target "$DriveId/$($file.id)" -Detail @{ FileName = $file.name; LabelId = $LabelId } -Result 'success'
            }
            catch {
                $results += [PSCustomObject]@{
                    Name    = $file.name
                    ItemId  = $file.id
                    DriveId = $DriveId
                    Size    = $file.size
                    Status  = 'Failed'
                    Error   = $_.Exception.Message
                }
                $failedCount++

                Write-SLAuditEntry -Action 'AutoLabel-Apply' -Target "$DriveId/$($file.id)" -Detail @{ FileName = $file.name; LabelId = $LabelId } -Result 'failed' -ErrorMessage $_.Exception.Message
            }
        }

        $summary = [PSCustomObject]@{
            Action          = 'Invoke-SLAutoLabelScan'
            DriveId         = $DriveId
            SiteId          = $SiteId
            LabelId         = $LabelId
            TotalFiles      = $allFiles.Count
            MatchedFiles    = $matchingFiles.Count
            SkippedFiles    = $skippedFiles.Count
            SuccessCount    = $successCount
            FailedCount     = $failedCount
            DryRun          = [bool]$isDryRun
            Results         = $results
            Skipped         = $skippedFiles
        }

        Write-SLAuditEntry -Action 'Invoke-SLAutoLabelScan' -Target ($SiteId ?? $DriveId) -Detail @{ Matched = $matchingFiles.Count; Success = $successCount; Failed = $failedCount } -Result $(if ($isDryRun) { 'dry-run-complete' } else { 'complete' })

        if ($AsJson) {
            return $summary | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        return $summary
    }
}
