# StableLabel v1 — Sensitivity Label Management Tool

## Vision

A precision tool for MIP/AIP sensitivity label management that gives E3 users
E5-grade auto-labelling with per-site granularity, plus bulk operations and a
file explorer that E5 doesn't offer natively.

**Scope: MIP + AIP sensitivity labels only. No DLP. No retention labels.**

**V2: Migration tool (AIP → MIP, tenant-to-tenant, label scheme remapping).**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron (React + TypeScript + TailwindCSS)                    │
│  ┌─────────┬─────────────────────────────────────────────────┐  │
│  │ Sidebar  │  Dashboard | Labels | Auto-Label | Manual      │  │
│  │          │  Bulk Ops | Explorer | Snapshots | Settings    │  │
│  └─────────┴─────────────────────────────────────────────────┘  │
│         │ IPC (structured invoke)            │ subprocess        │
│  ┌──────▼──────────────┐          ┌──────────▼────────────┐     │
│  │  PowerShell 7+      │          │  OpenLabels (Python)   │     │
│  │  - Graph API        │          │  - Pattern detection   │     │
│  │  - Compliance Center│          │  - Checksum validators │     │
│  │  - AIPService       │          │  - ML models (optional)│     │
│  │  - Label CRUD       │          │  - Content scanning    │     │
│  └─────────────────────┘          └────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

**Key integration**: OpenLabels runs as a Python subprocess. StableLabel sends
file content/paths → OpenLabels returns detected entities + confidence scores →
StableLabel uses those results to drive auto-labelling decisions.

---

## Pages (8 total)

### 1. Dashboard
- Label statistics (total labels, policies, auto-label rules active)
- Recent labelling activity feed
- Connection status indicators (Graph, Compliance, AIP, OpenLabels engine)
- Quick actions (connect, jump to explorer, upload CSV)

### 2. Labels
- Sensitivity label tree view (parent → sublabels)
- Label policies (which users see which labels)
- Label detail panel: encryption settings, content marking, scope
- Both MIP (unified labeling) and AIP (legacy) label display

### 3. Auto-Label
The flagship feature. Granular auto-labelling rules that exceed E5 capabilities.

**Condition Builder:**
- Entity-based: Select from OpenLabels entity types (SSN, credit card, etc.)
  with confidence thresholds
- Custom patterns: Define regex/keyword rules locally
- Location-scoped: Target specific SharePoint sites, libraries, OneDrive paths
- File-type filters: .docx, .xlsx, .pdf, etc.
- Combination logic: AND/OR across conditions

**Site-Level Granularity:**
- Per-site label rules (Site A gets Confidential, Site B gets Internal)
- Site group presets (e.g., "All HR sites", "All Finance libraries")
- Override hierarchy: site-specific > group > global

**Execution:**
- Test mode (simulation with dry-run results)
- Scheduled or on-demand runs
- Progress dashboard with per-file status
- Results export (CSV)

**OpenLabels Integration:**
- Content scanning via Python subprocess
- Entity detection results drive labelling decisions
- Configurable confidence thresholds per entity type
- Detection tier selection (patterns only, patterns + ML, full)

### 4. Manual Label (CSV Upload)
- Upload CSV with columns: FilePath/URL, TargetLabel
- Template CSV download for correct formatting
- Validation preview: resolve label names/GUIDs, check file accessibility
- Per-file progress tracker during application
- Error report (which files failed, why)
- Re-run failed items

### 5. Bulk Operations
Three removal modes with granular control:

| Mode | Action |
|------|--------|
| Remove label only | Strip sensitivity label, keep encryption if present |
| Remove encryption only | Strip RMS protection, keep label metadata |
| Remove label + encryption | Full strip — both label and protection removed |

- File selection: CSV upload, paste URL list, or pick from Explorer
- Dry-run preview before execution
- Batch processing with progress tracking
- Results summary with CSV export

### 6. Explorer
The file browser experience.

