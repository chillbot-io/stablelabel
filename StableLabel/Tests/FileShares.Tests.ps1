#Requires -Modules Pester

<#
.SYNOPSIS
    Tests for StableLabel file share functions: Connect-SLFileShare,
    Disconnect-SLFileShare, Get-SLFileShareInventory, Get-SLFileShareLabel,
    Set-SLFileShareLabel, Remove-SLFileShareLabel, Set-SLFileShareLabelBulk,
    Get-SLFileShareScan.
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
# Connect-SLFileShare
# =============================================================================
Describe 'Connect-SLFileShare' {
    BeforeEach {
        $script:SLFileShares = [System.Collections.Generic.List[hashtable]]::new()
    }

    It 'Rejects invalid UNC path' {
        { Connect-SLFileShare -Path 'not-a-unc-path' -Confirm:$false } | Should -Throw
    }

    It 'Returns dry-run result with -DryRun' {
        $result = Connect-SLFileShare -Path '\\server\share' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Path | Should -Be '\\server\share'
    }

    It 'Returns dry-run result with DriveLetter' {
        $result = Connect-SLFileShare -Path '\\server\share' -DriveLetter 'Z' -DryRun
        $result.DryRun | Should -BeTrue
        $result.DriveLetter | Should -Be 'Z'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        $json = Connect-SLFileShare -Path '\\server\share' -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Accepts custom Name parameter in dry-run' {
        $result = Connect-SLFileShare -Path '\\server\data' -Name 'DataShare' -DryRun
        $result.Name | Should -Be 'DataShare'
    }
}

# =============================================================================
# Disconnect-SLFileShare
# =============================================================================
Describe 'Disconnect-SLFileShare' {
    BeforeEach {
        $script:SLFileShares = [System.Collections.Generic.List[hashtable]]::new()
    }

    It 'Throws when no tracked shares exist' {
        { Disconnect-SLFileShare -Path '\\server\share' } | Should -Throw '*No tracked file shares*'
    }

    It 'Throws when share path not found' {
        $script:SLFileShares.Add(@{
            Name      = 'TestShare'
            Path      = '\\server\existing'
            DriveName = 'SL_existing'
        })
        { Disconnect-SLFileShare -Path '\\server\nonexistent' } | Should -Throw '*not found*'
    }

    It 'Requires at least one identifier parameter' {
        $script:SLFileShares.Add(@{
            Name      = 'TestShare'
            Path      = '\\server\share'
            DriveName = 'SL_share'
        })
        { Disconnect-SLFileShare } | Should -Throw '*must specify*'
    }

    It 'Disconnects a tracked share by path' {
        $script:SLFileShares.Add(@{
            Name      = 'TestShare'
            Path      = '\\server\share'
            DriveName = 'SL_share'
        })
        Mock Remove-PSDrive { }
        $result = Disconnect-SLFileShare -Path '\\server\share' -Confirm:$false
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Disconnects all tracked shares with -All' {
        $script:SLFileShares.Add(@{ Name = 'Share1'; Path = '\\s1\a'; DriveName = 'SL_a' })
        $script:SLFileShares.Add(@{ Name = 'Share2'; Path = '\\s2\b'; DriveName = 'SL_b' })
        Mock Remove-PSDrive { }
        $result = Disconnect-SLFileShare -All -Confirm:$false
        $result | Should -Not -BeNullOrEmpty
    }
}

# =============================================================================
# Get-SLFileShareInventory
# =============================================================================
Describe 'Get-SLFileShareInventory' {
    BeforeEach {
        $script:SLAipClientType = $null
    }

    It 'Requires AIP client' {
        Mock Get-Module { $null } -ParameterFilter { $Name -eq 'AzureInformationProtection' }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'Set-AIPFileLabel' }
        { Get-SLFileShareInventory -Path '\\server\share' } | Should -Throw '*AIP*'
    }

    It 'Returns inventory when AIP client is available' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Get-ChildItem {
            @(
                [PSCustomObject]@{ FullName = '\\server\share\doc1.docx'; Name = 'doc1.docx'; Length = 1024; Extension = '.docx' }
                [PSCustomObject]@{ FullName = '\\server\share\doc2.xlsx'; Name = 'doc2.xlsx'; Length = 2048; Extension = '.xlsx' }
            )
        }
        Mock Get-AIPFileStatus {
            [PSCustomObject]@{
                FileName       = 'doc1.docx'
                MainLabelName  = 'Confidential'
                SubLabelName   = $null
                IsLabeled      = $true
            }
        }
        $result = Get-SLFileShareInventory -Path '\\server\share'
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Get-ChildItem { @([PSCustomObject]@{ FullName = '\\s\s\f.docx'; Name = 'f.docx'; Length = 100; Extension = '.docx' }) }
        Mock Get-AIPFileStatus { [PSCustomObject]@{ FileName = 'f.docx'; MainLabelName = 'Public'; IsLabeled = $true } }
        $json = Get-SLFileShareInventory -Path '\\server\share' -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Get-SLFileShareLabel
