#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel elevation functions: Enable/Disable-SLSuperUser,
    Get-SLSuperUserStatus, Grant/Revoke-SLSiteAdmin, Grant/Revoke-SLMailboxAccess,
    Request-SLPimRole, Start/Stop-SLElevatedJob, Invoke-SLElevatedAction.
#>

BeforeAll {
    $moduleRoot = Join-Path $PSScriptRoot '..'

    $script:SLConnection = @{
        GraphConnected      = $false
        ComplianceConnected = $false
        ProtectionConnected = $false
        UserPrincipalName   = 'admin@contoso.com'
        TenantId            = 'tenant-123'
        UserId              = 'user-id-123'
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
# Enable-SLSuperUser
# =============================================================================
Describe 'Enable-SLSuperUser' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Enable-SLSuperUser -Confirm:$false } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Enable-SLSuperUser -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Enable-SuperUser'
        $result.Target | Should -Be 'AipServiceSuperUserFeature'
        $result.PSObject.Properties.Name | Should -Contain 'Action'
        $result.PSObject.Properties.Name | Should -Contain 'Target'
        $result.PSObject.Properties.Name | Should -Contain 'DryRun'
    }

    It 'Writes audit entry on dry-run' {
        $auditPath = $script:SLConfig.AuditLogPath
        if (Test-Path $auditPath) { Remove-Item $auditPath -Force }
        $null = Enable-SLSuperUser -DryRun
        Test-Path $auditPath | Should -BeTrue
        $content = Get-Content -Path $auditPath -Raw
        $auditEntry = $content.Trim().Split("`n") | Select-Object -Last 1 | ConvertFrom-Json
        $auditEntry.action | Should -Be 'Enable-SuperUser'
        $auditEntry.result | Should -Be 'dry-run'
        $auditEntry.target | Should -Be 'AipServiceSuperUserFeature'
    }

    It 'Records elevation state file on success' -Skip:(-not $IsWindows) {
        Mock Enable-AipServiceSuperUserFeature { }
        $statePath = $script:SLConfig.ElevationState
        if (Test-Path $statePath) { Remove-Item $statePath -Force }

        $null = Enable-SLSuperUser -Confirm:$false
        Test-Path $statePath | Should -BeTrue
        $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json
        $state.SuperUser.Enabled | Should -BeTrue
        $state.SuperUser.EnabledAt | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Enable-SLSuperUser -DryRun -AsJson
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }
}

# =============================================================================
# Disable-SLSuperUser
# =============================================================================
Describe 'Disable-SLSuperUser' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Disable-SLSuperUser -Confirm:$false } | Should -Throw '*Not connected to Protection*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Disable-SLSuperUser -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Disable-SuperUser'
        $result.Target | Should -Be 'AipServiceSuperUserFeature'
        $result.PSObject.Properties.Name | Should -Contain 'Action'
        $result.PSObject.Properties.Name | Should -Contain 'Target'
        $result.PSObject.Properties.Name | Should -Contain 'DryRun'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Disable-SLSuperUser -DryRun -AsJson
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }
}

# =============================================================================
# Get-SLSuperUserStatus
# =============================================================================
Describe 'Get-SLSuperUserStatus' {
    BeforeEach {
        $script:SLConnection.ProtectionConnected = $true
    }

    It 'Requires Protection connection' {
        $script:SLConnection.ProtectionConnected = $false
        { Get-SLSuperUserStatus } | Should -Throw '*Not connected to Protection*'
    }
}

# =============================================================================
# Grant-SLSiteAdmin
# =============================================================================
Describe 'Grant-SLSiteAdmin' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Grant-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com' -Confirm:$false } |
            Should -Throw '*Not connected to Graph*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Grant-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Grant-SiteAdmin'
        $result.SiteUrl | Should -Be 'https://contoso.sharepoint.com/sites/hr'
        $result.UserPrincipalName | Should -Be 'admin@contoso.com'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Grant-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Grant-SiteAdmin'
    }
}

# =============================================================================
# Revoke-SLSiteAdmin
# =============================================================================
Describe 'Revoke-SLSiteAdmin' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Revoke-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com' -Confirm:$false } |
            Should -Throw '*Not connected to Graph*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Revoke-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Revoke-SiteAdmin'
        $result.SiteUrl | Should -Be 'https://contoso.sharepoint.com/sites/hr'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Revoke-SLSiteAdmin -SiteUrl 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'admin@contoso.com' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Revoke-SiteAdmin'
    }
}

