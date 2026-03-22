import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConnectionStatus, _resetForTesting } from '../../renderer/hooks/useConnectionStatus';
import { mockInvoke } from '../setup';

describe('useConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
  });

  const mockStatus = {
    GraphConnected: true,
    ComplianceConnected: false,
    ProtectionConnected: false,
    UserPrincipalName: 'admin@contoso.com',
    TenantId: 'tenant-abc-123',
  };

  it('fetches status on mount', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockStatus });

    const { result } = renderHook(() => useConnectionStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockInvoke).toHaveBeenCalledWith('Get-SLConnectionStatus');
    expect(result.current.status).toEqual(mockStatus);
  });

  it('exposes a refresh function', async () => {
    mockInvoke.mockResolvedValue({ success: true, data: mockStatus });

    const { result } = renderHook(() => useConnectionStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue({ success: true, data: { ...mockStatus, ComplianceConnected: true } });

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('Get-SLConnectionStatus');
    });
  });

  it('handles failed status gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('no connection'));

    const { result } = renderHook(() => useConnectionStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.status).toBeNull();
  });

  it('starts with loading true', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.loading).toBe(true);
  });
});
