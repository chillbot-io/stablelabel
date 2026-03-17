import '@testing-library/jest-dom/vitest';

// Mock the Electron IPC bridge exposed via preload
const mockInvoke = vi.fn().mockResolvedValue({ success: true, data: null });
const mockCheckPwsh = vi.fn().mockResolvedValue({ available: true, path: 'pwsh' });
const mockGetStatus = vi.fn().mockResolvedValue({ initialized: false });
const mockOnDeviceCode = vi.fn().mockReturnValue(() => {});

// Only set up window mock in jsdom environment
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'stablelabel', {
    value: {
      invoke: mockInvoke,
      checkPwsh: mockCheckPwsh,
      getStatus: mockGetStatus,
      onDeviceCode: mockOnDeviceCode,
      platform: 'win32',
    },
    writable: true,
  });
}

export { mockInvoke, mockCheckPwsh, mockGetStatus, mockOnDeviceCode };
