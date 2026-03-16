#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel protection functions: Get-SLProtectionConfig,
    Get-SLProtectionTemplate, Export-SLProtectionTemplate, Import-SLProtectionTemplate,
    Remove-SLProtectionTemplate, Get-SLProtectionAdmin, Get-SLProtectionKey,
    Get-SLProtectionLog, Get-SLDocumentTrack, Restore-SLDocumentAccess,
    Revoke-SLDocumentAccess, Get-SLOnboardingPolicy, Set-SLOnboardingPolicy.
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
# Get-SLProtectionConfig
# =============================================================================
Describe 'Get-SLProtectionConfig' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Get-SLProtectionConfig } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns configuration' {
        Mock Invoke-SLProtectionCommand {
            [PSCustomObject]@{
                RightsManagementServiceStatus = 'Enabled'
                LicensingIntranetDistributionPointUrl = 'https://contoso.com'
            }
        }
        $result = Get-SLProtectionConfig
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLProtectionCommand {
            [PSCustomObject]@{ RightsManagementServiceStatus = 'Enabled' }
        }
        $json = Get-SLProtectionConfig -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Get-SLProtectionTemplate
# =============================================================================
Describe 'Get-SLProtectionTemplate' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Get-SLProtectionTemplate } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns all templates' {
        Mock Invoke-SLProtectionCommand {
            @(
                [PSCustomObject]@{ TemplateId = 'tid-1'; Name = 'Confidential - All Employees' }
                [PSCustomObject]@{ TemplateId = 'tid-2'; Name = 'Highly Confidential' }
            )
        }
        $result = Get-SLProtectionTemplate
        $result | Should -HaveCount 2
    }

    It 'Returns specific template by TemplateId' {
        Mock Invoke-SLProtectionCommand {
            [PSCustomObject]@{ TemplateId = 'tid-1'; Name = 'Confidential - All Employees' }
        }
        $result = Get-SLProtectionTemplate -TemplateId 'tid-1'
        $result.TemplateId | Should -Be 'tid-1'
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLProtectionCommand {
            @([PSCustomObject]@{ TemplateId = 'tid-1'; Name = 'Test' })
        }
        $json = Get-SLProtectionTemplate -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Export-SLProtectionTemplate
# =============================================================================
Describe 'Export-SLProtectionTemplate' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Export-SLProtectionTemplate -TemplateId 'tid-1' -Path 'C:\temp\t.xml' -Confirm:$false } | Should -Throw '*Not connected to Protection*'
    }

    It 'Exports a template' {
        Mock Invoke-SLProtectionCommand { $null }
        $result = Export-SLProtectionTemplate -TemplateId 'tid-1' -Path (Join-Path $TestDrive 'template.xml') -Confirm:$false
        $result | Should -Not -BeNullOrEmpty
        $result.TemplateId | Should -Be 'tid-1'
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLProtectionCommand { $null }
        $json = Export-SLProtectionTemplate -TemplateId 'tid-1' -Path (Join-Path $TestDrive 'template.xml') -AsJson -Confirm:$false
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Import-SLProtectionTemplate
# =============================================================================
Describe 'Import-SLProtectionTemplate' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Import-SLProtectionTemplate -Path 'C:\temp\t.xml' -Confirm:$false } | Should -Throw '*Not connected to Protection*'
    }

    It 'Throws when file not found' {
        { Import-SLProtectionTemplate -Path (Join-Path $TestDrive 'nonexistent.xml') -Confirm:$false } | Should -Throw '*not found*'
    }

    It 'Returns dry-run result with -DryRun' {
        Set-Content -Path (Join-Path $TestDrive 'template.xml') -Value '<template />'
        $result = Import-SLProtectionTemplate -Path (Join-Path $TestDrive 'template.xml') -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Import-AipServiceTemplate'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        Set-Content -Path (Join-Path $TestDrive 'template.xml') -Value '<template />'
        $json = Import-SLProtectionTemplate -Path (Join-Path $TestDrive 'template.xml') -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Imports a template from file' {
        Set-Content -Path (Join-Path $TestDrive 'template.xml') -Value '<template />'
        Mock Invoke-SLProtectionCommand {
            [PSCustomObject]@{ TemplateId = 'new-tid-1' }
        }
        $result = Import-SLProtectionTemplate -Path (Join-Path $TestDrive 'template.xml') -Confirm:$false
        $result | Should -Not -BeNullOrEmpty
    }
}

