import '@testing-library/jest-dom/vitest';

// Helper to build a realistic sensitivity label matching M365 Graph API shape
export function mockLabelResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'guid-1234-5678',
    name: 'Confidential',
    displayName: 'Confidential',
    description: 'Business data that could cause damage if shared',
    color: '#FF0000',
    priority: 2,
    isActive: true,
    parent: null,
    tooltip: 'Apply to sensitive business documents',
    contentFormats: ['file', 'email'],
    hasProtection: false,
    ...overrides,
  };
}

// Mock the Electron IPC bridge exposed via preload
const mockInvoke = vi.fn().mockResolvedValue({
  success: true,
  data: [mockLabelResponse()],
});
const mockCheckPwsh = vi.fn().mockResolvedValue({
  available: true,
  path: 'pwsh',
  version: '7.4.0',
});
const mockGetStatus = vi.fn().mockResolvedValue({
  initialized: false,
  graphConnected: false,
  complianceConnected: false,
});
const mockOnDeviceCode = vi.fn().mockReturnValue(() => {});

// Only set up window mock in jsdom environment
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'stablelabel', {
    value: {
      invoke: mockInvoke,
      checkPwsh: mockCheckPwsh,
      getStatus: mockGetStatus,
      onDeviceCode: mockOnDeviceCode,
      openFileDialog: vi.fn().mockResolvedValue(null),
      saveFileDialog: vi.fn().mockResolvedValue(null),
      clearCredentials: vi.fn().mockResolvedValue(undefined),
      updateSettings: vi.fn().mockResolvedValue(undefined),
      getPreferences: vi.fn().mockResolvedValue({}),
      setPreferences: vi.fn().mockResolvedValue(true),
      classifierInvoke: vi.fn().mockResolvedValue({ success: true, data: null }),
      checkClassifier: vi.fn().mockResolvedValue({ available: false }),
      getClassifierStatus: vi.fn().mockResolvedValue({ initialized: false }),
      platform: 'win32',
    },
    writable: true,
  });
}

export { mockInvoke, mockCheckPwsh, mockGetStatus, mockOnDeviceCode };

// Helper to set up an error response for the next invoke call
export function mockInvokeError(error: string) {
  mockInvoke.mockResolvedValueOnce({ success: false, data: null, error });
}

// Helper to set up a realistic policy response matching Compliance Center shape
export function mockPolicyResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'policy-guid-0001',
    name: 'Auto-Label Confidential',
    displayName: 'Auto-Label Confidential',
    mode: 'Enable',
    priority: 0,
    createdBy: 'admin@contoso.com',
    createdDateTime: '2025-06-15T10:00:00Z',
    lastModifiedBy: 'admin@contoso.com',
    lastModifiedDateTime: '2025-06-15T10:00:00Z',
    status: 'Enabled',
    labelId: 'guid-1234-5678',
    labelDisplayName: 'Confidential',
    workload: 'Exchange, SharePoint, OneDrive',
    ...overrides,
  };
}
