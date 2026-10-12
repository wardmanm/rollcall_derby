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
 * Where to go after signing in: `next` if it's a path on this server, otherwise rcl-core's home. A full URL, `//host`
 * or `/\host` (which browsers read as `//host`) would send a person to another site straight after they sign in.
 */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !/^\/[/\\]/.test(next) ? next : CORE_PAGES.home;
}
