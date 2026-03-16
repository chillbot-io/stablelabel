#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel public functions.
#>

BeforeAll {
    $moduleRoot = Join-Path $PSScriptRoot '..'

    $script:SLConnection = @{
        GraphConnected      = $false
        ComplianceConnected = $false
        ProtectionConnected = $false
        UserPrincipalName   = $null
        TenantId            = $null
        ConnectedAt         = @{ Graph = $null; Compliance = $null; Protection = $null }
        ComplianceCommandCount = 0
        ComplianceSessionStart = $null
    }
    $script:SLLabelCache = @{ Labels = @(); CachedAt = $null; TenantId = $null }
    $script:SLActiveJob = $null
    $script:SLFileShares = [System.Collections.Generic.List[hashtable]]::new()
    $script:SLAipClientType = $null
    $script:SLConfig = @{
        SnapshotPath     = Join-Path $HOME '.stablelabel' 'snapshots'
        AuditLogPath     = Join-Path $HOME '.stablelabel' 'audit.jsonl'
        ElevationState   = Join-Path $HOME '.stablelabel' 'elevation-state.json'
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
# Connection Functions
# =============================================================================
Describe 'Connect-SLGraph' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $false
        $script:SLConnection.UserPrincipalName = $null
        $script:SLConnection.TenantId = $null
    }

    It 'Sets GraphConnected to true on success' {
        Mock Connect-MgGraph { }
        Mock Get-MgContext { [PSCustomObject]@{ Account = 'user@contoso.com'; TenantId = 'tenant-abc' } }

        $result = Connect-SLGraph
        $script:SLConnection.GraphConnected | Should -BeTrue
        $result.Status | Should -Be 'Connected'
        $result.Backend | Should -Be 'Graph'
    }

    It 'Stores UserPrincipalName and TenantId' {
        Mock Connect-MgGraph { }
        Mock Get-MgContext { [PSCustomObject]@{ Account = 'admin@contoso.com'; TenantId = 'tenant-123' } }

        $null = Connect-SLGraph
        $script:SLConnection.UserPrincipalName | Should -Be 'admin@contoso.com'
        $script:SLConnection.TenantId | Should -Be 'tenant-123'
    }

    It 'Returns JSON when -AsJson is used' {
        Mock Connect-MgGraph { }
        Mock Get-MgContext { [PSCustomObject]@{ Account = 'user@contoso.com'; TenantId = 'tid' } }

        $json = Connect-SLGraph -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).Status | Should -Be 'Connected'
    }

    It 'Merges additional scopes' {
        Mock Connect-MgGraph { } -Verifiable
        Mock Get-MgContext { [PSCustomObject]@{ Account = 'u@c.com'; TenantId = 't' } }

        $null = Connect-SLGraph -Scopes 'Mail.Read'
        Should -InvokeVerifiable
    }

    It 'Sets GraphConnected to false on failure' {
        Mock Connect-MgGraph { throw 'Auth failed' }

        { Connect-SLGraph } | Should -Throw '*Auth failed*'
        $script:SLConnection.GraphConnected | Should -BeFalse
    }

    It 'Passes TenantId when specified' {
        Mock Connect-MgGraph { } -ParameterFilter { $TenantId -eq 'my-tenant' }
        Mock Get-MgContext { [PSCustomObject]@{ Account = 'u@c.com'; TenantId = 'my-tenant' } }

        $result = Connect-SLGraph -TenantId 'my-tenant'
        $result.TenantId | Should -Be 'my-tenant'
    }
}

