import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock values ────────────────────────────────────────────────────────
const mockHandle = vi.fn();
const mockWebContentsOn = vi.fn();
const mockSetWindowOpenHandler = vi.fn();
const mockOpenExternal = vi.fn();
const mockSetPermissionRequestHandler = vi.fn();
const mockShowOpenDialog = vi.fn();
const mockShowSaveDialog = vi.fn();
const mockLoadURL = vi.fn();
const mockCredentialsClear = vi.fn();

const mockPsBridge = {
  invokeStructured: vi.fn().mockResolvedValue({ success: true, data: null }),
  checkPwshAvailable: vi.fn().mockResolvedValue({ available: true }),
  isInitialized: vi.fn().mockReturnValue(false),
  dispose: vi.fn(),
  onDeviceCode: null as unknown,
};

const mockWebContents = {
  on: mockWebContentsOn,
  setWindowOpenHandler: mockSetWindowOpenHandler,
  send: vi.fn(),
  closeDevTools: vi.fn(),
};

const mockBrowserWindowInstance = {
  webContents: mockWebContents,
  on: vi.fn(),
  loadURL: mockLoadURL,
  loadFile: vi.fn(),
};

// Collect the .then callback from app.whenReady()
let readyCallback: (() => Promise<void>) | null = null;

vi.mock('electron', () => {
  // BrowserWindow needs to be a real constructor
  function BrowserWindow() {
    return mockBrowserWindowInstance;
  }
  BrowserWindow.getAllWindows = vi.fn().mockReturnValue([]);

  return {
    app: {
      whenReady: vi.fn(() => ({
        then: (cb: () => Promise<void>) => { readyCallback = cb; },
      })),
      on: vi.fn(),
      isPackaged: false,
      quit: vi.fn(),
    },
    BrowserWindow,
    ipcMain: { handle: mockHandle },
    dialog: {
      showOpenDialog: mockShowOpenDialog,
      showSaveDialog: mockShowSaveDialog,
    },
    session: {
      defaultSession: { setPermissionRequestHandler: mockSetPermissionRequestHandler },
    },
    shell: { openExternal: mockOpenExternal },
  };
});

// Mock PowerShellBridge as a class using a real class
vi.mock('../powershell-bridge', () => {
  return {
    PowerShellBridge: class MockPowerShellBridge {
      invokeStructured = mockPsBridge.invokeStructured;
      checkPwshAvailable = mockPsBridge.checkPwshAvailable;
      isInitialized = mockPsBridge.isInitialized;
      dispose = mockPsBridge.dispose;
      onDeviceCode = null as unknown;
    },
  };
});

vi.mock('../credential-store', () => ({
  CredentialStore: { clear: mockCredentialsClear },
}));

vi.mock('../cmdlet-registry', () => ({
  CMDLET_REGISTRY: {
    'Get-SLLabel': { params: {} },
    'Connect-SLGraph': { params: {} },
  } as Record<string, unknown>,
}));

vi.mock('../trusted-hosts', () => ({
  TRUSTED_EXTERNAL_HOSTS: ['microsoft.com', 'login.microsoftonline.com', 'learn.microsoft.com', 'aka.ms'],
}));

// Declare the globals that Vite injects at build time
vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173');
vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');

