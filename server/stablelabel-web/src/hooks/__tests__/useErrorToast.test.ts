import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useErrorToast } from '../useErrorToast';

describe('useErrorToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('starts with an empty toasts array', () => {
    const { result } = renderHook(() => useErrorToast());
    expect(result.current.toasts).toEqual([]);
  });

  it('adds a toast when showError is called', () => {
    const { result } = renderHook(() => useErrorToast());
    act(() => {
      result.current.showError('Test error');
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Test error');
  });

  it('auto-dismisses toasts after 5 seconds', () => {
    const { result } = renderHook(() => useErrorToast());
    act(() => {
      result.current.showError('Auto dismiss me');
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('manually dismisses a toast', () => {
    const { result } = renderHook(() => useErrorToast());
    act(() => {
      result.current.showError('Dismiss me');
    });
    const id = result.current.toasts[0].id;
    act(() => {
      result.current.dismiss(id);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('can accumulate multiple toasts', () => {
    const { result } = renderHook(() => useErrorToast());
    act(() => {
      result.current.showError('Error 1');
      result.current.showError('Error 2');
    });
    expect(result.current.toasts).toHaveLength(2);
  });
});
