import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElapsedTime } from '../../renderer/hooks/useElapsedTime';

describe('useElapsedTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string when not running', () => {
    const { result } = renderHook(() => useElapsedTime(false));
    expect(result.current).toBe('');
  });

  it('returns empty string initially when running', () => {
    const { result } = renderHook(() => useElapsedTime(true));
    expect(result.current).toBe('');
  });

  it('shows seconds after time passes', () => {
    const { result } = renderHook(() => useElapsedTime(true));

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe('5s');
  });

  it('shows minutes and seconds', () => {
    const { result } = renderHook(() => useElapsedTime(true));

    act(() => { vi.advanceTimersByTime(65000); });
    expect(result.current).toBe('1m 5s');
  });

  it('resets when running changes to false', () => {
    const { result, rerender } = renderHook(
      ({ running }) => useElapsedTime(running),
      { initialProps: { running: true } }
    );

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe('5s');

    rerender({ running: false });
    expect(result.current).toBe('');
  });
});
