# StableLabel Deep Dive Audit Report

**Date**: 2026-03-19
**Scope**: Full codebase audit — Security, AI Slop, E2E/Tests, Application Logic, Electron Architecture

---

## Executive Summary

32 issues found across 5 audit categories. The app has strong security foundations (cmdlet allowlist, Electron sandboxing, OS-level credential encryption) but suffers from AI-generated code duplication, silent error swallowing, tautological tests, and two command injection vulnerabilities that bypass the otherwise excellent input validation.

---

## CRITICAL & HIGH SEVERITY

### 1. Command Injection in Retention Detail Components

**Severity**: CRITICAL
**Files**: `stablelabel-gui/src/renderer/components/Retention/RetentionLabelDetail.tsx:19`, `RetentionPolicyDetail.tsx:19`

Uses string interpolation instead of parameterized invoke:
```typescript
// VULNERABLE — user input can break out of quotes
invoke<RetentionLabel>(`Get-SLRetentionLabel -Identity '${labelName}'`)

// SAFE — rest of codebase uses this pattern
invoke<RetentionLabel>('Get-SLRetentionLabel', { Identity: labelName })
```

**Fix**: Switch to parameterized invoke like every other detail component.

---

### 2. Restore-SLSnapshot Silently Skips Create/Update Operations

**Severity**: CRITICAL
**File**: `StableLabel/Public/Snapshot/Restore-SLSnapshot.ps1:204-210`

The restore function emits `Write-Warning` for Create/Update operations but sets `Status = 'Success'` anyway. Users think restore worked when it skipped the actual work.

**Fix**: Set status to `'Skipped'` or `'Partial'` and surface clearly to the user.

---

### 3. npm Dependency Vulnerabilities (32 total)

**Severity**: HIGH
**File**: `stablelabel-gui/package.json`

- Electron ASAR integrity bypass (needs ≥35.7.5)
- `tar` — arbitrary file creation via hardlink path traversal
- `esbuild` — XSS via dev server
- `tmp` — symlink exploitation

**Fix**: `npm audit fix`, upgrade Electron.

---

### 4. PowerShell Bridge — No Spawn Error Handler

**Severity**: HIGH
**File**: `stablelabel-gui/src/powershell-bridge.ts:160-168`

No `.on('error')` handler for the persistent PowerShell process. If the process fails to start after initialization, all subsequent commands hang forever.

**Fix**: Add error handler that rejects pending commands and notifies the renderer.

---

### 5. PowerShell Bridge — Unbounded Buffer Growth

**Severity**: HIGH
**File**: `stablelabel-gui/src/powershell-bridge.ts:170-194`

`outputBuffer` and `stderrBuffer` grow without limit. A runaway cmdlet could exhaust memory.

**Fix**: Add max buffer size with truncation or error on overflow.

---

### 6. PowerShell Bridge — Zombie Process Risk

**Severity**: HIGH
**File**: `stablelabel-gui/src/powershell-bridge.ts:345-348`

No `SIGKILL` escalation if graceful kill fails during dispose.

**Fix**: Add timeout-based SIGKILL escalation.

---

### 7. Connect-SLAll Partial Connection State

**Severity**: HIGH
**File**: `StableLabel/Public/Connection/Connect-SLAll.ps1:174-188`

If Graph succeeds but Compliance fails, returns `PartiallyConnected` but stale credentials remain set. Downstream operations may use wrong identity.

**Fix**: Clear identity fields on partial failure or prevent operations that require full connection.

---

### 8. Pre-Restore Backup Not Validated

**Severity**: HIGH
**File**: `StableLabel/Public/Snapshot/Restore-SLSnapshot.ps1:188-189`

`New-SLSnapshot` output suppressed with `Out-Null`. If backup fails (disk full), restore proceeds with no recovery path.

**Fix**: Capture and validate backup result before proceeding.

---

### 9. State Updates After Unmount

**Severity**: HIGH
**Files**: `DocumentLabelBulk.tsx`, `FileShareLabelBulk.tsx`, `SnapshotDetail.tsx`, `SnapshotList.tsx`

Async callbacks call `setState` without checking if component is still mounted. Causes React memory leak warnings.

**Fix**: Use cleanup flag or AbortController pattern.

---

### 10. Massive Code Duplication (AI Slop)

**Severity**: HIGH
**Files**: 6+ detail components across DLP, Retention, Labels, Snapshots, Protection

`Card`, `RawJson`, `fmt`/`formatDate`, `LocationRow` helper components are copy-pasted identically. Should be in `common/`.

---

### 11. Triple `setActiveTabId` Calls (AI Slop)

**Severity**: HIGH
**Files**: `DlpPage.tsx:34-41`, `LabelsPage.tsx:34-41`, `RetentionPage.tsx:29-33`

`setActiveTabId(tabId)` called 3 times in same callback — redundant, causes unnecessary re-renders.

---

### 12. Silent Error Swallowing