# =============================================================================
Describe 'Get-SLFileShareLabel' {
    It 'Requires AIP client' {
        Mock Get-Module { $null } -ParameterFilter { $Name -eq 'AzureInformationProtection' }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'Set-AIPFileLabel' }
        { Get-SLFileShareLabel -Path '\\server\share\doc.docx' } | Should -Throw '*AIP*'
    }

    It 'Returns label status for a single file' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Test-Path { $true } -ParameterFilter { $PathType -eq 'Leaf' }
        Mock Get-AIPFileStatus {
            [PSCustomObject]@{
                FileName      = 'doc.docx'
                MainLabelName = 'Confidential'
                IsLabeled     = $true
            }
        }
        $result = Get-SLFileShareLabel -Path '\\server\share\doc.docx'
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Test-Path { $true } -ParameterFilter { $PathType -eq 'Leaf' }
        Mock Get-AIPFileStatus {
            [PSCustomObject]@{ FileName = 'doc.docx'; MainLabelName = 'Public'; IsLabeled = $true }
        }
        $json = Get-SLFileShareLabel -Path '\\server\share\doc.docx' -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Handles directory path with -Recurse' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Test-Path { $false } -ParameterFilter { $PathType -eq 'Leaf' }
        Mock Get-ChildItem {
            @([PSCustomObject]@{ FullName = '\\server\share\doc.docx'; Name = 'doc.docx' })
        }
        Mock Get-AIPFileStatus {
            [PSCustomObject]@{ FileName = 'doc.docx'; MainLabelName = 'Internal'; IsLabeled = $true }
        }
        $result = Get-SLFileShareLabel -Path '\\server\share' -Recurse
        $result | Should -Not -BeNullOrEmpty
    }
}

# =============================================================================
# Set-SLFileShareLabel
# =============================================================================
Describe 'Set-SLFileShareLabel' {
    It 'Requires AIP client' {
        Mock Get-Module { $null } -ParameterFilter { $Name -eq 'AzureInformationProtection' }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'Set-AIPFileLabel' }
        { Set-SLFileShareLabel -Path '\\server\share\doc.docx' -LabelId 'abc-123' } | Should -Throw '*AIP*'
    }

    It 'Returns dry-run result with -DryRun' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        $result = Set-SLFileShareLabel -Path '\\server\share\doc.docx' -LabelId 'abc-123' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Path | Should -Be '\\server\share\doc.docx'
    }

    It 'Accepts LabelName parameter in dry-run' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Resolve-SLLabelName { 'resolved-id-123' }
        $result = Set-SLFileShareLabel -Path '\\server\share\doc.docx' -LabelName 'Confidential' -DryRun
        $result.DryRun | Should -BeTrue
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        $json = Set-SLFileShareLabel -Path '\\server\share\doc.docx' -LabelId 'abc-123' -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }

    It 'Includes Justification in dry-run' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        $result = Set-SLFileShareLabel -Path '\\server\share\doc.docx' -LabelId 'abc-123' -Justification 'Policy update' -DryRun
        $result.Justification | Should -Be 'Policy update'
    }
}

# =============================================================================
# Remove-SLFileShareLabel
# =============================================================================
Describe 'Remove-SLFileShareLabel' {
    It 'Requires AIP client' {
        Mock Get-Module { $null } -ParameterFilter { $Name -eq 'AzureInformationProtection' }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'Set-AIPFileLabel' }
        { Remove-SLFileShareLabel -Path '\\server\share\doc.docx' -Confirm:$false } | Should -Throw '*AIP*'
    }

    It 'Returns dry-run result with -DryRun' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        $result = Remove-SLFileShareLabel -Path '\\server\share\doc.docx' -DryRun
        $result.DryRun | Should -BeTrue
        $result.Path | Should -Be '\\server\share\doc.docx'
    }

    It 'Includes Justification in dry-run result' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        $result = Remove-SLFileShareLabel -Path '\\server\share\doc.docx' -Justification 'No longer needed' -DryRun
        $result.Justification | Should -Be 'No longer needed'
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        $json = Remove-SLFileShareLabel -Path '\\server\share\doc.docx' -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
        ($json | ConvertFrom-Json).DryRun | Should -BeTrue
    }
}

