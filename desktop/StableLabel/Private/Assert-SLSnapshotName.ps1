function Assert-SLSnapshotName {
    <#
    .SYNOPSIS
        Validates a snapshot name for filesystem safety.
    .DESCRIPTION
        Rejects names containing path traversal, filesystem-unsafe characters,
        leading dots, or excessive length. Called before any file path construction.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )

    if ($Name -match '[/\\:*?"<>|]') {
        throw "Snapshot name '$Name' contains invalid characters (/ \ : * ? `" < > |)."
    }
    if ($Name -match '^\.' -or $Name -match '\.\.') {
        throw "Snapshot name '$Name' cannot start with a dot or contain '..' path traversal."
    }
    if ($Name.Length -gt 128) {
        throw "Snapshot name must be 128 characters or fewer (got $($Name.Length))."
    }
    if ([string]::IsNullOrWhiteSpace($Name)) {
        throw 'Snapshot name cannot be empty or whitespace.'
    }
}
