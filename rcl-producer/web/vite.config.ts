import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { DEV_PORTS, serverProxy } from '@rollcall/web-sdk/vite';
import { PRODUCER_BASE } from './src/base.ts';

// Two pages: the Producer app (index.html) and the lean OBS overlay (overlay.html, ADR-0006).
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// Serve the overlay at /producer/overlay in development too, matching the production server: real files (and
// other tools' own paths, such as the overlay Storybook's config files) win, and only an unmatched
// /producer/overlay request falls back to the overlay page. Returning a function from configureServer runs this
// after Vite's own middlewares, the same precedence as the production server's not-found handler
// (rcl-core/server/src/web-apps.ts).
const overlayRoute: Plugin = {
  name: 'rollcall-overlay-route',
  configureServer(dev) {
    return () => {
      dev.middlewares.use((req, _res, next) => {
        if (req.url && /^\/producer\/overlay(\/|$|\?)/.test(req.url)) req.url = '/producer/overlay.html';
        next();
      });
    };
  },
};

export default defineConfig({
  base: PRODUCER_BASE,
  plugins: [react(), overlayRoute],
  // Reached through rcl-core's Vite (the front door) at /producer/, or directly on its own port. Either way it passes
  // API, Socket.IO and API explorer traffic to the Rollcall server (ADR-0004).
  server: { port: DEV_PORTS.producer, strictPort: true, proxy: serverProxy() },
  build: {
    rolldownOptions: {
      input: { main: page('./index.html'), overlay: page('./overlay.html') },
    },
  },
});
