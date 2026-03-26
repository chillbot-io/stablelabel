import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePagination } from '../../renderer/hooks/usePagination';

describe('usePagination', () => {
  const items = Array.from({ length: 120 }, (_, i) => `item-${i}`);

  it('returns first page of items by default', () => {
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.visible).toHaveLength(50);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(70);
    expect(result.current.total).toBe(120);
  });

  it('loads more items on loadMore', () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => { result.current.loadMore(); });
    expect(result.current.visible).toHaveLength(100);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remaining).toBe(20);
  });

  it('loads all items after multiple loadMore calls', () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => { result.current.loadMore(); });
    act(() => { result.current.loadMore(); });
    expect(result.current.visible).toHaveLength(120);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('resets on reset call', () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => { result.current.loadMore(); });
    expect(result.current.visible).toHaveLength(100);
    act(() => { result.current.reset(); });
    expect(result.current.visible).toHaveLength(50);
  });

  it('handles empty array', () => {
    const { result } = renderHook(() => usePagination([]));
    expect(result.current.visible).toHaveLength(0);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.total).toBe(0);
  });

  it('handles array smaller than page size', () => {
    const small = ['a', 'b', 'c'];
    const { result } = renderHook(() => usePagination(small));
    expect(result.current.visible).toHaveLength(3);
    expect(result.current.hasMore).toBe(false);
  });

  it('supports custom page size', () => {
    const { result } = renderHook(() => usePagination(items, 10));
    expect(result.current.visible).toHaveLength(10);
    act(() => { result.current.loadMore(); });
    expect(result.current.visible).toHaveLength(20);
  });
});
