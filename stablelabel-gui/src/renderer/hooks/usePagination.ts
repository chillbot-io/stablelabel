import { useState, useMemo } from 'react';

const DEFAULT_PAGE_SIZE = 50;

export function usePagination<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [limit, setLimit] = useState(pageSize);

  const visible = useMemo(() => items.slice(0, limit), [items, limit]);
  const hasMore = items.length > limit;
  const remaining = Math.max(0, items.length - limit);

  const loadMore = () => setLimit((prev) => prev + pageSize);
  const reset = () => setLimit(pageSize);

  return { visible, hasMore, remaining, loadMore, reset, total: items.length };
}
