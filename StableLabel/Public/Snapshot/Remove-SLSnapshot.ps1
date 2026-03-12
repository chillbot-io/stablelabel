function Remove-SLSnapshot {
    <#
    .SYNOPSIS
        Deletes a saved snapshot.
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [string]$Path,

        [switch]$AsJson
    )

    process {
        $snapshotDir = if ($Path) { $Path } else { $script:SLConfig.SnapshotPath }
        $filePath = Join-Path $snapshotDir "$Name.json"

        if (-not (Test-Path $filePath)) {
            throw "Snapshot '$Name' not found at '$filePath'."
        }

        if ($PSCmdlet.ShouldProcess($Name, 'Remove snapshot')) {
            Remove-Item -Path $filePath -Force
            Write-SLAuditEntry -Action 'Remove-SLSnapshot' -Target $Name

            $result = [PSCustomObject]@{
                Name    = $Name
                Path    = $filePath
                Removed = $true
            }

            if ($AsJson) {
                return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            }
            $result
        }
    }
}