# =============================================================================
# Remove-SLProtectionTemplate
# =============================================================================
Describe 'Remove-SLProtectionTemplate' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Remove-SLProtectionTemplate -TemplateId 'tid-1' -Confirm:$false } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Remove-SLProtectionTemplate -TemplateId 'tid-1' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Remove-AipServiceTemplate'
        $result.TemplateId | Should -Be 'tid-1'
    }

    It 'Removes a template' {
        Mock Invoke-SLProtectionCommand { }
        $null = Remove-SLProtectionTemplate -TemplateId 'tid-1' -Confirm:$false
    }
}

# =============================================================================
# Get-SLProtectionAdmin
# =============================================================================
Describe 'Get-SLProtectionAdmin' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Get-SLProtectionAdmin } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns all administrators' {
        Mock Invoke-SLProtectionCommand {
            @(
                [PSCustomObject]@{ EmailAddress = 'admin@contoso.com'; Role = 'GlobalAdministrator' }
                [PSCustomObject]@{ EmailAddress = 'connector@contoso.com'; Role = 'ConnectorAdministrator' }
            )
        }
        $result = Get-SLProtectionAdmin
        $result | Should -HaveCount 2
    }

    It 'Filters by role' {
        Mock Invoke-SLProtectionCommand {
            @(
                [PSCustomObject]@{ EmailAddress = 'admin@contoso.com'; Role = 'GlobalAdministrator' }
                [PSCustomObject]@{ EmailAddress = 'connector@contoso.com'; Role = 'ConnectorAdministrator' }
            )
        }
        $result = Get-SLProtectionAdmin -Role GlobalAdministrator
        $result | Should -HaveCount 1
        $result.Role | Should -Be 'GlobalAdministrator'
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLProtectionCommand {
            @([PSCustomObject]@{ EmailAddress = 'admin@contoso.com'; Role = 'GlobalAdministrator' })
        }
        $json = Get-SLProtectionAdmin -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Get-SLProtectionKey
# =============================================================================
Describe 'Get-SLProtectionKey' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Get-SLProtectionKey } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns key information' {
        Mock Invoke-SLProtectionCommand {
            [PSCustomObject]@{
                KeyId        = 'key-123'
                KeyType      = 'Microsoft-managed'
                CreatedDate  = (Get-Date).AddYears(-1)
            }
        }
        $result = Get-SLProtectionKey
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLProtectionCommand {
            [PSCustomObject]@{ KeyId = 'key-123'; KeyType = 'Microsoft-managed' }
        }
        $json = Get-SLProtectionKey -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Get-SLProtectionLog
# =============================================================================
Describe 'Get-SLProtectionLog' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Get-SLProtectionLog } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns log entries' {
        Mock Invoke-SLProtectionCommand {
            @(
                [PSCustomObject]@{ ContentName = 'doc.docx'; RequesterEmail = 'user@contoso.com' }
            )
        }
        $result = Get-SLProtectionLog
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Filters by UserEmail' {
        Mock Invoke-SLProtectionCommand {
            @([PSCustomObject]@{ ContentName = 'doc.docx'; RequesterEmail = 'user@contoso.com' })
        }
        $result = Get-SLProtectionLog -UserEmail 'user@contoso.com'
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Accepts date range parameters' {
        Mock Invoke-SLProtectionCommand { @() }
        $result = Get-SLProtectionLog -FromTime (Get-Date).AddDays(-7) -ToTime (Get-Date)
        $result | Should -Not -BeNull
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLProtectionCommand {
            @([PSCustomObject]@{ ContentName = 'doc.docx'; RequesterEmail = 'user@contoso.com' })
        }
        $json = Get-SLProtectionLog -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Get-SLDocumentTrack
