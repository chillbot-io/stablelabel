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

    It 'Returns object with all expected fields' {
        $result = Get-SLConnectionStatus
        $result.PSObject.Properties.Name | Should -Contain 'GraphConnected'
        $result.PSObject.Properties.Name | Should -Contain 'ComplianceConnected'
        $result.PSObject.Properties.Name | Should -Contain 'ProtectionConnected'
        $result.PSObject.Properties.Name | Should -Contain 'UserPrincipalName'
        $result.PSObject.Properties.Name | Should -Contain 'TenantId'
        $result.PSObject.Properties.Name | Should -Contain 'ConnectedAt'
        $result.PSObject.Properties.Name | Should -Contain 'SessionAge'
        $result.PSObject.Properties.Name | Should -Contain 'ComplianceCommandCount'
        $result.PSObject.Properties.Name | Should -Contain 'ComplianceSessionStart'
        $result.PSObject.Properties.Name | Should -Contain 'ComplianceSessionAge'
    }
}

# =============================================================================
# Connect-SLGraph
# =============================================================================
Describe 'Connect-SLGraph' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $false
        $script:SLConnection.ConnectedAt.Graph = $null
        $script:SLConnection.UserPrincipalName = $null
        $script:SLConnection.TenantId = $null
    }

    It 'Passes TenantId to Connect-MgGraph when provided' {
        Mock Connect-MgGraph { }
        Mock Get-MgContext { [PSCustomObject]@{ Account = 'admin@contoso.com'; TenantId = 'tenant-abc' } }

        $null = Connect-SLGraph -TenantId 'tenant-abc'
        Should -Invoke Connect-MgGraph -Times 1 -ParameterFilter {
            $TenantId -eq 'tenant-abc'
        }
    }
}

# =============================================================================
# Connect-SLCompliance
# =============================================================================
Describe 'Connect-SLCompliance' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $false
        $script:SLConnection.ComplianceSessionStart = $null
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Sets ComplianceSessionStart after successful connection' {
        Mock Connect-IPPSSession { }

        $null = Connect-SLCompliance -UserPrincipalName 'admin@contoso.com'
        $script:SLConnection.ComplianceSessionStart | Should -Not -BeNullOrEmpty
        $script:SLConnection.ComplianceConnected | Should -BeTrue
        $script:SLConnection.ComplianceCommandCount | Should -Be 0
    }
}

# =============================================================================
# Disconnect-SLGraph
# =============================================================================
Describe 'Disconnect-SLGraph' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.UserPrincipalName = 'admin@contoso.com'
        $script:SLConnection.ConnectedAt.Graph = [datetime]::UtcNow
    }

    It 'Clears UserPrincipalName and sets GraphConnected to false' {
        Mock Disconnect-MgGraph { }

        $result = Disconnect-SLGraph
        $script:SLConnection.GraphConnected | Should -BeFalse
        $script:SLConnection.UserPrincipalName | Should -BeNullOrEmpty
        $result.Status | Should -Be 'Disconnected'
        $result.Backend | Should -Be 'Graph'
    }
}

