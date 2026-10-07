import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite dev server proxies API, Socket.IO and API explorer (/docs) traffic to the
// obs-producer server, so the browser only ever talks to one origin (ADR-0004). Object entries, not the string
// shorthand: the shorthand sets `changeOrigin`, which rewrites `Host`, and the server's CSRF check compares
// `Origin` with `Host`.
const server = process.env.OBS_PRODUCER_DEV_SERVER ?? 'http://localhost:5580';

// Two pages: the admin app (index.html) and the lean OBS overlay (overlay.html, ADR-0006).
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// Serve the overlay at /overlay in development too, matching the production server: real files (and other
// tools' own paths, such as the overlay Storybook's config files) win, and only an unmatched /overlay request
// falls back to the overlay page. Returning a function from configureServer runs this after Vite's own
// middlewares, the same precedence as the production server's setNotFoundHandler (apps/server/src/app.ts).
const overlayRoute: Plugin = {
  name: 'obs-producer-overlay-route',
  configureServer(dev) {
    return () => {
      dev.middlewares.use((req, _res, next) => {
        if (req.url && /^\/overlay(\/|$|\?)/.test(req.url)) req.url = '/overlay.html';
        next();
      });
    };
  },
};

export default defineConfig({
  plugins: [react(), overlayRoute],
  server: {
    proxy: {
      '/api': { target: server },
      '/docs': { target: server },
      '/socket.io': { target: server, ws: true },
    },
  },
  build: {
    rolldownOptions: {
      input: { main: page('./index.html'), overlay: page('./overlay.html') },
    },
  },
});
