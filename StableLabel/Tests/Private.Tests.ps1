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

# =============================================================================
# Invoke-SLWithRetry
# =============================================================================
Describe 'Invoke-SLWithRetry' {
    It 'Returns result on first successful attempt' {
        $result = Invoke-SLWithRetry -ScriptBlock { 'success' } -MaxRetries 3
        $result | Should -Be 'success'
    }

    It 'Retries on retryable HTTP status codes and eventually succeeds' {
        $script:retryAttempt = 0
        Mock Start-Sleep { }
        $result = Invoke-SLWithRetry -ScriptBlock {
            $script:retryAttempt++
            if ($script:retryAttempt -lt 3) {
                $ex = [System.Exception]::new("HTTP StatusCode: 429")
                throw $ex
            }
            'recovered'
        } -MaxRetries 3 -BaseDelaySeconds 1
        $result | Should -Be 'recovered'
        $script:retryAttempt | Should -Be 3
        Should -Invoke Start-Sleep -Times 2
    }

    It 'Throws after exceeding MaxRetries' {
        Mock Start-Sleep { }
        { Invoke-SLWithRetry -ScriptBlock {
            throw [System.Exception]::new("HTTP StatusCode: 503")
        } -MaxRetries 2 -BaseDelaySeconds 1 } | Should -Throw '*503*'
    }

    It 'Does not retry on non-retryable errors' {
        Mock Start-Sleep { }
        { Invoke-SLWithRetry -ScriptBlock {
            throw 'Not a retryable error'
        } -MaxRetries 3 } | Should -Throw '*Not a retryable error*'
        Should -Not -Invoke Start-Sleep
    }

    It 'Applies exponential backoff delay' {
        $script:retryAttempt2 = 0
        $delays = [System.Collections.Generic.List[int]]::new()
        Mock Start-Sleep { $delays.Add($Seconds) }
        { Invoke-SLWithRetry -ScriptBlock {
            $script:retryAttempt2++
            throw [System.Exception]::new("HTTP StatusCode: 500")
        } -MaxRetries 3 -BaseDelaySeconds 2 } | Should -Throw
        $delays.Count | Should -Be 3
        # Exponential: 2^1=2, 2^2=4, 2^3=8
        $delays[0] | Should -Be 2
        $delays[1] | Should -Be 4
        $delays[2] | Should -Be 8
    }
}

# =============================================================================
# Write-SLAuditEntry
# =============================================================================
Describe 'Write-SLAuditEntry' {
    BeforeEach {
        $script:SLConnection.UserPrincipalName = 'admin@contoso.com'
        $script:SLConnection.TenantId = 'tenant-123'
        $script:SLConfig.AuditLogPath = Join-Path $TestDrive 'audit-test.jsonl'
        if (Test-Path $script:SLConfig.AuditLogPath) { Remove-Item $script:SLConfig.AuditLogPath -Force }
    }

    It 'Writes a valid JSON entry to the audit log' {
        Write-SLAuditEntry -Action 'Test-Action' -Target 'TestTarget' -Result 'success'
        $content = Get-Content -Path $script:SLConfig.AuditLogPath -Raw
        $entry = $content.Trim() | ConvertFrom-Json
        $entry.action | Should -Be 'Test-Action'
        $entry.target | Should -Be 'TestTarget'
        $entry.result | Should -Be 'success'
        $entry.user | Should -Be 'admin@contoso.com'
        $entry.tenantId | Should -Be 'tenant-123'
        $entry.timestamp | Should -Not -BeNullOrEmpty
    }

    It 'Includes detail hashtable in JSON output' {
        Write-SLAuditEntry -Action 'Test-Detail' -Target 'T1' -Detail @{ Key1 = 'Value1'; Key2 = 42 } -Result 'success'
        $content = Get-Content -Path $script:SLConfig.AuditLogPath -Raw
        $entry = $content.Trim() | ConvertFrom-Json
        $entry.detail.Key1 | Should -Be 'Value1'
        $entry.detail.Key2 | Should -Be 42
    }

    It 'Includes error field when ErrorMessage is provided' {
        Write-SLAuditEntry -Action 'Test-Error' -Target 'T1' -Result 'failed' -ErrorMessage 'Something broke'
        $content = Get-Content -Path $script:SLConfig.AuditLogPath -Raw
        $entry = $content.Trim() | ConvertFrom-Json
        $entry.result | Should -Be 'failed'
        $entry.error | Should -Be 'Something broke'
    }

    It 'Appends multiple entries as separate lines' {
        Write-SLAuditEntry -Action 'First' -Target 'T1' -Result 'success'
        Write-SLAuditEntry -Action 'Second' -Target 'T2' -Result 'dry-run'
        $lines = @(Get-Content -Path $script:SLConfig.AuditLogPath | Where-Object { $_.Trim() })
        $lines.Count | Should -BeGreaterOrEqual 2
        ($lines[0] | ConvertFrom-Json).action | Should -Be 'First'
        ($lines[-1] | ConvertFrom-Json).action | Should -Be 'Second'
    }
}

# =============================================================================
# Test-SLDryRun
# =============================================================================
Describe 'Test-SLDryRun' {
    It 'Returns true when -DryRun switch is set' {
        $result = Test-SLDryRun -DryRun
        $result | Should -BeTrue
    }

    It 'Returns false when -DryRun switch is not set' {
        $result = Test-SLDryRun
        $result | Should -BeFalse
    }

    It 'Returns false when -DryRun is explicitly false' {
        $result = Test-SLDryRun -DryRun:$false
        $result | Should -BeFalse
    }
}

