import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposes a safe API to the renderer process via contextBridge.
 * The renderer cannot access Node.js or Electron APIs directly.
 *
 * Commands use a structured API — the renderer sends a cmdlet name
 * and parameter object; the main process validates against the
 * cmdlet registry and builds the PowerShell command server-side.
 */
contextBridge.exposeInMainWorld('stablelabel', {
  /** Invoke a StableLabel cmdlet with validated parameters */
  invoke: (
    cmdlet: string,
    params?: Record<string, unknown>,
  ): Promise<{ success: boolean; data: unknown; error?: string }> =>
    ipcRenderer.invoke('ps:invoke', cmdlet, params ?? {}),

  /** Check if pwsh is available on this machine */
  checkPwsh: (): Promise<{ available: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('ps:check-pwsh'),

  /** Get bridge status */
  getStatus: (): Promise<{ initialized: boolean; modulePath?: string }> =>
    ipcRenderer.invoke('ps:get-status'),

  /** Listen for device-code authentication prompts from Connect-MgGraph */
  onDeviceCode: (callback: (info: { userCode: string; verificationUrl: string; message: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { userCode: string; verificationUrl: string; message: string }) => callback(info);
    ipcRenderer.on('ps:device-code', handler);
    return () => ipcRenderer.removeListener('ps:device-code', handler);
  },

  /** Open a native file-open dialog */
  openFileDialog: (options?: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null> =>
    ipcRenderer.invoke('dialog:open-file', options),

  /** Open a native file-save dialog */
  saveFileDialog: (options?: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-file', options),

  /** Clear stored credentials */
  clearCredentials: (): Promise<void> =>
    ipcRenderer.invoke('credentials:clear'),

  /** Current platform (win32, darwin, linux) */
  platform: process.platform,
});
