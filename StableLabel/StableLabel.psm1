#Requires -Version 7.0

# StableLabel - Unified Microsoft Purview Compliance Management Module

# Module-scoped connection state
$script:SLConnection = @{
    GraphConnected      = $false
    ComplianceConnected = $false
    ProtectionConnected = $false
    UserPrincipalName   = $null
    TenantId            = $null
    ConnectedAt         = @{
        Graph      = $null
        Compliance = $null
        Protection = $null
    }
    ComplianceCommandCount = 0
    ComplianceSessionStart = $null
}

# Module-scoped label cache for GUID-to-name resolution
$script:SLLabelCache = @{
    Labels    = @()
    CachedAt  = $null
    TenantId  = $null
}

# Module-scoped active elevated job (used by Start/Invoke/Stop-SLElevatedJob)
$script:SLActiveJob = $null

# Module-scoped config
$script:SLConfig = @{
    SnapshotPath    = Join-Path $HOME '.stablelabel' 'snapshots'
    AuditLogPath    = Join-Path $HOME '.stablelabel' 'audit.jsonl'
    ElevationState  = Join-Path $HOME '.stablelabel' 'elevation-state.json'
    GraphApiVersion = 'v1.0'
    GraphBetaVersion = 'beta'
    GraphBaseUrl    = 'https://graph.microsoft.com'
    DefaultBatchSize = 50
    MaxJsonDepth    = 20
    ComplianceMaxCommands     = 50
    ComplianceMaxSessionMinutes = 30
    ComplianceIdleTimeoutMinutes = 12
}

# Ensure config directory exists
$configDir = Join-Path $HOME '.stablelabel'
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}
if (-not (Test-Path $script:SLConfig.SnapshotPath)) {
    New-Item -ItemType Directory -Path $script:SLConfig.SnapshotPath -Force | Out-Null
}

# Load classes first
$classFiles = Get-ChildItem -Path (Join-Path $PSScriptRoot 'Classes') -Filter '*.ps1' -ErrorAction SilentlyContinue
foreach ($file in $classFiles) {
    . $file.FullName
}

# Load private functions
$privateFiles = Get-ChildItem -Path (Join-Path $PSScriptRoot 'Private') -Filter '*.ps1' -ErrorAction SilentlyContinue
foreach ($file in $privateFiles) {
    . $file.FullName
}

# Load public functions from all subdirectories
$publicPath = Join-Path $PSScriptRoot 'Public'
$publicFiles = Get-ChildItem -Path $publicPath -Filter '*.ps1' -Recurse -ErrorAction SilentlyContinue
foreach ($file in $publicFiles) {
    . $file.FullName
}

# Export only public functions (controlled by manifest FunctionsToExport)
