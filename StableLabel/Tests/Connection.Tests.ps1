#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel connection functions and additional Get-SLConnectionStatus scenarios.
#>

BeforeAll {
    $moduleRoot = Join-Path $PSScriptRoot '..'

    $script:SLConnection = @{
        GraphConnected      = $false
        ComplianceConnected = $false
        UserPrincipalName   = $null
        TenantId            = $null
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
# Get-SLConnectionStatus (additional scenarios)
# =============================================================================
Describe 'Get-SLConnectionStatus - Additional' {
    BeforeEach {
        $script:SLConnection = @{
            GraphConnected      = $true
            ComplianceConnected = $true
            UserPrincipalName   = 'admin@contoso.com'
            TenantId            = 'tenant-xyz'
            ConnectedAt         = @{
                Graph      = [datetime]::UtcNow.AddMinutes(-10)
                Compliance = [datetime]::UtcNow.AddMinutes(-5)
            }
            ComplianceCommandCount = 12
            ComplianceSessionStart = [datetime]::UtcNow.AddMinutes(-5)
        }
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
    }

    It 'Returns ConnectedAt timestamps' {
        $result = Get-SLConnectionStatus
        $result.ConnectedAt.Graph | Should -Not -BeNullOrEmpty
        $result.ConnectedAt.Compliance | Should -Not -BeNullOrEmpty
    }

    It 'Returns all disconnected when nothing is connected' {
        $script:SLConnection.GraphConnected = $false
        $script:SLConnection.ComplianceConnected = $false
        $script:SLConnection.ConnectedAt.Graph = $null
        $script:SLConnection.ConnectedAt.Compliance = $null

        $result = Get-SLConnectionStatus
        $result.GraphConnected | Should -BeFalse
        $result.ComplianceConnected | Should -BeFalse
    }

    It 'Returns object with all expected fields' {
        $result = Get-SLConnectionStatus
        $result.PSObject.Properties.Name | Should -Contain 'GraphConnected'
        $result.PSObject.Properties.Name | Should -Contain 'ComplianceConnected'
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

    It 'Sets GraphConnected to false but preserves UPN' {
        Mock Disconnect-MgGraph { }

        $result = Disconnect-SLGraph
        $script:SLConnection.GraphConnected | Should -BeFalse
        # UPN is preserved because it may have been set by Compliance
        $script:SLConnection.UserPrincipalName | Should -Be 'admin@contoso.com'
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
            UserPrincipalName   = $null
            TenantId            = $null
            UseDeviceCode       = $false
            ConnectedAt         = @{ Graph = $null; Compliance = $null }
            ComplianceCommandCount = 0
            ComplianceSessionStart = $null
        }
    }

    It 'Returns Connected status with Compliance only (Graph deferred by default)' {
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com' }
        }
        Mock Get-Module {
            [PSCustomObject]@{ Version = [version]'3.0.0'; Name = $Name }
        } -ParameterFilter { $ListAvailable }

        $result = Connect-SLAll -SkipPrereqs -UserPrincipalName 'admin@contoso.com'
        $result.Status | Should -Be 'Connected'
        $result.UserPrincipalName | Should -Be 'admin@contoso.com'
        $result.GraphConnected | Should -BeFalse
        $result.ComplianceConnected | Should -BeTrue
    }

    It 'Returns Connected status with both Graph and Compliance when -IncludeGraph is used' {
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com' }
        }
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com'; TenantId = 'tenant-123' }
        }
        Mock Get-Module {
            [PSCustomObject]@{ Version = [version]'3.0.0'; Name = $Name }
        } -ParameterFilter { $ListAvailable }

        $result = Connect-SLAll -SkipPrereqs -UserPrincipalName 'admin@contoso.com' -IncludeGraph
        $result.Status | Should -Be 'Connected'
        $result.GraphConnected | Should -BeTrue
        $result.ComplianceConnected | Should -BeTrue
    }

    It 'Returns Failed status when Compliance connection fails' {
        Mock Connect-SLCompliance { throw 'Compliance auth failed' }

        $result = Connect-SLAll -SkipPrereqs
        $result.Status | Should -Be 'Failed'
        $result.Stage | Should -Be 'Compliance'
        $result.Error | Should -Match 'Compliance.*failed'
    }

    It 'Still succeeds when Graph fails but Compliance succeeds with -IncludeGraph' {
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com' }
        }
        Mock Connect-SLGraph { throw 'Graph auth failed' }

        $result = Connect-SLAll -SkipPrereqs -UserPrincipalName 'admin@contoso.com' -IncludeGraph
        $result.Status | Should -Be 'Connected'
        $result.ComplianceConnected | Should -BeTrue
        $result.GraphConnected | Should -BeFalse
    }

    It 'Passes TenantId to Connect-SLGraph when -IncludeGraph is used' {
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com' }
        }
        Mock Connect-SLGraph {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com'; TenantId = 'tenant-abc' }
        }

        $null = Connect-SLAll -SkipPrereqs -UserPrincipalName 'admin@contoso.com' -TenantId 'tenant-abc' -IncludeGraph
        Should -Invoke Connect-SLGraph -ParameterFilter { $TenantId -eq 'tenant-abc' }
    }

    It 'Passes UseDeviceCode to Connect-SLCompliance' {
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = $null }
        }

        $null = Connect-SLAll -SkipPrereqs -UseDeviceCode
        Should -Invoke Connect-SLCompliance -ParameterFilter { $UseDeviceCode -eq $true }
    }

    It 'Includes step details in result' {
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com' }
        }

        $result = Connect-SLAll -SkipPrereqs -UserPrincipalName 'admin@contoso.com'
        $result.Steps | Should -Not -BeNullOrEmpty
        $result.Steps.Count | Should -BeGreaterOrEqual 2
    }

    It 'Returns JSON with -AsJson' {
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com' }
        }

        $json = Connect-SLAll -SkipPrereqs -UserPrincipalName 'admin@contoso.com' -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).Status | Should -Be 'Connected'
    }

    It 'Checks prerequisites when -SkipPrereqs is not set' {
        Mock Get-Module {
            [PSCustomObject]@{ Version = [version]'3.0.0'; Name = $Name }
        } -ParameterFilter { $ListAvailable }
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com' }
        }

        $result = Connect-SLAll -UserPrincipalName 'admin@contoso.com'
        $result.Status | Should -Be 'Connected'
        # Prereq steps should appear (at least ExchangeOnlineManagement)
        $prereqSteps = $result.Steps | Where-Object { $_.Step -eq 'Prereq' }
        $prereqSteps.Count | Should -BeGreaterOrEqual 1
    }

    It 'Fails when prerequisite installation fails' {
        Mock Get-Module { $null } -ParameterFilter { $ListAvailable }
        Mock Install-Module { throw 'Permission denied' }

        $result = Connect-SLAll
        $result.Status | Should -Be 'Failed'
        $result.Stage | Should -Be 'Prerequisites'
    }

    It 'Stores TenantId and UseDeviceCode for lazy Graph connection' {
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com' }
        }

        $null = Connect-SLAll -SkipPrereqs -UserPrincipalName 'admin@contoso.com' -TenantId 'tenant-abc' -UseDeviceCode
        $script:SLConnection['TenantId'] | Should -Be 'tenant-abc'
        $script:SLConnection['UseDeviceCode'] | Should -BeTrue
    }

    It 'Includes Graph Deferred step when -IncludeGraph is not specified' {
        Mock Connect-SLCompliance {
            [PSCustomObject]@{ UserPrincipalName = 'admin@contoso.com' }
        }

        $result = Connect-SLAll -SkipPrereqs -UserPrincipalName 'admin@contoso.com'
        $graphStep = $result.Steps | Where-Object { $_.Step -eq 'Graph' }
        $graphStep.Status | Should -Be 'Deferred'
    }
}
