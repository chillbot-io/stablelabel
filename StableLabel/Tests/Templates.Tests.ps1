#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel template functions: Get-SLTemplate, Deploy-SLTemplate.
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
# Get-SLTemplate
# =============================================================================
Describe 'Get-SLTemplate' {
    It 'Returns all built-in templates' {
        $result = Get-SLTemplate
        $result | Should -Not -BeNullOrEmpty
        @($result).Count | Should -BeGreaterOrEqual 3
    }

    It 'Returns Standard-Labels template by name' {
        $result = Get-SLTemplate -Name 'Standard-Labels'
        $result | Should -Not -BeNullOrEmpty
        $result.Name | Should -Be 'Standard-Labels'
        $result.Type | Should -Be 'Labels'
    }

    It 'Returns GDPR-DLP template by name' {
        $result = Get-SLTemplate -Name 'GDPR-DLP'
        $result | Should -Not -BeNullOrEmpty
        $result.Name | Should -Be 'GDPR-DLP'
        $result.Type | Should -Be 'DLP'
        $result.SensitiveInfoTypes | Should -Not -BeNullOrEmpty
    }

    It 'Warns when template name not found' {
        $result = Get-SLTemplate -Name 'Nonexistent-Template' -WarningAction SilentlyContinue
        $result | Should -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        $json = Get-SLTemplate -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Returns JSON for specific template with -AsJson' {
        $json = Get-SLTemplate -Name 'Standard-Labels' -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).Name | Should -Be 'Standard-Labels'
    }

    It 'Templates have required properties' {
        $templates = Get-SLTemplate
        foreach ($t in $templates) {
            $t.PSObject.Properties.Name | Should -Contain 'Name'
            $t.PSObject.Properties.Name | Should -Contain 'Description'
            $t.PSObject.Properties.Name | Should -Contain 'Type'
        }
    }
}

# =============================================================================
# Deploy-SLTemplate
# =============================================================================
Describe 'Deploy-SLTemplate' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Deploy-SLTemplate -Name 'Standard-Labels' -Confirm:$false } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Deploys Standard-Labels template in dry-run mode' {
        $result = Deploy-SLTemplate -Name 'Standard-Labels' -DryRun -Confirm:$false
        $result | Should -Not -BeNullOrEmpty
        $result.TemplateName | Should -Be 'Standard-Labels'
        $result.Type | Should -Be 'Labels'
        $result.ItemsCreated | Should -BeGreaterOrEqual 1
    }

    It 'Deploys GDPR-DLP template in dry-run mode' {
        $result = Deploy-SLTemplate -Name 'GDPR-DLP' -DryRun -Confirm:$false
        $result | Should -Not -BeNullOrEmpty
        $result.TemplateName | Should -Be 'GDPR-DLP'
        $result.Type | Should -Be 'DLP'
        $result.ItemsCreated | Should -BeGreaterOrEqual 2
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Deploy-SLTemplate -Name 'Standard-Labels' -DryRun -AsJson -Confirm:$false
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).TemplateName | Should -Be 'Standard-Labels'
    }

    It 'Returns nothing for nonexistent template' {
        $result = Deploy-SLTemplate -Name 'Nonexistent-Template' -DryRun -WarningAction SilentlyContinue -Confirm:$false
        $result | Should -BeNullOrEmpty
    }

    It 'Includes Results array in output' {
        $result = Deploy-SLTemplate -Name 'Standard-Labels' -DryRun -Confirm:$false
        $result.Results | Should -Not -BeNullOrEmpty
    }
}
