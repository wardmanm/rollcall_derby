import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serverProxy } from '@rollcall/web-sdk/vite';

export default defineConfig({
  plugins: [react()],
  // In development Vite passes API, Socket.IO and API explorer traffic to the Rollcall server (ADR-0004).
  server: { proxy: serverProxy() },
});
