#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel DLP functions: New/Set/Remove-SLDlpPolicy,
    Get/New/Set/Remove-SLDlpRule, Get/Set-SLSensitiveInfoType.
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
# New-SLDlpPolicy
# =============================================================================
Describe 'New-SLDlpPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { New-SLDlpPolicy -Name 'Test' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = New-SLDlpPolicy -Name 'PII Protection' -ExchangeLocation 'All' -Mode 'Enable' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'New-DlpCompliancePolicy'
        $result.Name | Should -Be 'PII Protection'
        $result.Mode | Should -Be 'Enable'
    }

    It 'Includes all location types in dry-run' {
        $result = New-SLDlpPolicy -Name 'Test' -ExchangeLocation 'All' -SharePointLocation 'All' -OneDriveLocation 'All' -TeamsLocation 'All' -DryRun
        $result.ExchangeLocation | Should -Contain 'All'
        $result.SharePointLocation | Should -Contain 'All'
        $result.OneDriveLocation | Should -Contain 'All'
        $result.TeamsLocation | Should -Contain 'All'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = New-SLDlpPolicy -Name 'Test' -DryRun -AsJson
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Creates a DLP policy' {
        Mock New-DlpCompliancePolicy { [PSCustomObject]@{ Name = 'PII Protection'; Mode = 'Enable' } }
        $result = New-SLDlpPolicy -Name 'PII Protection' -Mode 'Enable' -Confirm:$false
        $result.Name | Should -Be 'PII Protection'
    }
}

# =============================================================================
# Set-SLDlpPolicy
# =============================================================================
Describe 'Set-SLDlpPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Set-SLDlpPolicy -Identity 'Test' -Mode 'Enable' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Set-SLDlpPolicy -Identity 'PII Protection' -Mode 'Enable' -Comment 'Updated' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-DlpCompliancePolicy'
        $result.Identity | Should -Be 'PII Protection'
        $result.Mode | Should -Be 'Enable'
    }

    It 'Includes Add/Remove locations in dry-run' {
        $result = Set-SLDlpPolicy -Identity 'Test' -AddExchangeLocation 'user@mail.com' -RemoveTeamsLocation 'group1' -DryRun
        $result.AddExchangeLocation | Should -Contain 'user@mail.com'
        $result.RemoveTeamsLocation | Should -Contain 'group1'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Set-SLDlpPolicy -Identity 'Test' -Mode 'Enable' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Set-DlpCompliancePolicy'
    }
}

# =============================================================================
# Remove-SLDlpPolicy
# =============================================================================
Describe 'Remove-SLDlpPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Remove-SLDlpPolicy -Identity 'Test' -Confirm:$false } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Remove-SLDlpPolicy -Identity 'Old DLP Policy' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Remove-DlpCompliancePolicy'
        $result.Identity | Should -Be 'Old DLP Policy'
    }

    It 'Removes a DLP policy' {
        Mock Remove-DlpCompliancePolicy { }
        $null = Remove-SLDlpPolicy -Identity 'Old DLP Policy' -Confirm:$false
        Should -Invoke Remove-DlpCompliancePolicy -Times 1
    }
}

# =============================================================================
# Get-SLDlpRule
# =============================================================================
Describe 'Get-SLDlpRule' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLDlpRule } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns all DLP rules' {
        Mock Get-DlpComplianceRule {
            @(
                [PSCustomObject]@{ Name = 'Rule1'; ParentPolicyName = 'Policy1' }
                [PSCustomObject]@{ Name = 'Rule2'; ParentPolicyName = 'Policy2' }
            )
        }
        $result = Get-SLDlpRule
        $result | Should -HaveCount 2
    }

    It 'Returns specific rule by Identity' {
        Mock Get-DlpComplianceRule {
            [PSCustomObject]@{ Name = 'Block Credit Cards'; ParentPolicyName = 'PII Protection' }
        }
        $result = Get-SLDlpRule -Identity 'Block Credit Cards'
        $result.Name | Should -Be 'Block Credit Cards'
    }

    It 'Filters by Policy name' {
        Mock Get-DlpComplianceRule {
            @(
                [PSCustomObject]@{ Name = 'Rule1'; ParentPolicyName = 'PII Protection' }
                [PSCustomObject]@{ Name = 'Rule2'; ParentPolicyName = 'Other Policy' }
            )
        }
        $result = Get-SLDlpRule -Policy 'PII Protection'
        $result | Should -HaveCount 1
        $result.Name | Should -Be 'Rule1'
    }

    It 'Returns JSON with -AsJson' {
        Mock Get-DlpComplianceRule {
            @([PSCustomObject]@{ Name = 'Test'; ParentPolicyName = 'P1' })
        }
        $json = Get-SLDlpRule -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# New-SLDlpRule
# =============================================================================
Describe 'New-SLDlpRule' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { New-SLDlpRule -Name 'Test' -Policy 'P1' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = New-SLDlpRule -Name 'Block Credit Cards' -Policy 'PII Protection' -BlockAccess $true -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'New-DlpComplianceRule'
        $result.Name | Should -Be 'Block Credit Cards'
        $result.Policy | Should -Be 'PII Protection'
    }

    It 'Includes ContentContainsSensitiveInformation in dry-run' {
        $sitInfo = @(@{ Name = 'U.S. Social Security Number (SSN)'; minCount = 1 })
        $result = New-SLDlpRule -Name 'Detect SSN' -Policy 'P1' -ContentContainsSensitiveInformation $sitInfo -DryRun
        $result.ContentContainsSensitiveInformation | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = New-SLDlpRule -Name 'Test' -Policy 'P1' -DryRun -AsJson
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Creates a DLP rule' {
        Mock New-DlpComplianceRule { [PSCustomObject]@{ Name = 'Block Credit Cards' } }
        $result = New-SLDlpRule -Name 'Block Credit Cards' -Policy 'PII Protection' -Confirm:$false
        $result.Name | Should -Be 'Block Credit Cards'
    }
}

