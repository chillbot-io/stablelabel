#Requires -Modules Pester

<#
.SYNOPSIS
    Pester tests for the StableLabel PowerShell module.
.DESCRIPTION
    Tests private helper functions and public functions using mocked backends.
    Run with: Invoke-Pester ./StableLabel/Tests/
#>

BeforeAll {
    # Dot-source the module loader to get all functions in scope
    $moduleRoot = Join-Path $PSScriptRoot '..'

    # Initialize module-scoped variables (same as StableLabel.psm1)
    $script:SLConnection = @{
        GraphConnected      = $false
        ComplianceConnected = $false
        ProtectionConnected = $false
        UserPrincipalName   = $null
        TenantId            = $null
        ConnectedAt         = @{
            Graph      = $null
            Compliance = $null
            Protection = $null
        }
        ComplianceCommandCount = 0
        ComplianceSessionStart = $null
    }

    $script:SLLabelCache = @{
        Labels    = @()
        CachedAt  = $null
        TenantId  = $null
    }

    $script:SLActiveJob = $null
    $script:SLFileShares = [System.Collections.Generic.List[hashtable]]::new()
    $script:SLAipClientType = $null

    $script:SLConfig = @{
        SnapshotPath    = Join-Path $HOME '.stablelabel' 'snapshots'
        AuditLogPath    = Join-Path $HOME '.stablelabel' 'audit.jsonl'
        ElevationState  = Join-Path $HOME '.stablelabel' 'elevation-state.json'
        GraphApiVersion = 'v1.0'
        GraphBetaVersion = 'beta'
        GraphBaseUrl    = 'https://graph.microsoft.com'
        DefaultBatchSize = 50
        MaxJsonDepth    = 20
        ComplianceMaxCommands     = 50
        ComplianceMaxSessionMinutes = 30
        ComplianceIdleTimeoutMinutes = 12
    }

    # Load classes
    $classFiles = Get-ChildItem -Path (Join-Path $moduleRoot 'Classes') -Filter '*.ps1' -ErrorAction SilentlyContinue
    foreach ($file in $classFiles) {
        . $file.FullName
    }

    # Load private functions
    $privateFiles = Get-ChildItem -Path (Join-Path $moduleRoot 'Private') -Filter '*.ps1' -ErrorAction SilentlyContinue
    foreach ($file in $privateFiles) {
        . $file.FullName
    }

    # Load public functions
    $publicPath = Join-Path $moduleRoot 'Public'
    $publicFiles = Get-ChildItem -Path $publicPath -Filter '*.ps1' -Recurse -ErrorAction SilentlyContinue
    foreach ($file in $publicFiles) {
        . $file.FullName
    }
}

Describe 'Module Manifest' {
    It 'Manifest is valid' {
        $manifest = Join-Path $PSScriptRoot '..' 'StableLabel.psd1'
        { Test-ModuleManifest -Path $manifest } | Should -Not -Throw
    }

    It 'Exports more than 50 functions' {
        $manifest = Test-ModuleManifest -Path (Join-Path $PSScriptRoot '..' 'StableLabel.psd1')
        $manifest.ExportedFunctions.Count | Should -BeGreaterThan 50
    }

    It 'Requires PowerShell 7.0' {
        $manifest = Test-ModuleManifest -Path (Join-Path $PSScriptRoot '..' 'StableLabel.psd1')
        $manifest.PowerShellVersion | Should -Be '7.0'
    }

    It 'Version is 0.1.0' {
        $manifest = Test-ModuleManifest -Path (Join-Path $PSScriptRoot '..' 'StableLabel.psd1')
        $manifest.Version.ToString() | Should -Be '0.1.0'
    }
}

Describe 'Test-SLFileTypeSupported' {
    It 'Recognizes .docx as supported' {
        $result = Test-SLFileTypeSupported -FileName 'report.docx'
        $result.Supported | Should -BeTrue
        $result.Extension | Should -Be '.docx'
    }

    It 'Recognizes .xlsx as supported' {
        $result = Test-SLFileTypeSupported -FileName 'data.xlsx'
        $result.Supported | Should -BeTrue
    }

    It 'Recognizes .pdf as supported' {
        $result = Test-SLFileTypeSupported -FileName 'document.pdf'
        $result.Supported | Should -BeTrue
    }

    It 'Recognizes .pptx as supported' {
        $result = Test-SLFileTypeSupported -FileName 'slides.pptx'
        $result.Supported | Should -BeTrue
    }

    It 'Rejects .doc (legacy format)' {
        $result = Test-SLFileTypeSupported -FileName 'old.doc'
        $result.Supported | Should -BeFalse
        $result.Reason | Should -Match 'Unsupported'
    }

    It 'Rejects .txt' {
        $result = Test-SLFileTypeSupported -FileName 'notes.txt'
        $result.Supported | Should -BeFalse
    }

    It 'Rejects .exe' {
        $result = Test-SLFileTypeSupported -FileName 'app.exe'
        $result.Supported | Should -BeFalse
    }

    It 'Handles file with no extension' {
        $result = Test-SLFileTypeSupported -FileName 'README'
        $result.Supported | Should -BeFalse
        $result.Reason | Should -Match 'No file extension'
    }

    It 'Handles .vsdx (Visio) as supported' {
        $result = Test-SLFileTypeSupported -FileName 'diagram.vsdx'
        $result.Supported | Should -BeTrue
    }

    It 'Is case-insensitive for extensions' {
        $result = Test-SLFileTypeSupported -FileName 'report.DOCX'
        $result.Supported | Should -BeTrue
    }

    It 'Returns FileName in the result' {
        $result = Test-SLFileTypeSupported -FileName 'test.pdf'
        $result.FileName | Should -Be 'test.pdf'
    }
}

