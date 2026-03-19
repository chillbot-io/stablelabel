import { useState, useCallback, useRef, useEffect } from 'react';
import type { PsResult } from '../lib/types';

export interface DeviceCodeInfo {
  userCode: string;
  verificationUrl: string;
  message: string;
}

declare global {
  interface Window {
    stablelabel: {
      invoke: (cmdlet: string, params?: Record<string, unknown>) => Promise<PsResult>;
      checkPwsh: () => Promise<{ available: boolean; path?: string; error?: string }>;
      getStatus: () => Promise<{ initialized: boolean; modulePath?: string }>;
      onDeviceCode: (callback: (info: DeviceCodeInfo) => void) => () => void;
      openFileDialog: (options?: {
        title?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<string | null>;
      saveFileDialog: (options?: {
        title?: string;
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<string | null>;
      clearCredentials: () => Promise<void>;
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
  const invoke = useCallback(async <T = unknown>(
    cmdlet: string,
    params?: Record<string, unknown>,
  ): Promise<PsResult<T>> => {
    const result = await window.stablelabel.invoke(cmdlet, params);
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
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async (cmdlet: string, params?: Record<string, unknown>) => {
    setState({ data: null, loading: true, error: null });
    try {
      const result = await window.stablelabel.invoke(cmdlet, params);
      if (!mountedRef.current) return null;
      if (result.success) {
        setState({ data: result.data as T, loading: false, error: null });
        return result.data as T;
      } else {
        setState({ data: null, loading: false, error: result.error || 'Unknown error' });
        return null;
      }
    } catch (err) {
      if (!mountedRef.current) return null;
      const message = err instanceof Error ? err.message : String(err);
      setState({ data: null, loading: false, error: message });
      return null;
    }
  }, []);

  return { ...state, execute };
}
