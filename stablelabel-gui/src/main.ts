import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import { PowerShellBridge } from './powershell-bridge';
import { ClassifierBridge } from './classifier-bridge';
import { CredentialStore } from './credential-store';
import { logger, initFileLogging } from './logger';
import { CMDLET_REGISTRY } from './cmdlet-registry';
import { TRUSTED_EXTERNAL_HOSTS } from './trusted-hosts';

const MAIN_WINDOW_WIDTH = 1400;
const MAIN_WINDOW_HEIGHT = 900;
const MAIN_WINDOW_MIN_WIDTH = 1000;
const MAIN_WINDOW_MIN_HEIGHT = 700;

/** Allowed classifier actions — defense-in-depth allowlist */
const CLASSIFIER_ACTIONS = new Set(['analyze', 'health', 'list_entities', 'reload', 'test']);

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let psBridge: PowerShellBridge | null = null;
let classifierBridge: ClassifierBridge | null = null;

function getModulePath(): string {
  if (app.isPackaged) {
    // In packaged app, module is in resources
    return path.join(process.resourcesPath, 'StableLabel');
  }
  // In development, module is adjacent to the GUI folder
  return path.join(__dirname, '..', '..', '..', 'StableLabel');
}

function ensureBridges(): void {
  if (!psBridge) {
    const modulePath = getModulePath();
    psBridge = new PowerShellBridge(modulePath);
    // Wire device-code callback once — uses closure over mainWindow ref
    psBridge.onDeviceCode = (info) => {
      mainWindow?.webContents.send('ps:device-code', info);
    };
  }
  if (!classifierBridge) {
    classifierBridge = new ClassifierBridge();
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    title: 'StableLabel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // ── Navigation guards (M2) ──────────────────────────────────────────
  const appOrigin = MAIN_WINDOW_VITE_DEV_SERVER_URL ?? 'file://';

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appOrigin)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const hostname = new URL(url).hostname;
      if (TRUSTED_EXTERNAL_HOSTS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
        shell.openExternal(url);
      }
    } catch {
      // Reject malformed URLs
    }
    return { action: 'deny' as const };
  });

  // ── Disable DevTools in production (L2) ─────────────────────────────
  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // ── Structured file logging ─────────────────────────────────────────
  initFileLogging(app.getPath('userData')).then(() => {
    logger.info('APP', `StableLabel v${app.getVersion()} starting (${process.platform}, Electron ${process.versions.electron})`);
  });

  // ── Permission handler — deny all (L3) ──────────────────────────────
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  // Initialize bridges
  ensureBridges();

  // Register IPC handlers — structured invocation only
  // All handlers return structured results instead of throwing, so the
  // renderer always gets a usable response even on unexpected errors (#30).
  ipcMain.handle('ps:invoke', async (_event, cmdlet: string, params: Record<string, unknown>) => {
    try {
      if (!psBridge) return { success: false, data: null, error: 'PowerShell bridge not initialized' };

      // Validate cmdlet is in the registry (defense-in-depth — buildCommand checks too)
      if (!CMDLET_REGISTRY[cmdlet]) {
        return { success: false, data: null, error: `Cmdlet "${cmdlet}" is not permitted` };
      }

      return psBridge.invokeStructured(cmdlet, params);
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ps:check-pwsh', async () => {
    try {
      if (!psBridge) return { available: false, error: 'PowerShell bridge not initialized' };
      return psBridge.checkPwshAvailable();
    } catch (err) {
      return { available: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ps:get-status', async () => {
    try {
      if (!psBridge) return { initialized: false };
      return {
        initialized: psBridge.isInitialized(),
        modulePath: getModulePath(),
      };
    } catch {
      return { initialized: false };
    }
  });

  // ── File dialogs (M4) ───────────────────────────────────────────────
  ipcMain.handle('dialog:open-file', async (_event, options?: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options?.title ?? 'Select File',
      filters: options?.filters,
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('dialog:save-file', async (_event, options?: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => {
    if (!mainWindow) return null;
    // Validate defaultPath — reject directory traversal and UNC paths
    let safePath = options?.defaultPath;
    if (safePath) {
      const normalised = safePath.replace(/\\/g, '/');
      if (normalised.includes('/../') || normalised.startsWith('//') || normalised.startsWith('\\\\')) {
        safePath = undefined;
      }
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: options?.title ?? 'Save File',
      defaultPath: safePath,
      filters: options?.filters,
    });
    return result.canceled ? null : result.filePath ?? null;
  });

  // ── Credential vault ────────────────────────────────────────────────
  ipcMain.handle('credentials:clear', async () => {
    CredentialStore.clear();
  });

  // ── Encrypted preferences (replaces renderer localStorage for PII) ─
  ipcMain.handle('preferences:get', async () => {
    return CredentialStore.loadPrefs();
  });

  ipcMain.handle('preferences:set', async (_event, prefs: Record<string, unknown>) => {
    if (typeof prefs !== 'object' || prefs === null) return false;
    const existing = CredentialStore.loadPrefs();
    return CredentialStore.savePrefs({ ...existing, ...prefs });
  });

  // ── Settings (pushed from renderer) ────────────────────────────────
  ipcMain.handle('settings:update', async (_event, settings: { timeout?: number; logLevel?: string }) => {
    if (settings.timeout && psBridge) {
      psBridge.setCommandTimeout(settings.timeout);
    }
    if (settings.logLevel) {
      logger.setLevel(settings.logLevel);
    }
  });

  // ── Classifier (Presidio + spaCy) ──────────────────────────────────
  ipcMain.handle('classifier:invoke', async (_event, action: string, params: Record<string, unknown>) => {
    try {
      if (!classifierBridge) return { success: false, data: null, error: 'Classifier bridge not initialized' };
      // Validate action against allowlist (defense-in-depth)
      if (!CLASSIFIER_ACTIONS.has(action)) {
        return { success: false, data: null, error: `Unknown classifier action: "${action}"` };
      }
      return classifierBridge.invoke(action, params);
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('classifier:check', async () => {
    try {
      if (!classifierBridge) return { available: false, error: 'Not initialized' };
      return classifierBridge.checkAvailable();
    } catch (err) {
      return { available: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('classifier:get-status', async () => {
    try {
      if (!classifierBridge) return { initialized: false };
      return { initialized: classifierBridge.isInitialized() };
    } catch {
      return { initialized: false };
    }
  });

  createWindow();

  // ── Auto-update (check silently, notify user when ready) ──────────
  if (app.isPackaged) {
    autoUpdater.logger = {
      info: (msg: unknown) => logger.info('UPDATER', String(msg)),
      warn: (msg: unknown) => logger.warn('UPDATER', String(msg)),
      error: (msg: unknown) => logger.error('UPDATER', String(msg)),
      debug: (msg: unknown) => logger.debug('UPDATER', String(msg)),
    };
    // Don't auto-download — notify the user first so they can choose when.
    // This prevents a compromised update feed from silently replacing the app.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) => {
      logger.info('UPDATER', `Update available: ${info.version}`);
      // Notify renderer so the UI can show an "Update available" prompt
      mainWindow?.webContents.send('update:available', info.version);
    });
    autoUpdater.on('update-downloaded', (info) => {
      logger.info('UPDATER', `Update downloaded: ${info.version} — will install on quit`);
      mainWindow?.webContents.send('update:ready', info.version);
    });
    autoUpdater.checkForUpdates().catch((err) => {
      logger.warn('UPDATER', `Update check failed: ${err}`);
    });
  }
});

app.on('window-all-closed', () => {
  // Dispose bridges on all platforms — no reason to keep PowerShell
  // running when there are no windows. On macOS, bridges are re-created
  // in the 'activate' handler when the user clicks the dock icon.
  psBridge?.dispose();
  psBridge = null;
  classifierBridge?.dispose();
  classifierBridge = null;

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    ensureBridges();
    createWindow();
  }
});
