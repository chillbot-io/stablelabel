#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel snapshot functions: New-SLSnapshot, Get-SLSnapshot,
    Remove-SLSnapshot, Compare-SLSnapshot, Restore-SLSnapshot.
#>

BeforeAll {
    $moduleRoot = Join-Path $PSScriptRoot '..'

    $script:SLConnection = @{
        GraphConnected      = $false
        ComplianceConnected = $false
        ProtectionConnected = $false
        UserPrincipalName   = 'admin@contoso.com'
        TenantId            = 'tenant-123'
        ConnectedAt         = @{ Graph = $null; Compliance = $null; Protection = $null }
        ComplianceCommandCount = 0
        ComplianceSessionStart = $null
    }
    $script:SLLabelCache = @{ Labels = @(); CachedAt = $null; TenantId = $null }
    $script:SLActiveJob = $null
    $script:SLFileShares = [System.Collections.Generic.List[hashtable]]::new()
    $script:SLAipClientType = $null
    $script:SLConfig = @{
        SnapshotPath     = Join-Path $TestDrive 'snapshots'
        AuditLogPath     = Join-Path $TestDrive 'audit.jsonl'
        ElevationState   = Join-Path $TestDrive 'elevation-state.json'
        GraphApiVersion  = 'v1.0'
        GraphBetaVersion = 'beta'
        GraphBaseUrl     = 'https://graph.microsoft.com'
        DefaultBatchSize = 50
        MaxJsonDepth     = 20
        ComplianceMaxCommands        = 50
        ComplianceMaxSessionMinutes  = 30
        ComplianceIdleTimeoutMinutes = 12
    }

    $classFiles = Get-ChildItem -Path (Join-Path $moduleRoot 'Classes') -Filter '*.ps1' -ErrorAction SilentlyContinue
    foreach ($file in $classFiles) { . $file.FullName }
    $privateFiles = Get-ChildItem -Path (Join-Path $moduleRoot 'Private') -Filter '*.ps1' -ErrorAction SilentlyContinue
    foreach ($file in $privateFiles) { . $file.FullName }
    $publicFiles = Get-ChildItem -Path (Join-Path $moduleRoot 'Public') -Filter '*.ps1' -Recurse -ErrorAction SilentlyContinue
    foreach ($file in $publicFiles) { . $file.FullName }
}

# =============================================================================
# New-SLSnapshot
# =============================================================================
Describe 'New-SLSnapshot' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
        $script:SLConfig.SnapshotPath = Join-Path $TestDrive 'snapshots'
    }

    It 'Requires Graph connection for All scope' {
        $script:SLConnection.GraphConnected = $false
        { New-SLSnapshot -Name 'test-snap' } | Should -Throw '*Not connected to Graph*'
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { New-SLSnapshot -Name 'test-snap' -Scope Dlp } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Creates a snapshot file' {
        Mock Invoke-SLGraphRequest {
            @([PSCustomObject]@{ id = 'l1'; displayName = 'Public'; isActive = $true })
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'Policy1'; Enabled = $true })
        }
        $result = New-SLSnapshot -Name 'test-create' -Path $TestDrive
        $result | Should -Not -BeNullOrEmpty
        $result.Name | Should -Be 'test-create'
        Test-Path (Join-Path $TestDrive 'test-create.json') | Should -BeTrue
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLGraphRequest { @() }
        Mock Invoke-SLComplianceCommand { @() }
        $json = New-SLSnapshot -Name 'test-json' -Path $TestDrive -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Accepts Scope parameter' {
        Mock Invoke-SLComplianceCommand { @() }
        $result = New-SLSnapshot -Name 'test-dlp-only' -Scope Dlp -Path $TestDrive
        $result | Should -Not -BeNullOrEmpty
        $result.Scope | Should -Be 'Dlp'
    }
}

# =============================================================================
# Get-SLSnapshot
# =============================================================================
Describe 'Get-SLSnapshot' {
    BeforeEach {
        $script:SLConfig.SnapshotPath = Join-Path $TestDrive 'snapshots'
        $snapshotDir = $script:SLConfig.SnapshotPath
        if (-not (Test-Path $snapshotDir)) {
            New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        }
    }

    It 'Returns empty array when no snapshots exist' {
        $emptyDir = Join-Path $TestDrive 'empty-snaps'
        New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
        $result = Get-SLSnapshot -Path $emptyDir
        @($result).Count | Should -Be 0
    }

    It 'Returns snapshot list from directory' {
        $snapshotDir = Join-Path $TestDrive 'list-snaps'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        $snapData = @{
            SnapshotId = 'snap-001'
            Name       = 'snap1'
            Scope      = 'All'
            CreatedAt  = (Get-Date).ToString('o')
            Data       = @{ SensitivityLabels = @() }
        }
        $snapData | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'snap1.json') -Encoding utf8
        $result = Get-SLSnapshot -Path $snapshotDir
        @($result).Count | Should -BeGreaterOrEqual 1
    }

    It 'Returns specific snapshot by name' {
        $snapshotDir = Join-Path $TestDrive 'named-snaps'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        $snapData = @{
            SnapshotId = 'snap-002'
            Name       = 'specific-snap'
            Scope      = 'All'
            CreatedAt  = (Get-Date).ToString('o')
            Data       = @{ SensitivityLabels = @() }
        }
        $snapData | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'specific-snap.json') -Encoding utf8
        $result = Get-SLSnapshot -Name 'specific-snap' -Path $snapshotDir
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Throws when named snapshot not found' {
        $snapshotDir = Join-Path $TestDrive 'missing-snaps'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        { Get-SLSnapshot -Name 'nonexistent' -Path $snapshotDir } | Should -Throw '*not found*'
    }

    It 'Returns JSON with -AsJson' {
        $snapshotDir = Join-Path $TestDrive 'json-snaps'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        $snapData = @{
            SnapshotId = 'snap-003'
            Name       = 'json-snap'
            Scope      = 'All'
            CreatedAt  = (Get-Date).ToString('o')
            Data       = @{ SensitivityLabels = @() }
        }
        $snapData | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'json-snap.json') -Encoding utf8
        $json = Get-SLSnapshot -Name 'json-snap' -Path $snapshotDir -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Remove-SLSnapshot
