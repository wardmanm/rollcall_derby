import type { Server as HttpServer } from 'node:http';
import { parseCookie } from 'cookie';
import type { FastifyBaseLogger } from 'fastify';
import { Server } from 'socket.io';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@obs-producer/shared';
import type { AppDatabase } from './db.ts';
import { isSameOrigin, SESSION_COOKIE } from './auth/guard.ts';
import { findSession } from './auth/sessions.ts';

// Socket.IO shares the HTTP server's port (ADR-0004). It has two namespaces (ADR-0008):
// - `/` is for signed-in clients (dashboards, from Live Mode on). The session is checked when a client connects.
// - `/overlay` is public, because OBS browser sources can't log in. Output token URLs replace it in Live Mode.
export function attachRealtime(
  httpServer: HttpServer,
  { version, db, log }: { version: string; db: AppDatabase; log: FastifyBaseLogger },
): Server {
  const io = new Server(httpServer, { serveClient: false });

  io.use((socket, next) => {
    // Socket.IO awaits this middleware without ever handling a rejection, so a throw here (a closed
    // database handle, a full disk during findSession's last-seen write, any I/O error) would otherwise
    // be an unhandled rejection that crashes the whole process, taking every overlay down mid-game.
    try {
      const { headers } = socket.handshake;
      if (!isSameOrigin(headers.origin, headers.host)) return next(new Error('cross_origin'));
      const token = headers.cookie ? parseCookie(headers.cookie)[SESSION_COOKIE] : undefined;
      const user = token ? findSession(db, token)?.user : undefined;
      if (!user) return next(new Error('unauthenticated'));
      if (user.mustChangePassword) return next(new Error('password_change_required'));
      return next();
    } catch (error) {
      log.error({ err: error }, 'Socket session check failed');
      return next(new Error('internal_error'));
    }
  });

  const hello = ServerHelloSchema.parse({ name: APP_NAME, version });
  io.of('/overlay').on('connection', (socket) => {
    socket.emit(SERVER_HELLO_EVENT, hello);
  });
  return io;
}
