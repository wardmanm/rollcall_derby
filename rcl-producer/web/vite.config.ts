import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { DEV_PORTS, serverProxy } from '@rollcall/web-sdk/vite';
import { PRODUCER_BASE } from './src/base.ts';

// Two pages: the Producer app (index.html) and the lean OBS overlay (overlay.html, ADR-0006).
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// Serve the overlay at /producer/overlay and everything below it in development too, as the production server
// does (rcl-core/server/src/web-apps.ts). This runs before Vite's own middlewares: after them, the URL has already
// been rewritten to index.html. No real file lives below /producer/overlay, so nothing else is shadowed.
const OVERLAY_PATH = /^\/producer\/overlay(?:\/[^?]*)?(\?.*)?$/;
const overlayRoute: Plugin = {
  name: 'rollcall-overlay-route',
  configureServer(dev) {
    dev.middlewares.use((req, _res, next) => {
      const match = req.url ? OVERLAY_PATH.exec(req.url) : null;
      if (match) req.url = `/producer/overlay.html${match[1] ?? ''}`;
      next();
    });
  },
};

export default defineConfig({
  base: PRODUCER_BASE,
  plugins: [react(), overlayRoute],
  // Reached through rcl-core's Vite (the front door) at /producer/, or directly on its own port. Either way it passes
  // API, Socket.IO and API explorer traffic to the Rollcall server (ADR-0019).
  server: { port: DEV_PORTS.producer, strictPort: true, proxy: serverProxy() },
  build: {
    rolldownOptions: {
      input: { main: page('./index.html'), overlay: page('./overlay.html') },
    },
  },
});