Describe 'Disconnect-SLGraph' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.UserPrincipalName = 'user@contoso.com'
        $script:SLConnection.TenantId = 'tenant-123'
        $script:SLConnection.ConnectedAt.Graph = [datetime]::UtcNow
    }

    It 'Clears connection state' {
        Mock Disconnect-MgGraph { }

        $result = Disconnect-SLGraph
        $script:SLConnection.GraphConnected | Should -BeFalse
        $script:SLConnection.UserPrincipalName | Should -BeNullOrEmpty
        $script:SLConnection.TenantId | Should -BeNullOrEmpty
        $result.Status | Should -Be 'Disconnected'
    }

    It 'Returns JSON when -AsJson is used' {
        Mock Disconnect-MgGraph { }

        $json = Disconnect-SLGraph -AsJson
        ($json | ConvertFrom-Json).Backend | Should -Be 'Graph'
    }

    It 'Throws on disconnect failure' {
        Mock Disconnect-MgGraph { throw 'Disconnect failed' }
        { Disconnect-SLGraph } | Should -Throw '*Disconnect failed*'
    }
}

Describe 'Connect-SLCompliance' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $false
        $script:SLConnection.ComplianceCommandCount = 0
        $script:SLConnection.ComplianceSessionStart = $null
    }

    It 'Sets ComplianceConnected on success' {
        Mock Connect-IPPSSession { }

        $result = Connect-SLCompliance -UserPrincipalName 'admin@contoso.com'
        $script:SLConnection.ComplianceConnected | Should -BeTrue
        $result.Status | Should -Be 'Connected'
        $result.Backend | Should -Be 'Compliance'
    }

    It 'Resets command count and session start' {
        Mock Connect-IPPSSession { }

        $null = Connect-SLCompliance -UserPrincipalName 'admin@contoso.com'
        $script:SLConnection.ComplianceCommandCount | Should -Be 0
        $script:SLConnection.ComplianceSessionStart | Should -Not -BeNullOrEmpty
    }

    It 'Sets ComplianceConnected to false on failure' {
        Mock Connect-IPPSSession { throw 'Connection failed' }

        { Connect-SLCompliance -UserPrincipalName 'admin@contoso.com' } | Should -Throw '*Connection failed*'
        $script:SLConnection.ComplianceConnected | Should -BeFalse
    }

    It 'Returns JSON with -AsJson' {
        Mock Connect-IPPSSession { }

        $json = Connect-SLCompliance -UserPrincipalName 'admin@contoso.com' -AsJson
        ($json | ConvertFrom-Json).Backend | Should -Be 'Compliance'
    }
}

Describe 'Disconnect-SLCompliance' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceCommandCount = 15
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
    }

    It 'Clears compliance state' {
        Mock Disconnect-ExchangeOnline { }

        $result = Disconnect-SLCompliance
        $script:SLConnection.ComplianceConnected | Should -BeFalse
        $script:SLConnection.ComplianceCommandCount | Should -Be 0
        $script:SLConnection.ComplianceSessionStart | Should -BeNullOrEmpty
        $result.Status | Should -Be 'Disconnected'
    }

    It 'Throws on failure' {
        Mock Disconnect-ExchangeOnline { throw 'Error' }
        { Disconnect-SLCompliance } | Should -Throw '*Error*'
    }
}

