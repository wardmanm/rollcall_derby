import type { Plugin, ProxyOptions } from 'vite';

/** Each rcl web app's Vite dev server port. rcl-core's is the front door: open it, not the others. */
export const DEV_PORTS = { core: 5173, producer: 5174 } as const;

// Dev-server proxy entries for every rcl web app (ADR-0019): the browser talks only to Vite, which passes API,
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

// The front door's proxy (rcl-core's Vite): the server's paths, plus the Producer app's own Vite below /producer,
// WebSockets included, so its hot reload works through the front door too.
export function frontDoorProxy(target?: string): Record<string, ProxyOptions> {
  return { ...serverProxy(target), '/producer': { target: `http://localhost:${DEV_PORTS.producer}`, ws: true } };
}

/** A Vite plugin that sends `/` to `home`, as the production server does. */
export function redirectRoot(home: string): Plugin {
  return {
    name: 'rollcall-redirect-root',
    configureServer(dev) {
      dev.middlewares.use((req, res, next) => {
        if (req.url !== '/') return next();
        res.writeHead(302, { Location: home }).end();
      });
    },
  };
}
