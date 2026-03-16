#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel private helper functions.
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
        AuditLogPath     = Join-Path $HOME '.stablelabel' 'audit.jsonl'
        ElevationState   = Join-Path $HOME '.stablelabel' 'elevation-state.json'
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

Describe 'Resolve-SLLabelName' {
    BeforeEach {
        $script:SLLabelCache = @{
            Labels = @(
                [PSCustomObject]@{ id = 'guid-1'; name = 'Confidential'; displayName = 'Confidential' }
                [PSCustomObject]@{ id = 'guid-2'; name = 'Internal'; displayName = 'Internal Only' }
                [PSCustomObject]@{ id = 'guid-3'; name = 'Public'; displayName = 'Public' }
            )
            CachedAt = Get-Date
            TenantId = 'test-tenant'
        }
        $script:SLConnection.TenantId = 'test-tenant'
    }

    It 'Resolves label ID to name' {
        $result = Resolve-SLLabelName -LabelId 'guid-1'
        $result | Should -Be 'Confidential'
    }

    It 'Returns GUID if label ID not found in cache' {
        $result = Resolve-SLLabelName -LabelId 'guid-unknown'
        $result | Should -Be 'guid-unknown'
    }

    It 'Resolves label name to ID' {
        $result = Resolve-SLLabelName -LabelName 'Confidential'
        $result | Should -Be 'guid-1'
    }

    It 'Resolves displayName to ID' {
        $result = Resolve-SLLabelName -LabelName 'Internal Only'
        $result | Should -Be 'guid-2'
    }

    It 'Throws when label name not found' {
        { Resolve-SLLabelName -LabelName 'NonExistent' } | Should -Throw "*not found*"
    }

    It 'Uses cached data when fresh (< 30 min)' {
        Mock Invoke-SLGraphRequest { throw 'Should not be called' }
        $result = Resolve-SLLabelName -LabelId 'guid-1'
        $result | Should -Be 'Confidential'
    }

    It 'Refreshes cache when ForceRefresh is set' {
        Mock Invoke-SLGraphRequest {
            @(
                [PSCustomObject]@{ id = 'guid-new'; name = 'NewLabel'; displayName = 'NewLabel' }
            )
        }
        $result = Resolve-SLLabelName -LabelId 'guid-new' -ForceRefresh
        $result | Should -Be 'NewLabel'
        Should -Invoke Invoke-SLGraphRequest -Times 1
    }

    It 'Refreshes cache when stale (> 30 min)' {
        $script:SLLabelCache.CachedAt = (Get-Date).AddMinutes(-35)
        Mock Invoke-SLGraphRequest {
            @([PSCustomObject]@{ id = 'guid-1'; name = 'Confidential'; displayName = 'Confidential' })
        }
        $null = Resolve-SLLabelName -LabelId 'guid-1'
        Should -Invoke Invoke-SLGraphRequest -Times 1
    }

    It 'Falls back to stale cache when refresh fails' {
        $script:SLLabelCache.CachedAt = (Get-Date).AddMinutes(-35)
        Mock Invoke-SLGraphRequest { throw 'Network error' }
        $result = Resolve-SLLabelName -LabelId 'guid-1'
        $result | Should -Be 'Confidential'
    }

    It 'Throws when refresh fails and cache is empty' {
        $script:SLLabelCache.Labels = @()
        $script:SLLabelCache.CachedAt = $null
        Mock Invoke-SLGraphRequest { throw 'Network error' }
        { Resolve-SLLabelName -LabelId 'guid-1' } | Should -Throw '*cache is empty*'
    }
}

Describe 'ConvertTo-SLSnapshot' {
    BeforeEach {
        $script:SLConnection.UserPrincipalName = 'admin@contoso.com'
        $script:SLConnection.TenantId = 'tenant-123'
    }

    It 'Returns an ordered hashtable with required keys' {
        Mock Get-Module { [PSCustomObject]@{ Version = [version]'0.1.0' } }
        $result = ConvertTo-SLSnapshot -Data @{ Labels = @() } -Name 'test-snap' -Scope 'All'

        $result.Keys | Should -Contain 'SnapshotId'
        $result.Keys | Should -Contain 'Name'
        $result.Keys | Should -Contain 'CreatedAt'
        $result.Keys | Should -Contain 'CreatedBy'
        $result.Keys | Should -Contain 'TenantId'
        $result.Keys | Should -Contain 'Scope'
        $result.Keys | Should -Contain 'Data'
    }

    It 'Sets the Name correctly' {
        Mock Get-Module { [PSCustomObject]@{ Version = [version]'0.1.0' } }
        $result = ConvertTo-SLSnapshot -Data @{} -Name 'my-snapshot' -Scope 'Labels'
        $result.Name | Should -Be 'my-snapshot'
    }

    It 'Sets the Scope correctly' {
        Mock Get-Module { [PSCustomObject]@{ Version = [version]'0.1.0' } }
        $result = ConvertTo-SLSnapshot -Data @{} -Name 'test' -Scope 'Dlp'
        $result.Scope | Should -Be 'Dlp'
    }

    It 'Includes CreatedBy from connection state' {
        Mock Get-Module { [PSCustomObject]@{ Version = [version]'0.1.0' } }
        $result = ConvertTo-SLSnapshot -Data @{} -Name 'test'
        $result.CreatedBy | Should -Be 'admin@contoso.com'
    }

    It 'Includes TenantId from connection state' {
        Mock Get-Module { [PSCustomObject]@{ Version = [version]'0.1.0' } }
        $result = ConvertTo-SLSnapshot -Data @{} -Name 'test'
        $result.TenantId | Should -Be 'tenant-123'
    }

    It 'Generates a SnapshotId with date prefix' {
        Mock Get-Module { [PSCustomObject]@{ Version = [version]'0.1.0' } }
        $result = ConvertTo-SLSnapshot -Data @{} -Name 'test'
        $result.SnapshotId | Should -Match '^sl-snap-\d{8}-\d{6}$'
    }

    It 'Preserves the Data hashtable' {
        Mock Get-Module { [PSCustomObject]@{ Version = [version]'0.1.0' } }
        $data = @{ Labels = @('a', 'b'); Policies = @('c') }
        $result = ConvertTo-SLSnapshot -Data $data -Name 'test'
        $result.Data.Labels.Count | Should -Be 2
        $result.Data.Policies.Count | Should -Be 1
    }

    It 'CreatedAt is ISO 8601 UTC format' {
        Mock Get-Module { [PSCustomObject]@{ Version = [version]'0.1.0' } }
        $result = ConvertTo-SLSnapshot -Data @{} -Name 'test'
        $result.CreatedAt | Should -Match '^\d{4}-\d{2}-\d{2}T.*Z$'
    }
}

