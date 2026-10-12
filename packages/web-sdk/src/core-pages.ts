// rcl-core's pages that every rcl app sends people to (split spec). rcl-core's web app serves them below /core/.
export const CORE_PAGES = {
  home: '/core/',
  setup: '/core/setup',
  signIn: '/core/login',
  changePassword: '/core/change-password',
} as const;

/** `page`, with where to come back to afterwards. */
export const withNext = (page: string, next: string) => `${page}?${new URLSearchParams({ next })}`;

/**
 * Where to go after signing in: `next` if it's a path on this server, otherwise rcl-core's home. It's read with the
 * browser's own address rules, so nothing that leads to another site gets through: not a full URL, `//host`, `/\host`,
 * nor `/<tab>/host` (browsers drop tabs and line breaks before reading an address).
 */
export function safeNext(next: string | null): string {
  if (!next?.startsWith('/')) return CORE_PAGES.home;
  const url = new URL(next, window.location.origin);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : CORE_PAGES.home;
}
