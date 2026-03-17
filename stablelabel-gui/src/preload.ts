import { contextBridge, ipcRenderer } from 'electron';

/**
 * Exposes a safe API to the renderer process via contextBridge.
 * The renderer cannot access Node.js or Electron APIs directly.
 */
contextBridge.exposeInMainWorld('stablelabel', {
  /** Invoke a StableLabel PowerShell command and get JSON result */
  invoke: (command: string): Promise<{ success: boolean; data: unknown; error?: string }> =>
    ipcRenderer.invoke('ps:invoke', command),

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

  /** Current platform (win32, darwin, linux) */
  platform: process.platform,
});
