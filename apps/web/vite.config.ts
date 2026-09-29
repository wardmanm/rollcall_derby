import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite dev server proxies API and Socket.IO traffic to the obs-producer server,
// so the browser only ever talks to one origin (ADR-0004).
const server = process.env.OBS_PRODUCER_DEV_SERVER ?? 'http://localhost:5580';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': server,
      '/socket.io': { target: server, ws: true },
    },
  },
});
