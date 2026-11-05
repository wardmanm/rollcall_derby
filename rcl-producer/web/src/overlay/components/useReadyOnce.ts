import { useCallback, useEffect, useRef } from 'react';

/** A callback that calls `onReady` the first time it runs and never again. */
export function useReadyOnce(onReady: (() => void) | undefined): () => void {
  const done = useRef(false);
  const latest = useRef(onReady);
  useEffect(() => {
    latest.current = onReady;
  });
  return useCallback(() => {
    if (done.current) return;
    done.current = true;
    latest.current?.();
  }, []);
}
