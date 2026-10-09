import type { Server as HttpServer } from 'node:http';
import { parseCookie } from 'cookie';
import type { FastifyBaseLogger } from 'fastify';
import { Server, type Namespace } from 'socket.io';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/core-contract';
import type { AppDatabase } from './db.ts';
import { accessProblem, deny, type Access, type Permissions } from './auth/access.ts';
import { isSameOrigin, resolvePrincipal } from './auth/guard.ts';
import { CORE_APP_ID } from './auth/permissions.ts';

export interface Realtime {
  /** Creates a namespace that checks each connecting client against `access` (ADR-0018). */
  namespace(name: `/${string}`, options: { access: Access }): Namespace;
}

export interface RealtimeOptions {
  version: string;
  db: AppDatabase;
  log: FastifyBaseLogger;
  permissions: Permissions;
  /** Adds namespaces after the built-in ones (for tests). */
  registerNamespaces?: (realtime: Realtime) => void;
  /** Called for each namespace as it's created; the namespace inventory test uses it. */
  onNamespace?: (name: string, access: Access) => void;
}

// Socket.IO shares the HTTP server's port (ADR-0004). Every namespace declares who may join, like every /api route
// (ADR-0018). The bare `/` namespace serves nothing and refuses everyone.
export function attachRealtime(
  httpServer: HttpServer,
  { version, db, log, permissions, registerNamespaces, onNamespace }: RealtimeOptions,
): Server {
  const io = new Server(httpServer, { serveClient: false });
  io.use((_socket, next) => next(new Error('not_found')));

  // A namespace made with io.of() directly would let anyone in, so it stops the server instead.
  const names = new Set<string>(['/']);
  let creating: string | undefined;
  io.on('new_namespace', (nsp) => {
    if (nsp.name !== creating) throw new Error(`Socket.IO namespace ${nsp.name} has no access; use namespace()`);
  });

  const realtime: Realtime = {
    namespace(name, { access }) {
      if (names.has(name)) throw new Error(`Socket.IO namespace ${name} already exists`);
      const problem = accessProblem(access, { appId: CORE_APP_ID, permissions });
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
            const denial = deny(access, principal, permissions);
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
  };

  const hello = ServerHelloSchema.parse({ name: APP_NAME, version });
  realtime
    .namespace('/overlay', {
      access: { public: "OBS browser sources can't sign in; output token URLs replace this in Live Mode" },
    })
    .on('connection', (socket) => {
      socket.emit(SERVER_HELLO_EVENT, hello);
    });
  registerNamespaces?.(realtime);
  return io;
}
