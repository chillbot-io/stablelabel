#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel label policy and auto-label policy functions.
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
# Get-SLLabelPolicy
# =============================================================================
Describe 'Get-SLLabelPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLLabelPolicy } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns all label policies' {
        Mock Get-LabelPolicy {
            @(
                [PSCustomObject]@{ Name = 'Global Policy'; Enabled = $true }
                [PSCustomObject]@{ Name = 'Finance Policy'; Enabled = $true }
            )
        }
        $result = Get-SLLabelPolicy
        $result | Should -HaveCount 2
    }

    It 'Returns specific policy by Identity' {
        Mock Get-LabelPolicy {
            [PSCustomObject]@{ Name = 'Global Policy'; Enabled = $true }
        }
        $result = Get-SLLabelPolicy -Identity 'Global Policy'
        $result.Name | Should -Be 'Global Policy'
    }

    It 'Returns JSON with -AsJson' {
        Mock Get-LabelPolicy {
            @([PSCustomObject]@{ Name = 'Test'; Enabled = $true })
        }
        $json = Get-SLLabelPolicy -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# New-SLLabelPolicy
# =============================================================================
Describe 'New-SLLabelPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { New-SLLabelPolicy -Name 'Test' -Labels 'Confidential' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Creates a label policy' {
        Mock New-LabelPolicy { [PSCustomObject]@{ Name = 'Finance Policy'; Labels = @('Confidential') } }
        $result = New-SLLabelPolicy -Name 'Finance Policy' -Labels 'Confidential' -Confirm:$false
        $result.Name | Should -Be 'Finance Policy'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = New-SLLabelPolicy -Name 'Test Policy' -Labels 'Public' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'New-LabelPolicy'
        $result.Name | Should -Be 'Test Policy'
    }

    It 'Includes labels in dry-run result' {
        $result = New-SLLabelPolicy -Name 'Test' -Labels 'Confidential', 'Internal' -DryRun
        $result.Labels | Should -HaveCount 2
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = New-SLLabelPolicy -Name 'Test' -Labels 'Public' -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Includes AdvancedSettings in dry-run' {
        $settings = @{ RequireJustification = 'true' }
        $result = New-SLLabelPolicy -Name 'Test' -AdvancedSettings $settings -DryRun
        $result.AdvancedSettings.RequireJustification | Should -Be 'true'
    }

    It 'Includes Comment in dry-run' {
        $result = New-SLLabelPolicy -Name 'Test' -Comment 'Test comment' -DryRun
        $result.Comment | Should -Be 'Test comment'
    }
}

# =============================================================================
# Set-SLLabelPolicy
# =============================================================================
Describe 'Set-SLLabelPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Set-SLLabelPolicy -Identity 'Test' -Comment 'Update' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Set-SLLabelPolicy -Identity 'Global Policy' -Comment 'Updated' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-LabelPolicy'
        $result.Identity | Should -Be 'Global Policy'
    }

    It 'Returns AddLabels and RemoveLabels in dry-run' {
        $result = Set-SLLabelPolicy -Identity 'Test' -AddLabels 'Secret' -RemoveLabels 'Public' -DryRun
        $result.AddLabels | Should -Contain 'Secret'
        $result.RemoveLabels | Should -Contain 'Public'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Set-SLLabelPolicy -Identity 'Test' -Comment 'Change' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Set-LabelPolicy'
    }

    It 'Updates a label policy' {
        Mock Set-LabelPolicy { [PSCustomObject]@{ Name = 'Global Policy'; Comment = 'Updated' } }
        $result = Set-SLLabelPolicy -Identity 'Global Policy' -Comment 'Updated' -Confirm:$false
        $result.Comment | Should -Be 'Updated'
    }
}

# =============================================================================
# Remove-SLLabelPolicy
# =============================================================================
Describe 'Remove-SLLabelPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Remove-SLLabelPolicy -Identity 'Test' -Confirm:$false } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Remove-SLLabelPolicy -Identity 'Old Policy' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Remove-LabelPolicy'
        $result.Identity | Should -Be 'Old Policy'
    }

    It 'Removes a label policy' {
        Mock Remove-LabelPolicy { }
        $null = Remove-SLLabelPolicy -Identity 'Old Policy' -Confirm:$false
        Should -Invoke Remove-LabelPolicy -Times 1
    }
}

