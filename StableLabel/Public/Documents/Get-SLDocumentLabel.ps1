function Get-SLDocumentLabel {
    <#
    .SYNOPSIS
        Extracts the sensitivity label from a document via Microsoft Graph API.
    .DESCRIPTION
        Calls the extractSensitivityLabels endpoint on a specific drive item
        to retrieve the currently applied sensitivity label information.
    .PARAMETER DriveId
        The ID of the drive containing the document.
    .PARAMETER ItemId
        The ID of the document item within the drive.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Get-SLDocumentLabel -DriveId 'b!abc123' -ItemId '01ABC123DEF'
    .EXAMPLE
        Get-SLDocumentLabel -DriveId 'b!abc123' -ItemId '01ABC123DEF' -AsJson
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

    begin {
        Assert-SLConnected -Require Graph
    }

    process {
        try {
            Write-Verbose "Extracting sensitivity label from drive '$DriveId', item '$ItemId'."

            $result = Invoke-SLGraphRequest -Method POST `
                -Uri "/drives/$DriveId/items/$ItemId/extractSensitivityLabels" `
                -ApiVersion beta

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }

            return $result
        }
        catch {
            $PSCmdlet.ThrowTerminatingError($_)
        }
    }
}
