import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { PowerShellBridge } from './powershell-bridge';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let psBridge: PowerShellBridge | null = null;

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
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'StableLabel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
  // Initialize PowerShell bridge
  const modulePath = getModulePath();
  psBridge = new PowerShellBridge(modulePath);

  // Register IPC handlers
  ipcMain.handle('ps:invoke', async (_event, command: string) => {
    if (!psBridge) throw new Error('PowerShell bridge not initialized');

    // Wire device-code callback to forward to renderer via IPC
    psBridge.onDeviceCode = (info) => {
      mainWindow?.webContents.send('ps:device-code', info);
    };

    return psBridge.invoke(command);
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

  createWindow();
});

app.on('window-all-closed', () => {
  if (psBridge) {
    psBridge.dispose();
    psBridge = null;
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
