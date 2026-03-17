import { useState, useCallback } from 'react';
import type { PsResult } from '../lib/types';

export interface DeviceCodeInfo {
  userCode: string;
  verificationUrl: string;
  message: string;
}

declare global {
  interface Window {
    stablelabel: {
      invoke: (command: string) => Promise<PsResult>;
      checkPwsh: () => Promise<{ available: boolean; path?: string; error?: string }>;
      getStatus: () => Promise<{ initialized: boolean; modulePath?: string }>;
      onDeviceCode: (callback: (info: DeviceCodeInfo) => void) => () => void;
      platform: string;
    };
  }
}

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to call StableLabel PowerShell functions via IPC.
 * Returns a typed invoke function with loading/error state.
 */
export function usePowerShell() {
  const invoke = useCallback(async <T = unknown>(command: string): Promise<PsResult<T>> => {
    const result = await window.stablelabel.invoke(command);
    return result as PsResult<T>;
  }, []);

  return { invoke };
}

/**
 * Hook for async PS operations with loading/error state management.
 */
export function useAsyncOperation<T = unknown>() {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (command: string) => {
    setState({ data: null, loading: true, error: null });
    try {
      const result = await window.stablelabel.invoke(command);
      if (result.success) {
        setState({ data: result.data as T, loading: false, error: null });
        return result.data as T;
      } else {
        setState({ data: null, loading: false, error: result.error || 'Unknown error' });
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ data: null, loading: false, error: message });
      return null;
    }
  }, []);

  return { ...state, execute };
}