# =============================================================================
# Grant-SLMailboxAccess
# =============================================================================
Describe 'Grant-SLMailboxAccess' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Grant-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -Confirm:$false } |
            Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Grant-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Grant-MailboxAccess'
        $result.Identity | Should -Be 'shared@contoso.com'
        $result.User | Should -Be 'admin@contoso.com'
        $result.AccessRights | Should -Be 'FullAccess'
    }

    It 'Supports ReadPermission access rights in dry-run' {
        $result = Grant-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -AccessRights ReadPermission -DryRun
        $result.AccessRights | Should -Be 'ReadPermission'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Grant-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Grant-MailboxAccess'
    }

    It 'Grants mailbox access' {
        Mock Add-MailboxPermission { [PSCustomObject]@{ Identity = 'shared@contoso.com' } }
        $result = Grant-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -Confirm:$false
        $result.Action | Should -Be 'Grant-MailboxAccess'
    }
}

# =============================================================================
# Revoke-SLMailboxAccess
# =============================================================================
Describe 'Revoke-SLMailboxAccess' {
    BeforeEach {
        $script:SLConnection.ComplianceConnected = $true
        $script:SLConnection.ComplianceSessionStart = [datetime]::UtcNow
        $script:SLConnection.ComplianceCommandCount = 0
    }

    It 'Requires Compliance connection' {
        $script:SLConnection.ComplianceConnected = $false
        { Revoke-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -Confirm:$false } |
            Should -Throw '*Not connected to Compliance*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Revoke-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Revoke-MailboxAccess'
        $result.Identity | Should -Be 'shared@contoso.com'
        $result.User | Should -Be 'admin@contoso.com'
        $result.AccessRights | Should -Be 'FullAccess'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Revoke-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Revoke-MailboxAccess'
    }

    It 'Revokes mailbox access' {
        Mock Remove-MailboxPermission { }
        $result = Revoke-SLMailboxAccess -Identity 'shared@contoso.com' -User 'admin@contoso.com' -Confirm:$false
        $result.Action | Should -Be 'Revoke-MailboxAccess'
        $result.Revoked | Should -BeTrue
    }
}

# =============================================================================
# Request-SLPimRole
# =============================================================================
Describe 'Request-SLPimRole' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
        $script:SLConnection.UserId = 'user-id-123'
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Request-SLPimRole -RoleDefinitionId '62e90394' -Justification 'Test' } | Should -Throw '*Not connected to Graph*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Request-SLPimRole -RoleDefinitionId '62e90394' -Justification 'Compliance investigation' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Request-PimRole'
        $result.RoleDefinitionId | Should -Be '62e90394'
        $result.Justification | Should -Be 'Compliance investigation'
        $result.DurationHours | Should -Be 8
    }

    It 'Supports custom DurationHours' {
        $result = Request-SLPimRole -RoleDefinitionId '62e90394' -Justification 'Test' -DurationHours 4 -DryRun
        $result.DurationHours | Should -Be 4
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Request-SLPimRole -RoleDefinitionId '62e90394' -Justification 'Test' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Request-PimRole'
    }

    It 'Activates a PIM role via Graph' {
        Mock Invoke-SLGraphRequest { @{ id = 'request-123'; status = 'Provisioned' } } -ParameterFilter {
            $Uri -like '*roleAssignmentScheduleRequests*'
        }
        $result = Request-SLPimRole -RoleDefinitionId '62e90394' -Justification 'Audit' -Confirm:$false
        $result.RequestId | Should -Be 'request-123'
        $result.Status | Should -Be 'Provisioned'
    }
}