# =============================================================================
# Labels
# =============================================================================
Describe 'Get-SLLabel' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Get-SLLabel } | Should -Throw '*Not connected to Graph*'
    }

    It 'Returns all labels' {
        Mock Invoke-SLGraphRequest {
            @(
                [PSCustomObject]@{ id = 'g1'; name = 'Confidential'; displayName = 'Confidential'; isActive = $true; parent = $null; parentLabelId = $null; tooltip = $null }
                [PSCustomObject]@{ id = 'g2'; name = 'Internal'; displayName = 'Internal'; isActive = $true; parent = $null; parentLabelId = $null; tooltip = $null }
            )
        }
        $result = Get-SLLabel
        $result | Should -HaveCount 2
    }

    It 'Returns single label by ID' {
        Mock Invoke-SLGraphRequest {
            [PSCustomObject]@{ id = 'g1'; name = 'Confidential'; displayName = 'Confidential' }
        }
        $result = Get-SLLabel -Id 'g1'
        $result.name | Should -Be 'Confidential'
    }

    It 'Returns label by Name' {
        Mock Invoke-SLGraphRequest {
            @(
                [PSCustomObject]@{ id = 'g1'; name = 'Confidential'; displayName = 'Confidential' }
                [PSCustomObject]@{ id = 'g2'; name = 'Internal'; displayName = 'Internal' }
            )
        }
        $result = Get-SLLabel -Name 'Confidential'
        $result.id | Should -Be 'g1'
    }

    It 'Warns when label name not found' {
        Mock Invoke-SLGraphRequest { @() }
        $result = Get-SLLabel -Name 'NonExistent' -WarningAction SilentlyContinue
        $result | Should -BeNullOrEmpty
    }

    It 'Builds tree hierarchy with -Tree' {
        Mock Invoke-SLGraphRequest {
            @(
                [PSCustomObject]@{ id = 'p1'; name = 'Parent'; displayName = 'Parent'; isActive = $true; parent = $null; parentLabelId = $null; tooltip = 'tip' }
                [PSCustomObject]@{ id = 'c1'; name = 'Child'; displayName = 'Child'; isActive = $true; parent = [PSCustomObject]@{ id = 'p1' }; parentLabelId = 'p1'; tooltip = $null }
            )
        }
        $result = Get-SLLabel -Tree
        $result | Should -HaveCount 1
        $result[0].SubLabels | Should -HaveCount 1
        $result[0].SubLabels[0].Name | Should -Be 'Child'
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLGraphRequest {
            @([PSCustomObject]@{ id = 'g1'; name = 'Test'; displayName = 'Test'; isActive = $true; parent = $null; parentLabelId = $null; tooltip = $null })
        }
        $json = Get-SLLabel -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# DLP
# =============================================================================
Describe 'Get-SLDlpPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLDlpPolicy } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns all DLP policies' {
        Mock Get-DlpCompliancePolicy {
            @(
                [PSCustomObject]@{ Name = 'Policy1'; Enabled = $true }
                [PSCustomObject]@{ Name = 'Policy2'; Enabled = $false }
            )
        }
        $result = Get-SLDlpPolicy
        $result | Should -HaveCount 2
    }

    It 'Returns specific policy by Identity' {
        Mock Get-DlpCompliancePolicy {
            [PSCustomObject]@{ Name = 'Credit Card Policy'; Enabled = $true }
        }
        $result = Get-SLDlpPolicy -Identity 'Credit Card Policy'
        $result.Name | Should -Be 'Credit Card Policy'
    }

    It 'Returns JSON with -AsJson' {
        Mock Get-DlpCompliancePolicy {
            @([PSCustomObject]@{ Name = 'Test'; Enabled = $true })
        }
        $json = Get-SLDlpPolicy -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Retention
# =============================================================================
Describe 'Get-SLRetentionLabel' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLRetentionLabel } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns all retention labels' {
        Mock Get-ComplianceTag {
            @(
                [PSCustomObject]@{ Name = 'FinancialRecords'; RetentionDuration = 2555 }
                [PSCustomObject]@{ Name = 'LegalHold'; RetentionDuration = 0 }
            )
        }
        $result = Get-SLRetentionLabel
        $result | Should -HaveCount 2
    }

    It 'Returns specific label by Identity' {
        Mock Get-ComplianceTag {
            [PSCustomObject]@{ Name = 'FinancialRecords'; RetentionDuration = 2555 }
        }
        $result = Get-SLRetentionLabel -Identity 'FinancialRecords'
        $result.Name | Should -Be 'FinancialRecords'
    }
}

