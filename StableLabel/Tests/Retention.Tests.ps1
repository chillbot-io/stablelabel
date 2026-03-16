#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel retention label and retention policy functions.
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
# New-SLRetentionLabel
# =============================================================================
Describe 'New-SLRetentionLabel' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { New-SLRetentionLabel -Name 'Test' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = New-SLRetentionLabel -Name 'Financial Records' -RetentionDuration 2555 -RetentionAction Keep -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'New-ComplianceTag'
        $result.Name | Should -Be 'Financial Records'
        $result.RetentionDuration | Should -Be 2555
        $result.RetentionAction | Should -Be 'Keep'
    }

    It 'Includes RetentionType in dry-run' {
        $result = New-SLRetentionLabel -Name 'Test' -RetentionType 'CreationAgeInDays' -DryRun
        $result.RetentionType | Should -Be 'CreationAgeInDays'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = New-SLRetentionLabel -Name 'Test' -DryRun -AsJson
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Creates a retention label' {
        Mock New-ComplianceTag { [PSCustomObject]@{ Name = 'Financial Records'; RetentionDuration = 2555 } }
        $result = New-SLRetentionLabel -Name 'Financial Records' -RetentionDuration 2555 -RetentionAction Keep -Confirm:$false
        $result.Name | Should -Be 'Financial Records'
    }
}

# =============================================================================
# Set-SLRetentionLabel
# =============================================================================
Describe 'Set-SLRetentionLabel' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Set-SLRetentionLabel -Identity 'Test' -Comment 'Update' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Set-SLRetentionLabel -Identity 'Financial Records' -Comment 'Updated' -RetentionDuration 3650 -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-ComplianceTag'
        $result.Identity | Should -Be 'Financial Records'
        $result.Comment | Should -Be 'Updated'
        $result.RetentionDuration | Should -Be 3650
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Set-SLRetentionLabel -Identity 'Test' -Comment 'Change' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Set-ComplianceTag'
    }

    It 'Updates a retention label' {
        Mock Set-ComplianceTag { [PSCustomObject]@{ Name = 'Financial Records'; Comment = 'Updated' } }
        $result = Set-SLRetentionLabel -Identity 'Financial Records' -Comment 'Updated' -Confirm:$false
        $result.Comment | Should -Be 'Updated'
    }
}

# =============================================================================
# Remove-SLRetentionLabel
# =============================================================================
Describe 'Remove-SLRetentionLabel' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Remove-SLRetentionLabel -Identity 'Test' -Confirm:$false } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Remove-SLRetentionLabel -Identity 'Old Label' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Remove-ComplianceTag'
        $result.Identity | Should -Be 'Old Label'
    }

    It 'Removes a retention label' {
        Mock Remove-ComplianceTag { }
        $null = Remove-SLRetentionLabel -Identity 'Old Label' -Confirm:$false
        Should -Invoke Remove-ComplianceTag -Times 1
    }
}

# =============================================================================
# Get-SLRetentionPolicy
# =============================================================================
Describe 'Get-SLRetentionPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLRetentionPolicy } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns all retention policies' {
        Mock Get-RetentionCompliancePolicy {
            @(
                [PSCustomObject]@{ Name = 'Exchange Retention'; Enabled = $true }
                [PSCustomObject]@{ Name = 'SharePoint Retention'; Enabled = $true }
            )
        }
        $result = Get-SLRetentionPolicy
        $result | Should -HaveCount 2
    }

    It 'Returns specific policy by Identity' {
        Mock Get-RetentionCompliancePolicy {
            [PSCustomObject]@{ Name = 'Exchange Retention'; Enabled = $true }
        }
        $result = Get-SLRetentionPolicy -Identity 'Exchange Retention'
        $result.Name | Should -Be 'Exchange Retention'
    }

    It 'Returns JSON with -AsJson' {
        Mock Get-RetentionCompliancePolicy {
            @([PSCustomObject]@{ Name = 'Test'; Enabled = $true })
        }
        $json = Get-SLRetentionPolicy -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Passes -IncludeTestDetails when specified' {
        Mock Get-RetentionCompliancePolicy {
            [PSCustomObject]@{ Name = 'Test'; Enabled = $true; TestDetails = 'details' }
        }
        $result = Get-SLRetentionPolicy -IncludeTestDetails
        Should -Invoke Get-RetentionCompliancePolicy -Times 1
    }
}

# =============================================================================
# New-SLRetentionPolicy
# =============================================================================
Describe 'New-SLRetentionPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { New-SLRetentionPolicy -Name 'Test' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = New-SLRetentionPolicy -Name 'Exchange Retention' -ExchangeLocation 'All' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'New-RetentionCompliancePolicy'
        $result.Name | Should -Be 'Exchange Retention'
        $result.ExchangeLocation | Should -Contain 'All'
    }

    It 'Includes multiple location types in dry-run' {
        $result = New-SLRetentionPolicy -Name 'Test' -SharePointLocation 'All' -OneDriveLocation 'All' -ModernGroupLocation 'All' -DryRun
        $result.SharePointLocation | Should -Contain 'All'
        $result.OneDriveLocation | Should -Contain 'All'
        $result.ModernGroupLocation | Should -Contain 'All'
    }

    It 'Defaults Enabled to true in dry-run' {
        $result = New-SLRetentionPolicy -Name 'Test' -DryRun
        $result.Enabled | Should -BeTrue
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = New-SLRetentionPolicy -Name 'Test' -DryRun -AsJson
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Creates a retention policy' {
        Mock New-RetentionCompliancePolicy { [PSCustomObject]@{ Name = 'Exchange Retention' } }
        $result = New-SLRetentionPolicy -Name 'Exchange Retention' -ExchangeLocation 'All' -Confirm:$false
        $result.Name | Should -Be 'Exchange Retention'
    }
}

# =============================================================================
# Set-SLRetentionPolicy
# =============================================================================
Describe 'Set-SLRetentionPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Set-SLRetentionPolicy -Identity 'Test' -Comment 'Update' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Set-SLRetentionPolicy -Identity 'Exchange Retention' -Comment 'Updated' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-RetentionCompliancePolicy'
        $result.Identity | Should -Be 'Exchange Retention'
    }

    It 'Includes Add/Remove locations in dry-run' {
        $result = Set-SLRetentionPolicy -Identity 'Test' -AddExchangeLocation 'user@contoso.com' -RemoveSharePointLocation 'https://site.com' -DryRun
        $result.AddExchangeLocation | Should -Contain 'user@contoso.com'
        $result.RemoveSharePointLocation | Should -Contain 'https://site.com'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Set-SLRetentionPolicy -Identity 'Test' -Comment 'Change' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Set-RetentionCompliancePolicy'
    }
}

# =============================================================================
# Remove-SLRetentionPolicy
# =============================================================================
Describe 'Remove-SLRetentionPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Remove-SLRetentionPolicy -Identity 'Test' -Confirm:$false } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Remove-SLRetentionPolicy -Identity 'Old Policy' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Remove-RetentionCompliancePolicy'
        $result.Identity | Should -Be 'Old Policy'
    }

    It 'Removes a retention policy' {
        Mock Remove-RetentionCompliancePolicy { }
        $null = Remove-SLRetentionPolicy -Identity 'Old Policy' -Confirm:$false
        Should -Invoke Remove-RetentionCompliancePolicy -Times 1
    }
}
