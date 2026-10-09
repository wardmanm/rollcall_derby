import { buildApp } from './app.ts';
import { createPermissions } from './auth/access.ts';
import { dummyHash } from './auth/passwords.ts';
import { CORE_PERMISSIONS } from './auth/permissions.ts';
import { purgeExpiredSessions } from './auth/sessions.ts';
import type { ServerConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { attachRealtime } from './realtime.ts';
import { installedWebApps } from './web-apps.ts';

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
  const permissions = createPermissions(CORE_PERMISSIONS);
  const webApps = installedWebApps(config.webDir);
  const app = buildApp({ version, logger, webApps, db, apiDocs: config.apiDocs, permissions });
  const io = attachRealtime(app.server, { version, db, log: app.log, permissions });

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
  app.addHook('preClose', async () => {
    io.engine.close();
  });
  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    sqlite.close();
  });

  try {
    // Hash the stand-in password now, so the first failed login takes as long as later ones.
    await dummyHash();
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    // The port is taken, or a route's access declaration is wrong: release the database, timer and sockets.
    await app.close();
    throw error;
  }
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error(`Unexpected server address: ${String(address)}`);
  const { port } = address;
  const host = config.host === '0.0.0.0' ? 'localhost' : config.host;
  return { url: `http://${host}:${port}`, close: () => app.close() };
}