**Left panel — Navigation Tree:**
- SharePoint site picker (search + browse)
- OneDrive user picker
- On-prem file share connector (UNC path input)
- Document library → Folder hierarchy drill-down

**Center panel — File List:**
- Columns: Name, Type, Size, Modified, Current Label, Label Method, Encrypted
- Checkbox per file + Select All (page) + Select All (filtered)
- Toolbar: Label Selected, Unlabel Selected, Remove Encryption, Refresh
- Pagination / virtual scroll for large libraries
- Sort + filter by label, type, date, unlabelled-only

**Right panel — Content Viewer (slide-out):**
- Current label + who applied + timestamp
- Label method (manual, auto-policy, default label)
- Entity detections (run OpenLabels scan on selected file)
- SIT matches that would trigger auto-labelling
- Encryption status + RMS permissions list
- File metadata (size, author, created, modified)

### 7. Snapshots
- Capture current label & policy configuration state
- Compare two snapshots (diff view: added/removed/modified)
- Restore from snapshot with dry-run preview
- **Scopes limited to**: Labels, Label Policies, Auto-Label Policies
  (DLP and Retention scopes removed)

### 8. Settings
- Connection management (Graph, Compliance, AIPService)
- OpenLabels engine path + configuration
- Default batch sizes and timeouts
- Export format preferences (CSV encoding, delimiter)
- About / version

---

## PowerShell Module — Cmdlet Plan

### KEEP (existing, ~28 cmdlets)

| Category | Cmdlets |
|----------|---------|
| Connection | Connect-SLGraph, Connect-SLCompliance, Connect-SLProtection, Connect-SLAll, Disconnect-SLGraph, Disconnect-SLCompliance, Disconnect-SLProtection, Disconnect-SLAll, Get-SLConnectionStatus |
| Labels | Get-SLLabel, Get-SLLabelPolicy, New-SLLabelPolicy, Set-SLLabelPolicy, Remove-SLLabelPolicy |
| Auto-Label | Get-SLAutoLabelPolicy, New-SLAutoLabelPolicy, Set-SLAutoLabelPolicy, Remove-SLAutoLabelPolicy |
| Documents | Get-SLDocumentLabel, Set-SLDocumentLabel, Set-SLDocumentLabelBulk, Remove-SLDocumentLabel |
| Protection | Get-SLProtectionConfig |
| Analysis | Get-SLLabelReport, Get-SLLabelMismatch |
| Snapshots | New-SLSnapshot, Get-SLSnapshot, Remove-SLSnapshot, Compare-SLSnapshot, Restore-SLSnapshot |
| Audit | Get-SLAuditLog |

### NEW (to build, ~10 cmdlets)

| Cmdlet | Purpose |
|--------|---------|
| Get-SLSiteList | Enumerate SharePoint sites accessible to current user |
| Get-SLOneDriveList | List OneDrive locations for user lookup |
| Get-SLDriveChildren | Browse drive/folder contents via Graph (supports pagination) |
| Get-SLDocumentDetail | Full label detail + encryption info for Content Viewer |
| Remove-SLDocumentEncryption | Remove RMS encryption only (keep label) |
| Remove-SLDocumentLabelBulk | Bulk remove labels with mode: LabelOnly / EncryptionOnly / Both |
| Import-SLLabelCsv | Parse + validate CSV for manual labelling, return preview |
| Get-SLFileShareChildren | Browse on-prem file share contents (replaces old FileShare cmdlets) |
| Get-SLFileShareLabel | Read label from on-prem file (AIP client) |
| Set-SLFileShareLabel | Apply label to on-prem file (AIP client) |

### REMOVE (~57 cmdlets)

| Category | Count |
|----------|-------|
| DLP (policies, rules, SITs) | 10 |
| Retention (labels, policies) | 8 |
| Elevation (super user, site admin, mailbox, PIM, jobs) | 12 |
| Templates | 2 |
| Old File Shares (connect, disconnect, scan, inventory, bulk) | 8 |
| Protection (templates CRUD, document tracking, revoke/restore, logs, keys, admin, onboarding) | 12 |
| Analysis (DLP alignment, policy conflicts, permissions, health, readiness) | 5 |

