# Security Hardening Plan — HIGH + MEDIUM Findings + Credential Vault

## Overview

The core fix is **H1: Structured IPC with cmdlet allowlist**. Moving command construction
from the renderer to the main process eliminates H1, H2, H3, and most of M4 in one shot.
The remaining MEDIUMs are small targeted fixes. The credential vault layers on top.

---

## Step 1: Create cmdlet registry + structured IPC (fixes H1, H2, H3)

**New file: `src/cmdlet-registry.ts`**

Define every allowed cmdlet with its parameter schema:

```typescript
interface ParamDef {
  type: 'string' | 'number' | 'boolean' | 'guid' | 'path' | 'enum';
  required?: boolean;
  allowedValues?: string[];   // for enum type
  pattern?: RegExp;           // for string validation (e.g. GUID format)
  quote?: boolean;            // wrap in PS single quotes (default true for strings)
}

interface CmdletDef {
  name: string;               // e.g. 'Get-SLLabel'
  params: Record<string, ParamDef>;
  switches?: string[];        // e.g. ['-Confirm:$false', '-UseDeviceCode']
}
```

Register all 69 cmdlets with their parameters. Main process validates:
1. Cmdlet name is in the registry
2. Every param key exists in the schema
3. Every param value matches its type/pattern/enum
4. Build the PS command string server-side with centralized escaping

**Refactor `src/powershell-bridge.ts`**
- Add `invokeStructured(cmdlet: string, params: Record<string, unknown>): Promise<Result>`
- Build command string internally using the registry
- Centralized `escapeValue()` that handles: single-quote doubling, newline rejection,
  null byte stripping, backtick escaping
- Keep raw `invoke()` as private (only used internally by bridge for bootstrapping)

**Refactor `src/preload.ts`**
- Change API from `invoke(command: string)` to `invoke(cmdlet: string, params?: Record<string, unknown>)`
- Old raw-string signature removed entirely

**Refactor `src/main.ts` IPC handler**
- `ps:invoke` now receives `{ cmdlet, params }`, validates against registry, calls bridge

**Refactor all 31 renderer components**
- Replace `invoke(\`Get-SLLabel\`)` → `invoke('Get-SLLabel')`
- Replace `invoke(\`Set-SLDocumentLabel -ItemId '${esc(id)}' -LabelId '${esc(labelId)}'\`)`
  → `invoke('Set-SLDocumentLabel', { ItemId: id, LabelId: labelId })`
- Remove all local `esc()` function definitions

---

## Step 2: Electron hardening (fixes M1, M2, M3)

**In `src/main.ts`:**

a) Add `sandbox: true` to BrowserWindow webPreferences (M1)

b) Add navigation guards (M2):
```typescript
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  const allowed = ['microsoft.com', 'login.microsoftonline.com'];
  if (allowed.some(d => new URL(url).hostname.endsWith(d))) {
    shell.openExternal(url);
  }
  return { action: 'deny' };
});
mainWindow.webContents.on('will-navigate', (event, url) => {
  const appOrigin = MAIN_WINDOW_VITE_DEV_SERVER_URL ?? 'file://';
  if (!url.startsWith(appOrigin)) event.preventDefault();
});
```

c) Validate device-code URL domain in bridge (M3):
- In `powershell-bridge.ts` where device-code is parsed, reject URLs not matching
  `microsoft.com/devicelogin` or `login.microsoftonline.com`

---

## Step 3: File path validation (fixes M4)

**In `src/main.ts`:**
- Add new IPC handlers `dialog:open-file` and `dialog:save-file` that use Electron's
  `dialog.showOpenDialog()` / `dialog.showSaveDialog()`
- Expose via preload as `window.stablelabel.openFileDialog()` / `saveFileDialog()`

**In cmdlet registry:**
- Parameters of type `'path'` are validated: no `..` sequences, must be absolute path
- For Export/Import operations, renderer calls the file dialog first, then passes the
  OS-selected path to the invoke call

**Refactor affected components:**
- ProtectionTemplates.tsx (Export/Import)
- FileShareConnect.tsx, FileShareScan.tsx, FileShareLabelApply.tsx, etc.

---

## Step 4: Credential vault via safeStorage (new feature)

**How it works:**
- Microsoft.Graph PowerShell module uses MSAL internally with an in-memory token cache
- We configure it to serialize the token cache to a file path we control
- On app quit, encrypt the cache file using `electron.safeStorage.encryptString()`
- On app start, decrypt and load the cache before calling Connect-SLAll
- MSAL automatically uses cached refresh tokens → silent auth (no device code needed)
- If refresh token is expired, falls back to device code flow gracefully

**In `src/credential-store.ts` (new):**
```typescript
import { safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const CACHE_PATH = path.join(app.getPath('userData'), '.token-cache');

export function loadTokenCache(): string | null {
  if (!existsSync(CACHE_PATH)) return null;
  const encrypted = readFileSync(CACHE_PATH);
  return safeStorage.decryptString(encrypted);
}

export function saveTokenCache(plaintext: string): void {
  const encrypted = safeStorage.encryptString(plaintext);
  writeFileSync(CACHE_PATH, encrypted);
}

export function clearTokenCache(): void {
  if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
}
```

**In PowerShell bridge:**
- On init, if cached tokens exist, set the MSAL token cache path and deserialize
- On disconnect/quit, serialize and encrypt via credential-store
- Add `ps:clear-credentials` IPC handler for explicit sign-out

**In ConnectionDialog.tsx:**
- Show "Sign in" vs "Reconnect as {upn}" based on whether cached credentials exist
- Add explicit "Sign out" button that clears the vault

---

## Step 5: Update tests

- Update powershell-bridge tests for new `invokeStructured()` method
- Add cmdlet-registry tests: allowlist validation, param type checking, injection attempts
- Add credential-store tests: encrypt/decrypt round-trip, missing file handling
- Update component tests to use new `invoke(cmdlet, params)` signature

---

## Execution Order

1. **Step 1** (cmdlet registry + structured IPC) — largest change, fixes 3 HIGHs
2. **Step 2** (Electron hardening) — small, independent changes in main.ts + bridge
3. **Step 3** (file path validation) — depends on Step 1 for path param type
4. **Step 4** (credential vault) — independent, can be done in parallel with Step 3
5. **Step 5** (tests) — after each step, update relevant tests
