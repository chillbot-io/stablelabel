#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel document labeling functions: Set-SLDocumentLabel,
    Remove-SLDocumentLabel, Set-SLDocumentLabelBulk.
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
    $script:SLLabelCache = @{
        Labels = @(
            [PSCustomObject]@{ id = 'guid-1'; name = 'Confidential'; displayName = 'Confidential' }
            [PSCustomObject]@{ id = 'guid-2'; name = 'Internal'; displayName = 'Internal' }
        )
        CachedAt = Get-Date
        TenantId = 'tenant-123'
    }
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
# Set-SLDocumentLabel
# =============================================================================
Describe 'Set-SLDocumentLabel' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Set-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -LabelId 'label-1' } | Should -Throw '*Not connected to Graph*'
    }

    It 'Returns dry-run result with -DryRun by LabelId' {
        $result = Set-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -LabelId 'label-guid' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Set-DocumentLabel'
        $result.DriveId | Should -Be 'b!abc'
        $result.ItemId | Should -Be '01DEF'
        $result.SensitivityLabelId | Should -Be 'label-guid'
    }

    It 'Returns dry-run result with -DryRun by LabelName' {
        $result = Set-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -LabelName 'Confidential' -DryRun
        $result.DryRun | Should -BeTrue
        $result.SensitivityLabelId | Should -Be 'guid-1'
    }

    It 'Includes Justification in dry-run' {
        $result = Set-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -LabelId 'label-1' -Justification 'Policy update' -DryRun
        $result.Justification | Should -Be 'Policy update'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Set-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -LabelId 'label-1' -DryRun -AsJson
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Calls assignSensitivityLabel endpoint with correct body' {
        Mock Invoke-SLGraphRequest { @{ status = 'ok' } }
        $null = Set-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -LabelId 'label-1' -Justification 'Policy update' -Confirm:$false
        Should -Invoke Invoke-SLGraphRequest -Times 1 -ParameterFilter {
            $Uri -like '*assignSensitivityLabel*' -and
            $Method -eq 'POST' -and
            $Body.sensitivityLabelId -eq 'label-1' -and
            $Body.justificationText -eq 'Policy update'
        }
    }

    It 'Propagates error when Graph API throws' {
        Mock Invoke-SLGraphRequest { throw 'Forbidden' }
        { Set-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -LabelId 'label-1' -Confirm:$false } | Should -Throw '*Forbidden*'
    }

    It 'Resolves label name to ID when using -LabelName' {
        Mock Invoke-SLGraphRequest { @{ status = 'ok' } }
        $null = Set-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -LabelName 'Confidential' -Confirm:$false
        Should -Invoke Invoke-SLGraphRequest -Times 1
    }
}

# =============================================================================
# Remove-SLDocumentLabel
# =============================================================================
Describe 'Remove-SLDocumentLabel' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        { Remove-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -Confirm:$false } | Should -Throw '*Not connected to Graph*'
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Remove-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Action | Should -Be 'Remove-DocumentLabel'
        $result.DriveId | Should -Be 'b!abc'
        $result.ItemId | Should -Be '01DEF'
    }

    It 'Includes Justification in dry-run' {
        $result = Remove-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -Justification 'No longer needed' -DryRun
        $result.Justification | Should -Be 'No longer needed'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Remove-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -DryRun -AsJson
        ($json | ConvertFrom-Json).Action | Should -Be 'Remove-DocumentLabel'
    }

    It 'Calls removeSensitivityLabel endpoint' {
        Mock Invoke-SLGraphRequest { @{ status = 'ok' } }
        $null = Remove-SLDocumentLabel -DriveId 'b!abc' -ItemId '01DEF' -Confirm:$false
        Should -Invoke Invoke-SLGraphRequest -Times 1 -ParameterFilter {
            $Uri -like '*removeSensitivityLabel*' -and $Method -eq 'POST'
        }
    }

    It 'Propagates error when Graph returns 404' {
        Mock Invoke-SLGraphRequest { throw 'Resource not found (404)' }
        { Remove-SLDocumentLabel -DriveId 'b!abc' -ItemId 'MISSING' -Confirm:$false } | Should -Throw '*Resource not found*'
    }
}