describe('main.ts IPC handlers', () => {
  let handlers: Record<string, (...args: unknown[]) => unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    handlers = {};
    readyCallback = null;

    mockHandle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler;
    });

    // Import the module — this registers the whenReady .then callback
    await import('../main');

    // Execute the whenReady callback to trigger IPC handler registration
    if (readyCallback) {
      await readyCallback();
    }
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('registers all expected IPC channels', () => {
    expect(handlers['ps:invoke']).toBeDefined();
    expect(handlers['ps:check-pwsh']).toBeDefined();
    expect(handlers['ps:get-status']).toBeDefined();
    expect(handlers['dialog:open-file']).toBeDefined();
    expect(handlers['dialog:save-file']).toBeDefined();
    expect(handlers['credentials:clear']).toBeDefined();
  });

  it('ps:invoke rejects unregistered cmdlets', async () => {
    const result = await handlers['ps:invoke']({}, 'Invoke-Evil', {});
    expect(result).toEqual({
      success: false,
      data: null,
      error: 'Cmdlet "Invoke-Evil" is not permitted',
    });
  });

  it('ps:invoke does not call bridge for unregistered cmdlets', async () => {
    await handlers['ps:invoke']({}, 'Invoke-Evil', {});
    expect(mockPsBridge.invokeStructured).not.toHaveBeenCalled();
  });

  it('ps:invoke allows registered cmdlets', async () => {
    const result = await handlers['ps:invoke']({}, 'Get-SLLabel', {});
    expect(result).toEqual({ success: true, data: null });
    expect(mockPsBridge.invokeStructured).toHaveBeenCalledWith('Get-SLLabel', {});
  });

  it('ps:check-pwsh delegates to bridge', async () => {
    const result = await handlers['ps:check-pwsh']({});
    expect(result).toEqual({ available: true });
    expect(mockPsBridge.checkPwshAvailable).toHaveBeenCalled();
  });

  it('ps:get-status returns initialized state and modulePath', async () => {
    const result = (await handlers['ps:get-status']({})) as Record<string, unknown>;
    expect(result).toHaveProperty('initialized', false);
    expect(result).toHaveProperty('modulePath');
  });

  it('dialog:open-file returns null when canceled', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const result = await handlers['dialog:open-file']({}, {});
    expect(result).toBeNull();
  });

  it('dialog:open-file returns file path when selected', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/test.csv'] });
    const result = await handlers['dialog:open-file']({}, {});
    expect(result).toBe('/tmp/test.csv');
  });

  it('dialog:save-file returns null when canceled', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true });
    const result = await handlers['dialog:save-file']({}, {});
    expect(result).toBeNull();
  });

  it('dialog:save-file returns file path when saved', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/output.json' });
    const result = await handlers['dialog:save-file']({}, {});
    expect(result).toBe('/tmp/output.json');
  });

  it('credentials:clear calls CredentialStore.clear', async () => {
    await handlers['credentials:clear']({});
    expect(mockCredentialsClear).toHaveBeenCalled();
  });

  it('sets permission handler to deny all', () => {
    expect(mockSetPermissionRequestHandler).toHaveBeenCalledTimes(1);
    const handler = mockSetPermissionRequestHandler.mock.calls[0][0];
    const callback = vi.fn();
    handler(null, 'camera', callback);
    expect(callback).toHaveBeenCalledWith(false);
  });
});

describe('main.ts window creation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    readyCallback = null;
    mockHandle.mockImplementation(() => {});

    await import('../main');
    if (readyCallback) await readyCallback();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('creates BrowserWindow with security options', () => {
    // BrowserWindow was called — verify via the mockBrowserWindowInstance setup
    // The webContents.on was called which proves the window was created
    expect(mockWebContentsOn).toHaveBeenCalled();
    expect(mockSetWindowOpenHandler).toHaveBeenCalled();
    // The window loaded a URL
    expect(mockLoadURL).toHaveBeenCalled();
  });

  it('sets up navigation guard on will-navigate', () => {
    const willNavCalls = mockWebContentsOn.mock.calls.filter(
      (c: unknown[]) => c[0] === 'will-navigate',
    );
    expect(willNavCalls.length).toBeGreaterThan(0);
    const handler = willNavCalls[0][1];
    const event = { preventDefault: vi.fn() };
    handler(event, 'https://evil.com');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('allows navigation to app origin', () => {
    const willNavCalls = mockWebContentsOn.mock.calls.filter(
      (c: unknown[]) => c[0] === 'will-navigate',
    );
    const handler = willNavCalls[0][1];
    const event = { preventDefault: vi.fn() };
    handler(event, 'http://localhost:5173/page');
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('sets up window open handler for trusted hosts', () => {
    expect(mockSetWindowOpenHandler.mock.calls.length).toBeGreaterThan(0);
    const handler = mockSetWindowOpenHandler.mock.calls[0][0];

    const result = handler({ url: 'https://learn.microsoft.com/docs' });
    expect(result).toEqual({ action: 'deny' });
    expect(mockOpenExternal).toHaveBeenCalledWith('https://learn.microsoft.com/docs');
  });

  it('blocks untrusted hosts from opening externally', () => {
    const handler = mockSetWindowOpenHandler.mock.calls[0][0];
    mockOpenExternal.mockClear();

    const result = handler({ url: 'https://evil.com/phish' });
    expect(result).toEqual({ action: 'deny' });
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('rejects malformed URLs without throwing', () => {
    const handler = mockSetWindowOpenHandler.mock.calls[0][0];
    mockOpenExternal.mockClear();

    const result = handler({ url: 'not-a-valid-url' });
    expect(result).toEqual({ action: 'deny' });
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('loads dev server URL in development', () => {
    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173');
  });
});
