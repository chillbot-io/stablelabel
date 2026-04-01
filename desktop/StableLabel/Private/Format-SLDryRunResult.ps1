function Format-SLDryRunResult {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$Result,

        [switch]$AsJson
    )

    $Result | Add-Member -NotePropertyName DryRun -NotePropertyValue $true -Force

    if ($AsJson) {
        return $Result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
    }
    return $Result
}
