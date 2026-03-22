/** Stacked error toasts — appears bottom-right. */

import { X } from 'lucide-react';
import type { Toast } from '@/hooks/useErrorToast';

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export default function ErrorToast({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-red-900/90 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-200 flex items-start gap-2 shadow-lg animate-in"
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="text-red-400 hover:text-red-200 shrink-0">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
