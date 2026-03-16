#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel analysis functions: Test-SLDeploymentReadiness,
    Test-SLPermission, Get-SLPolicyHealth, Test-SLPolicyConflict,
    Test-SLLabelDlpAlignment, Get-SLLabelMismatch, Get-SLLabelReport.
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
        SnapshotPath     = Join-Path $HOME '.stablelabel' 'snapshots'
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
# Test-SLDeploymentReadiness
# =============================================================================
Describe 'Test-SLDeploymentReadiness' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Test-SLDeploymentReadiness } | Should -Throw '*Not connected to Graph*'
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Test-SLDeploymentReadiness } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns readiness result with checks' {
        Mock Invoke-SLGraphRequest {
            [PSCustomObject]@{ userPrincipalName = 'admin@contoso.com' }
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'Global Policy'; Enabled = $true; Labels = @('Confidential') })
        }
        $result = Test-SLDeploymentReadiness
        $result | Should -Not -BeNullOrEmpty
        $result.Checks | Should -Not -BeNullOrEmpty
        $result.PSObject.Properties.Name | Should -Contain 'Ready'
        $result.PSObject.Properties.Name | Should -Contain 'Summary'
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLGraphRequest {
            [PSCustomObject]@{ userPrincipalName = 'admin@contoso.com' }
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'Policy1'; Enabled = $true; Labels = @('Conf') })
        }
        $json = Test-SLDeploymentReadiness -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Includes check names in result' {
        Mock Invoke-SLGraphRequest {
            [PSCustomObject]@{ userPrincipalName = 'admin@contoso.com' }
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'Policy'; Enabled = $true; Labels = @('Public') })
        }
        $result = Test-SLDeploymentReadiness
        $result.Checks.Name | Should -Contain 'GraphConnection'
    }
}

# =============================================================================
# Test-SLPermission
# =============================================================================
Describe 'Test-SLPermission' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ProtectionConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Test-SLPermission } | Should -Throw '*Not connected to Graph*'
    }

    It 'Returns permission results for all scopes' {
        Mock Invoke-SLGraphRequest {
            param($Method, $Uri)
            if ($Uri -eq '/me') {
                [PSCustomObject]@{ userPrincipalName = 'admin@contoso.com' }
            }
            elseif ($Uri -match 'memberOf') {
                @([PSCustomObject]@{ displayName = 'Compliance Admin' })
            }
            else {
                @([PSCustomObject]@{ id = '1'; displayName = 'Confidential' })
            }
        }
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{ Name = 'Policy1' })
        }
        Mock Invoke-SLProtectionCommand {
            [PSCustomObject]@{ RightsManagementServiceStatus = 'Enabled' }
        }
        $result = Test-SLPermission
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Filters by scope with -Scope Labels' {
        Mock Invoke-SLGraphRequest {
            param($Method, $Uri)
            if ($Uri -eq '/me') {
                [PSCustomObject]@{ userPrincipalName = 'admin@contoso.com' }
            }
            elseif ($Uri -match 'memberOf') {
                @()
            }
            else {
                @([PSCustomObject]@{ id = '1'; displayName = 'Public' })
            }
        }
        $result = Test-SLPermission -Scope Labels
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLGraphRequest {
            param($Method, $Uri)
            if ($Uri -eq '/me') {
                [PSCustomObject]@{ userPrincipalName = 'admin@contoso.com' }
            }
            elseif ($Uri -match 'memberOf') {
                @()
            }
            else {
                @([PSCustomObject]@{ id = '1'; displayName = 'Public' })
            }
        }
        Mock Invoke-SLComplianceCommand { @() }
        Mock Invoke-SLProtectionCommand { [PSCustomObject]@{} }
        $json = Test-SLPermission -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Get-SLPolicyHealth
