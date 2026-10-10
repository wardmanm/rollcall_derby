import type { Server } from 'socket.io';
import { buildApp } from './app.ts';
import { dummyHash } from './auth/passwords.ts';
import { purgeExpiredSessions } from './auth/sessions.ts';
import type { ServerConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { attachRealtime } from './realtime.ts';
import { INSTALLED_APPS } from './installed-apps.ts';

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

// Wires the database, HTTP API and Socket.IO onto one port.
export async function startServer(
  config: ServerConfig,
  { version, logger = true }: { version: string; logger?: boolean },
): Promise<RunningServer> {
  const { db, sqlite } = openDatabase(config.dataDir);
  const app = buildApp({
    version,
    logger,
    db,
    coreWebDir: config.webDir,
    apps: INSTALLED_APPS,
    apiDocs: config.apiDocs,
  });

  // Expired sessions are already ignored; this just keeps the table small.
  purgeExpiredSessions(db);
  const purgeTimer = setInterval(
    () => {
      try {
        purgeExpiredSessions(db);
      } catch (error) {
        app.log.error({ err: error }, 'Expired-session purge failed');
      }
    },
    60 * 60 * 1000,
  );
  purgeTimer.unref();

  // Drop live connections first, or closing the HTTP server waits on them forever. Close the
  // transports rather than calling disconnectSockets(): clients treat a server "disconnect" as a
  // deliberate kick and never reconnect, which would leave OBS overlays stale after a restart.
  let io: Server | undefined;
  app.addHook('preClose', async () => {
    io?.engine.close();
  });
  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    sqlite.close();
  });

  try {
    io = attachRealtime(app.server, { db, log: app.log, hosted: app.hostedApps });
    // Hash the stand-in password now, so the first failed login takes as long as later ones.
    await dummyHash();
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    // The port is taken, or a route's or namespace's access declaration is wrong: release the database, timer and
    // sockets.
    await app.close();
    throw error;
  }
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error(`Unexpected server address: ${String(address)}`);
  const { port } = address;
  const host = config.host === '0.0.0.0' ? 'localhost' : config.host;
  return { url: `http://${host}:${port}`, close: () => app.close() };
}
