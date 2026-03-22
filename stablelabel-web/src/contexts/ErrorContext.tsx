/** Error context — provides showError() globally to all pages. */

import { createContext, useContext } from 'react';
import { useErrorToast } from '@/hooks/useErrorToast';
import ErrorToast from '@/components/ErrorToast';

interface ErrorContextValue {
  showError: (message: string) => void;
}

const ErrorContext = createContext<ErrorContextValue>({
  showError: () => {},
});

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const { toasts, showError, dismiss } = useErrorToast();

  return (
    <ErrorContext.Provider value={{ showError }}>
      {children}
      <ErrorToast toasts={toasts} onDismiss={dismiss} />
    </ErrorContext.Provider>
  );
}

export function useError() {
  return useContext(ErrorContext);
}
