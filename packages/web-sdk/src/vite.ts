import type { ProxyOptions } from 'vite';

// Dev-server proxy entries for every rcl web app (ADR-0004): the browser talks only to Vite, which passes API,
// API explorer (/docs) and Socket.IO traffic to the Rollcall server. Object entries, never the string shorthand:
// the shorthand turns on `changeOrigin`, which rewrites `Host`, and the server's CSRF and socket checks compare
// `Origin` with `Host` (ADR-0018).
export function serverProxy(
  target = process.env.ROLLCALL_DEV_SERVER ?? 'http://localhost:5580',
): Record<string, ProxyOptions> {
  return {
    '/api': { target },
    '/docs': { target },
    '/socket.io': { target, ws: true },
  };
}
