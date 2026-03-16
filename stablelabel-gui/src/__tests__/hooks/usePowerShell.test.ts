import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePowerShell, useAsyncOperation } from '../../renderer/hooks/usePowerShell';
import { mockInvoke } from '../setup';

describe('usePowerShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an invoke function', () => {
    const { result } = renderHook(() => usePowerShell());
    expect(typeof result.current.invoke).toBe('function');
  });

  it('invoke calls window.stablelabel.invoke', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, data: ['label1', 'label2'] });

    const { result } = renderHook(() => usePowerShell());

    let response: unknown;
    await act(async () => {
      response = await result.current.invoke('Get-SLLabel');
    });

    expect(mockInvoke).toHaveBeenCalledWith('Get-SLLabel');
    expect((response as { success: boolean }).success).toBe(true);
  });

  it('invoke passes through errors', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Not connected' });

    const { result } = renderHook(() => usePowerShell());

    let response: unknown;
    await act(async () => {
      response = await result.current.invoke('Get-SLLabel');
    });

    expect((response as { success: boolean; error: string }).success).toBe(false);
    expect((response as { error: string }).error).toBe('Not connected');
  });
});

describe('useAsyncOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with idle state', () => {
    const { result } = renderHook(() => useAsyncOperation());
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets loading during execution', async () => {
    let resolvePromise: (v: unknown) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) => { resolvePromise = resolve; })
    );

    const { result } = renderHook(() => useAsyncOperation<string[]>());

    let executePromise: Promise<unknown>;
    act(() => {
      executePromise = result.current.execute('Get-SLLabel');
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvePromise!({ success: true, data: ['a', 'b'] });
      await executePromise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(['a', 'b']);
  });

  it('sets error on failure', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, data: null, error: 'Connection failed' });

    const { result } = renderHook(() => useAsyncOperation());

    await act(async () => {
      await result.current.execute('Get-SLLabel');
    });

    expect(result.current.error).toBe('Connection failed');
    expect(result.current.data).toBeNull();
  });

  it('handles thrown exceptions', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAsyncOperation());

    await act(async () => {
      await result.current.execute('Get-SLLabel');
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBeNull();
  });
});
