import { useCallback, useEffect, useRef } from 'react';
import { LOAD_LIMIT_MS } from '../load-limit.ts';

/**
 * A callback that calls `onReady` the first time it runs and never again. If it hasn't run within LOAD_LIMIT_MS of
 * mounting, the picture counts as failed: `onLimit` runs (to show a fallback), then the callback, so a load that hangs
 * never holds the piece back.
 */
export function useReadyOnce(onReady?: () => void, onLimit?: () => void): () => void {
  const done = useRef(false);
  const latest = useRef({ onReady, onLimit });
  useEffect(() => {
    latest.current = { onReady, onLimit };
  });
  const ready = useCallback(() => {
    if (done.current) return;
    done.current = true;
    latest.current.onReady?.();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (done.current) return;
      latest.current.onLimit?.();
      ready();
    }, LOAD_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [ready]);
  return ready;
}