# =============================================================================
Describe 'Get-SLDocumentTrack' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Get-SLDocumentTrack } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns tracking log entries' {
        Mock Invoke-SLProtectionCommand {
            @([PSCustomObject]@{ ContentName = 'report.docx'; UserEmail = 'user@contoso.com'; AccessTime = (Get-Date) })
        }
        $result = Get-SLDocumentTrack
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Filters by UserEmail' {
        Mock Invoke-SLProtectionCommand {
            @([PSCustomObject]@{ ContentName = 'report.docx'; UserEmail = 'user@contoso.com' })
        }
        $result = Get-SLDocumentTrack -UserEmail 'user@contoso.com'
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLProtectionCommand {
            @([PSCustomObject]@{ ContentName = 'report.docx'; UserEmail = 'user@contoso.com' })
        }
        $json = Get-SLDocumentTrack -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Accepts date range parameters' {
        Mock Invoke-SLProtectionCommand { @() }
        $result = Get-SLDocumentTrack -FromTime (Get-Date).AddDays(-30) -ToTime (Get-Date)
        $result | Should -Not -BeNull
    }
}

# =============================================================================
# Restore-SLDocumentAccess
# =============================================================================
Describe 'Restore-SLDocumentAccess' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Restore-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com' -Confirm:$false } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Restore-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Clear-AipServiceDocumentRevoked'
        $result.ContentId | Should -Be 'abc123'
        $result.IssuerEmail | Should -Be 'user@contoso.com'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Restore-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com' -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Restores access to a document' {
        Mock Invoke-SLProtectionCommand { $null }
        $result = Restore-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com' -Confirm:$false
        $result | Should -Not -BeNullOrEmpty
    }
}

# =============================================================================
# Revoke-SLDocumentAccess
# =============================================================================
Describe 'Revoke-SLDocumentAccess' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Revoke-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com' -Confirm:$false } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Revoke-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-AipServiceDocumentRevoked'
        $result.ContentId | Should -Be 'abc123'
        $result.IssuerEmail | Should -Be 'user@contoso.com'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Revoke-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com' -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Revokes access to a document' {
        Mock Invoke-SLProtectionCommand { $null }
        $result = Revoke-SLDocumentAccess -ContentId 'abc123' -IssuerEmail 'user@contoso.com' -Confirm:$false
        $result | Should -Not -BeNullOrEmpty
    }
}

# =============================================================================
# Get-SLOnboardingPolicy
# =============================================================================
Describe 'Get-SLOnboardingPolicy' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Get-SLOnboardingPolicy } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns onboarding policy' {
        Mock Invoke-SLProtectionCommand {
            [PSCustomObject]@{
                UseRmsUserLicense     = $true
                SecurityGroupObjectId = '00000000-0000-0000-0000-000000000001'
                Scope                 = 'All'
            }
        }
        $result = Get-SLOnboardingPolicy
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Invoke-SLProtectionCommand {
            [PSCustomObject]@{ UseRmsUserLicense = $true; Scope = 'All' }
        }
        $json = Get-SLOnboardingPolicy -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Set-SLOnboardingPolicy
# =============================================================================
Describe 'Set-SLOnboardingPolicy' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Set-SLOnboardingPolicy -Scope All -Confirm:$false } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Set-SLOnboardingPolicy -UseRmsUserLicense $true -Scope All -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-AipServiceOnboardingControlPolicy'
        $result.Scope | Should -Be 'All'
    }

    It 'Includes SecurityGroupObjectId in dry-run' {
        $result = Set-SLOnboardingPolicy -Scope SecurityGroup -SecurityGroupObjectId 'group-id-123' -DryRun
        $result.SecurityGroupObjectId | Should -Be 'group-id-123'
        $result.DryRun | Should -BeTrue
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Set-SLOnboardingPolicy -UseRmsUserLicense $true -Scope All -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Sets onboarding policy' {
        Mock Invoke-SLProtectionCommand { $null }
        $result = Set-SLOnboardingPolicy -UseRmsUserLicense $true -Scope All -Confirm:$false
        $result | Should -Not -BeNullOrEmpty
    }
}
