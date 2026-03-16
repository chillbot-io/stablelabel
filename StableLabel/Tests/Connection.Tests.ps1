#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel connection functions: Connect-SLProtection,
    Disconnect-SLProtection, and additional Get-SLConnectionStatus scenarios.
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
# Connect-SLProtection
# =============================================================================
Describe 'Connect-SLProtection' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $false
        $script:SLConnection.ConnectedAt.Protection = $null
    }

    It 'Throws on non-Windows platforms' -Skip:$IsWindows {
        { Connect-SLProtection } | Should -Throw '*not supported*'
    }

    It 'Throws when AIPService module is not installed' -Skip:(-not $IsWindows) {
        Mock Get-Module { $null } -ParameterFilter { $ListAvailable -and $Name -eq 'AIPService' }
        { Connect-SLProtection } | Should -Throw '*AIPService module is not installed*'
    }

    It 'Sets ProtectionConnected on success' -Skip:(-not $IsWindows) {
        Mock Get-Module { [PSCustomObject]@{ Name = 'AIPService' } } -ParameterFilter { $ListAvailable -and $Name -eq 'AIPService' }
        Mock Connect-AipService { }

        $result = Connect-SLProtection
        $script:SLConnection.ProtectionConnected | Should -BeTrue
        $result.Status | Should -Be 'Connected'
        $result.Backend | Should -Be 'Protection'
    }

    It 'Returns JSON with -AsJson' -Skip:(-not $IsWindows) {
        Mock Get-Module { [PSCustomObject]@{ Name = 'AIPService' } } -ParameterFilter { $ListAvailable -and $Name -eq 'AIPService' }
        Mock Connect-AipService { }

        $json = Connect-SLProtection -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).Backend | Should -Be 'Protection'
    }

    It 'Sets ProtectionConnected to false on failure' -Skip:(-not $IsWindows) {
        Mock Get-Module { [PSCustomObject]@{ Name = 'AIPService' } } -ParameterFilter { $ListAvailable -and $Name -eq 'AIPService' }
        Mock Connect-AipService { throw 'Auth failed' }

        { Connect-SLProtection } | Should -Throw '*Auth failed*'
        $script:SLConnection.ProtectionConnected | Should -BeFalse
    }

    It 'Records ConnectedAt timestamp on success' -Skip:(-not $IsWindows) {
        Mock Get-Module { [PSCustomObject]@{ Name = 'AIPService' } } -ParameterFilter { $ListAvailable -and $Name -eq 'AIPService' }
        Mock Connect-AipService { }

        $before = [datetime]::UtcNow
        $null = Connect-SLProtection
        $script:SLConnection.ConnectedAt.Protection | Should -Not -BeNullOrEmpty
    }
}

# =============================================================================
# Disconnect-SLProtection
# =============================================================================
Describe 'Disconnect-SLProtection' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
        $script:SLConnection.ConnectedAt.Protection = [datetime]::UtcNow
    }

    It 'Clears Protection connection state' {
        Mock Disconnect-AipService { }

        $result = Disconnect-SLProtection
        $script:SLConnection.ProtectionConnected | Should -BeFalse
        $script:SLConnection.ConnectedAt.Protection | Should -BeNullOrEmpty
        $result.Status | Should -Be 'Disconnected'
        $result.Backend | Should -Be 'Protection'
    }

    It 'Returns JSON with -AsJson' {
        Mock Disconnect-AipService { }

        $json = Disconnect-SLProtection -AsJson
        ($json | ConvertFrom-Json).Status | Should -Be 'Disconnected'
    }

    It 'Throws on disconnect failure' {
        Mock Disconnect-AipService { throw 'Disconnect error' }
        { Disconnect-SLProtection } | Should -Throw '*Disconnect error*'
    }
}

# =============================================================================
# Get-SLConnectionStatus (additional scenarios)
# =============================================================================
Describe 'Get-SLConnectionStatus - Additional' {
    BeforeEach {
        $script:SLConnection = @{
            GraphConnected      = $true
            ComplianceConnected = $true
            ProtectionConnected = $true
            UserPrincipalName   = 'admin@contoso.com'
            TenantId            = 'tenant-xyz'
            ConnectedAt         = @{
                Graph      = [datetime]::UtcNow.AddMinutes(-10)
                Compliance = [datetime]::UtcNow.AddMinutes(-5)
                Protection = [datetime]::UtcNow.AddMinutes(-2)
            }
            ComplianceCommandCount = 12
            ComplianceSessionStart = [datetime]::UtcNow.AddMinutes(-5)
        }
    }

    It 'Returns ProtectionConnected status' {
        $result = Get-SLConnectionStatus
        $result.ProtectionConnected | Should -BeTrue
    }

    It 'Returns ComplianceCommandCount' {
        $result = Get-SLConnectionStatus
        $result.ComplianceCommandCount | Should -Be 12
    }

    It 'Returns ComplianceSessionAge when session is active' {
        $result = Get-SLConnectionStatus
        $result.ComplianceSessionAge | Should -Not -BeNullOrEmpty
    }

    It 'Returns all backends as connected' {
        $result = Get-SLConnectionStatus
        $result.GraphConnected | Should -BeTrue
        $result.ComplianceConnected | Should -BeTrue
        $result.ProtectionConnected | Should -BeTrue
    }

    It 'Returns session age for Protection backend' {
        $result = Get-SLConnectionStatus
        $result.SessionAge.Protection | Should -Not -BeNullOrEmpty
    }

    It 'Returns ConnectedAt timestamps' {
        $result = Get-SLConnectionStatus
        $result.ConnectedAt.Graph | Should -Not -BeNullOrEmpty
        $result.ConnectedAt.Compliance | Should -Not -BeNullOrEmpty
        $result.ConnectedAt.Protection | Should -Not -BeNullOrEmpty
    }

    It 'Returns all disconnected when nothing is connected' {
        $script:SLConnection.GraphConnected = $false
        $script:SLConnection.ComplianceConnected = $false
        $script:SLConnection.ProtectionConnected = $false
        $script:SLConnection.ConnectedAt.Graph = $null
        $script:SLConnection.ConnectedAt.Compliance = $null
        $script:SLConnection.ConnectedAt.Protection = $null

        $result = Get-SLConnectionStatus
        $result.GraphConnected | Should -BeFalse
        $result.ComplianceConnected | Should -BeFalse
        $result.ProtectionConnected | Should -BeFalse
    }
}