**Severity**: HIGH
**Files**: `DashboardPage.tsx` (6 instances), `ProtectionConfigPanel.tsx:49`, `LabelDetail.tsx:44`

`.catch(() => {})` and `catch { /* ignore */ }` throughout. Users get no feedback when operations fail.

---

## MEDIUM SEVERITY

### Security

| # | File | Issue |
|---|------|-------|
| 13 | `ConnectionDialog.tsx`, `SettingsPage.tsx` | localStorage stores UPN & tenant ID — should use `safeStorage` |
| 14 | `Enable-SLSuperUser.ps1:79` | `elevation-state.json` created with default permissions (world-readable on Linux) |
| 15 | `powershell-bridge.ts:231-270` | No command queue size limit — unbounded growth possible |
| 16 | `main.ts:136-148` | File dialog `defaultPath` not validated — potential directory traversal |
| 17 | `cmdlet-registry.ts:58-67` | UNC path traversal not fully validated |
| 18 | `credential-store.ts:37` | Silent fallback if encryption unavailable — tokens may be stored unencrypted |

### Application Logic

| # | File | Issue |
|---|------|-------|
| 19 | `usePagination.ts:5-16` | Pagination doesn't reset on items change — filtered lists show empty |
| 20 | `Invoke-SLComplianceCommand.ps1:53-56` | Session recycle resets timestamp — idle timeout miscalculated |
| 21 | `StableLabel.psm1:54-60` | Module init doesn't validate writable directories |
| 22 | `SettingsPage.tsx:36-40` | `useEffect` overwrites user-set `modulePath` on reconnect |
| 23 | `SettingsPage.tsx:25-34` | No validation of localStorage settings shape |
| 24 | `main.ts:163-165` | macOS: PowerShell bridge not cleaned up when all windows close |
| 25 | `Set-SLFileShareLabelBulk.ps1:86-93` | Filter parameter not validated — invalid globs silently produce no results |

### AI Slop

| # | File | Issue |
|---|------|-------|
| 26 | `DlpPage.tsx:21`, `LabelsPage.tsx:21`, `RetentionPage.tsx:18` | Module-level mutable `let formCounter` — should use `useRef` |
| 27 | Multiple detail components | Unsafe type assertions (`as Record<string, unknown>`, `as unknown as T`) |
| 28 | Across codebase | Inconsistent error handling patterns across similar components |

---

## TEST & E2E ISSUES

| # | Severity | Issue |
|---|----------|-------|
| 29 | CRITICAL | **No E2E tests exist** — zero integration tests for any user flow |
| 30 | HIGH | **Tautological tests** — ~30% of assertions verify mock returns equal mock returns |
| 31 | HIGH | **Only dry-run tested** — all mutation operations only tested with `-WhatIf` |
| 32 | HIGH | **GUI tests only verify rendering** — no IPC, data flow, or interaction testing |
| 33 | MEDIUM | **Shared test state** — snapshot/audit tests share `TestDrive` dirs without isolation |
| 34 | MEDIUM | **Unrealistic mocks** — mock objects missing critical real API properties |
| 35 | MEDIUM | **Zero tests for**: auth failure recovery, credential persistence, token refresh, concurrency, injection |

---

## LOW SEVERITY

| # | File | Issue |
|---|------|-------|
| 36 | `index.html:6` | CSP allows `style-src 'unsafe-inline'` |
| 37 | `App.tsx:20-51` | No code splitting — all pages imported eagerly |
| 38 | `main.ts:109-120` | IPC handlers don't catch exceptions from bridge calls |
| 39 | Multiple files | Meaningless comments: `/* ignore */`, `// Non-critical` |

---

## What's Working Well

- **Cmdlet registry allowlist** — excellent command injection prevention (except 2 Retention files)
- **Electron sandboxing** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **Credential storage** — OS-level encryption via `safeStorage` with `0o600` permissions
- **Navigation guards** — external URLs validated against trusted host allowlist
- **Permission handler** — all Electron permissions denied by default
- **No `Invoke-Expression`** anywhere in PowerShell code
- **Audit logging** with proper file permissions
- **Device code URL validation** — phishing prevention via domain allowlist
- **Path traversal prevention** in cmdlet registry (with minor UNC gap)

---

## Priority Fix Order

1. **Immediate**: Fix command injection in `RetentionLabelDetail.tsx` and `RetentionPolicyDetail.tsx`
2. **Immediate**: Fix `Restore-SLSnapshot.ps1` — don't report Success when ops are skipped
3. **This week**: `npm audit fix`, upgrade Electron
4. **This week**: Add spawn error handler + buffer limits to `powershell-bridge.ts`
5. **This week**: Extract duplicated helper components to `common/`
6. **Soon**: Fix silent error swallowing across Dashboard and detail pages
7. **Soon**: Add E2E test coverage for critical paths (auth, labels, snapshots, elevation)
8. **Ongoing**: Replace tautological tests with meaningful assertions