# =============================================================================
# Templates
# =============================================================================
Describe 'Get-SLTemplate' {
    It 'Returns all built-in templates' {
        $result = Get-SLTemplate
        $result.Count | Should -BeGreaterOrEqual 5
    }

    It 'Returns Standard-Labels template by name' {
        $result = Get-SLTemplate -Name 'Standard-Labels'
        $result.Name | Should -Be 'Standard-Labels'
        $result.Type | Should -Be 'Labels'
    }

    It 'Returns GDPR-DLP template by name' {
        $result = Get-SLTemplate -Name 'GDPR-DLP'
        $result.Name | Should -Be 'GDPR-DLP'
        $result.Type | Should -Be 'DLP'
    }

    It 'Returns Healthcare-HIPAA template' {
        $result = Get-SLTemplate -Name 'Healthcare-HIPAA'
        $result.SensitiveInfoTypes | Should -Contain 'U.S. Social Security Number'
    }

    It 'Returns PCI-DSS template' {
        $result = Get-SLTemplate -Name 'PCI-DSS'
        $result.SensitiveInfoTypes | Should -Contain 'Credit Card Number'
    }

    It 'Returns PII-Protection template' {
        $result = Get-SLTemplate -Name 'PII-Protection'
        $result.Type | Should -Be 'DLP'
    }

    It 'Warns when template not found' {
        $result = Get-SLTemplate -Name 'NonExistent' -WarningAction SilentlyContinue
        $result | Should -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        $json = Get-SLTemplate -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Each template has Name, Description, and Type' {
        $templates = Get-SLTemplate
        foreach ($t in $templates) {
            $t.Name | Should -Not -BeNullOrEmpty
            $t.Description | Should -Not -BeNullOrEmpty
            $t.Type | Should -Not -BeNullOrEmpty
        }
    }
}

# =============================================================================
# Snapshots
# =============================================================================
Describe 'Get-SLSnapshot' {
    BeforeAll {
        $testSnapDir = Join-Path $TestDrive 'snapshots'
        New-Item -ItemType Directory -Path $testSnapDir -Force | Out-Null
    }

    It 'Returns empty array when snapshot directory does not exist' {
        $result = Get-SLSnapshot -Path (Join-Path $TestDrive 'nonexistent')
        $result | Should -HaveCount 0
    }

    It 'Returns "[]" as JSON when directory does not exist' {
        $result = Get-SLSnapshot -Path (Join-Path $TestDrive 'nonexistent') -AsJson
        $result | Should -Be '[]'
    }

    It 'Throws when named snapshot not found' {
        { Get-SLSnapshot -Name 'missing' -Path $testSnapDir } | Should -Throw "*not found*"
    }

    It 'Lists snapshots from directory' {
        $snap = [ordered]@{
            SnapshotId = 'sl-snap-test'
            Name       = 'test-list'
            CreatedAt  = '2024-01-01T00:00:00Z'
            CreatedBy  = 'admin@contoso.com'
            TenantId   = 'tenant-123'
            Scope      = 'All'
            Data       = @{ SensitivityLabels = @('a', 'b') }
        }
        $snap | ConvertTo-Json -Depth 10 | Out-File (Join-Path $testSnapDir 'test-list.json') -Encoding utf8

        $result = Get-SLSnapshot -Path $testSnapDir
        $result.Count | Should -BeGreaterOrEqual 1
        ($result | Where-Object { $_.Name -eq 'test-list' }) | Should -Not -BeNullOrEmpty
    }

    It 'Returns specific snapshot by name' {
        $snap = [ordered]@{
            SnapshotId = 'sl-snap-byname'
            Name       = 'specific'
            Scope      = 'Labels'
            Data       = @{}
        }
        $snap | ConvertTo-Json -Depth 10 | Out-File (Join-Path $testSnapDir 'specific.json') -Encoding utf8

        $result = Get-SLSnapshot -Name 'specific' -Path $testSnapDir
        $result.SnapshotId | Should -Be 'sl-snap-byname'
    }

    It 'Returns snapshot content as JSON with -AsJson' {
        $snap = [ordered]@{ SnapshotId = 'sl-snap-json'; Name = 'json-test'; Scope = 'All'; Data = @{} }
        $snap | ConvertTo-Json -Depth 10 | Out-File (Join-Path $testSnapDir 'json-test.json') -Encoding utf8

        $result = Get-SLSnapshot -Name 'json-test' -Path $testSnapDir -AsJson
        { $result | ConvertFrom-Json } | Should -Not -Throw
    }
}

