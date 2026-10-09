import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { serverProxy } from '@rollcall/web-sdk/vite';

// Two pages: the admin app (index.html) and the lean OBS overlay (overlay.html, ADR-0006).
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// Serve the overlay at /overlay in development too, matching the production server: real files (and other
// tools' own paths, such as the overlay Storybook's config files) win, and only an unmatched /overlay request
// falls back to the overlay page. Returning a function from configureServer runs this after Vite's own
// middlewares, the same precedence as the production server's setNotFoundHandler (rcl-core/server/src/app.ts).
const overlayRoute: Plugin = {
  name: 'rollcall-overlay-route',
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
  // In development Vite passes API, Socket.IO and API explorer traffic to the Rollcall server (ADR-0004).
  server: { proxy: serverProxy() },
  build: {
    rolldownOptions: {
      input: { main: page('./index.html'), overlay: page('./overlay.html') },
    },
  },
});
