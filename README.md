# StableLabel

Unified Microsoft Purview compliance management - sensitivity labels, retention labels, DLP policies, snapshot/rollback, privilege elevation, and bulk operations.

## Architecture

- **StableLabel/** - PowerShell 7+ module (the engine)
- **stablelabel-gui/** - Electron desktop app (the dashboard)

The GUI calls the PowerShell module via a persistent `pwsh` process. Every function supports `-AsJson` for machine-readable output.

## Quick Start (PowerShell)

```powershell
Import-Module ./StableLabel

# Connect to backends
Connect-SLGraph
Connect-SLCompliance

# Snapshot current state
New-SLSnapshot -Name baseline

# View labels
Get-SLLabel -Tree

# Compare snapshot to live
Compare-SLSnapshot -Name baseline -Live

# Restore (shows dry-run first)
Restore-SLSnapshot -Name baseline -DryRun
```

## Requirements

- PowerShell 7.0+
- Microsoft.Graph.Authentication module
- ExchangeOnlineManagement module
- AIPService module (optional, Windows-only, for Protection features)
