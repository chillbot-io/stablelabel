#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel reporting functions: Get-SLAuditLog.
#>

BeforeAll {
    $moduleRoot = Join-Path $PSScriptRoot '..'

    $script:SLConnection = @{
        GraphConnected      = $false
        ComplianceConnected = $false
        UserPrincipalName   = 'admin@contoso.com'
        TenantId            = 'tenant-123'
        ConnectedAt         = @{ Graph = $null; Compliance = $null }
        ComplianceCommandCount = 0
        ComplianceSessionStart = $null
    }
    $script:SLLabelCache = @{ Labels = @(); CachedAt = $null; TenantId = $null }
    $script:SLActiveJob = $null
    $script:SLConfig = @{
        SnapshotPath     = Join-Path $HOME '.stablelabel' 'snapshots'
        AuditLogPath     = Join-Path $TestDrive 'audit.jsonl'
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
# Get-SLAuditLog
# =============================================================================
Describe 'Get-SLAuditLog' {
    BeforeEach {
        $script:SLConfig.AuditLogPath = Join-Path $TestDrive 'audit.jsonl'
    }

    It 'Returns empty array when audit log does not exist' {
        $script:SLConfig.AuditLogPath = Join-Path $TestDrive 'nonexistent-audit.jsonl'
        $result = Get-SLAuditLog -WarningAction SilentlyContinue
        @($result).Count | Should -Be 0
    }

    It 'Returns audit log entries' {
        $logPath = $script:SLConfig.AuditLogPath
        $entries = @(
            (@{ Timestamp = (Get-Date).AddMinutes(-2).ToString('o'); Action = 'New-DlpCompliancePolicy'; Target = 'PII Policy'; Result = 'success' } | ConvertTo-Json -Compress),
            (@{ Timestamp = (Get-Date).AddMinutes(-1).ToString('o'); Action = 'Set-LabelPolicy'; Target = 'Global Policy'; Result = 'success' } | ConvertTo-Json -Compress),
            (@{ Timestamp = (Get-Date).ToString('o'); Action = 'Remove-LabelPolicy'; Target = 'Old Policy'; Result = 'dry-run' } | ConvertTo-Json -Compress)
        )
        $entries | Out-File -FilePath $logPath -Encoding utf8
        $result = Get-SLAuditLog
        @($result).Count | Should -Be 3
    }

    It 'Limits entries with -Last' {
        $logPath = $script:SLConfig.AuditLogPath
        $entries = @(
            (@{ Timestamp = (Get-Date).AddMinutes(-3).ToString('o'); Action = 'Action1'; Result = 'success' } | ConvertTo-Json -Compress),
            (@{ Timestamp = (Get-Date).AddMinutes(-2).ToString('o'); Action = 'Action2'; Result = 'success' } | ConvertTo-Json -Compress),
            (@{ Timestamp = (Get-Date).AddMinutes(-1).ToString('o'); Action = 'Action3'; Result = 'success' } | ConvertTo-Json -Compress)
        )
        $entries | Out-File -FilePath $logPath -Encoding utf8
        $result = Get-SLAuditLog -Last 2
        @($result).Count | Should -Be 2
    }

    It 'Filters by Action' {
        $logPath = $script:SLConfig.AuditLogPath
        $entries = @(
            (@{ Timestamp = (Get-Date).AddMinutes(-2).ToString('o'); Action = 'New-DlpCompliancePolicy'; Result = 'success' } | ConvertTo-Json -Compress),
            (@{ Timestamp = (Get-Date).AddMinutes(-1).ToString('o'); Action = 'Set-LabelPolicy'; Result = 'success' } | ConvertTo-Json -Compress)
        )
        $entries | Out-File -FilePath $logPath -Encoding utf8
        $result = Get-SLAuditLog -Action 'New-DlpCompliancePolicy'
        @($result).Count | Should -Be 1
        $result.Action | Should -Be 'New-DlpCompliancePolicy'
    }

    It 'Filters by Result' {
        $logPath = $script:SLConfig.AuditLogPath
        $entries = @(
            (@{ Timestamp = (Get-Date).AddMinutes(-2).ToString('o'); Action = 'Action1'; Result = 'success' } | ConvertTo-Json -Compress),
            (@{ Timestamp = (Get-Date).AddMinutes(-1).ToString('o'); Action = 'Action2'; Result = 'dry-run' } | ConvertTo-Json -Compress)
        )
        $entries | Out-File -FilePath $logPath -Encoding utf8
        $result = Get-SLAuditLog -Result 'dry-run'
        @($result).Count | Should -Be 1
        $result.Result | Should -Be 'dry-run'
    }

    It 'Returns JSON with -AsJson' {
        $logPath = $script:SLConfig.AuditLogPath
        $entries = @(
            (@{ Timestamp = (Get-Date).ToString('o'); Action = 'Test'; Result = 'success' } | ConvertTo-Json -Compress)
        )
        $entries | Out-File -FilePath $logPath -Encoding utf8
        $json = Get-SLAuditLog -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}