Describe 'Test-SLDryRun' {
    It 'Returns true when -DryRun is set' {
        $result = Test-SLDryRun -DryRun
        $result | Should -BeTrue
    }

    It 'Returns false when -DryRun is not set' {
        $result = Test-SLDryRun
        $result | Should -BeFalse
    }
}

Describe 'Assert-SLConnected' {
    BeforeEach {
        $script:SLConnection = @{
            GraphConnected      = $false
            ComplianceConnected = $false
            ProtectionConnected = $false
            UserPrincipalName   = $null
            TenantId            = $null
            ConnectedAt         = @{
                Graph      = $null
                Compliance = $null
                Protection = $null
            }
            ComplianceCommandCount = 0
            ComplianceSessionStart = $null
        }
    }

    It 'Throws when Graph is not connected' {
        { Assert-SLConnected -Require Graph } | Should -Throw '*Not connected to Graph*'
    }

    It 'Throws when Compliance is not connected' {
        { Assert-SLConnected -Require Compliance } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Throws when Protection is not connected' {
        { Assert-SLConnected -Require Protection } | Should -Throw '*Not connected to Protection*'
    }

    It 'Does not throw when Graph is connected' {
        $script:SLConnection.GraphConnected = $true
        { Assert-SLConnected -Require Graph } | Should -Not -Throw
    }

    It 'Does not throw when Compliance is connected' {
        $script:SLConnection.ComplianceConnected = $true
        { Assert-SLConnected -Require Compliance } | Should -Not -Throw
    }

    It 'Does not throw when Protection is connected' {
        $script:SLConnection.ProtectionConnected = $true
        { Assert-SLConnected -Require Protection } | Should -Not -Throw
    }

    It 'Throws for All when any backend is disconnected' {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $true
        # Protection still false
        { Assert-SLConnected -Require All } | Should -Throw '*Not connected to Protection*'
    }

    It 'Does not throw for All when everything is connected' {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ProtectionConnected = $true
        { Assert-SLConnected -Require All } | Should -Not -Throw
    }

    It 'Error message suggests the correct Connect command' {
        try {
            Assert-SLConnected -Require Graph
        }
        catch {
            $_.Exception.Message | Should -Match 'Connect-SLGraph'
        }
    }
}

