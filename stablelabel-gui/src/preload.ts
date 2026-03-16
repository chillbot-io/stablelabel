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

  /** Current platform (win32, darwin, linux) */
  platform: process.platform,
});