---

## Frontend — Components Plan

### REMOVE (pages + child components)

| Page | Components removed |
|------|-------------------|
| DlpPage | DlpPolicyList, DlpPolicyDetail, DlpPolicyForm, DlpRuleList, DlpRuleDetail, DlpRuleForm, SensitiveInfoTypeList, SensitiveInfoTypeDetail (~9) |
| RetentionPage | RetentionLabelList, RetentionLabelDetail, RetentionLabelForm, RetentionPolicyList, RetentionPolicyDetail, RetentionPolicyForm (~6) |
| ElevationPage | SuperUserPanel, SiteAdminPanel, MailboxAccessPanel, PimRolePanel, ElevatedJobPanel, ElevationStatusPanel (~7) |
| TemplatesPage | (~1) |
| ProtectionPage | ProtectionConfigPanel, ProtectionTemplates, DocumentTracking, OnboardingPolicy, ProtectionLogs (~6) |
| FileSharesPage | FileShareConnect, FileShareScan, FileShareLabelApply, FileShareLabelBulk, FileShareInventory (~6) |
| AnalysisPage | PermissionCheck, PolicyConflicts, LabelDlpAlignment, DeploymentReadiness, PolicyHealth (keep LabelReport + LabelMismatch) (~5) |

**~40 components removed**

### KEEP & SIMPLIFY

| Page | Components |
|------|-----------|
| Dashboard | DashboardPage (strip DLP/Retention stats) |
| Labels | LabelList, LabelDetail, LabelTree, PolicyList, PolicyDetail, PolicyForm, AutoLabelList, AutoLabelForm |
| Snapshots | SnapshotList, SnapshotCreate, SnapshotDetail, SnapshotDiffView |
| Settings | SettingsPage |
| Sidebar | Sidebar (update nav items) |
| TopBar | TopBar |

### NEW COMPONENTS (~20)

**Explorer Page:**
- ExplorerPage (layout orchestrator)
- SiteTreePanel (SharePoint/OneDrive/FileShare navigation)
- SitePicker (search + select SharePoint sites)
- OneDrivePicker (user lookup)
- FileShareInput (UNC path entry)
- FolderTree (recursive folder drill-down)
- FileListPanel (data grid with checkboxes)
- FileToolbar (label/unlabel/encrypt actions)
- ContentViewerPanel (slide-out right panel)
- EntityDetectionList (SIT matches from OpenLabels)

**Manual Label Page:**
- ManualLabelPage
- CsvUpload (drag-drop + file picker)
- CsvPreview (validation table with status per row)
- LabelProgress (progress bar + per-file status)

**Bulk Operations Page:**
- BulkOpsPage
- RemovalModeSelector (three-mode radio/card selector)
- FileSelector (CSV upload, paste, or Explorer integration)
- DryRunPreview (table showing what will change)
- ResultsSummary (success/fail counts + CSV export)

**Auto-Label Page (enhanced):**
- ConditionBuilder (visual rule builder)
- EntityTypePicker (select OpenLabels entity types)
- SiteScopeSelector (per-site/group targeting)
- PolicySimulator (dry-run results view)

---

## OpenLabels Integration Architecture

### Subprocess Management

StableLabel spawns OpenLabels as a long-running Python subprocess:

```
Electron Main Process
  └─ openlabels-bridge.ts
       └─ spawn('python', ['-m', 'openlabels.cli', '--mode=server', '--format=jsonl'])
            └─ stdin: JSON requests
            └─ stdout: JSON responses
```

**Communication protocol**: JSON Lines over stdin/stdout (same pattern as PowerShell bridge)

**Request types:**
- `scan_content`: Send file path or text → get entity detections
- `scan_batch`: Send multiple files → get batch results
- `list_entities`: Get available entity types
- `health`: Check engine status + available detectors