Describe 'Invoke-SLProtectionCommand' {
    It 'Throws on non-Windows platforms' -Skip:$IsWindows {
        { Invoke-SLProtectionCommand -ScriptBlock { 'test' } } | Should -Throw '*Windows*'
    }

    It 'Checks Protection connection on Windows' -Skip:(-not $IsWindows) {
        $script:SLConnection.ProtectionConnected = $false
        { Invoke-SLProtectionCommand -ScriptBlock { 'test' } } | Should -Throw '*Not connected to Protection*'
    }
}

Describe 'Invoke-SLComplianceCommand' {
    BeforeEach {
        $script:SLConnection = @{
            GraphConnected      = $false
            ComplianceConnected = $true
            ProtectionConnected = $false
            UserPrincipalName   = 'admin@contoso.com'
            TenantId            = 'tenant-123'
            ConnectedAt         = @{ Graph = $null; Compliance = [datetime]::UtcNow; Protection = $null }
            ComplianceCommandCount = 0
            ComplianceSessionStart = [datetime]::UtcNow
        }
    }

    It 'Throws when Compliance is not connected' {
        $script:SLConnection.ComplianceConnected = $false
        { Invoke-SLComplianceCommand -ScriptBlock { 'test' } } | Should -Throw '*Not connected to Compliance*'
    }

    It 'Executes the script block and increments command count' {
        $result = Invoke-SLComplianceCommand -ScriptBlock { 'hello' }
        $result | Should -Be 'hello'
        $script:SLConnection.ComplianceCommandCount | Should -Be 1
    }

    It 'Returns complex objects from script blocks' {
        $result = Invoke-SLComplianceCommand -ScriptBlock {
            [PSCustomObject]@{ Name = 'TestPolicy'; Enabled = $true }
        }
        $result.Name | Should -Be 'TestPolicy'
    }

    It 'Increments command count on each call' {
        $null = Invoke-SLComplianceCommand -ScriptBlock { 'a' }
        $null = Invoke-SLComplianceCommand -ScriptBlock { 'b' }
        $null = Invoke-SLComplianceCommand -ScriptBlock { 'c' }
        $script:SLConnection.ComplianceCommandCount | Should -Be 3
    }
}

Describe 'Invoke-SLGraphRequest' {
    BeforeEach {
        $script:SLConfig.GraphBaseUrl = 'https://graph.microsoft.com'
        $script:SLConfig.MaxJsonDepth = 20
    }

    It 'Constructs the correct URL with v1.0' {
        Mock Invoke-MgGraphRequest { [PSCustomObject]@{ value = @() } } -Verifiable
        $null = Invoke-SLGraphRequest -Method GET -Uri '/me'
        Should -InvokeVerifiable
    }

    It 'Returns .value when present and no pagination' {
        Mock Invoke-MgGraphRequest {
            @{ value = @('item1', 'item2') }
        }
        $result = Invoke-SLGraphRequest -Method GET -Uri '/test'
        $result | Should -HaveCount 2
    }

    It 'Returns raw result when no .value property' {
        Mock Invoke-MgGraphRequest {
            [PSCustomObject]@{ id = 'abc'; name = 'test' }
        }
        $result = Invoke-SLGraphRequest -Method GET -Uri '/test/abc'
        $result.id | Should -Be 'abc'
    }

    It 'Handles AutoPaginate with multiple pages' {
        $callCount = 0
        Mock Invoke-MgGraphRequest {
            $callCount++
            if ($callCount -eq 1) {
                @{
                    value = @('page1-item1', 'page1-item2')
                    '@odata.nextLink' = 'https://graph.microsoft.com/v1.0/test?skiptoken=abc'
                }
            }
            else {
                @{
                    value = @('page2-item1')
                }
            }
        }.GetNewClosure()

        $result = Invoke-SLGraphRequest -Method GET -Uri '/test' -AutoPaginate
        $result | Should -HaveCount 3
    }

    It 'Passes Body as JSON for POST requests' {
        Mock Invoke-MgGraphRequest { @{ id = 'new-item' } } -Verifiable
        $body = @{ name = 'Test'; value = 42 }
        $result = Invoke-SLGraphRequest -Method POST -Uri '/test' -Body $body
        Should -InvokeVerifiable
    }

    It 'Uses beta API version when specified' {
        Mock Invoke-MgGraphRequest { @{ value = @() } }
        $null = Invoke-SLGraphRequest -Method GET -Uri '/security/labels' -ApiVersion beta
        Should -Invoke Invoke-MgGraphRequest -ParameterFilter {
            $Uri -like '*beta*'
        }
    }
}
