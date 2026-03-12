function Resolve-SLLabelName {
    <#
    .SYNOPSIS
        Bidirectional GUID-to-name and name-to-GUID resolution for sensitivity labels.
        Uses a module-scoped cache that refreshes every 30 minutes.
    #>
    [CmdletBinding()]
    param(
        [string]$LabelId,

        [string]$LabelName,

        [switch]$ForceRefresh
    )

    # Refresh cache if stale (>30 min) or forced
    $cacheAge = if ($script:SLLabelCache.CachedAt) {
        (Get-Date) - $script:SLLabelCache.CachedAt
    }
    else {
        [timespan]::MaxValue
    }

    if ($ForceRefresh -or $cacheAge.TotalMinutes -gt 30 -or $script:SLLabelCache.Labels.Count -eq 0) {
        try {
            $labels = Invoke-SLGraphRequest -Method GET -Uri '/security/informationProtection/sensitivityLabels' -ApiVersion beta -AutoPaginate
            $script:SLLabelCache.Labels = $labels
            $script:SLLabelCache.CachedAt = Get-Date
            $script:SLLabelCache.TenantId = $script:SLConnection.TenantId
        }
        catch {
            Write-Verbose "Failed to refresh label cache: $_"
            if ($script:SLLabelCache.Labels.Count -eq 0) {
                throw "Cannot resolve label - cache is empty and refresh failed: $_"
            }
        }
    }

    if ($LabelId) {
        $match = $script:SLLabelCache.Labels | Where-Object { $_.id -eq $LabelId }
        if ($match) {
            return $match.name
        }
        return $LabelId  # Return GUID if not found
    }

    if ($LabelName) {
        $match = $script:SLLabelCache.Labels | Where-Object { $_.name -eq $LabelName -or $_.displayName -eq $LabelName }
        if ($match) {
            return $match.id
        }
        throw "Label '$LabelName' not found. Use Get-SLLabel to see available labels."
    }
}