**Configuration passed at startup:**
- Detection preset: `patterns_only` | `full` (with ML)
- Enabled entity types
- Confidence thresholds
- Language settings

### Auto-Label Rule Evaluation

```
1. User defines auto-label rule:
   IF file in "HR SharePoint Site"
   AND contains SSN (confidence > 0.8)
   AND contains NAME (confidence > 0.7)
   THEN apply "Highly Confidential - HR"

2. When triggered (manual scan or scheduled):
   a. StableLabel enumerates files in target location(s) via Graph
   b. For each file, downloads content via Graph API
   c. Sends content to OpenLabels subprocess for entity detection
   d. Evaluates rule conditions against detection results
   e. Applies label via Set-SLDocumentLabel if conditions match

3. Results logged per-file: matched rules, detected entities, applied label
```

---

## Implementation Phases

### Phase 1: Strip Down (remove dead weight)
1. Delete DLP page, components, and cmdlets
2. Delete Retention page, components, and cmdlets
3. Delete Elevation page, components, and cmdlets
4. Delete Templates page, components, and cmdlets
5. Delete FileShares page and components (cmdlets replaced in Phase 3)
6. Delete Protection page and most cmdlets (keep Get-SLProtectionConfig)
7. Pare down Analysis page (keep LabelReport + LabelMismatch only)
8. Update Sidebar navigation (8 items instead of 15)
9. Simplify Dashboard (label-only stats)
10. Scope Snapshots (remove DLP/Retention scopes)
11. Clean cmdlet registry (remove deleted cmdlet entries)
12. Remove unused types, hooks, utilities

### Phase 2: Build Manual Label + Bulk Ops
1. Build Import-SLLabelCsv cmdlet
2. Build ManualLabelPage + CsvUpload + CsvPreview + LabelProgress
3. Build Remove-SLDocumentEncryption cmdlet
4. Build Remove-SLDocumentLabelBulk cmdlet
5. Build BulkOpsPage + RemovalModeSelector + FileSelector + DryRunPreview
6. Register new cmdlets in cmdlet-registry.ts
7. Wire up IPC handlers

### Phase 3: Build Explorer
1. Build Get-SLSiteList cmdlet (Graph: /sites?search=*)
2. Build Get-SLOneDriveList cmdlet (Graph: /users/{id}/drive)
3. Build Get-SLDriveChildren cmdlet (Graph: /drives/{id}/items/{id}/children)
4. Build Get-SLDocumentDetail cmdlet (label + encryption detail)
5. Build fresh file share browsing cmdlets (Get-SLFileShareChildren, etc.)
6. Build ExplorerPage layout
7. Build SiteTreePanel + SitePicker + OneDrivePicker + FileShareInput
8. Build FolderTree (recursive navigation)
9. Build FileListPanel (data grid + checkboxes + pagination)
10. Build FileToolbar (label/unlabel actions)
11. Build ContentViewerPanel (slide-out)

### Phase 4: OpenLabels Integration
1. Build openlabels-bridge.ts (subprocess manager, JSONL protocol)
2. Add OpenLabels health check to Dashboard connection status
3. Build EntityDetectionList component (for Content Viewer)
4. Wire Content Viewer to trigger OpenLabels scan on file select
5. Enhance Auto-Label page:
   - ConditionBuilder with EntityTypePicker
   - SiteScopeSelector for per-site rules
   - PolicySimulator for dry-run testing
6. Build auto-label execution engine (enumerate → scan → evaluate → apply)
7. Settings page: OpenLabels engine path + detector configuration

### Phase 5: Polish
1. Dashboard refinement (activity feed, quick stats)
2. Virtual scroll / pagination for large file lists
3. Error handling + retry logic for Graph API pagination
4. Export improvements (CSV encoding, column selection)
5. Snapshot scope enforcement (only label-related scopes)
6. Keyboard shortcuts for Explorer (Ctrl+A select all, etc.)
