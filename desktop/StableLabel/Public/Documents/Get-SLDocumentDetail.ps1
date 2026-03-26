function Get-SLDocumentDetail {
    <#
    .SYNOPSIS
        Gets detailed label and protection information for a document.
    .DESCRIPTION
        Retrieves the current sensitivity label, assignment method, encryption
        status, and file metadata for a specific document. Used by the Explorer
        content viewer panel.
    .PARAMETER DriveId
        The ID of the drive containing the document.
    .PARAMETER ItemId
        The ID of the document item within the drive.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLDocumentDetail -DriveId 'b!abc123' -ItemId '01ABC'
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$DriveId,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [switch]$AsJson
    )

    process {
        try {
            Write-Verbose "Getting document detail for drive '$DriveId', item '$ItemId'..."

            # Get file metadata
            $metaUri = "/drives/$DriveId/items/$ItemId"
            $meta = Invoke-SLGraphRequest -Method GET -Uri $metaUri

            # Get sensitivity label
            $labelData = $null
            try {
                $labelUri = "/drives/$DriveId/items/$ItemId/extractSensitivityLabels"
                $labelResult = Invoke-SLGraphRequest -Method POST -Uri $labelUri -ApiVersion beta
                if ($labelResult -and $labelResult.labels) {
                    $labelData = $labelResult.labels
                }
            }
            catch {
                Write-Verbose "Could not extract labels: $_"
                $labelData = @()
            }

            $modifiedBy = if ($meta.lastModifiedBy -and $meta.lastModifiedBy.user) { $meta.lastModifiedBy.user.displayName } else { $null }
            $createdBy = if ($meta.createdBy -and $meta.createdBy.user) { $meta.createdBy.user.displayName } else { $null }

            # Build label summary
            $labels = @()
            foreach ($label in $labelData) {
                $labels += [PSCustomObject]@{
                    LabelId          = $label.sensitivityLabelId
                    Name             = $label.name
                    Description      = $label.description
                    Color            = $label.color
                    AssignmentMethod = $label.assignmentMethod
                    IsProtected      = $label.isProtectionEnabled -eq $true
                }
            }

            $output = [PSCustomObject]@{
                Action          = 'Get-DocumentDetail'
                DriveId         = $DriveId
                ItemId          = $ItemId
                Name            = $meta.name
                Size            = $meta.size
                MimeType        = if ($meta.file) { $meta.file.mimeType } else { $null }
                WebUrl          = $meta.webUrl
                CreatedDateTime = $meta.createdDateTime
                CreatedBy       = $createdBy
                LastModified    = $meta.lastModifiedDateTime
                ModifiedBy      = $modifiedBy
                Labels          = @($labels)
                HasLabel        = $labels.Count -gt 0
                IsProtected     = ($labels | Where-Object { $_.IsProtected }) -ne $null
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
