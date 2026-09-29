import type { AddressInfo } from 'node:net';
import { buildApp } from './app.ts';
import type { ServerConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { attachRealtime } from './realtime.ts';

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

// Wires the database, HTTP API and Socket.IO onto one port.
export async function startServer(
  config: ServerConfig,
  { version, logger = true }: { version: string; logger?: boolean },
): Promise<RunningServer> {
  const { sqlite } = openDatabase(config.dataDir);
  const app = buildApp({ version, logger, webDir: config.webDir });
  const io = attachRealtime(app.server, { version });

  // Drop live sockets first, or closing the HTTP server waits on them forever.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true);
    io.engine.close();
  });
  app.addHook('onClose', async () => {
    sqlite.close();
  });

  await app.listen({ host: config.host, port: config.port });
  const { port } = app.server.address() as AddressInfo;
  const host = config.host === '0.0.0.0' ? 'localhost' : config.host;
  return { url: `http://${host}:${port}`, close: () => app.close() };
}
