# StableLabel Deep Dive Audit Report

**Date**: 2026-03-19
**Scope**: Full codebase audit — Security, AI Slop, E2E/Tests, Application Logic, Electron Architecture
**Updated**: 2026-03-22 — Removed findings referencing deleted components (DLP, Retention, FileShare, SuperUser)

---

## Executive Summary

31 issues found across 5 audit categories. The app has strong security foundations (cmdlet allowlist, Electron sandboxing, OS-level credential encryption) but suffers from tautological tests, and needs attention on PowerShell bridge reliability and snapshot restore correctness.

---

## CRITICAL & HIGH SEVERITY

### 1. Restore-SLSnapshot Silently Skips Create/Update Operations

**Severity**: CRITICAL
**File**: `StableLabel/Public/Snapshot/Restore-SLSnapshot.ps1:204-210`

The restore function emits `Write-Warning` for Create/Update operations but sets `Status = 'Success'` anyway. Users think restore worked when it skipped the actual work.

**Fix**: Set status to `'Skipped'` or `'Partial'` and surface clearly to the user.

---

### 2. npm Dependency Vulnerabilities (32 total)

**Severity**: HIGH
**File**: `stablelabel-gui/package.json`

- Electron ASAR integrity bypass (needs ≥35.7.5)
- `tar` — arbitrary file creation via hardlink path traversal
- `esbuild` — XSS via dev server
- `tmp` — symlink exploitation

**Fix**: `npm audit fix`, upgrade Electron.

---

### 3. PowerShell Bridge — No Spawn Error Handler

**Severity**: HIGH
**File**: `stablelabel-gui/src/powershell-bridge.ts:160-168`

No `.on('error')` handler for the persistent PowerShell process. If the process fails to start after initialization, all subsequent commands hang forever.

**Fix**: Add error handler that rejects pending commands and notifies the renderer.

---

### 4. PowerShell Bridge — Unbounded Buffer Growth

**Severity**: HIGH
**File**: `stablelabel-gui/src/powershell-bridge.ts:170-194`

`outputBuffer` and `stderrBuffer` grow without limit. A runaway cmdlet could exhaust memory.

**Fix**: Add max buffer size with truncation or error on overflow.

---

### 5. PowerShell Bridge — Zombie Process Risk

**Severity**: HIGH
**File**: `stablelabel-gui/src/powershell-bridge.ts:345-348`

No `SIGKILL` escalation if graceful kill fails during dispose.

**Fix**: Add timeout-based SIGKILL escalation.

---

### 6. Connect-SLAll Partial Connection State

**Severity**: HIGH
**File**: `StableLabel/Public/Connection/Connect-SLAll.ps1:174-188`

If Graph succeeds but Compliance fails, returns `PartiallyConnected` but stale credentials remain set. Downstream operations may use wrong identity.

**Fix**: Clear identity fields on partial failure or prevent operations that require full connection.

---

### 7. Pre-Restore Backup Not Validated

**Severity**: HIGH
**File**: `StableLabel/Public/Snapshot/Restore-SLSnapshot.ps1:188-189`

`New-SLSnapshot` output suppressed with `Out-Null`. If backup fails (disk full), restore proceeds with no recovery path.

**Fix**: Capture and validate backup result before proceeding.

---

### 8. State Updates After Unmount

**Severity**: HIGH
**Files**: `DocumentLabelBulk.tsx`, `SnapshotDetail.tsx`, `SnapshotList.tsx`

Async callbacks call `setState` without checking if component is still mounted. Causes React memory leak warnings.

**Fix**: Use cleanup flag or AbortController pattern.

---

## MEDIUM SEVERITY

### Security

| # | File | Issue |
|---|------|-------|
| 9 | `ConnectionDialog.tsx`, `SettingsPage.tsx` | localStorage stores UPN & tenant ID — should use `safeStorage` |
| 10 | `powershell-bridge.ts:231-270` | No command queue size limit — unbounded growth possible |
| 11 | `main.ts:136-148` | File dialog `defaultPath` not validated — potential directory traversal |
| 12 | `cmdlet-registry.ts:58-67` | UNC path traversal not fully validated |
| 13 | `credential-store.ts:37` | Silent fallback if encryption unavailable — tokens may be stored unencrypted |

### Application Logic

| # | File | Issue |
|---|------|-------|
| 14 | `usePagination.ts:5-16` | Pagination doesn't reset on items change — filtered lists show empty |
| 15 | `Invoke-SLComplianceCommand.ps1:53-56` | Session recycle resets timestamp — idle timeout miscalculated |
| 16 | `StableLabel.psm1:54-60` | Module init doesn't validate writable directories |
| 17 | `SettingsPage.tsx:36-40` | `useEffect` overwrites user-set `modulePath` on reconnect |
| 18 | `SettingsPage.tsx:25-34` | No validation of localStorage settings shape |
| 19 | `main.ts:163-165` | macOS: PowerShell bridge not cleaned up when all windows close |

### AI Slop

| # | File | Issue |
|---|------|-------|
| 20 | Across codebase | Inconsistent error handling patterns across similar components |

---

## TEST & E2E ISSUES

| # | Severity | Issue |
|---|----------|-------|
| 21 | CRITICAL | **No E2E tests exist** — zero integration tests for any user flow |
| 22 | HIGH | **Tautological tests** — ~30% of assertions verify mock returns equal mock returns |
| 23 | HIGH | **Only dry-run tested** — all mutation operations only tested with `-WhatIf` |
| 24 | HIGH | **GUI tests only verify rendering** — no IPC, data flow, or interaction testing |
| 25 | MEDIUM | **Shared test state** — snapshot/audit tests share `TestDrive` dirs without isolation |
| 26 | MEDIUM | **Unrealistic mocks** — mock objects missing critical real API properties |
| 27 | MEDIUM | **Zero tests for**: auth failure recovery, credential persistence, token refresh, concurrency, injection |

---

## LOW SEVERITY

| # | File | Issue |
|---|------|-------|
| 28 | `index.html:6` | CSP allows `style-src 'unsafe-inline'` |
| 29 | `App.tsx:20-51` | No code splitting — all pages imported eagerly |
| 30 | `main.ts:109-120` | IPC handlers don't catch exceptions from bridge calls |
| 31 | Multiple files | Meaningless comments: `/* ignore */`, `// Non-critical` |

---

## What's Working Well

- **Cmdlet registry allowlist** — excellent command injection prevention
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

1. **Immediate**: Fix `Restore-SLSnapshot.ps1` — don't report Success when ops are skipped
2. **This week**: `npm audit fix`, upgrade Electron
3. **This week**: Add spawn error handler + buffer limits to `powershell-bridge.ts`
4. **Soon**: Add E2E test coverage for critical paths (auth, labels, snapshots)
5. **Ongoing**: Replace tautological tests with meaningful assertions