Describe 'Remove-SLSnapshot' {
    BeforeAll {
        $testSnapDir = Join-Path $TestDrive 'remove-snaps'
        New-Item -ItemType Directory -Path $testSnapDir -Force | Out-Null
        # Mock audit entry to avoid needing full config
        $script:SLConfig.AuditLogPath = Join-Path $TestDrive 'audit-remove.jsonl'
        $script:SLConnection.UserPrincipalName = 'admin@contoso.com'
        $script:SLConnection.TenantId = 'tenant-123'
    }

    It 'Throws when snapshot not found' {
        { Remove-SLSnapshot -Name 'missing' -Path $testSnapDir -Confirm:$false } | Should -Throw '*not found*'
    }

    It 'Removes an existing snapshot' {
        $snapFile = Join-Path $testSnapDir 'to-remove.json'
        '{}' | Out-File $snapFile -Encoding utf8

        $result = Remove-SLSnapshot -Name 'to-remove' -Path $testSnapDir -Confirm:$false
        $result.Removed | Should -BeTrue
        Test-Path $snapFile | Should -BeFalse
    }
}

# =============================================================================
# Elevation
# =============================================================================
Describe 'Get-SLElevationStatus' {
    It 'Returns empty state when file does not exist' {
        $script:SLConfig.ElevationState = Join-Path $TestDrive 'nonexistent-elevation.json'

        $result = Get-SLElevationStatus
        $result.Exists | Should -BeFalse
        $result.StatePath | Should -Be (Join-Path $TestDrive 'nonexistent-elevation.json')
    }

    It 'Reads existing elevation state file' {
        $statePath = Join-Path $TestDrive 'elevation-state.json'
        @{ ActiveJobs = @() } | ConvertTo-Json | Out-File $statePath -Encoding utf8
        $script:SLConfig.ElevationState = $statePath

        $result = Get-SLElevationStatus
        $result.Exists | Should -BeTrue
    }

    It 'Returns JSON with -AsJson' {
        $script:SLConfig.ElevationState = Join-Path $TestDrive 'nonexistent-elevation2.json'
        $json = Get-SLElevationStatus -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Audit Log
# =============================================================================
Describe 'Get-SLAuditLog' {
    BeforeAll {
        $testAuditPath = Join-Path $TestDrive 'audit-read.jsonl'
    }

    BeforeEach {
        $script:SLConfig.AuditLogPath = $testAuditPath
        $script:SLConfig.MaxJsonDepth = 20
        if (Test-Path $testAuditPath) { Remove-Item $testAuditPath -Force }
    }

    It 'Returns empty array when audit log does not exist' {
        $script:SLConfig.AuditLogPath = Join-Path $TestDrive 'nonexistent-audit.jsonl'
        $result = Get-SLAuditLog -WarningAction SilentlyContinue
        $result | Should -HaveCount 0
    }

    It 'Returns "[]" as JSON when audit log does not exist' {
        $script:SLConfig.AuditLogPath = Join-Path $TestDrive 'nonexistent-audit2.jsonl'
        $result = Get-SLAuditLog -AsJson -WarningAction SilentlyContinue
        $result | Should -Be '[]'
    }

    It 'Reads entries from the audit log' {
        $entries = @(
            @{ Timestamp = '2024-01-01T00:00:00Z'; Action = 'Set-Label'; Target = 'doc.docx'; Result = 'success' }
            @{ Timestamp = '2024-01-01T01:00:00Z'; Action = 'New-Policy'; Target = 'policy1'; Result = 'success' }
        )
        foreach ($e in $entries) {
            ($e | ConvertTo-Json -Compress) | Out-File $testAuditPath -Append -Encoding utf8
        }

        $result = Get-SLAuditLog
        $result | Should -HaveCount 2
    }

    It 'Filters by -Action' {
        $entries = @(
            @{ Timestamp = '2024-01-01T00:00:00Z'; Action = 'Set-Label'; Result = 'success' }
            @{ Timestamp = '2024-01-01T01:00:00Z'; Action = 'New-Policy'; Result = 'success' }
            @{ Timestamp = '2024-01-01T02:00:00Z'; Action = 'Set-Label'; Result = 'failed' }
        )
        foreach ($e in $entries) {
            ($e | ConvertTo-Json -Compress) | Out-File $testAuditPath -Append -Encoding utf8
        }

        $result = Get-SLAuditLog -Action 'Set-Label'
        $result | Should -HaveCount 2
    }

    It 'Filters by -Result' {
        $entries = @(
            @{ Timestamp = '2024-01-01T00:00:00Z'; Action = 'Test'; Result = 'success' }
            @{ Timestamp = '2024-01-01T01:00:00Z'; Action = 'Test'; Result = 'failed' }
            @{ Timestamp = '2024-01-01T02:00:00Z'; Action = 'Test'; Result = 'success' }
        )
        foreach ($e in $entries) {
            ($e | ConvertTo-Json -Compress) | Out-File $testAuditPath -Append -Encoding utf8
        }

        $result = Get-SLAuditLog -Result 'failed'
        $result | Should -HaveCount 1
    }

    It 'Respects -Last limit' {
        for ($i = 1; $i -le 10; $i++) {
            (@{ Timestamp = "2024-01-01T0${i}:00:00Z"; Action = "Action$i"; Result = 'success' } | ConvertTo-Json -Compress) |
                Out-File $testAuditPath -Append -Encoding utf8
        }

        $result = Get-SLAuditLog -Last 3
        $result | Should -HaveCount 3
    }

    It 'Sorts newest first' {
        $entries = @(
            @{ Timestamp = '2024-01-01T00:00:00Z'; Action = 'First'; Result = 'success' }
            @{ Timestamp = '2024-01-03T00:00:00Z'; Action = 'Third'; Result = 'success' }
            @{ Timestamp = '2024-01-02T00:00:00Z'; Action = 'Second'; Result = 'success' }
        )
        foreach ($e in $entries) {
            ($e | ConvertTo-Json -Compress) | Out-File $testAuditPath -Append -Encoding utf8
        }

        $result = Get-SLAuditLog
        $result[0].Action | Should -Be 'Third'
    }

    It 'Returns JSON with -AsJson' {
        (@{ Timestamp = '2024-01-01T00:00:00Z'; Action = 'Test'; Result = 'success' } | ConvertTo-Json -Compress) |
            Out-File $testAuditPath -Encoding utf8

        $json = Get-SLAuditLog -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Skips malformed lines' {
        @(
            '{"Timestamp":"2024-01-01T00:00:00Z","Action":"Good","Result":"success"}'
            'not valid json'
            '{"Timestamp":"2024-01-01T01:00:00Z","Action":"AlsoGood","Result":"success"}'
        ) | Out-File $testAuditPath -Encoding utf8

        $result = Get-SLAuditLog
        $result | Should -HaveCount 2
    }
}

# =============================================================================
# Documents
# =============================================================================
Describe 'Get-SLDocumentLabel' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Get-SLDocumentLabel -DriveId 'drive1' -ItemId 'item1' } | Should -Throw '*Not connected to Graph*'
    }

    It 'Calls extractSensitivityLabels endpoint' {
        Mock Invoke-SLGraphRequest {
            [PSCustomObject]@{ labels = @(@{ sensitivityLabelId = 'label-1'; name = 'Confidential' }) }
        }
        $result = Get-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF'
        $result.labels | Should -HaveCount 1
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLGraphRequest {
            [PSCustomObject]@{ labels = @() }
        }
        $json = Get-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Compare-SLSnapshot
# =============================================================================
Describe 'Compare-SLSnapshot' {
    BeforeAll {
        $testSnapDir = Join-Path $TestDrive 'compare-snaps'
        New-Item -ItemType Directory -Path $testSnapDir -Force | Out-Null
    }

    It 'Throws when neither -Live nor -CompareTo is specified' {
        { Compare-SLSnapshot -Name 'test' -Path $testSnapDir } | Should -Throw '*Specify either*'
    }

    It 'Throws when reference snapshot not found' {
        { Compare-SLSnapshot -Name 'nonexistent' -CompareTo 'other' -Path $testSnapDir } | Should -Throw '*not found*'
    }

    It 'Throws when comparison snapshot not found' {
        $ref = [ordered]@{ SnapshotId = 'ref-1'; Scope = 'All'; Data = @{ SensitivityLabels = @() } }
        $ref | ConvertTo-Json -Depth 10 | Out-File (Join-Path $testSnapDir 'ref.json') -Encoding utf8

        { Compare-SLSnapshot -Name 'ref' -CompareTo 'nonexistent' -Path $testSnapDir } | Should -Throw '*not found*'
    }

    It 'Detects no changes between identical snapshots' {
        $data = @{
            SensitivityLabels = @([PSCustomObject]@{ id = 'l1'; name = 'Label1' })
            DlpPolicies = @()
        }
        $snap = [ordered]@{ SnapshotId = 'snap-a'; Scope = 'All'; Data = $data }
        $snapJson = $snap | ConvertTo-Json -Depth 20
        $snapJson | Out-File (Join-Path $testSnapDir 'snapA.json') -Encoding utf8
        $snapJson | Out-File (Join-Path $testSnapDir 'snapB.json') -Encoding utf8

        $result = Compare-SLSnapshot -Name 'snapA' -CompareTo 'snapB' -Path $testSnapDir
        $result.HasChanges | Should -BeFalse
    }

    It 'Detects added items' {
        $snapRef = [ordered]@{ SnapshotId = 'r1'; Scope = 'All'; Data = @{ SensitivityLabels = @() } }
        $snapComp = [ordered]@{ SnapshotId = 'c1'; Scope = 'All'; Data = @{ SensitivityLabels = @([PSCustomObject]@{ id = 'new1'; name = 'NewLabel' }) } }

        $snapRef | ConvertTo-Json -Depth 20 | Out-File (Join-Path $testSnapDir 'added-ref.json') -Encoding utf8
        $snapComp | ConvertTo-Json -Depth 20 | Out-File (Join-Path $testSnapDir 'added-comp.json') -Encoding utf8

        $result = Compare-SLSnapshot -Name 'added-ref' -CompareTo 'added-comp' -Path $testSnapDir
        $result.HasChanges | Should -BeTrue
        $result.Categories.SensitivityLabels.Summary.AddedCount | Should -Be 1
    }

    It 'Detects removed items' {
        $snapRef = [ordered]@{ SnapshotId = 'r2'; Scope = 'All'; Data = @{ SensitivityLabels = @([PSCustomObject]@{ id = 'old1'; name = 'OldLabel' }) } }
        $snapComp = [ordered]@{ SnapshotId = 'c2'; Scope = 'All'; Data = @{ SensitivityLabels = @() } }

        $snapRef | ConvertTo-Json -Depth 20 | Out-File (Join-Path $testSnapDir 'removed-ref.json') -Encoding utf8
        $snapComp | ConvertTo-Json -Depth 20 | Out-File (Join-Path $testSnapDir 'removed-comp.json') -Encoding utf8

        $result = Compare-SLSnapshot -Name 'removed-ref' -CompareTo 'removed-comp' -Path $testSnapDir
        $result.HasChanges | Should -BeTrue
        $result.Categories.SensitivityLabels.Summary.RemovedCount | Should -Be 1
    }
}
