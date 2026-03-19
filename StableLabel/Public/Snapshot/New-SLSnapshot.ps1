function New-SLSnapshot {
    <#
    .SYNOPSIS
        Captures current state of sensitivity labels, label policies, auto-label policies,
        DLP policies, DLP rules, retention labels, and retention policies.
    .DESCRIPTION
        Creates a point-in-time snapshot of the tenant's Purview configuration.
        Snapshots are stored as JSON files and can be compared or restored later.
    .PARAMETER Name
        The name for the new snapshot (used as the file name).
    .PARAMETER Scope
        The scope of data to capture: All, Labels, Dlp, or Retention.
    .PARAMETER Path
        Override the snapshot storage directory path.
    .PARAMETER AsJson
        Return results as a JSON string.
    .EXAMPLE
        New-SLSnapshot -Name "2024-01-15_baseline"
    .EXAMPLE
        New-SLSnapshot -Name "dlp-only" -Scope Dlp
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [ValidateSet('All', 'Labels', 'Dlp', 'Retention')]
        [string]$Scope = 'All',

        [string]$Path,

        [switch]$AsJson
    )

    begin {
        # Labels scope needs Graph + Compliance; DLP/Retention need Compliance; All needs both
        if ($Scope -eq 'All' -or $Scope -eq 'Labels') {
            Assert-SLConnected -Require Graph
            Assert-SLConnected -Require Compliance
        }
        else {
            Assert-SLConnected -Require Compliance
        }
    }

    process {
        $snapshotDir = if ($Path) { $Path } else { $script:SLConfig.SnapshotPath }
        if (-not (Test-Path $snapshotDir)) {
            New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        }

        $data = @{}
        $capturedItems = @{}

        # Sensitivity Labels (Graph API)
        if ($Scope -in 'All', 'Labels') {
            Write-Verbose 'Capturing sensitivity labels...'
            try {
                $labels = Invoke-SLGraphRequest -Method GET -Uri '/security/informationProtection/sensitivityLabels' -ApiVersion beta -AutoPaginate
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

        # DLP
        if ($Scope -in 'All', 'Dlp') {
            Write-Verbose 'Capturing DLP policies...'
            try {
                $dlpPolicies = Invoke-SLComplianceCommand -ScriptBlock { Get-DlpCompliancePolicy } -OperationName 'Snapshot: Get-DlpCompliancePolicy'
                $data['DlpPolicies'] = @($dlpPolicies | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth | ConvertFrom-Json)
                $capturedItems['DlpPolicies'] = @($dlpPolicies).Count
            }
            catch {
                Write-Warning "Failed to capture DLP policies: $_"
                $data['DlpPolicies'] = @()
                $capturedItems['DlpPolicies'] = 0
            }

            Write-Verbose 'Capturing DLP rules...'
            try {
                $dlpRules = Invoke-SLComplianceCommand -ScriptBlock { Get-DlpComplianceRule } -OperationName 'Snapshot: Get-DlpComplianceRule'
                $data['DlpRules'] = @($dlpRules | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth | ConvertFrom-Json)
                $capturedItems['DlpRules'] = @($dlpRules).Count
            }
            catch {
                Write-Warning "Failed to capture DLP rules: $_"
                $data['DlpRules'] = @()
                $capturedItems['DlpRules'] = 0
            }

            Write-Verbose 'Capturing sensitive information types...'
            try {
                $sits = Invoke-SLComplianceCommand -ScriptBlock { Get-DlpSensitiveInformationType | Where-Object { $_.Publisher -ne 'Microsoft Corporation' } } -OperationName 'Snapshot: Get-DlpSensitiveInformationType'
                $data['SensitiveInfoTypes'] = @($sits | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth | ConvertFrom-Json)
                $capturedItems['SensitiveInfoTypes'] = @($sits).Count
            }
            catch {
                Write-Warning "Failed to capture sensitive info types: $_"
                $data['SensitiveInfoTypes'] = @()
                $capturedItems['SensitiveInfoTypes'] = 0
            }
        }

        # Retention
        if ($Scope -in 'All', 'Retention') {
            Write-Verbose 'Capturing retention labels...'
            try {
                $retLabels = Invoke-SLComplianceCommand -ScriptBlock { Get-ComplianceTag } -OperationName 'Snapshot: Get-ComplianceTag'
                $data['RetentionLabels'] = @($retLabels | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth | ConvertFrom-Json)
                $capturedItems['RetentionLabels'] = @($retLabels).Count
            }
            catch {
                Write-Warning "Failed to capture retention labels: $_"
                $data['RetentionLabels'] = @()
                $capturedItems['RetentionLabels'] = 0
            }

            Write-Verbose 'Capturing retention policies...'
            try {
                $retPolicies = Invoke-SLComplianceCommand -ScriptBlock { Get-RetentionCompliancePolicy -IncludeTestDetails } -OperationName 'Snapshot: Get-RetentionCompliancePolicy'
                $data['RetentionPolicies'] = @($retPolicies | ConvertTo-Json -Depth $script:SLConfig.MaxJsonDepth | ConvertFrom-Json)
                $capturedItems['RetentionPolicies'] = @($retPolicies).Count
            }
            catch {
                Write-Warning "Failed to capture retention policies: $_"
                $data['RetentionPolicies'] = @()
                $capturedItems['RetentionPolicies'] = 0
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