# =============================================================================
Describe 'Get-SLPolicyHealth' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLPolicyHealth } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns health results for all policy types' {
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{
                Name               = 'Global Policy'
                Enabled            = $true
                Labels             = @('Confidential')
                DistributionStatus = 'Success'
                WhenChangedUTC     = (Get-Date).AddDays(-1)
            })
        }
        $result = Get-SLPolicyHealth
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Filters by PolicyType Label' {
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{
                Name               = 'Label Policy'
                Enabled            = $true
                Labels             = @('Public')
                DistributionStatus = 'Success'
                WhenChangedUTC     = (Get-Date)
            })
        }
        $result = Get-SLPolicyHealth -PolicyType Label
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Filters by PolicyType DLP' {
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{
                Name           = 'DLP Policy'
                Enabled        = $true
                Mode           = 'Enable'
                WhenChangedUTC = (Get-Date)
            })
        }
        $result = Get-SLPolicyHealth -PolicyType DLP
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{
                Name               = 'Test Policy'
                Enabled            = $true
                Labels             = @('Conf')
                DistributionStatus = 'Success'
                WhenChangedUTC     = (Get-Date)
            })
        }
        $json = Get-SLPolicyHealth -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Test-SLPolicyConflict
# =============================================================================
Describe 'Test-SLPolicyConflict' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Test-SLPolicyConflict } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns conflict results for all policy types' {
        Mock Invoke-SLComplianceCommand {
            @(
                [PSCustomObject]@{
                    Name              = 'Policy A'
                    Enabled           = $true
                    ExchangeLocation  = @('All')
                    SharePointLocation = @()
                    OneDriveLocation  = @()
                    Labels            = @('Conf')
                }
                [PSCustomObject]@{
                    Name              = 'Policy B'
                    Enabled           = $true
                    ExchangeLocation  = @('All')
                    SharePointLocation = @()
                    OneDriveLocation  = @()
                    Labels            = @('Public')
                }
            )
        }
        $result = Test-SLPolicyConflict
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Filters by PolicyType Label' {
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{
                Name              = 'Label Policy'
                Enabled           = $true
                ExchangeLocation  = @('All')
                SharePointLocation = @()
                OneDriveLocation  = @()
                Labels            = @('Public')
            })
        }
        $result = Test-SLPolicyConflict -PolicyType Label
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{
                Name              = 'Policy1'
                Enabled           = $true
                ExchangeLocation  = @('All')
                SharePointLocation = @()
                OneDriveLocation  = @()
                Labels            = @('Conf')
            })
        }
        $json = Test-SLPolicyConflict -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Accepts DLP PolicyType' {
        Mock Invoke-SLComplianceCommand {
            @([PSCustomObject]@{
                Name              = 'DLP Policy'
                Enabled           = $true
                ExchangeLocation  = @('All')
                SharePointLocation = @()
                OneDriveLocation  = @()
                TeamsLocation     = @()
                Mode              = 'Enable'
            })
        }
        $result = Test-SLPolicyConflict -PolicyType DLP
        $result | Should -Not -BeNullOrEmpty
    }
}

# =============================================================================
# Test-SLLabelDlpAlignment
# =============================================================================
Describe 'Test-SLLabelDlpAlignment' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Test-SLLabelDlpAlignment } | Should -Throw '*Not connected to Graph*'
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.ComplianceConnected = $false
        { Test-SLLabelDlpAlignment } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns alignment results' {
        Mock Invoke-SLGraphRequest {
            @(
                [PSCustomObject]@{ id = 'label-1'; displayName = 'Confidential'; isActive = $true }
                [PSCustomObject]@{ id = 'label-2'; displayName = 'Public'; isActive = $true }
            )
        }
        Mock Invoke-SLComplianceCommand {
            param($OperationName, $ScriptBlock)
            if ($OperationName -match 'DlpCompliancePolicy') {
                @([PSCustomObject]@{ Name = 'DLP Policy 1' })
            }
            elseif ($OperationName -match 'DlpComplianceRule') {
                @([PSCustomObject]@{
                    Name = 'Rule1'
                    ContentContainsSensitivityLabels = @('label-1')
                })
            }
            else { @() }
        }
        $result = Test-SLLabelDlpAlignment
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLGraphRequest {
            @([PSCustomObject]@{ id = 'label-1'; displayName = 'Public'; isActive = $true })
        }
        Mock Invoke-SLComplianceCommand { @() }
        $json = Test-SLLabelDlpAlignment -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
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
