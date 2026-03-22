function New-SLSnapshot {
    <#
    .SYNOPSIS
        Captures current state of sensitivity labels, label policies, and auto-label policies.
    .DESCRIPTION
        Creates a point-in-time snapshot of the tenant's sensitivity label configuration.
        Snapshots are stored as JSON files and can be compared or restored later.
    .PARAMETER Name
        The name for the new snapshot (used as the file name).
    .PARAMETER Scope
        The scope of data to capture: All, Labels, or AutoLabel.
    .PARAMETER Path
        Override the snapshot storage directory path.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        New-SLSnapshot -Name "2024-01-15_baseline"
    .EXAMPLE
        New-SLSnapshot -Name "autolabel-only" -Scope AutoLabel
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [ValidateSet('All', 'Labels', 'AutoLabel')]
        [string]$Scope = 'All',

        [string]$Path,

        [switch]$AsJson
    )

    begin {
        Assert-SLSnapshotName -Name $Name
        Assert-SLConnected -Require Compliance
    }

    process {
        $snapshotDir = if ($Path) { $Path } else { $script:SLConfig.SnapshotPath }
        if (-not (Test-Path $snapshotDir)) {
            New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        }

        $data = @{}
        $capturedItems = @{}

        # Sensitivity Labels (Compliance Center)
        if ($Scope -in 'All', 'Labels') {
            Write-Verbose 'Capturing sensitivity labels...'
            try {
                $rawLabels = Invoke-SLComplianceCommand -ScriptBlock { Get-Label -ErrorAction Stop } -OperationName 'Snapshot: Get-Label'
                $labels = @($rawLabels | ForEach-Object { Convert-SLComplianceLabel -Label $_ })
                $data['SensitivityLabels'] = @($labels)
                $capturedItems['SensitivityLabels'] = $labels.Count
            }
            catch {
                Write-Warning "Failed to capture sensitivity labels: $_"
                $data['SensitivityLabels'] = @()
                $capturedItems['SensitivityLabels'] = 0
            }

            Write-Verbose 'Capturing label policies...'
            try {
                $labelPolicies = Invoke-SLComplianceCommand -ScriptBlock { Get-LabelPolicy } -OperationName 'Snapshot: Get-LabelPolicy'
                $data['LabelPolicies'] = @($labelPolicies | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth | ConvertFrom-Json)
                $capturedItems['LabelPolicies'] = @($labelPolicies).Count
            }
            catch {
                Write-Warning "Failed to capture label policies: $_"
                $data['LabelPolicies'] = @()
                $capturedItems['LabelPolicies'] = 0
            }
        }

        # Auto-Label Policies
        if ($Scope -in 'All', 'Labels', 'AutoLabel') {
            Write-Verbose 'Capturing auto-label policies...'
            try {
                $autoLabelPolicies = Invoke-SLComplianceCommand -ScriptBlock { Get-AutoSensitivityLabelPolicy } -OperationName 'Snapshot: Get-AutoSensitivityLabelPolicy'
                $data['AutoLabelPolicies'] = @($autoLabelPolicies | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth | ConvertFrom-Json)
                $capturedItems['AutoLabelPolicies'] = @($autoLabelPolicies).Count
            }
            catch {
                Write-Warning "Failed to capture auto-label policies: $_"
                $data['AutoLabelPolicies'] = @()
                $capturedItems['AutoLabelPolicies'] = 0
            }
        }

        # Build snapshot object
        $snapshot = ConvertTo-SLSnapshot -Data $data -Name $Name -Scope $Scope

        # Write to file
        $fileName = "$Name.json"
        $filePath = Join-Path $snapshotDir $fileName
        $tempPath = Join-Path $snapshotDir "$Name.tmp.$([System.IO.Path]::GetRandomFileName())"
        try {
            $json = $snapshot | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
            $json | Out-File -FilePath $tempPath -Encoding utf8 -ErrorAction Stop
            # Atomic rename — if this fails, the original file is untouched
            Move-Item -Path $tempPath -Destination $filePath -Force -ErrorAction Stop
        }
        catch {
            # Clean up temp file on failure
            if (Test-Path $tempPath) { Remove-Item -Path $tempPath -Force -ErrorAction SilentlyContinue }
            throw
        }

        Write-SLAuditEntry -Action 'New-SLSnapshot' -Target $Name -Detail @{
            Scope = $Scope
            Path  = $filePath
            Items = $capturedItems
        }

        $summary = [PSCustomObject]@{
            SnapshotId = $snapshot.SnapshotId
            Name       = $Name
            Scope      = $Scope
            CreatedAt  = $snapshot.CreatedAt
            Path       = $filePath
            Items      = [PSCustomObject]$capturedItems
        }

        if ($AsJson) {
            return $summary | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth
        }

        $summary
    }
}
