#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel analysis functions: Get-SLLabelMismatch, Get-SLLabelReport.
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
# Get-SLLabelMismatch
# =============================================================================
Describe 'Get-SLLabelMismatch' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Get-SLLabelMismatch } | Should -Throw '*Not connected to Graph*'
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLLabelMismatch } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns mismatch results with expected properties' {
        Mock Invoke-SLGraphRequest {
            @(
                [PSCustomObject]@{ id = 'label-1'; displayName = 'Confidential' }
                [PSCustomObject]@{ id = 'label-2'; displayName = 'Internal' }
            )
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{
                Name   = 'Global Policy'
                Labels = @('label-1', 'Unknown-Label')
            })
        }
        $result = Get-SLLabelMismatch
        $result | Should -Not -BeNullOrEmpty
        $result.PSObject.Properties.Name | Should -Contain 'InGraphOnly'
        $result.PSObject.Properties.Name | Should -Contain 'InPolicyOnly'
        $result.PSObject.Properties.Name | Should -Contain 'Matched'
    }

    It 'Detects labels in Graph but not in policies' {
        Mock Invoke-SLGraphRequest {
            @(
                [PSCustomObject]@{ id = 'label-1'; displayName = 'Confidential' }
                [PSCustomObject]@{ id = 'label-2'; displayName = 'Orphan Label' }
            )
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'Policy1'; Labels = @('label-1') })
        }
        $result = Get-SLLabelMismatch
        $result.InGraphOnly.Count | Should -BeGreaterOrEqual 1
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLGraphRequest {
            @([PSCustomObject]@{ id = 'label-1'; displayName = 'Public' })
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'Policy1'; Labels = @('label-1') })
        }
        $json = Get-SLLabelMismatch -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Get-SLLabelReport
# =============================================================================
Describe 'Get-SLLabelReport' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Get-SLLabelReport } | Should -Throw '*Not connected to Graph*'
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLLabelReport } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns report with label counts' {
        Mock Invoke-SLGraphRequest {
            @(
                [PSCustomObject]@{ id = 'l1'; displayName = 'Public'; isActive = $true; parent = $null; parentLabelId = $null }
                [PSCustomObject]@{ id = 'l2'; displayName = 'Confidential'; isActive = $true; parent = $null; parentLabelId = $null }
                [PSCustomObject]@{ id = 'l3'; displayName = 'Conf\AllEmployees'; isActive = $false; parent = 'Confidential'; parentLabelId = 'l2' }
            )
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'Global Policy'; Labels = @('l1', 'l2') })
        }
        $result = Get-SLLabelReport
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLGraphRequest {
            @([PSCustomObject]@{ id = 'l1'; displayName = 'Public'; isActive = $true; parent = $null; parentLabelId = $null })
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'Policy1'; Labels = @('l1') })
        }
        $json = Get-SLLabelReport -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Distinguishes active and inactive labels' {
        Mock Invoke-SLGraphRequest {
            @(
                [PSCustomObject]@{ id = 'l1'; displayName = 'Active'; isActive = $true; parent = $null; parentLabelId = $null }
                [PSCustomObject]@{ id = 'l2'; displayName = 'Inactive'; isActive = $false; parent = $null; parentLabelId = $null }
            )
        }
        Mock Invoke-SLComplianceCommand { @() }
        $result = Get-SLLabelReport
        $result | Should -Not -BeNullOrEmpty
    }
}
