/** Global error toast state — lightweight, no external deps. */

import { useCallback, useState } from 'react';

export interface Toast {
  id: number;
  message: string;
}

let _nextId = 0;

export function useErrorToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showError = useCallback((message: string) => {
    const id = _nextId++;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showError, dismiss };
}