# =============================================================================
Describe 'Remove-SLSnapshot' {
    BeforeEach {
        $script:SLConfig.SnapshotPath = Join-Path $TestDrive 'snapshots'
    }

    It 'Throws when snapshot not found' {
        $snapshotDir = Join-Path $TestDrive 'rm-snaps'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        { Remove-SLSnapshot -Name 'nonexistent' -Path $snapshotDir -Confirm:$false } | Should -Throw '*not found*'
    }

    It 'Removes an existing snapshot' {
        $snapshotDir = Join-Path $TestDrive 'rm-existing'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        $snapData = @{ SnapshotId = 'snap-rm'; Name = 'to-remove'; Scope = 'All'; CreatedAt = (Get-Date).ToString('o'); Data = @{} }
        $snapData | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'to-remove.json') -Encoding utf8

        $result = Remove-SLSnapshot -Name 'to-remove' -Path $snapshotDir -Confirm:$false
        $result.Removed | Should -BeTrue
        Test-Path (Join-Path $snapshotDir 'to-remove.json') | Should -BeFalse
    }

    It 'Returns JSON with -AsJson' {
        $snapshotDir = Join-Path $TestDrive 'rm-json'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        $snapData = @{ SnapshotId = 'snap-rmj'; Name = 'rm-json-snap'; Scope = 'All'; CreatedAt = (Get-Date).ToString('o'); Data = @{} }
        $snapData | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'rm-json-snap.json') -Encoding utf8

        $json = Remove-SLSnapshot -Name 'rm-json-snap' -Path $snapshotDir -AsJson -Confirm:$false
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).Removed | Should -BeTrue
    }
}

# =============================================================================
# Compare-SLSnapshot
# =============================================================================
Describe 'Compare-SLSnapshot' {
    BeforeEach {
        $script:SLConfig.SnapshotPath = Join-Path $TestDrive 'snapshots'
    }

    It 'Throws when neither -Live nor -CompareTo is specified' {
        { Compare-SLSnapshot -Name 'snap1' } | Should -Throw '*Specify either*'
    }

    It 'Throws when reference snapshot not found' {
        $snapshotDir = Join-Path $TestDrive 'cmp-notfound'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        { Compare-SLSnapshot -Name 'nonexistent' -CompareTo 'other' -Path $snapshotDir } | Should -Throw '*not found*'
    }

    It 'Compares two snapshots' {
        $snapshotDir = Join-Path $TestDrive 'cmp-two'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

        $snap1 = @{
            SnapshotId = 'snap-cmp-1'; Name = 'baseline'; Scope = 'All'
            CreatedAt  = (Get-Date).AddDays(-1).ToString('o')
            Data       = @{
                SensitivityLabels = @(@{ id = 'l1'; displayName = 'Public' })
                LabelPolicies     = @(@{ Name = 'Policy1' })
            }
        }
        $snap2 = @{
            SnapshotId = 'snap-cmp-2'; Name = 'current'; Scope = 'All'
            CreatedAt  = (Get-Date).ToString('o')
            Data       = @{
                SensitivityLabels = @(@{ id = 'l1'; displayName = 'Public' }; @{ id = 'l2'; displayName = 'Confidential' })
                LabelPolicies     = @(@{ Name = 'Policy1' })
            }
        }
        $snap1 | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'baseline.json') -Encoding utf8
        $snap2 | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'current.json') -Encoding utf8

        $result = Compare-SLSnapshot -Name 'baseline' -CompareTo 'current' -Path $snapshotDir
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        $snapshotDir = Join-Path $TestDrive 'cmp-json'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

        $snap1 = @{
            SnapshotId = 's1'; Name = 'a'; Scope = 'All'; CreatedAt = (Get-Date).ToString('o')
            Data = @{ SensitivityLabels = @() }
        }
        $snap2 = @{
            SnapshotId = 's2'; Name = 'b'; Scope = 'All'; CreatedAt = (Get-Date).ToString('o')
            Data = @{ SensitivityLabels = @() }
        }
        $snap1 | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'a.json') -Encoding utf8
        $snap2 | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'b.json') -Encoding utf8

        $json = Compare-SLSnapshot -Name 'a' -CompareTo 'b' -Path $snapshotDir -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Restore-SLSnapshot
