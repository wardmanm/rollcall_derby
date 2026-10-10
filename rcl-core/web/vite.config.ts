import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { DEV_PORTS, frontDoorProxy, redirectRoot } from '@rollcall/web-sdk/vite';
import { CORE_BASE } from './src/base.ts';

export default defineConfig({
  base: CORE_BASE,
  plugins: [react(), redirectRoot(CORE_BASE)],
  // The front door in development: Vite passes API, Socket.IO and API explorer traffic to the Rollcall server
  // (ADR-0019), and /producer to the Producer app's own Vite, so everything works through this one port.
  server: { port: DEV_PORTS.core, strictPort: true, proxy: frontDoorProxy() },
});
