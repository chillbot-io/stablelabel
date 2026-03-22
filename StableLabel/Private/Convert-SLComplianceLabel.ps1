function Convert-SLComplianceLabel {
    <#
    .SYNOPSIS
        Converts a Compliance Center label object to the normalized format
        previously returned by the Graph API, ensuring downstream compatibility.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$Label
    )

    [PSCustomObject]@{
        id            = $Label.Guid.ToString()
        name          = $Label.Name
        displayName   = $Label.DisplayName
        tooltip       = $Label.Tooltip
        isActive      = ($Label.Mode -eq 'Enforce')
        parentLabelId = if ($Label.ParentId -and $Label.ParentId -ne [guid]::Empty) {
                            $Label.ParentId.ToString()
                        } else { $null }
        parent        = $null
        priority      = $Label.Priority
        description   = $Label.Comment
        contentType   = $Label.ContentType
    }
}