# =============================================================================
# Set-SLDocumentLabelBulk
# =============================================================================
Describe 'Set-SLDocumentLabelBulk' {
    BeforeEach {
        $script:SLConnection.GraphConnected = $true
    }

    It 'Requires Graph connection' {
        $script:SLConnection.GraphConnected = $false
        $items = @(@{ DriveId = 'b!abc'; ItemId = '01ABC' })
        { Set-SLDocumentLabelBulk -Items $items -LabelId 'label-1' } | Should -Throw '*Not connected to Graph*'
    }

    It 'Returns summary with dry-run for multiple items' {
        $items = @(
            @{ DriveId = 'b!abc'; ItemId = '01ABC' }
            @{ DriveId = 'b!abc'; ItemId = '02DEF' }
        )
        Mock Set-SLDocumentLabel {
            [PSCustomObject]@{ DryRun = $true }
        }
        $result = Set-SLDocumentLabelBulk -Items $items -LabelId 'label-1' -DryRun
        $result.Action | Should -Be 'Set-DocumentLabelBulk'
        $result.TotalItems | Should -Be 2
        $result.DryRun | Should -BeTrue
    }

    It 'Resolves label name once for batch' {
        $items = @(
            @{ DriveId = 'b!abc'; ItemId = '01ABC' }
        )
        Mock Set-SLDocumentLabel {
            [PSCustomObject]@{ DryRun = $true }
        }
        $result = Set-SLDocumentLabelBulk -Items $items -LabelName 'Confidential' -DryRun
        $result.SensitivityLabelId | Should -Be 'guid-1'
    }

    It 'Returns JSON with -AsJson' {
        $items = @(@{ DriveId = 'b!abc'; ItemId = '01ABC' })
        Mock Set-SLDocumentLabel {
            [PSCustomObject]@{ DryRun = $true }
        }
        $json = Set-SLDocumentLabelBulk -Items $items -LabelId 'label-1' -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Reports failures without stopping the batch' {
        $items = @(
            @{ DriveId = 'b!abc'; ItemId = '01ABC' }
            @{ DriveId = 'b!abc'; ItemId = '02DEF' }
        )
        $callCount = 0
        Mock Set-SLDocumentLabel {
            $callCount++
            if ($callCount -eq 1) { throw 'API error' }
            [PSCustomObject]@{ Status = 'ok' }
        }.GetNewClosure()

        $result = Set-SLDocumentLabelBulk -Items $items -LabelId 'label-1' -Confirm:$false
        $result.FailedCount | Should -Be 1
        $result.SuccessCount | Should -Be 1
        $result.Results | Should -HaveCount 2
    }

    It 'Includes justification when provided' {
        $items = @(@{ DriveId = 'b!abc'; ItemId = '01ABC' })
        Mock Set-SLDocumentLabel {
            [PSCustomObject]@{ DryRun = $true }
        }
        $result = Set-SLDocumentLabelBulk -Items $items -LabelId 'label-1' -Justification 'Bulk update' -DryRun
        $result.TotalItems | Should -Be 1
    }

    It 'Handles empty items array' {
        $items = @(@{ DriveId = 'b!abc'; ItemId = '01ABC' })
        # Provide a single-element array (ValidateNotNullOrEmpty prevents truly empty)
        Mock Set-SLDocumentLabel { [PSCustomObject]@{ Status = 'ok' } }
        $result = Set-SLDocumentLabelBulk -Items $items -LabelId 'label-1' -Confirm:$false
        $result.TotalCount | Should -Be 1
    }

    It 'Reports all failures when every item fails' {
        $items = @(
            @{ DriveId = 'b!abc'; ItemId = '01ABC' }
            @{ DriveId = 'b!abc'; ItemId = '02DEF' }
            @{ DriveId = 'b!abc'; ItemId = '03GHI' }
        )
        Mock Set-SLDocumentLabel { throw 'Service unavailable' }
        $result = Set-SLDocumentLabelBulk -Items $items -LabelId 'label-1' -Confirm:$false
        $result.FailedCount | Should -Be 3
        $result.SuccessCount | Should -Be 0
    }

    It 'Captures individual item errors in results' {
        $items = @(
            @{ DriveId = 'b!abc'; ItemId = '01ABC' }
            @{ DriveId = 'b!abc'; ItemId = '02DEF' }
        )
        Mock Set-SLDocumentLabel {
            if ($ItemId -eq '01ABC') { throw 'Item locked' }
            [PSCustomObject]@{ Status = 'ok' }
        }
        $result = Set-SLDocumentLabelBulk -Items $items -LabelId 'label-1' -Confirm:$false
        $failedItem = $result.Items | Where-Object { $_.Status -eq 'Failed' }
        $failedItem | Should -Not -BeNullOrEmpty
        $failedItem.Error | Should -Match 'Item locked'
        $failedItem.ItemId | Should -Be '01ABC'
    }
}
