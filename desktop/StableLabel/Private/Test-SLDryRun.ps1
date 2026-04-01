function Test-SLDryRun {
    <#
    .SYNOPSIS
        Helper to check if a DryRun switch is active and emit verbose output.
    #>
    [CmdletBinding()]
    param(
        [switch]$DryRun
    )

    if ($DryRun) {
        Write-Verbose '[DRY RUN] No changes will be made.'
        return $true
    }
    return $false
}