# =============================================================================
# Set-SLFileShareLabelBulk
# =============================================================================
Describe 'Set-SLFileShareLabelBulk' {
    It 'Requires AIP client' {
        Mock Get-Module { $null } -ParameterFilter { $Name -eq 'AzureInformationProtection' }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'Set-AIPFileLabel' }
        { Set-SLFileShareLabelBulk -Path '\\server\share' -LabelId 'abc-123' } | Should -Throw '*AIP*'
    }

    It 'Returns dry-run result with -DryRun' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Get-ChildItem {
            @(
                [PSCustomObject]@{ FullName = '\\server\share\doc1.docx'; Name = 'doc1.docx'; Extension = '.docx' }
                [PSCustomObject]@{ FullName = '\\server\share\doc2.xlsx'; Name = 'doc2.xlsx'; Extension = '.xlsx' }
            )
        }
        Mock Set-SLFileShareLabel {
            [PSCustomObject]@{ Path = $Path; LabelId = $LabelId; DryRun = $true }
        }
        $result = Set-SLFileShareLabelBulk -Path '\\server\share' -LabelId 'abc-123' -DryRun
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Accepts LabelName parameter in dry-run' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Resolve-SLLabelName { 'resolved-id' }
        Mock Get-ChildItem {
            @([PSCustomObject]@{ FullName = '\\server\share\f.docx'; Name = 'f.docx'; Extension = '.docx' })
        }
        Mock Set-SLFileShareLabel {
            [PSCustomObject]@{ Path = $Path; DryRun = $true }
        }
        $result = Set-SLFileShareLabelBulk -Path '\\server\share' -LabelName 'Confidential' -DryRun
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson in dry-run mode' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Get-ChildItem {
            @([PSCustomObject]@{ FullName = '\\s\s\f.docx'; Name = 'f.docx'; Extension = '.docx' })
        }
        Mock Set-SLFileShareLabel {
            [PSCustomObject]@{ Path = '\\s\s\f.docx'; DryRun = $true }
        }
        $json = Set-SLFileShareLabelBulk -Path '\\server\share' -LabelId 'abc-123' -DryRun -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}

# =============================================================================
# Get-SLFileShareScan
# =============================================================================
Describe 'Get-SLFileShareScan' {
    It 'Requires AIP client' {
        Mock Get-Module { $null } -ParameterFilter { $Name -eq 'AzureInformationProtection' }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq 'Set-AIPFileLabel' }
        { Get-SLFileShareScan -Path '\\server\share' } | Should -Throw '*AIP*'
    }

    It 'Returns scan results' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Get-ChildItem {
            @(
                [PSCustomObject]@{ FullName = '\\s\s\doc.docx'; Name = 'doc.docx'; Length = 1024; Extension = '.docx' }
                [PSCustomObject]@{ FullName = '\\s\s\sheet.xlsx'; Name = 'sheet.xlsx'; Length = 2048; Extension = '.xlsx' }
            )
        }
        Mock Get-AIPFileStatus {
            [PSCustomObject]@{
                FileName      = 'doc.docx'
                MainLabelName = 'Confidential'
                IsLabeled     = $true
            }
        }
        $result = Get-SLFileShareScan -Path '\\server\share'
        $result | Should -Not -BeNullOrEmpty
    }

    It 'Returns JSON with -AsJson' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Get-ChildItem {
            @([PSCustomObject]@{ FullName = '\\s\s\f.docx'; Name = 'f.docx'; Length = 100; Extension = '.docx' })
        }
        Mock Get-AIPFileStatus {
            [PSCustomObject]@{ FileName = 'f.docx'; MainLabelName = 'Public'; IsLabeled = $true }
        }
        $json = Get-SLFileShareScan -Path '\\server\share' -AsJson
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }

    It 'Supports -Recurse and -Filter parameters' {
        Mock Assert-SLAipClient { $script:SLAipClientType = 'UnifiedLabeling' }
        Mock Get-ChildItem {
            @([PSCustomObject]@{ FullName = '\\s\s\sub\f.docx'; Name = 'f.docx'; Length = 100; Extension = '.docx' })
        }
        Mock Get-AIPFileStatus {
            [PSCustomObject]@{ FileName = 'f.docx'; MainLabelName = 'Internal'; IsLabeled = $true }
        }
        $result = Get-SLFileShareScan -Path '\\server\share' -Recurse -Filter '*.docx'
        $result | Should -Not -BeNullOrEmpty
    }
}
