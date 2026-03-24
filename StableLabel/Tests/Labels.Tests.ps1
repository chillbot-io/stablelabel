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
    $script:SLAipClientType = $null
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
        Should -Invoke Get-LabelPolicy -Times 1
    }

    It 'Returns specific policy by Identity' {
        Mock Get-LabelPolicy {
            [PSCustomObject]@{ Name = 'Global Policy'; Enabled = $true }
        }
        $result = Get-SLLabelPolicy -Identity 'Global Policy'
        $result.Name | Should -Be 'Global Policy'
        Should -Invoke Get-LabelPolicy -Times 1 -ParameterFilter {
            $Identity -eq 'Global Policy'
        }
    }

    It 'Returns JSON with -AsJson' {
        Mock Get-LabelPolicy {
            @([PSCustomObject]@{ Name = 'Test'; Enabled = $true })
        }
        $json = Get-SLLabelPolicy -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        Should -Invoke Get-LabelPolicy -Times 1
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

    It 'Creates a label policy with correct parameters' {
        Mock New-LabelPolicy { [PSCustomObject]@{ Name = 'Finance Policy' } }
        $null = New-SLLabelPolicy -Name 'Finance Policy' -Labels 'Confidential','Internal' -Confirm:$false
        Should -Invoke New-LabelPolicy -Times 1 -ParameterFilter {
            $Name -eq 'Finance Policy' -and
            $Labels.Count -eq 2 -and
            $Labels -contains 'Confidential' -and
            $Labels -contains 'Internal'
        }
    }

    It 'Writes audit entry on successful create' {
        Mock New-LabelPolicy { [PSCustomObject]@{ Name = 'Test' } }
        $auditPath = $script:SLConfig.AuditLogPath
        if (Test-Path $auditPath) { Remove-Item $auditPath -Force }
        $null = New-SLLabelPolicy -Name 'Test' -Labels 'Public' -Confirm:$false
        Test-Path $auditPath | Should -BeTrue
        $entries = Get-Content $auditPath | ForEach-Object { $_ | ConvertFrom-Json }
        $createEntry = $entries | Where-Object { $_.action -eq 'New-LabelPolicy' -and $_.result -ne 'dry-run' }
        $createEntry | Should -Not -BeNullOrEmpty
    }

    It 'Propagates error when New-LabelPolicy throws' {
        Mock New-LabelPolicy { throw 'Policy creation failed' }
        { New-SLLabelPolicy -Name 'Bad Policy' -Labels 'Public' -Confirm:$false } | Should -Throw '*Policy creation failed*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = New-SLLabelPolicy -Name 'Test Policy' -Labels 'Public' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'New-LabelPolicy'
        $result.Name | Should -Be 'Test Policy'
    }

    It 'Writes audit entry on dry-run with valid JSON structure' {
        $auditPath = $script:SLConfig.AuditLogPath
        if (Test-Path $auditPath) { Remove-Item $auditPath -Force }
        $null = New-SLLabelPolicy -Name 'Audit Test' -Labels 'Public' -DryRun
        Test-Path $auditPath | Should -BeTrue
        $content = Get-Content -Path $auditPath -Raw
        $content | Should -Match 'New-LabelPolicy'
        $content | Should -Match 'dry-run'
        $content | Should -Match 'Audit Test'
        # Verify the audit entry is valid JSON with expected fields
        $auditEntry = $content.Trim().Split("`n") | Select-Object -Last 1 | ConvertFrom-Json
        $auditEntry.action | Should -Be 'New-LabelPolicy'
        $auditEntry.result | Should -Be 'dry-run'
        $auditEntry.target | Should -Be 'Audit Test'
        $auditEntry.timestamp | Should -Not -BeNullOrEmpty
    }

    It 'Throws when Name is empty' {
        { New-SLLabelPolicy -Name '' -Labels 'Public' } | Should -Throw
    }

    It 'Throws when Name contains only whitespace' {
        { New-SLLabelPolicy -Name '   ' -Labels 'Public' } | Should -Throw
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

    It 'Updates a label policy with correct parameters' {
        Mock Set-LabelPolicy { [PSCustomObject]@{ Name = 'Global Policy' } }
        $null = Set-SLLabelPolicy -Identity 'Global Policy' -Comment 'Updated' -AddLabels 'Secret' -Confirm:$false
        Should -Invoke Set-LabelPolicy -Times 1 -ParameterFilter {
            $Identity -eq 'Global Policy' -and
            $Comment -eq 'Updated' -and
            $AddLabels -contains 'Secret'
        }
    }

    It 'Writes audit entry on successful update' {
        Mock Set-LabelPolicy { [PSCustomObject]@{ Name = 'Global Policy' } }
        $auditPath = $script:SLConfig.AuditLogPath
        if (Test-Path $auditPath) { Remove-Item $auditPath -Force }
        $null = Set-SLLabelPolicy -Identity 'Global Policy' -Comment 'Changed' -Confirm:$false
        Test-Path $auditPath | Should -BeTrue
        $entries = Get-Content $auditPath | ForEach-Object { $_ | ConvertFrom-Json }
        $updateEntry = $entries | Where-Object { $_.action -eq 'Set-LabelPolicy' -and $_.result -ne 'dry-run' }
        $updateEntry | Should -Not -BeNullOrEmpty
    }

    It 'Propagates error when Set-LabelPolicy throws' {
        Mock Set-LabelPolicy { throw 'Access denied' }
        { Set-SLLabelPolicy -Identity 'Global Policy' -Comment 'Updated' -Confirm:$false } | Should -Throw '*Access denied*'
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
        Should -Invoke Remove-LabelPolicy -Times 1 -ParameterFilter {
            $Identity -eq 'Old Policy'
        }
    }

    It 'Writes audit entry on successful remove' {
        Mock Remove-LabelPolicy { }
        $auditPath = $script:SLConfig.AuditLogPath
        if (Test-Path $auditPath) { Remove-Item $auditPath -Force }
        $null = Remove-SLLabelPolicy -Identity 'Old Policy' -Confirm:$false
        Test-Path $auditPath | Should -BeTrue
        $entries = Get-Content $auditPath | ForEach-Object { $_ | ConvertFrom-Json }
        $removeEntry = $entries | Where-Object { $_.action -eq 'Remove-LabelPolicy' -and $_.result -ne 'dry-run' }
        $removeEntry | Should -Not -BeNullOrEmpty
    }

    It 'Propagates error when Remove-LabelPolicy throws' {
        Mock Remove-LabelPolicy { throw 'Policy not found' }
        { Remove-SLLabelPolicy -Identity 'Missing Policy' -Confirm:$false } | Should -Throw '*Policy not found*'
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
        Should -Invoke Get-AutoSensitivityLabelPolicy -Times 1
    }

    It 'Returns specific policy by Identity' {
        Mock Get-AutoSensitivityLabelPolicy {
            [PSCustomObject]@{ Name = 'PII Auto-Label'; Mode = 'Enable' }
        }
        $result = Get-SLAutoLabelPolicy -Identity 'PII Auto-Label'
        $result.Name | Should -Be 'PII Auto-Label'
        Should -Invoke Get-AutoSensitivityLabelPolicy -Times 1
    }

    It 'Returns JSON with -AsJson' {
        Mock Get-AutoSensitivityLabelPolicy {
            @([PSCustomObject]@{ Name = 'Test'; Mode = 'Enable' })
        }
        $json = Get-SLAutoLabelPolicy -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        Should -Invoke Get-AutoSensitivityLabelPolicy -Times 1
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

    It 'Creates an auto-label policy with correct parameters' {
        Mock New-AutoSensitivityLabelPolicy { [PSCustomObject]@{ Name = 'PII Auto-Label' } }
        $null = New-SLAutoLabelPolicy -Name 'PII Auto-Label' -ApplySensitivityLabel 'Confidential' -ExchangeLocation 'All' -Mode 'TestWithNotifications' -Confirm:$false
        Should -Invoke New-AutoSensitivityLabelPolicy -Times 1 -ParameterFilter {
            $Name -eq 'PII Auto-Label' -and
            $ApplySensitivityLabel -eq 'Confidential' -and
            $ExchangeLocation -contains 'All' -and
            $Mode -eq 'TestWithNotifications'
        }
    }

    It 'Writes audit entry on successful auto-label create' {
        Mock New-AutoSensitivityLabelPolicy { [PSCustomObject]@{ Name = 'Test' } }
        $auditPath = $script:SLConfig.AuditLogPath
        if (Test-Path $auditPath) { Remove-Item $auditPath -Force }
        $null = New-SLAutoLabelPolicy -Name 'Test' -ApplySensitivityLabel 'Internal' -Confirm:$false
        Test-Path $auditPath | Should -BeTrue
        $entries = Get-Content $auditPath | ForEach-Object { $_ | ConvertFrom-Json }
        $createEntry = $entries | Where-Object { $_.action -eq 'New-AutoSensitivityLabelPolicy' -and $_.result -ne 'dry-run' }
        $createEntry | Should -Not -BeNullOrEmpty
    }

    It 'Propagates error when New-AutoSensitivityLabelPolicy throws' {
        Mock New-AutoSensitivityLabelPolicy { throw 'Duplicate policy name' }
        { New-SLAutoLabelPolicy -Name 'Dupe' -ApplySensitivityLabel 'Confidential' -Confirm:$false } | Should -Throw '*Duplicate policy name*'
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

    It 'Updates an auto-label policy with correct parameters' {
        Mock Set-AutoSensitivityLabelPolicy { [PSCustomObject]@{ Name = 'PII Auto-Label' } }
        $null = Set-SLAutoLabelPolicy -Identity 'PII Auto-Label' -Mode 'Enable' -AddSharePointLocation 'https://site.com' -Confirm:$false
        Should -Invoke Set-AutoSensitivityLabelPolicy -Times 1 -ParameterFilter {
            $Identity -eq 'PII Auto-Label' -and
            $Mode -eq 'Enable' -and
            $AddSharePointLocation -contains 'https://site.com'
        }
    }

    It 'Writes audit entry on successful auto-label update' {
        Mock Set-AutoSensitivityLabelPolicy { [PSCustomObject]@{ Name = 'PII Auto-Label' } }
        $auditPath = $script:SLConfig.AuditLogPath
        if (Test-Path $auditPath) { Remove-Item $auditPath -Force }
        $null = Set-SLAutoLabelPolicy -Identity 'PII Auto-Label' -Mode 'Enable' -Confirm:$false
        Test-Path $auditPath | Should -BeTrue
        $entries = Get-Content $auditPath | ForEach-Object { $_ | ConvertFrom-Json }
        $updateEntry = $entries | Where-Object { $_.action -eq 'Set-AutoSensitivityLabelPolicy' -and $_.result -ne 'dry-run' }
        $updateEntry | Should -Not -BeNullOrEmpty
    }

    It 'Propagates error when Set-AutoSensitivityLabelPolicy throws' {
        Mock Set-AutoSensitivityLabelPolicy { throw 'Policy not found' }
        { Set-SLAutoLabelPolicy -Identity 'Missing' -Mode 'Enable' -Confirm:$false } | Should -Throw '*Policy not found*'
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
        Should -Invoke Remove-AutoSensitivityLabelPolicy -Times 1 -ParameterFilter {
            $Identity -eq 'Old Auto-Label'
        }
    }

    It 'Writes audit entry on successful auto-label remove' {
        Mock Remove-AutoSensitivityLabelPolicy { }
        $auditPath = $script:SLConfig.AuditLogPath
        if (Test-Path $auditPath) { Remove-Item $auditPath -Force }
        $null = Remove-SLAutoLabelPolicy -Identity 'Old Auto-Label' -Confirm:$false
        Test-Path $auditPath | Should -BeTrue
        $entries = Get-Content $auditPath | ForEach-Object { $_ | ConvertFrom-Json }
        $removeEntry = $entries | Where-Object { $_.action -eq 'Remove-AutoSensitivityLabelPolicy' -and $_.result -ne 'dry-run' }
        $removeEntry | Should -Not -BeNullOrEmpty
    }

    It 'Propagates error when Remove-AutoSensitivityLabelPolicy throws' {
        Mock Remove-AutoSensitivityLabelPolicy { throw 'Policy in use' }
        { Remove-SLAutoLabelPolicy -Identity 'Active Policy' -Confirm:$false } | Should -Throw '*Policy in use*'
    }
}
