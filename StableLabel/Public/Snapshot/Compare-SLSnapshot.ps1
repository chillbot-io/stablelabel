function Compare-SLSnapshot {
    <#
    .SYNOPSIS
        Compares a snapshot against live state or another snapshot.
    .DESCRIPTION
        Produces a structured diff showing Added, Removed, and Modified items
        per category with property-level changes for Modified items.
    .PARAMETER Name
        The name of the reference snapshot to compare from.
    .PARAMETER Live
        Compare the snapshot against the current live tenant state.
    .PARAMETER CompareTo
        The name of a second snapshot to compare against.
    .PARAMETER Path
        Override the snapshot storage directory path.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        Compare-SLSnapshot -Name "2024-01-15_baseline" -Live
    .EXAMPLE
        Compare-SLSnapshot -Name "2024-01-15_baseline" -CompareTo "2024-02-01_post-change"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [switch]$Live,

        [string]$CompareTo,

        [string]$Path,

        [switch]$AsJson
    )

    begin {
        if (-not $Live -and -not $CompareTo) {
            throw "Specify either -Live to compare against current tenant state, or -CompareTo <snapshot-name> to compare two snapshots."
        }
    }

    process {
        $snapshotDir = if ($Path) { $Path } else { $script:SLConfig.SnapshotPath }

        # Load reference snapshot
        $refPath = Join-Path $snapshotDir "$Name.json"
        if (-not (Test-Path $refPath)) {
            throw "Snapshot '$Name' not found."
        }
        $reference = Get-Content -Path $refPath -Raw -Encoding utf8 | ConvertFrom-Json

        # Load comparison data
        $comparison = $null
        $comparisonSource = ''

        if ($Live) {
            # Capture current state as a temporary snapshot
            $comparisonSource = 'Live tenant state'
            $tempName = "_compare-temp-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            $tempSnapshot = New-SLSnapshot -Name $tempName -Scope $reference.Scope -Path $env:TEMP
            $tempPath = Join-Path $env:TEMP "$tempName.json"
            $comparison = Get-Content -Path $tempPath -Raw -Encoding utf8 | ConvertFrom-Json
            Remove-Item -Path $tempPath -Force -ErrorAction SilentlyContinue
        }
        else {
            $comparisonSource = "Snapshot: $CompareTo"
            $compPath = Join-Path $snapshotDir "$CompareTo.json"
            if (-not (Test-Path $compPath)) {
                throw "Snapshot '$CompareTo' not found."
            }
            $comparison = Get-Content -Path $compPath -Raw -Encoding utf8 | ConvertFrom-Json
        }

        # Compare each data category
        $categories = @(
            'SensitivityLabels', 'LabelPolicies', 'AutoLabelPolicies',
            'DlpPolicies', 'DlpRules', 'SensitiveInfoTypes',
            'RetentionLabels', 'RetentionPolicies'
        )

        $diffs = [ordered]@{}

        foreach ($category in $categories) {
            $refItems = @()
            $compItems = @()

            if ($reference.Data.PSObject.Properties[$category]) {
                $refItems = @($reference.Data.$category)
            }
            if ($comparison.Data.PSObject.Properties[$category]) {
                $compItems = @($comparison.Data.$category)
            }

            # Determine the identity key for this category
            $idKey = switch ($category) {
                'SensitivityLabels'  { 'id' }
                'LabelPolicies'      { 'Name' }
                'AutoLabelPolicies'  { 'Name' }
                'DlpPolicies'        { 'Name' }
                'DlpRules'           { 'Name' }
                'SensitiveInfoTypes' { 'Name' }
                'RetentionLabels'    { 'Name' }
                'RetentionPolicies'  { 'Name' }
                default              { 'Name' }
            }

            $refHash = @{}
            foreach ($item in $refItems) {
                $key = $item.$idKey
                if ($key) { $refHash[$key] = $item }
            }

            $compHash = @{}
            foreach ($item in $compItems) {
                $key = $item.$idKey
                if ($key) { $compHash[$key] = $item }
            }

            $added = @()
            $removed = @()
            $modified = @()

            # Items in comparison but not in reference = added since snapshot
            foreach ($key in $compHash.Keys) {
                if (-not $refHash.ContainsKey($key)) {
                    $added += [PSCustomObject]@{
                        Identity = $key
                        Item     = $compHash[$key]
                    }
                }
            }

            # Items in reference but not in comparison = removed since snapshot
            foreach ($key in $refHash.Keys) {
                if (-not $compHash.ContainsKey($key)) {
                    $removed += [PSCustomObject]@{
                        Identity = $key
                        Item     = $refHash[$key]
                    }
                }
            }

            # Items in both = check for modifications
            foreach ($key in $refHash.Keys) {
                if ($compHash.ContainsKey($key)) {
                    $refJson = $refHash[$key] | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth -Compress
                    $compJson = $compHash[$key] | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth -Compress
                    if ($refJson -ne $compJson) {
                        $modified += [PSCustomObject]@{
                            Identity      = $key
                            SnapshotState = $refHash[$key]
                            CurrentState  = $compHash[$key]
                        }
                    }
                }
            }

            $diffs[$category] = [PSCustomObject]@{
                Added    = $added
                Removed  = $removed
                Modified = $modified
                Summary  = [PSCustomObject]@{
                    AddedCount    = $added.Count
                    RemovedCount  = $removed.Count
                    ModifiedCount = $modified.Count
                    UnchangedCount = [math]::Max(0, $refHash.Count - $removed.Count - $modified.Count)
                }
            }
        }

        $result = [PSCustomObject]@{
            ReferenceSnapshot = $Name
            ComparisonSource  = $comparisonSource
            ComparedAt        = (Get-Date).ToUniversalTime().ToString('o')
            HasChanges        = ($diffs.Values | ForEach-Object { $_.Summary.AddedCount + $_.Summary.RemovedCount + $_.Summary.ModifiedCount } | Measure-Object -Sum).Sum -gt 0
            Categories        = [PSCustomObject]$diffs
        }

        if ($AsJson) {
            return $result | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        $result
    }
}
