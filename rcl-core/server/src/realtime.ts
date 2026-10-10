import type { Server as HttpServer } from 'node:http';
import { parseCookie } from 'cookie';
import type { FastifyBaseLogger } from 'fastify';
import { Server } from 'socket.io';
import type { Access, AppModule, Realtime } from '@rollcall/app-sdk';
import type { HostedApps } from './apps.ts';
import type { AppDatabase } from './db.ts';
import { accessProblem, deny } from './auth/access.ts';
import { isSameOrigin, resolvePrincipal } from './auth/guard.ts';

export interface RealtimeOptions {
  db: AppDatabase;
  log: FastifyBaseLogger;
  hosted: HostedApps;
  /** Called for each namespace as it's created; the namespace inventory test uses it. */
  onNamespace?: (name: string, access: Access) => void;
}

// Socket.IO shares the HTTP server's port (ADR-0019). Each hosted app adds its own namespaces, at or below /<id>, and
// every namespace declares who may join, like every /api route (ADR-0018). The bare `/` namespace serves nothing and
// refuses everyone.
export function attachRealtime(httpServer: HttpServer, { db, log, hosted, onNamespace }: RealtimeOptions): Server {
  const io = new Server(httpServer, { serveClient: false });
  io.use((_socket, next) => next(new Error('not_found')));

  // A namespace made with io.of() directly would let anyone in, so it stops the server instead. Socket.IO has already
  // stored the namespace when this throws, so never catch the error and carry on: the server must not start.
  const names = new Set<string>(['/']);
  let creating: string | undefined;
  io.on('new_namespace', (nsp) => {
    if (nsp.name !== creating) throw new Error(`Socket.IO namespace ${nsp.name} has no access; use namespace()`);
  });

  const realtimeFor = (module: AppModule): Realtime => ({
    namespace(name, { access }) {
      if (name !== `/${module.id}` && !name.startsWith(`/${module.id}/`)) {
        throw new Error(`Socket.IO namespace ${name} isn't at or below /${module.id}, so ${module.id} can't create it`);
      }
      if (names.has(name)) throw new Error(`Socket.IO namespace ${name} already exists`);
      const problem = accessProblem(access, { appId: module.id, permissions: hosted.permissions });
      if (problem) throw new Error(`Socket.IO namespace ${name} ${problem}`);
      names.add(name);
      creating = name;
      const nsp = io.of(name);
      creating = undefined;
      if (!('public' in access)) {
        nsp.use((socket, next) => {
          // Socket.IO awaits this middleware without ever handling a rejection, so a throw here (a closed database
          // handle, a full disk during findSession's last-seen write, any I/O error) would otherwise be an unhandled
          // rejection that crashes the whole process, taking every overlay down mid-game.
          try {
            const { headers } = socket.handshake;
            if (!isSameOrigin(headers.origin, headers.host)) return next(new Error('cross_origin'));
            const principal = resolvePrincipal(db, headers.cookie ? parseCookie(headers.cookie) : {});
            const denial = deny(access, principal, hosted.permissions);
            return next(denial ? new Error(denial.error) : undefined);
          } catch (error) {
            log.error({ err: error }, 'Socket access check failed');
            return next(new Error('internal_error'));
          }
        });
      }
      onNamespace?.(name, access);
      return nsp;
    },
  });

  for (const module of hosted.modules) module.realtime?.(realtimeFor(module), hosted.contextFor(module));
  return io;
}
