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

  /** Push settings updates to the main process */
  updateSettings: (settings: { timeout?: number; logLevel?: string }): Promise<void> =>
    ipcRenderer.invoke('settings:update', settings),

  /** Load encrypted preferences from the main process (replaces localStorage for PII) */
  getPreferences: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('preferences:get'),

  /** Save encrypted preferences in the main process */
  setPreferences: (prefs: Record<string, unknown>): Promise<boolean> =>
    ipcRenderer.invoke('preferences:set', prefs),

  /** Current platform (win32, darwin, linux) */
  platform: process.platform,

  /* ── Classifier (Presidio) ─────────────────────────────────────── */

  /** Invoke a classifier action (analyze, health, list_entities, reload, test) */
  classifierInvoke: (
    action: string,
    params?: Record<string, unknown>,
  ): Promise<{ success: boolean; data: unknown; error?: string }> =>
    ipcRenderer.invoke('classifier:invoke', action, params ?? {}),

  /** Check if the classifier is available */
  checkClassifier: (): Promise<{ available: boolean; mode?: string; error?: string }> =>
    ipcRenderer.invoke('classifier:check'),

  /** Get classifier bridge status */
  getClassifierStatus: (): Promise<{ initialized: boolean }> =>
    ipcRenderer.invoke('classifier:get-status'),

  /* ── Local Job Runner (bulk labeling) ──────────────────────────── */

  /** Start a bulk labeling job — runs in background, progress via events */
  jobStart: (config: {
    target_label_id?: string;
    use_policies?: boolean;
    dry_run?: boolean;
    site_ids?: string[];
    policies?: Array<{
      policy_id: string;
      policy_name: string;
      target_label_id: string;
      priority: number;
      rules: Record<string, unknown>;
    }>;
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('job:start', config),

  /** Pause the running job */
  jobPause: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('job:pause'),

  /** Resume a paused job */
  jobResume: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('job:resume'),

  /** Cancel the running job */
  jobCancel: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('job:cancel'),

  /** Get results collected so far */
  jobGetResults: (): Promise<{ success: boolean; data: unknown[] }> =>
    ipcRenderer.invoke('job:get-results'),

  /** Listen for job progress updates */
  onJobProgress: (callback: (progress: {
    status: string;
    phase: string;
    total_files: number;
    processed_files: number;
    labelled_files: number;
    skipped_files: number;
    failed_files: number;
    current_file?: string;
    current_site?: string;
    error?: string;
  }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]) => callback(progress);
    ipcRenderer.on('job:progress', handler);
    return () => ipcRenderer.removeListener('job:progress', handler);
  },

  /** Listen for job completion */
  onJobCompleted: (callback: (results: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, results: unknown[]) => callback(results);
    ipcRenderer.on('job:completed', handler);
    return () => ipcRenderer.removeListener('job:completed', handler);
  },
});
