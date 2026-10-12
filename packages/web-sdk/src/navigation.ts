import { useCallback } from 'react';
import { useHref, useNavigate } from 'react-router';

// Leaving this app's router: a full page load, replacing the current history entry. Tests replace it with a spy,
// since jsdom can't load pages.
export const browser = {
  replace(url: string): void {
    window.location.replace(url);
  },
};

/**
 * Goes to a page of any rcl app, replacing the current history entry: through this app's router when the page is
 * below this app's base (`/core/…` in rcl-core), otherwise with a full page load.
 */
export function useGoTo(): (url: string) => void {
  const navigate = useNavigate();
  const base = useHref('/');
  return useCallback(
    (url: string) => {
      const prefix = base.endsWith('/') ? base : `${base}/`;
      if (url === base || url.startsWith(prefix)) void navigate(url.slice(prefix.length - 1), { replace: true });
      else browser.replace(url);
    },
    [navigate, base],
  );
}
