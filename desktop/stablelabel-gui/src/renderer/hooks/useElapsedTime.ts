import { useState, useEffect, useRef } from 'react';

const TICK_INTERVAL_MS = 1_000;

export function useElapsedTime(running: boolean): string {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }

    startRef.current = Date.now();
    setElapsed(0);

    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, TICK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [running]);

  if (!running || elapsed === 0) return '';
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}
