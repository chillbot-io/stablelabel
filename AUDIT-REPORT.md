# StableLabel Deep Dive Audit Report

**Date**: 2026-03-19
**Scope**: Full codebase audit — Security, AI Slop, E2E/Tests, Application Logic, Electron Architecture
**Updated**: 2026-03-23 — All CRITICAL, HIGH, MEDIUM, and LOW severity issues resolved. Removed findings referencing deleted components (DLP, Retention, FileShare, SuperUser)

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

### 2. ~~npm Dependency Vulnerabilities (32 total)~~ FIXED

**Severity**: HIGH
**File**: `stablelabel-gui/package.json`
**Status**: FIXED — Electron ASAR already resolved (v41 >> v35.7.5). Added npm overrides for `tar@^7.5.11` and `@tootallnate/once@^3.0.1` to patch transitive deps. Reduced from 32 HIGH to 0 HIGH (7 low/moderate remain in dev-only tooling: esbuild dev-server XSS and tmp symlink — not shipped to users).

**Fix**: `npm audit fix`, upgrade Electron.

---

### 3. PowerShell Bridge — No Spawn Error Handler

**Severity**: HIGH
**File**: `stablelabel-gui/src/powershell-bridge.ts:160-168`

No `.on('error')` handler for the persistent PowerShell process. If the process fails to start after initialization, all subsequent commands hang forever.

**Fix**: Add error handler that rejects pending commands and notifies the renderer.

---

### 4. ~~PowerShell Bridge — Unbounded Buffer Growth~~ FIXED

**Severity**: HIGH
**File**: `stablelabel-gui/src/powershell-bridge.ts:170-194`
**Status**: FIXED — Added 50 MB buffer cap. stdout overflow rejects the current command with an error. stderr overflow truncates from the start to keep recent output. Also added MAX_QUEUE_SIZE (500) to prevent unbounded command queue growth.

**Fix**: Add max buffer size with truncation or error on overflow.

---

### 5. ~~PowerShell Bridge — Zombie Process Risk~~ FIXED

**Severity**: HIGH
**File**: `stablelabel-gui/src/powershell-bridge.ts:345-348`
**Status**: FIXED — dispose() now sends graceful `exit`, then SIGTERM after 2s, then SIGKILL after another 2s if process survives.

**Fix**: Add timeout-based SIGKILL escalation.

---

### 6. ~~Connect-SLAll Partial Connection State~~ FIXED

**Severity**: HIGH
**File**: `StableLabel/Public/Connection/Connect-SLAll.ps1:174-188`
**Status**: FIXED — Graph failure now clears stale credentials (GraphAccessToken, GraphTokenExpiry) from `$script:SLConnection` and sets `GraphConnected=$false`. Status returns `PartiallyConnected` when `-IncludeGraph` was requested but Graph failed, instead of misleading `Connected`.

**Fix**: Clear identity fields on partial failure or prevent operations that require full connection.

---

### 7. ~~Pre-Restore Backup Not Validated~~ FIXED

**Severity**: HIGH
**File**: `StableLabel/Public/Snapshot/Restore-SLSnapshot.ps1:188-189`
**Status**: FIXED (previously) — Backup result is now captured and validated. If `New-SLSnapshot` fails or the file doesn't exist, restore throws before proceeding.

**Fix**: Capture and validate backup result before proceeding.

---

### 8. ~~State Updates After Unmount~~ FIXED

**Severity**: HIGH
**Files**: `DocumentLabelBulk.tsx`, `SnapshotDetail.tsx`, `SnapshotList.tsx`
**Status**: FIXED — Added `mountedRef` pattern to all three components. All async callbacks check `mountedRef.current` before calling setState. SnapshotDetail's useEffect also uses a `cancelled` cleanup variable returned from the effect.

**Fix**: Use cleanup flag or AbortController pattern.

---

## MEDIUM SEVERITY

### Security

| # | File | Issue |
|---|------|-------|
| 9 | `ConnectionDialog.tsx`, `SettingsPage.tsx` | ~~localStorage stores UPN & tenant ID~~ FIXED — Migrated to encrypted main-process preferences via IPC (`preferences:get`/`preferences:set`) backed by safeStorage |
| 10 | `powershell-bridge.ts:231-270` | ~~No command queue size limit~~ FIXED — MAX_QUEUE_SIZE=500 |
| 11 | `main.ts:136-148` | ~~File dialog `defaultPath` not validated~~ FIXED — Rejects path traversal (`/../`) and UNC paths (`\\\\`, `//`) |
| 12 | `cmdlet-registry.ts:58-67` | ~~UNC path traversal not fully validated~~ FIXED — `validatePath()` now rejects `\\\\` and `//` UNC prefixes |
| 13 | `credential-store.ts:37` | ~~Silent fallback if encryption unavailable~~ FIXED — Now logs explicit warning/error via logger when encryption is unavailable, refuses to store tokens unencrypted |

### Application Logic

| # | File | Issue |
|---|------|-------|
| 14 | `usePagination.ts:5-16` | ~~Pagination doesn't reset on items change~~ FIXED — Resets limit when `items.length` changes |
| 15 | `Invoke-SLComplianceCommand.ps1:53-56` | ~~Session recycle resets timestamp~~ FIXED — Added `ComplianceLastCommandAt` tracking; idle timeout now uses last command time, not session start |
| 16 | `StableLabel.psm1:54-60` | ~~Module init doesn't validate writable directories~~ FIXED — Write-test on init with clear warning if directory is not writable |
| 17 | `SettingsPage.tsx:36-40` | ~~`useEffect` overwrites user-set `modulePath`~~ FIXED — Tracks `userSetModulePath` flag; auto-fill only when user hasn't explicitly set a path |
| 18 | `SettingsPage.tsx:25-34` | ~~No validation of localStorage settings shape~~ FIXED — `validateSettings()` validates type, range, and allowed values before applying |
| 19 | `main.ts:163-165` | ~~macOS: PowerShell bridge not cleaned up~~ FIXED — Bridges now disposed on `window-all-closed` on all platforms; re-created on `activate` |

### AI Slop

| # | File | Issue |
|---|------|-------|
| 20 | Across codebase | ~~Inconsistent error handling patterns~~ FIXED — Unified to `?? 'Failed'` for invoke errors, added `.catch().finally()` to fire-and-forget promises in LabelsPage |

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
| 28 | `index.html:6` | ~~CSP allows `style-src 'unsafe-inline'`~~ FIXED — Removed `'unsafe-inline'`; Vite production build extracts CSS to files so `'self'` is sufficient |
| 29 | `App.tsx:20-51` | ~~No code splitting~~ FIXED — All 11 page components converted to `React.lazy()` with `Suspense` fallback |
| 30 | `main.ts:109-120` | ~~IPC handlers don't catch exceptions~~ FIXED — All IPC handlers wrapped in try-catch, return structured error responses instead of throwing |
| 31 | Multiple files | ~~Meaningless comments~~ FIXED — Replaced with descriptive context |

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