# =============================================================================
# Set-SLDlpRule
# =============================================================================
Describe 'Set-SLDlpRule' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Set-SLDlpRule -Identity 'Test' -Comment 'Update' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Set-SLDlpRule -Identity 'Block Credit Cards' -BlockAccess $true -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-DlpComplianceRule'
        $result.Identity | Should -Be 'Block Credit Cards'
    }

    It 'Includes NotifyUser and GenerateAlert in dry-run' {
        $result = Set-SLDlpRule -Identity 'Test' -NotifyUser 'admin@contoso.com' -GenerateAlert 'alerts@contoso.com' -DryRun
        $result.NotifyUser | Should -Contain 'admin@contoso.com'
        $result.GenerateAlert | Should -Contain 'alerts@contoso.com'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Set-SLDlpRule -Identity 'Test' -Comment 'Change' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Set-DlpComplianceRule'
    }
}

# =============================================================================
# Remove-SLDlpRule
# =============================================================================
Describe 'Remove-SLDlpRule' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Remove-SLDlpRule -Identity 'Test' -Confirm:$false } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Remove-SLDlpRule -Identity 'Old DLP Rule' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Remove-DlpComplianceRule'
        $result.Identity | Should -Be 'Old DLP Rule'
    }

    It 'Removes a DLP rule' {
        Mock Remove-DlpComplianceRule { }
        $null = Remove-SLDlpRule -Identity 'Old DLP Rule' -Confirm:$false
        Should -Invoke Remove-DlpComplianceRule -Times 1
    }
}

# =============================================================================
# Get-SLSensitiveInfoType
# =============================================================================
Describe 'Get-SLSensitiveInfoType' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLSensitiveInfoType } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns all sensitive info types' {
        Mock Get-DlpSensitiveInformationType {
            @(
                [PSCustomObject]@{ Name = 'Credit Card Number'; Publisher = 'Microsoft Corporation' }
                [PSCustomObject]@{ Name = 'Custom Pattern'; Publisher = 'Contoso' }
            )
        }
        $result = Get-SLSensitiveInfoType
        $result | Should -HaveCount 2
    }

    It 'Filters custom-only types with -CustomOnly' {
        Mock Get-DlpSensitiveInformationType {
            @(
                [PSCustomObject]@{ Name = 'Credit Card Number'; Publisher = 'Microsoft Corporation' }
                [PSCustomObject]@{ Name = 'Custom Pattern'; Publisher = 'Contoso' }
                [PSCustomObject]@{ Name = 'Employee ID'; Publisher = 'Contoso' }
            )
        }
        $result = Get-SLSensitiveInfoType -CustomOnly
        $result | Should -HaveCount 2
        $result.Publisher | Should -Not -Contain 'Microsoft Corporation'
    }

    It 'Returns specific type by Identity' {
        Mock Get-DlpSensitiveInformationType {
            [PSCustomObject]@{ Name = 'Credit Card Number'; Publisher = 'Microsoft Corporation' }
        }
        $result = Get-SLSensitiveInfoType -Identity 'Credit Card Number'
        $result.Name | Should -Be 'Credit Card Number'
    }

    It 'Returns JSON with -AsJson' {
        Mock Get-DlpSensitiveInformationType {
            @([PSCustomObject]@{ Name = 'Test'; Publisher = 'Microsoft Corporation' })
        }
        $json = Get-SLSensitiveInfoType -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Set-SLSensitiveInfoType
# =============================================================================
Describe 'Set-SLSensitiveInfoType' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Set-SLSensitiveInfoType -Identity 'Test' -Description 'Update' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Set-SLSensitiveInfoType -Identity 'Contoso Employee ID' -Description 'Updated pattern' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-DlpSensitiveInformationType'
        $result.Identity | Should -Be 'Contoso Employee ID'
        $result.Description | Should -Be 'Updated pattern'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Set-SLSensitiveInfoType -Identity 'Test' -Description 'Change' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Set-DlpSensitiveInformationType'
    }

    It 'Updates a sensitive info type' {
        Mock Set-DlpSensitiveInformationType { [PSCustomObject]@{ Name = 'Test'; Description = 'Updated' } }
        $result = Set-SLSensitiveInfoType -Identity 'Test' -Description 'Updated' -Confirm:$false
        $result.Description | Should -Be 'Updated'
    }
}
