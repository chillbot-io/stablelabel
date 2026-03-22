function Get-SLDriveChildren {
    <#
    .SYNOPSIS
        Lists the contents of a drive folder via Microsoft Graph.
    .DESCRIPTION
        Retrieves child items (files and folders) from a SharePoint or OneDrive
        drive location. Returns file metadata including name, size, type, and
        current sensitivity label if available.
    .PARAMETER SiteId
        The SharePoint site ID. Used to discover drives.
    .PARAMETER DriveId
        The drive ID to browse. If not specified, uses the default document library.
    .PARAMETER ItemId
        The folder item ID. If not specified, browses the root.
    .PARAMETER Path
        A folder path relative to the drive root (alternative to ItemId).
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLDriveChildren -SiteId 'site-id-here'
    .EXAMPLE
        Get-SLDriveChildren -DriveId 'b!abc123' -ItemId 'folder-id'
    #>
    [CmdletBinding()]
    param(
        [string]$SiteId,

        [string]$DriveId,

        [string]$ItemId,

        [string]$Path,

        [switch]$AsJson
    )

    process {
        try {
            # Resolve drive ID if only site ID provided
            if ($SiteId -and -not $DriveId) {
                Write-Verbose "Resolving default drive for site $SiteId..."
                $driveResult = Invoke-SLGraphRequest -Method GET -Uri "/sites/$SiteId/drive?`$select=id,name,webUrl"
                $DriveId = $driveResult.id
            }

            if (-not $DriveId) {
                throw 'Either -DriveId or -SiteId is required.'
            }

            # Build the URI based on what we have
            $uri = if ($ItemId) {
                "/drives/$DriveId/items/$ItemId/children"
            }
            elseif ($Path) {
                "/drives/$DriveId/root:/${Path}:/children"
            }
            else {
                "/drives/$DriveId/root/children"
            }

            $uri += "?`$select=id,name,size,file,folder,lastModifiedDateTime,lastModifiedBy,createdDateTime,webUrl,parentReference&`$top=200"

            $result = Invoke-SLGraphRequest -Method GET -Uri $uri -AutoPaginate
            $rawItems = if ($result -is [array]) { $result } elseif ($result.value) { $result.value } else { @($result) }

            $children = @()
            foreach ($item in $rawItems) {
                $isFolder = $null -ne $item.folder
                $mimeType = if ($item.file) { $item.file.mimeType } else { $null }
                $modifiedBy = if ($item.lastModifiedBy -and $item.lastModifiedBy.user) { $item.lastModifiedBy.user.displayName } else { $null }

                $children += [PSCustomObject]@{
                    Id               = $item.id
                    Name             = $item.name
                    IsFolder         = $isFolder
                    Size             = if ($isFolder) { $null } else { $item.size }
                    MimeType         = $mimeType
                    ChildCount       = if ($isFolder -and $item.folder) { $item.folder.childCount } else { $null }
                    LastModified     = $item.lastModifiedDateTime
                    ModifiedBy       = $modifiedBy
                    CreatedDateTime  = $item.createdDateTime
                    WebUrl           = $item.webUrl
                    DriveId          = $DriveId
                    ParentId         = if ($item.parentReference) { $item.parentReference.id } else { $null }
                }
            }

            # Sort: folders first, then files alphabetically
            $sorted = @($children | Sort-Object -Property @{Expression='IsFolder';Descending=$true}, @{Expression='Name';Ascending=$true})

            $output = [PSCustomObject]@{
                Action   = 'Get-DriveChildren'
                DriveId  = $DriveId
                ParentId = $ItemId
                Count    = $sorted.Count
                Items    = @($sorted)
            }

            if ($AsJson) {
                return $output | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            $output
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