# =============================================================================
# Connect-SLAll
# =============================================================================
Describe 'Connect-SLAll' {
    BeforeEach {
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
    }

    It 'Returns Connected status when both Graph and Compliance succeed' {
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com'; TenantId = 'tenant-123' }
        }
        Mock Connect-SLCompliance { }
        Mock Get-Module {
            [PSCustomObject]@{ Version = [version]'3.0.0'; Name = $Name }
        } -ParameterFilter { $ListAvailable }

        $result = Connect-SLAll -SkipPrereqs
        $result.Status | Should -Be 'Connected'
        $result.UserPrincipalName | Should -Be 'admin@contoso.com'
        $result.GraphConnected | Should -BeTrue
        $result.ComplianceConnected | Should -BeTrue
    }

    It 'Returns Failed status when Graph connection fails' {
        Mock Connect-SLGraph { throw 'Graph auth failed' }
        Mock Get-Module {
            [PSCustomObject]@{ Version = [version]'3.0.0'; Name = $Name }
        } -ParameterFilter { $ListAvailable }

        $result = Connect-SLAll -SkipPrereqs
        $result.Status | Should -Be 'Failed'
        $result.Stage | Should -Be 'Graph'
        $result.Error | Should -Match 'Graph.*failed'
    }

    It 'Returns PartiallyConnected when Compliance fails but Graph succeeds' {
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com'; TenantId = 'tenant-123' }
        }
        Mock Connect-SLCompliance { throw 'Compliance auth failed' }
        Mock Get-Module {
            [PSCustomObject]@{ Version = [version]'3.0.0'; Name = $Name }
        } -ParameterFilter { $ListAvailable }

        $result = Connect-SLAll -SkipPrereqs
        $result.Status | Should -Be 'PartiallyConnected'
        $result.Stage | Should -Be 'Compliance'
    }

    It 'Passes TenantId to Connect-SLGraph' {
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com'; TenantId = 'tenant-abc' }
        }
        Mock Connect-SLCompliance { }

        $null = Connect-SLAll -SkipPrereqs -TenantId 'tenant-abc'
        Should -Invoke Connect-SLGraph -ParameterFilter { $TenantId -eq 'tenant-abc' }
    }

    It 'Passes UseDeviceCode to Connect-SLGraph and Connect-SLCompliance' {
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com'; TenantId = 'tenant-123' }
        }
        Mock Connect-SLCompliance { }

        $null = Connect-SLAll -SkipPrereqs -UseDeviceCode
        Should -Invoke Connect-SLGraph -ParameterFilter { $UseDeviceCode -eq $true }
        Should -Invoke Connect-SLCompliance -ParameterFilter { $UseDeviceCode -eq $true }
    }

    It 'Passes Graph UPN to Connect-SLCompliance' {
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'svc@contoso.com'; TenantId = 'tenant-123' }
        }
        Mock Connect-SLCompliance { }

        $null = Connect-SLAll -SkipPrereqs
        Should -Invoke Connect-SLCompliance -ParameterFilter {
            $UserPrincipalName -eq 'svc@contoso.com'
        }
    }

    It 'Includes step details in result' {
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com'; TenantId = 'tenant-123' }
        }
        Mock Connect-SLCompliance { }

        $result = Connect-SLAll -SkipPrereqs
        $result.Steps | Should -Not -BeNullOrEmpty
        $result.Steps.Count | Should -BeGreaterOrEqual 2
    }

    It 'Returns JSON with -AsJson' {
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com'; TenantId = 'tenant-123' }
        }
        Mock Connect-SLCompliance { }

        $json = Connect-SLAll -SkipPrereqs -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).Status | Should -Be 'Connected'
    }

    It 'Checks prerequisites when -SkipPrereqs is not set' {
        Mock Get-Module {
            [PSCustomObject]@{ Version = [version]'3.0.0'; Name = $Name }
        } -ParameterFilter { $ListAvailable }
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com'; TenantId = 'tenant-123' }
        }
        Mock Connect-SLCompliance { }

        $result = Connect-SLAll
        $result.Status | Should -Be 'Connected'
        # Prereq steps should appear
        $prereqSteps = $result.Steps | Where-Object { $_.Step -eq 'Prereq' }
        $prereqSteps.Count | Should -BeGreaterOrEqual 2
    }

    It 'Fails when prerequisite installation fails' {
        Mock Get-Module { $null } -ParameterFilter { $ListAvailable }
        Mock Install-Module { throw 'Permission denied' }

        $result = Connect-SLAll
        $result.Status | Should -Be 'Failed'
        $result.Stage | Should -Be 'Prerequisites'
    }

    It 'Fails when Graph returns no UPN' {
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = $null; TenantId = 'tenant-123' }
        }

        $result = Connect-SLAll -SkipPrereqs
        $result.Status | Should -Be 'Failed'
        $result.Stage | Should -Be 'Compliance'
        $result.Error | Should -Match 'UPN'
    }
}
