#Requires -Version 7.0

# StableLabel - Sensitivity Label Management for Microsoft 365

# Module-scoped connection state
$script:SLConnection = @{
    GraphConnected      = $false
    ComplianceConnected = $false
    ProtectionConnected = $false
    UserPrincipalName   = $null
    TenantId            = $null
    UseDeviceCode       = $false
    ConnectedAt         = @{
        Graph      = $null
        Compliance = $null
        Protection = $null
    }
    ComplianceCommandCount = 0
    ComplianceSessionStart = $null
    ComplianceLastCommandAt = $null
}

# Module-scoped label cache for GUID-to-name resolution
$script:SLLabelCache = @{
    Labels    = @()
    CachedAt  = $null
    TenantId  = $null
}

# Module-scoped AIP client type (set by Assert-SLAipClient: 'UnifiedLabeling' or 'Legacy')
$script:SLAipClientType = $null

# Module-scoped config
$script:SLConfig = @{
    SnapshotPath    = Join-Path $HOME '.stablelabel' 'snapshots'
    AuditLogPath    = Join-Path $HOME '.stablelabel' 'audit.jsonl'
    GraphApiVersion = 'v1.0'
    GraphBetaVersion = 'beta'
    GraphBaseUrl    = 'https://graph.microsoft.com'
    DefaultBatchSize = 50
    MaxJsonDepth    = 20
    ComplianceMaxCommands     = 50
    ComplianceMaxSessionMinutes = 30
    ComplianceIdleTimeoutMinutes = 12
}

# Ensure config directories exist and are writable
$configDir = Join-Path $HOME '.stablelabel'
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}
if (-not (Test-Path $script:SLConfig.SnapshotPath)) {
    New-Item -ItemType Directory -Path $script:SLConfig.SnapshotPath -Force | Out-Null
}

# Validate directories are writable — fail early with a clear error
foreach ($dir in @($configDir, $script:SLConfig.SnapshotPath)) {
    $testFile = Join-Path $dir '.write-test'
    try {
        [System.IO.File]::WriteAllText($testFile, '')
        Remove-Item $testFile -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Warning "StableLabel directory '$dir' is not writable. Snapshots and audit logs may fail. Error: $_"
    }
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

# ── Graph module pre-warm ────────────────────────────────────────────────
# The Microsoft.Graph.Authentication module takes 10-30 seconds to import
# due to heavy .NET assembly loading. Start importing it in a background
# thread now so that by the time any function actually needs Graph, the
# assemblies are already loaded and Connect-MgGraph is near-instant.
#
# This is a fire-and-forget optimization — if the module isn't installed
# or the job fails, the lazy-connect path in Invoke-SLGraphRequest will
# handle it normally.
$script:SLGraphPreWarmJob = $null
try {
    $graphMod = Get-Module -ListAvailable -Name 'Microsoft.Graph.Authentication' |
        Where-Object { $_.Version -ge [version]'2.10.0' } |
        Sort-Object Version -Descending |
        Select-Object -First 1

    if ($graphMod) {
        $script:SLGraphPreWarmJob = Start-ThreadJob -Name 'SLGraphPreWarm' -ScriptBlock {
            Import-Module 'Microsoft.Graph.Authentication' -MinimumVersion '2.10.0' -ErrorAction Stop
        }
        Write-Verbose 'Graph module pre-warm started in background thread.'
    }
}
catch {
    # Pre-warm is best-effort — don't block module import
    Write-Verbose "Graph pre-warm skipped: $_"
}

# Export only public functions (controlled by manifest FunctionsToExport)