# =============================================================================
# Get-SLAutoLabelPolicy
# =============================================================================
Describe 'Get-SLAutoLabelPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Get-SLAutoLabelPolicy } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns all auto-label policies' {
        Mock Get-AutoSensitivityLabelPolicy {
            @(
                [PSCustomObject]@{ Name = 'PII Auto-Label'; Mode = 'Enable' }
                [PSCustomObject]@{ Name = 'Finance Auto-Label'; Mode = 'TestWithNotifications' }
            )
        }
        $result = Get-SLAutoLabelPolicy
        $result | Should -HaveCount 2
    }

    It 'Returns specific policy by Identity' {
        Mock Get-AutoSensitivityLabelPolicy {
            [PSCustomObject]@{ Name = 'PII Auto-Label'; Mode = 'Enable' }
        }
        $result = Get-SLAutoLabelPolicy -Identity 'PII Auto-Label'
        $result.Name | Should -Be 'PII Auto-Label'
    }

    It 'Returns JSON with -AsJson' {
        Mock Get-AutoSensitivityLabelPolicy {
            @([PSCustomObject]@{ Name = 'Test'; Mode = 'Enable' })
        }
        $json = Get-SLAutoLabelPolicy -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# New-SLAutoLabelPolicy
# =============================================================================
Describe 'New-SLAutoLabelPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { New-SLAutoLabelPolicy -Name 'Test' -ApplySensitivityLabel 'Confidential' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = New-SLAutoLabelPolicy -Name 'PII Auto-Label' -ApplySensitivityLabel 'Confidential' -ExchangeLocation 'All' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'New-AutoSensitivityLabelPolicy'
        $result.Name | Should -Be 'PII Auto-Label'
        $result.ApplySensitivityLabel | Should -Be 'Confidential'
    }

    It 'Includes locations in dry-run result' {
        $result = New-SLAutoLabelPolicy -Name 'Test' -ApplySensitivityLabel 'Internal' -ExchangeLocation 'All' -SharePointLocation 'All' -OneDriveLocation 'All' -DryRun
        $result.ExchangeLocation | Should -Contain 'All'
        $result.SharePointLocation | Should -Contain 'All'
        $result.OneDriveLocation | Should -Contain 'All'
    }

    It 'Includes Mode in dry-run result' {
        $result = New-SLAutoLabelPolicy -Name 'Test' -ApplySensitivityLabel 'Internal' -Mode 'TestWithNotifications' -DryRun
        $result.Mode | Should -Be 'TestWithNotifications'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = New-SLAutoLabelPolicy -Name 'Test' -ApplySensitivityLabel 'Conf' -DryRun -AsJson
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Creates an auto-label policy' {
        Mock New-AutoSensitivityLabelPolicy { [PSCustomObject]@{ Name = 'PII Auto-Label' } }
        $result = New-SLAutoLabelPolicy -Name 'PII Auto-Label' -ApplySensitivityLabel 'Confidential' -Confirm:$false
        $result.Name | Should -Be 'PII Auto-Label'
    }
}

# =============================================================================
# Set-SLAutoLabelPolicy
# =============================================================================
Describe 'Set-SLAutoLabelPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Set-SLAutoLabelPolicy -Identity 'Test' -Mode 'Enable' } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Set-SLAutoLabelPolicy -Identity 'PII Auto-Label' -Mode 'Enable' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-AutoSensitivityLabelPolicy'
        $result.Identity | Should -Be 'PII Auto-Label'
        $result.Mode | Should -Be 'Enable'
    }

    It 'Includes Add/Remove location params in dry-run' {
        $result = Set-SLAutoLabelPolicy -Identity 'Test' -AddSharePointLocation 'https://site.com' -RemoveExchangeLocation 'user@mail.com' -DryRun
        $result.AddSharePointLocation | Should -Contain 'https://site.com'
        $result.RemoveExchangeLocation | Should -Contain 'user@mail.com'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Set-SLAutoLabelPolicy -Identity 'Test' -Mode 'Enable' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Set-AutoSensitivityLabelPolicy'
    }

    It 'Updates an auto-label policy' {
        Mock Set-AutoSensitivityLabelPolicy { [PSCustomObject]@{ Name = 'PII Auto-Label'; Mode = 'Enable' } }
        $result = Set-SLAutoLabelPolicy -Identity 'PII Auto-Label' -Mode 'Enable' -Confirm:$false
        $result.Mode | Should -Be 'Enable'
    }
}

# =============================================================================
# Remove-SLAutoLabelPolicy
# =============================================================================
Describe 'Remove-SLAutoLabelPolicy' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Remove-SLAutoLabelPolicy -Identity 'Test' -Confirm:$false } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Remove-SLAutoLabelPolicy -Identity 'Old Auto-Label' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Remove-AutoSensitivityLabelPolicy'
        $result.Identity | Should -Be 'Old Auto-Label'
    }

    It 'Removes an auto-label policy' {
        Mock Remove-AutoSensitivityLabelPolicy { }
        $null = Remove-SLAutoLabelPolicy -Identity 'Old Auto-Label' -Confirm:$false
        Should -Invoke Remove-AutoSensitivityLabelPolicy -Times 1
    }
}
