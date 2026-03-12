function Get-SLSnapshot {
    <#
    .SYNOPSIS
        Lists saved snapshots or retrieves a specific snapshot by name.
    #>
    [CmdletBinding()]
    param(
        [string]$Name,

        [string]$Path,

        [switch]$AsJson
    )

    process {
        $snapshotDir = if ($Path) { $Path } else { $script:SLConfig.SnapshotPath }

        if (-not (Test-Path $snapshotDir)) {
            if ($AsJson) {
                return '[]'
            }
            return @()
        }

        if ($Name) {
            $filePath = Join-Path $snapshotDir "$Name.json"
            if (-not (Test-Path $filePath)) {
                throw "Snapshot '$Name' not found at '$filePath'."
            }

            $content = Get-Content -Path $filePath -Raw -Encoding utf8
            $snapshot = $content | ConvertFrom-Json

            if ($AsJson) {
                return $content
            }
            return $snapshot
        }

        # List all snapshots
        $files = Get-ChildItem -Path $snapshotDir -Filter '*.json' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending

        $snapshots = foreach ($file in $files) {
            try {
                $content = Get-Content -Path $file.FullName -Raw -Encoding utf8
                $snap = $content | ConvertFrom-Json

                # Build item counts
                $itemCounts = @{}
                if ($snap.Data) {
                    foreach ($prop in $snap.Data.PSObject.Properties) {
                        $itemCounts[$prop.Name] = @($prop.Value).Count
                    }
                }

                [PSCustomObject]@{
                    Name       = $file.BaseName
                    SnapshotId = $snap.SnapshotId
                    Scope      = $snap.Scope
                    CreatedAt  = $snap.CreatedAt
                    CreatedBy  = $snap.CreatedBy
                    TenantId   = $snap.TenantId
                    Path       = $file.FullName
                    SizeMB     = [math]::Round($file.Length / 1MB, 2)
                    Items      = [PSCustomObject]$itemCounts
                }
            }
            catch {
                Write-Warning "Failed to read snapshot '$($file.Name)': $_"
            }
        }

        if ($AsJson) {
            return $snapshots | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        $snapshots
    }
}
