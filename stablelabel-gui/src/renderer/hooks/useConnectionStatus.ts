import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import type { ConnectionStatus } from '../lib/types';

const POLL_INTERVAL_MS = 30_000;

// Shared singleton: all callers share one polling interval
let sharedStatus: ConnectionStatus | null = null;
let sharedLoading = true;
let listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

function notify() {
  listeners.forEach((l) => l());
}

async function fetchStatus() {
  try {
    const result = await window.stablelabel.invoke('Get-SLConnectionStatus');
    if (result.success && result.data) {
      sharedStatus = result.data as ConnectionStatus;
    }
  } catch (err) {
    console.error('Failed to fetch connection status:', err);
  } finally {
    sharedLoading = false;
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscriberCount++;
  if (subscriberCount === 1) {
    fetchStatus();
    pollTimer = setInterval(fetchStatus, POLL_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    subscriberCount--;
    if (subscriberCount === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

function getSnapshot() {
  return { status: sharedStatus, loading: sharedLoading };
}

let cachedSnapshot = getSnapshot();
function getStableSnapshot() {
  const next = getSnapshot();
  if (next.status !== cachedSnapshot.status || next.loading !== cachedSnapshot.loading) {
    cachedSnapshot = next;
  }
  return cachedSnapshot;
}

/** Reset singleton state for testing. */
export function _resetForTesting() {
  sharedStatus = null;
  sharedLoading = true;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  subscriberCount = 0;
  listeners = new Set();
  cachedSnapshot = getSnapshot();
}

/**
 * Shared connection status hook. Multiple callers share one polling interval.
 */
export function useConnectionStatus() {
  const snap = useSyncExternalStore(subscribe, getStableSnapshot);

  const refresh = useCallback(async () => {
    await fetchStatus();
  }, []);

  return { status: snap.status, loading: snap.loading, refresh };
}
