# StableLabel

Sensitivity label management for Microsoft 365. Gives E3 tenants E5-grade
auto-labeling with per-site granularity, plus bulk operations and a file
explorer that E5 does not offer natively.

**Scope: MIP + AIP sensitivity labels only. No DLP. No retention labels.**

## Key Features

- **Auto-labeling** with per-site granularity, entity detection, and custom
  pattern rules. Target specific SharePoint sites, libraries, or OneDrive paths.
- **Snapshot and rollback** of label/policy configuration state with diff view.
- **Bulk operations** for label removal, encryption removal, or both.
- **File explorer** with site tree, file list, and content viewer panel.
- **CSV import labeling** for applying labels from a spreadsheet.
- **Classification engine** powered by Presidio and spaCy for entity detection
  (SSN, credit card, etc.) with configurable confidence thresholds.

## Architecture

```
Electron (React + TypeScript + TailwindCSS)
  |                           |
  | IPC (structured invoke)   | subprocess
  v                           v
PowerShell 7+               stablelabel-api (Python)
- Graph API                 - FastAPI backend
- Compliance Center         - Presidio / spaCy NLP
- AIPService (Windows)      - Pattern detection
- Label CRUD                - Content scanning
- Snapshot/Restore          - ML models (optional)
```

**GUI pages:** Dashboard, Labels, Auto-Label, Manual Label (CSV),
Bulk Operations, Explorer, Snapshots, Classification, Audit Log, Settings.

**PowerShell module** exposes functions for labels, policies, auto-label
policies, documents, snapshots, analysis, protection, and reporting. All
functions support `-AsJson` for machine-readable output and `-WhatIf` for
dry-run on mutations.

**Python API** (`stablelabel-api`) runs as a subprocess. The GUI sends file
content or paths, the API returns detected entities and confidence scores,
and StableLabel uses those results to drive auto-labeling decisions.

## Target Audience

MSPs managing Microsoft 365 E3 tenants who need E5-grade auto-labeling
capabilities without the E5 license cost.

## Requirements

- PowerShell 7.0+
- Node.js 18+ (for Electron GUI)
- Python 3.11+ (for classification engine)
- Microsoft.Graph.Authentication PowerShell module
- ExchangeOnlineManagement PowerShell module
- AIPService module (optional, Windows-only, for legacy AIP features)

## Quick Start

```powershell
# PowerShell module
Import-Module ./StableLabel
Connect-SLGraph
Connect-SLCompliance
Get-SLLabel -Tree
New-SLSnapshot -Name baseline
```

```bash
# Classification API
cd stablelabel-api
pip install -e .
uvicorn app.main:app --reload
```

```bash
# Electron GUI
cd stablelabel-gui
npm install
npm start
```

## Project Structure

```
StableLabel/           PowerShell 7+ module
  Public/              Exported functions (Analysis, Connection, Documents,
                       Labels, Protection, Reporting, Snapshot)
stablelabel-gui/       Electron desktop app (React + Vite + Tailwind)
stablelabel-api/       Python FastAPI backend (Presidio, spaCy)
```

## License

Proprietary. All rights reserved.
