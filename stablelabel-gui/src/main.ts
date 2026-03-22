import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import path from 'node:path';
import { PowerShellBridge } from './powershell-bridge';
import { ClassifierBridge } from './classifier-bridge';
import { CredentialStore } from './credential-store';
import { CMDLET_REGISTRY } from './cmdlet-registry';
import { TRUSTED_EXTERNAL_HOSTS } from './trusted-hosts';

const MAIN_WINDOW_WIDTH = 1400;
const MAIN_WINDOW_HEIGHT = 900;
const MAIN_WINDOW_MIN_WIDTH = 1000;
const MAIN_WINDOW_MIN_HEIGHT = 700;

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
  // ── Permission handler — deny all (L3) ──────────────────────────────
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  // Initialize PowerShell bridge
  const modulePath = getModulePath();
  psBridge = new PowerShellBridge(modulePath);

  // Register IPC handlers — structured invocation only
  ipcMain.handle('ps:invoke', async (_event, cmdlet: string, params: Record<string, unknown>) => {
    if (!psBridge) throw new Error('PowerShell bridge not initialized');

    // Validate cmdlet is in the registry (defense-in-depth — buildCommand checks too)
    if (!CMDLET_REGISTRY[cmdlet]) {
      return { success: false, data: null, error: `Cmdlet "${cmdlet}" is not permitted` };
    }

    // Wire device-code callback to forward to renderer via IPC
    psBridge.onDeviceCode = (info) => {
      mainWindow?.webContents.send('ps:device-code', info);
    };

    return psBridge.invokeStructured(cmdlet, params);
  });

  ipcMain.handle('ps:check-pwsh', async () => {
    if (!psBridge) throw new Error('PowerShell bridge not initialized');
    return psBridge.checkPwshAvailable();
  });

  ipcMain.handle('ps:get-status', async () => {
    if (!psBridge) return { initialized: false };
    return {
      initialized: psBridge.isInitialized(),
      modulePath: getModulePath(),
    };
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
    const result = await dialog.showSaveDialog(mainWindow, {
      title: options?.title ?? 'Save File',
      defaultPath: options?.defaultPath,
      filters: options?.filters,
    });
    return result.canceled ? null : result.filePath ?? null;
  });

  // ── Credential vault ────────────────────────────────────────────────
  ipcMain.handle('credentials:clear', async () => {
    CredentialStore.clear();
  });

  // ── Classifier (Presidio + spaCy) ──────────────────────────────────
  classifierBridge = new ClassifierBridge();

  ipcMain.handle('classifier:invoke', async (_event, action: string, params: Record<string, unknown>) => {
    if (!classifierBridge) throw new Error('Classifier bridge not initialized');
    return classifierBridge.invoke(action, params);
  });

  ipcMain.handle('classifier:check', async () => {
    if (!classifierBridge) return { available: false, error: 'Not initialized' };
    return classifierBridge.checkAvailable();
  });

  ipcMain.handle('classifier:get-status', async () => {
    if (!classifierBridge) return { initialized: false };
    return { initialized: classifierBridge.isInitialized() };
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (psBridge) {
    psBridge.dispose();
    psBridge = null;
  }
  if (classifierBridge) {
    classifierBridge.dispose();
    classifierBridge = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