Describe 'Get-SLConnectionStatus' {
    BeforeEach {
        $script:SLConnection = @{
            GraphConnected      = $true
            ComplianceConnected = $false
            ProtectionConnected = $false
            UserPrincipalName   = 'testuser@contoso.com'
            TenantId            = 'tenant-123'
            ConnectedAt         = @{
                Graph      = [datetime]::UtcNow.AddMinutes(-5)
                Compliance = $null
                Protection = $null
            }
            ComplianceCommandCount = 0
            ComplianceSessionStart = $null
        }
    }

    It 'Returns correct Graph status' {
        $result = Get-SLConnectionStatus
        $result.GraphConnected | Should -BeTrue
        $result.ComplianceConnected | Should -BeFalse
    }

    It 'Includes UserPrincipalName' {
        $result = Get-SLConnectionStatus
        $result.UserPrincipalName | Should -Be 'testuser@contoso.com'
    }

    It 'Includes TenantId' {
        $result = Get-SLConnectionStatus
        $result.TenantId | Should -Be 'tenant-123'
    }

    It 'Returns valid JSON with -AsJson' {
        $json = Get-SLConnectionStatus -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'JSON contains expected fields' {
        $json = Get-SLConnectionStatus -AsJson
        $obj = $json | ConvertFrom-Json
        $obj.GraphConnected | Should -BeTrue
        $obj.UserPrincipalName | Should -Be 'testuser@contoso.com'
    }

    It 'Calculates session age for connected backends' {
        $result = Get-SLConnectionStatus
        $result.SessionAge.Graph | Should -Not -BeNullOrEmpty
    }

    It 'Session age is null for disconnected backends' {
        $result = Get-SLConnectionStatus
        $result.SessionAge.Compliance | Should -BeNullOrEmpty
    }
}

Describe 'Write-SLAuditEntry' {
    BeforeAll {
        $testAuditPath = Join-Path $TestDrive 'test-audit.jsonl'
    }

    BeforeEach {
        $script:SLConnection = @{
            UserPrincipalName = 'auditor@contoso.com'
            TenantId          = 'tenant-abc'
        }
        $script:SLConfig = @{
            AuditLogPath = $testAuditPath
            MaxJsonDepth = 20
        }
        if (Test-Path $testAuditPath) {
            Remove-Item $testAuditPath -Force
        }
    }

    It 'Creates an audit log file' {
        Write-SLAuditEntry -Action 'TestAction' -Target 'TestTarget'
        Test-Path $testAuditPath | Should -BeTrue
    }

    It 'Writes valid JSON' {
        Write-SLAuditEntry -Action 'TestAction' -Target 'TestTarget'
        $content = Get-Content $testAuditPath -Raw
        { $content.Trim() | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Includes action and target' {
        Write-SLAuditEntry -Action 'Set-Label' -Target 'document.docx'
        $entry = Get-Content $testAuditPath -Raw | ConvertFrom-Json
        $entry.action | Should -Be 'Set-Label'
        $entry.target | Should -Be 'document.docx'
    }

    It 'Includes user and tenant' {
        Write-SLAuditEntry -Action 'TestAction'
        $entry = Get-Content $testAuditPath -Raw | ConvertFrom-Json
        $entry.user | Should -Be 'auditor@contoso.com'
        $entry.tenantId | Should -Be 'tenant-abc'
    }

    It 'Defaults result to success' {
        Write-SLAuditEntry -Action 'TestAction'
        $entry = Get-Content $testAuditPath -Raw | ConvertFrom-Json
        $entry.result | Should -Be 'success'
    }

    It 'Records custom result' {
        Write-SLAuditEntry -Action 'TestAction' -Result 'dry-run'
        $entry = Get-Content $testAuditPath -Raw | ConvertFrom-Json
        $entry.result | Should -Be 'dry-run'
    }

    It 'Includes error message when provided' {
        Write-SLAuditEntry -Action 'FailedAction' -Result 'failed' -ErrorMessage 'Something broke'
        $entry = Get-Content $testAuditPath -Raw | ConvertFrom-Json
        $entry.error | Should -Be 'Something broke'
    }

    It 'Appends multiple entries' {
        Write-SLAuditEntry -Action 'First'
        Write-SLAuditEntry -Action 'Second'
        $lines = Get-Content $testAuditPath
        $lines.Count | Should -Be 2
    }

    It 'Includes ISO 8601 timestamp' {
        Write-SLAuditEntry -Action 'TestAction'
        $entry = Get-Content $testAuditPath -Raw | ConvertFrom-Json
        $entry.timestamp | Should -Match '^\d{4}-\d{2}-\d{2}T'
    }
}

Describe 'Invoke-SLWithRetry' {
    It 'Returns result on first successful attempt' {
        $result = Invoke-SLWithRetry -ScriptBlock { 'success' }
        $result | Should -Be 'success'
    }

    It 'Throws on non-retryable error' {
        { Invoke-SLWithRetry -ScriptBlock { throw 'Fatal error 400' } -MaxRetries 1 } |
            Should -Throw '*Fatal error 400*'
    }

    It 'Retries on 429 (throttled) errors' {
        $script:attemptCount = 0
        $result = Invoke-SLWithRetry -ScriptBlock {
            $script:attemptCount++
            if ($script:attemptCount -lt 2) {
                throw 'HTTP 429 Too Many Requests'
            }
            'recovered'
        } -MaxRetries 3 -BaseDelaySeconds 1

        $result | Should -Be 'recovered'
        $script:attemptCount | Should -Be 2
    }

    It 'Retries on 503 (service unavailable) errors' {
        $script:attemptCount = 0
        $result = Invoke-SLWithRetry -ScriptBlock {
            $script:attemptCount++
            if ($script:attemptCount -lt 2) {
                throw 'HTTP 503 Service Unavailable'
            }
            'ok'
        } -MaxRetries 3 -BaseDelaySeconds 1

        $result | Should -Be 'ok'
    }

    It 'Gives up after MaxRetries' {
        $script:attemptCount = 0
        { Invoke-SLWithRetry -ScriptBlock {
            $script:attemptCount++
            throw 'HTTP 429 throttled'
        } -MaxRetries 2 -BaseDelaySeconds 1 } | Should -Throw

        $script:attemptCount | Should -BeLessOrEqual 3
    }

    It 'Returns complex objects' {
        $result = Invoke-SLWithRetry -ScriptBlock {
            [PSCustomObject]@{ Name = 'test'; Value = 42 }
        }
        $result.Name | Should -Be 'test'
        $result.Value | Should -Be 42
    }
}