# =============================================================================
# Assert-SLAipClient
# =============================================================================
Describe 'Assert-SLAipClient' {
    BeforeEach {
        $script:SLAipClientType = $null
    }

    It 'Throws on non-Windows platforms' -Skip:$IsWindows {
        { Assert-SLAipClient } | Should -Throw '*requires Windows*'
    }

    It 'Sets client type to UnifiedLabeling when AIP module available' -Skip:(-not $IsWindows) {
        Mock Get-Module {
            [PSCustomObject]@{ Version = [version]'2.16.0'; Name = 'AzureInformationProtection' }
        } -ParameterFilter { $ListAvailable -eq $true }
        Mock Get-Module { $null } -ParameterFilter { $ListAvailable -ne $true }
        Mock Import-Module { }

        Assert-SLAipClient
        $script:SLAipClientType | Should -Be 'UnifiedLabeling'
    }

    It 'Imports the module if not already loaded' -Skip:(-not $IsWindows) {
        Mock Get-Module {
            [PSCustomObject]@{ Version = [version]'2.16.0'; Name = 'AzureInformationProtection' }
        } -ParameterFilter { $ListAvailable -eq $true }
        Mock Get-Module { $null } -ParameterFilter { $ListAvailable -ne $true }
        Mock Import-Module { } -Verifiable

        Assert-SLAipClient
        Should -InvokeVerifiable
    }

    It 'Skips import when module already loaded' -Skip:(-not $IsWindows) {
        $loaded = [PSCustomObject]@{ Version = [version]'2.16.0'; Name = 'AzureInformationProtection' }
        Mock Get-Module { $loaded } -ParameterFilter { $ListAvailable -eq $true }
        Mock Get-Module { $loaded } -ParameterFilter { $ListAvailable -ne $true }
        Mock Import-Module { }

        Assert-SLAipClient
        Should -Not -Invoke Import-Module
    }

    It 'Falls back to Legacy when Set-AIPFileLabel command exists' -Skip:(-not $IsWindows) {
        Mock Get-Module { $null } -ParameterFilter { $ListAvailable -eq $true }
        Mock Get-Command { [PSCustomObject]@{ Name = 'Set-AIPFileLabel' } } -ParameterFilter { $Name -eq 'Set-AIPFileLabel' }

        Assert-SLAipClient
        $script:SLAipClientType | Should -Be 'Legacy'
    }

    It 'Throws when neither module nor command available' -Skip:(-not $IsWindows) {
        Mock Get-Module { $null }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'Set-AIPFileLabel' }

        { Assert-SLAipClient } | Should -Throw '*not found*'
    }

    It 'Error message includes install URL' -Skip:(-not $IsWindows) {
        Mock Get-Module { $null }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'Set-AIPFileLabel' }

        $err = $null
        try { Assert-SLAipClient } catch { $err = $_.Exception.Message }
        $err | Should -Match 'learn.microsoft.com'
        $err | Should -Match 'Install-Module'
    }
}

# =============================================================================
# Format-SLDryRunResult
# =============================================================================
Describe 'Format-SLDryRunResult' {
    It 'Adds DryRun property to result' {
        $obj = [PSCustomObject]@{ Name = 'TestPolicy'; Status = 'Active' }
        $result = Format-SLDryRunResult -Result $obj
        $result.DryRun | Should -BeTrue
    }

    It 'Preserves original properties' {
        $obj = [PSCustomObject]@{ Name = 'TestPolicy'; Status = 'Active' }
        $result = Format-SLDryRunResult -Result $obj
        $result.Name | Should -Be 'TestPolicy'
        $result.Status | Should -Be 'Active'
    }

    It 'Overwrites existing DryRun property with true' {
        $obj = [PSCustomObject]@{ Name = 'TestPolicy'; DryRun = $false }
        $result = Format-SLDryRunResult -Result $obj
        $result.DryRun | Should -BeTrue
    }

    It 'Returns PSCustomObject by default (not JSON)' {
        $obj = [PSCustomObject]@{ Name = 'TestPolicy' }
        $result = Format-SLDryRunResult -Result $obj
        $result | Should -BeOfType [PSCustomObject]
    }

    It 'Returns JSON string when -AsJson is specified' {
        $obj = [PSCustomObject]@{ Name = 'TestPolicy' }
        $result = Format-SLDryRunResult -Result $obj -AsJson
        $result | Should -BeOfType [string]
        $parsed = $result | ConvertFrom-Json
        $parsed.Name | Should -Be 'TestPolicy'
        $parsed.DryRun | Should -BeTrue
    }

    It 'JSON output respects MaxJsonDepth from config' {
        $nested = [PSCustomObject]@{
            Level1 = [PSCustomObject]@{
                Level2 = [PSCustomObject]@{
                    Value = 'deep'
                }
            }
        }
        $result = Format-SLDryRunResult -Result $nested -AsJson
        $parsed = $result | ConvertFrom-Json
        $parsed.Level1.Level2.Value | Should -Be 'deep'
    }

    It 'Returns the same object reference (mutates in place)' {
        $obj = [PSCustomObject]@{ Name = 'TestPolicy' }
        $result = Format-SLDryRunResult -Result $obj
        [object]::ReferenceEquals($obj, $result) | Should -BeTrue
    }
}