# =============================================================================
# Start-SLElevatedJob
# =============================================================================
Describe 'Start-SLElevatedJob' {
    BeforeEach {
        $script:SLActiveJob = $null
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Start-SLElevatedJob -SiteUrls 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'ga@contoso.com' -DryRun
        $result.Status | Should -Be 'DryRun'
        $result.DryRun | Should -BeTrue
        $result.UserPrincipalName | Should -Be 'ga@contoso.com'
        $result.PSObject.Properties.Name | Should -Contain 'JobId'
        $result.PSObject.Properties.Name | Should -Contain 'Status'
        $result.PSObject.Properties.Name | Should -Contain 'DryRun'
        $result.PSObject.Properties.Name | Should -Contain 'UserPrincipalName'
        $result.PSObject.Properties.Name | Should -Contain 'SiteUrls'
        $result.PSObject.Properties.Name | Should -Contain 'Elevations'
        $result.PSObject.Properties.Name | Should -Contain 'StartedAt'
    }

    It 'Generates a job ID with SLJob prefix' {
        $result = Start-SLElevatedJob -SiteUrls 'https://contoso.sharepoint.com/sites/hr' -UserPrincipalName 'ga@contoso.com' -DryRun
        $result.JobId | Should -Match '^SLJob-'
    }

    It 'Includes SiteUrls in dry-run result' {
        $sites = @('https://site1.com', 'https://site2.com')
        $result = Start-SLElevatedJob -SiteUrls $sites -UserPrincipalName 'ga@contoso.com' -DryRun
        $result.SiteUrls | Should -HaveCount 2
    }

    It 'Stores job in module-scoped SLActiveJob on dry-run' {
        $null = Start-SLElevatedJob -SiteUrls 'https://site.com' -UserPrincipalName 'ga@contoso.com' -DryRun
        $script:SLActiveJob | Should -Not -BeNullOrEmpty
    }

    It 'Creates SuperUser elevation in dry-run when not skipped' {
        $result = Start-SLElevatedJob -SiteUrls 'https://site.com' -UserPrincipalName 'ga@contoso.com' -DryRun
        $superUserElev = $result.Elevations | Where-Object { $_.Type -eq 'SuperUser' }
        $superUserElev | Should -Not -BeNullOrEmpty
        $superUserElev.Status | Should -Be 'DryRun'
    }

    It 'Skips SuperUser elevation when -SkipSuperUser is set' {
        $result = Start-SLElevatedJob -SiteUrls 'https://site.com' -UserPrincipalName 'ga@contoso.com' -SkipSuperUser -DryRun
        $superUserElev = $result.Elevations | Where-Object { $_.Type -eq 'SuperUser' }
        $superUserElev | Should -BeNullOrEmpty
    }

    It 'Skips SiteAdmin elevation when -SkipSiteAdmin is set' {
        $result = Start-SLElevatedJob -SiteUrls 'https://site.com' -UserPrincipalName 'ga@contoso.com' -SkipSiteAdmin -DryRun
        $siteAdminElev = $result.Elevations | Where-Object { $_.Type -eq 'SiteAdmin' }
        $siteAdminElev | Should -BeNullOrEmpty
    }

    It 'Creates SiteAdmin elevations for each site URL in dry-run' {
        $sites = @('https://site1.com', 'https://site2.com', 'https://site3.com')
        $result = Start-SLElevatedJob -SiteUrls $sites -UserPrincipalName 'ga@contoso.com' -DryRun
        $siteAdminElevs = @($result.Elevations | Where-Object { $_.Type -eq 'SiteAdmin' })
        $siteAdminElevs | Should -HaveCount 3
    }
}

# =============================================================================
# Stop-SLElevatedJob
# =============================================================================
Describe 'Stop-SLElevatedJob' {
    BeforeEach {
        $script:SLActiveJob = $null
    }

    It 'Returns warning when no active job found' {
        $result = Stop-SLElevatedJob -Force -Confirm:$false
        $result | Should -BeNullOrEmpty
    }

    It 'Clears module-scoped SLActiveJob when stopping a dry-run job' {
        # Create a dry-run job first
        $script:SLActiveJob = @{
            JobId = 'SLJob-test-123'
            Status = 'DryRun'
            UserPrincipalName = 'ga@contoso.com'
            StartedAt = [datetime]::UtcNow.ToString('o')
            Elevations = [System.Collections.Generic.List[hashtable]]::new()
            SiteUrls = @()
            DryRun = $true
        }

        Mock Disconnect-MgGraph { }

        $result = Stop-SLElevatedJob -Force -Confirm:$false
        $script:SLActiveJob | Should -BeNullOrEmpty
    }
}

# =============================================================================
# Invoke-SLElevatedAction
# =============================================================================
Describe 'Invoke-SLElevatedAction' {
    BeforeEach {
        $script:SLActiveJob = $null
    }

    It 'Throws when no active job exists' {
        { Invoke-SLElevatedAction -ScriptBlock { 'test' } -Confirm:$false } | Should -Throw '*No active elevated job*'
    }

    It 'Throws when job is not Active or DryRun' {
        $script:SLActiveJob = @{
            JobId = 'SLJob-test'
            Status = 'Completed'
            Elevations = [System.Collections.Generic.List[hashtable]]::new()
        }
        { Invoke-SLElevatedAction -ScriptBlock { 'test' } -Confirm:$false } | Should -Throw '*not active*'
    }

    It 'Executes script block within dry-run job context' {
        $script:SLActiveJob = @{
            JobId = 'SLJob-test-dr'
            Status = 'DryRun'
            UserPrincipalName = 'ga@contoso.com'
            StartedAt = [datetime]::UtcNow.ToString('o')
            Elevations = [System.Collections.Generic.List[hashtable]]::new()
            SiteUrls = @()
            DryRun = $true
        }

        Mock Stop-SLElevatedJob { }

        $result = Invoke-SLElevatedAction -ScriptBlock { 'elevated-result' } -Confirm:$false
        $result | Should -Be 'elevated-result'
    }

    It 'Does not auto-cleanup when -NoAutoCleanup is set' {
        $script:SLActiveJob = @{
            JobId = 'SLJob-test-nac'
            Status = 'DryRun'
            UserPrincipalName = 'ga@contoso.com'
            StartedAt = [datetime]::UtcNow.ToString('o')
            Elevations = [System.Collections.Generic.List[hashtable]]::new()
            SiteUrls = @()
            DryRun = $true
        }

        Mock Stop-SLElevatedJob { }

        $null = Invoke-SLElevatedAction -ScriptBlock { 'test' } -NoAutoCleanup -Confirm:$false
        Should -Not -Invoke Stop-SLElevatedJob
    }
}