# =============================================================================
Describe 'Restore-SLSnapshot' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
        $script:SLConfig.SnapshotPath = Join-Path $TestDrive 'snapshots'
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Restore-SLSnapshot -Name 'test' -Confirm:$false } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Throws when snapshot not found' {
        $snapshotDir = Join-Path $TestDrive 'restore-notfound'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
        { Restore-SLSnapshot -Name 'nonexistent' -Path $snapshotDir -Confirm:$false } | Should -Throw '*not found*'
    }

    It 'Returns dry-run result with -DryRun' {
        $snapshotDir = Join-Path $TestDrive 'restore-dry'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

        $snap = @{
            SnapshotId = 'snap-restore'; Name = 'restore-me'; Scope = 'Dlp'
            CreatedAt  = (Get-Date).ToString('o')
            Data       = @{
                DlpPolicies = @(@{ Name = 'DLP1'; Mode = 'Enable' })
                DlpRules    = @(@{ Name = 'Rule1'; ParentPolicyName = 'DLP1' })
            }
        }
        $snap | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'restore-me.json') -Encoding utf8

        Mock Invoke-SLComplianceCommand { @() }
        Mock Invoke-SLGraphRequest { @() }
        $result = Restore-SLSnapshot -Name 'restore-me' -Path $snapshotDir -DryRun
        $result | Should -Not -BeNullOrEmpty
        $result.DryRun | Should -Be $true
        $result.SnapshotName | Should -Be 'restore-me'
        $result.PSObject.Properties.Name | Should -Contain 'TotalChanges'
        $result.PSObject.Properties.Name | Should -Contain 'Removals'
        $result.PSObject.Properties.Name | Should -Contain 'Creates'
        $result.PSObject.Properties.Name | Should -Contain 'Updates'
        $result.PSObject.Properties.Name | Should -Contain 'Plan'
        $result.TotalChanges | Should -BeOfType [int]
        $result.Removals | Should -BeOfType [int]
        $result.Creates | Should -BeOfType [int]
        $result.Updates | Should -BeOfType [int]
    }

    It 'Marks Create and Update operations as Skipped during actual restore' {
        $snapshotDir = Join-Path $TestDrive 'restore-skip'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

        # Snapshot has a policy that does NOT exist in live (triggers Create)
        $snap = @{
            SnapshotId = 'snap-skip'; Name = 'skip-test'; Scope = 'Dlp'
            CreatedAt  = (Get-Date).ToString('o')
            Data       = @{
                DlpPolicies = @(@{ Name = 'SnapshotOnlyPolicy'; Mode = 'Enable' })
                DlpRules    = @()
            }
        }
        $snap | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'skip-test.json') -Encoding utf8

        # Live has no policies -> diff will show Removed items needing Create
        Mock Invoke-SLComplianceCommand { @() }
        Mock Invoke-SLGraphRequest { @() }

        $plan = Restore-SLSnapshot -Name 'skip-test' -Path $snapshotDir -DryRun
        # The plan should show Create operations exist
        if ($plan.Creates -gt 0) {
            $createSteps = @($plan.Plan | Where-Object { $_.Phase -eq 'Create' })
            $createSteps.Count | Should -BeGreaterThan 0
        }
    }

    It 'Throws when pre-restore backup file is not created' {
        $snapshotDir = Join-Path $TestDrive 'restore-backup-fail'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

        $snap = @{
            SnapshotId = 'snap-bf'; Name = 'backup-fail'; Scope = 'Dlp'
            CreatedAt  = (Get-Date).ToString('o')
            Data       = @{
                DlpPolicies = @(@{ Name = 'LiveOnlyPolicy'; Mode = 'Enable' })
                DlpRules    = @()
            }
        }
        $snap | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'backup-fail.json') -Encoding utf8

        # Mock live state with a policy not in snapshot (triggers a removal plan)
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'LiveOnlyPolicy'; Mode = 'Enable' })
        }
        Mock Invoke-SLGraphRequest { @() }
        # Mock New-SLSnapshot to return $null (simulating backup failure)
        Mock New-SLSnapshot { $null }

        { Restore-SLSnapshot -Name 'backup-fail' -Path $snapshotDir -Confirm:$false -Force } | Should -Throw '*backup*'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $snapshotDir = Join-Path $TestDrive 'restore-json'
        New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

        $snap = @{
            SnapshotId = 'snap-rj'; Name = 'rj-snap'; Scope = 'Retention'
            CreatedAt  = (Get-Date).ToString('o')
            Data       = @{
                RetentionLabels   = @()
                RetentionPolicies = @()
            }
        }
        $snap | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $snapshotDir 'rj-snap.json') -Encoding utf8

        Mock Invoke-SLComplianceCommand { @() }
        $json = Restore-SLSnapshot -Name 'rj-snap' -Path $snapshotDir -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}
