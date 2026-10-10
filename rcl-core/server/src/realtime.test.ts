import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { FastifyBaseLogger } from 'fastify';
import type { Server as SocketIoServer } from 'socket.io';
import type { Access, AppModule } from '@rollcall/app-sdk';
import type { Role } from '@rollcall/core-contract';
import { hostApps } from './apps.ts';
import { coreApp } from './core-app.ts';
import { attachRealtime } from './realtime.ts';
import { openMemoryDatabase } from './db.ts';
import { createSession } from './auth/sessions.ts';
import { SESSION_COOKIE } from './auth/guard.ts';
import { INSTALLED_APPS } from './installed-apps.ts';
import { addUser, CORE_VERSION } from './testing.ts';

let httpServer: HttpServer | undefined;
let io: SocketIoServer | undefined;
let clients: Socket[] = [];

afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await io?.close();
  if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
  io = httpServer = undefined;
});

const testLog = (): FastifyBaseLogger =>
  ({
    error: vi.fn<(obj: { err: unknown }, msg: string) => void>(),
    child: vi.fn<() => FastifyBaseLogger>(() => testLog()),
  }) as unknown as FastifyBaseLogger;

// An app that only tests host: one namespace of each kind, so every kind of declaration has one to sweep.
const PROBE_APP: AppModule = {
  id: 'probe',
  title: 'Probe',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [{ key: 'probe:watch', summary: 'Watch', roles: [] }],
  realtime(rt) {
    rt.namespace('/probe/open', { access: { public: 'test probe' } }).on('connection', (socket) => {
      socket.emit('probe:hello', 'hi');
    });
    rt.namespace('/probe/signed-in', { access: { signedIn: true } });
    rt.namespace('/probe/watch', { access: { permission: 'probe:watch' } });
  },
};

// An app that only creates namespaces, with `realtime` doing whatever the test needs.
const appWith = (realtime: AppModule['realtime']): AppModule => ({ ...PROBE_APP, realtime });

// Hosts the installed apps and `apps` on a real port, and records every namespace as it's created.
function attach(apps: readonly AppModule[] = [...INSTALLED_APPS, PROBE_APP]) {
  const database = openMemoryDatabase();
  const log = testLog();
  const namespaces: { name: string; access: Access }[] = [];
  const hosted = hostApps({
    core: coreApp({ version: CORE_VERSION, db: database.db }),
    apps,
    coreVersion: CORE_VERSION,
    db: database.db,
    log,
  });
  httpServer = createServer();
  io = attachRealtime(httpServer, {
    db: database.db,
    log,
    hosted,
    onNamespace: (name, access) => namespaces.push({ name, access }),
  });
  return { ...database, log, hosted, namespaces };
}

async function startRealtime(apps?: readonly AppModule[]) {
  const rt = attach(apps);
  await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
  const url = `http://127.0.0.1:${(httpServer!.address() as AddressInfo).port}`;
  let users = 0;
  const cookieFor = async (role: Role, { mustChangePassword = false } = {}) => {
    const user = await addUser(rt.db, `user${(users += 1)}`, 'correct horse', role, { mustChangePassword });
    return `${SESSION_COOKIE}=${createSession(rt.db, user.id).token}`;
  };
  const open = (name: string, headers: Record<string, string> = {}) => {
    const client = connect(`${url}${name}`, { transports: ['websocket'], reconnection: false, extraHeaders: headers });
    clients.push(client);
    return outcome(client);
  };
  return { ...rt, url, cookieFor, open };
}

// 'connected', or the reason the server refused the connection.
function outcome(socket: Socket): Promise<string> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once('connect_error', (error) => resolve(error.message));
  });
}

// The namespaces that don't refuse the client with `error`. Each connection gets fresh headers.
async function notRefused(
  rt: Awaited<ReturnType<typeof startRealtime>>,
  names: readonly string[],
  headers: () => Promise<Record<string, string>>,
  error: string,
) {
  const found: string[] = [];
  for (const name of names) {
    const result = await rt.open(name, await headers());
    if (result !== error) found.push(`${name} → ${result}`);
  }
  return found;
}

describe('namespace inventory', () => {
  it('pins the public namespaces of the installed apps', () => {
    const rt = attach(INSTALLED_APPS);
    expect(rt.namespaces.filter((n) => 'public' in n.access).map((n) => n.name)).toEqual(['/producer/overlay']);
  });

  it('refuses an anonymous client on every namespace that is not public', async () => {
    const rt = await startRealtime();
    const gated = rt.namespaces.filter((n) => !('public' in n.access)).map((n) => n.name);
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    expect(await notRefused(rt, gated, async () => ({}), 'unauthenticated')).toEqual([]);
    expect(await notRefused(rt, gated, asAdmin, 'unauthenticated')).toHaveLength(gated.length);
  });

  it('refuses every namespace that is not public while a password change is pending', async () => {
    const rt = await startRealtime();
    const gated = rt.namespaces.filter((n) => !('public' in n.access)).map((n) => n.name);
    const pending = async () => ({ cookie: await rt.cookieFor('producer', { mustChangePassword: true }) });
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    expect(await notRefused(rt, gated, pending, 'password_change_required')).toEqual([]);
    expect(await notRefused(rt, gated, asAdmin, 'password_change_required')).toHaveLength(gated.length);
  });

  it('refuses each role every namespace whose permission it lacks', async () => {
    const rt = await startRealtime();
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    for (const role of ['producer', 'announcer'] as const) {
      const lacking = rt.namespaces
        .filter((n) => 'permission' in n.access && !rt.hosted.permissions.granted(role, n.access.permission))
        .map((n) => n.name);
      expect(lacking, role).toContain('/probe/watch');
      const asRole = async () => ({ cookie: await rt.cookieFor(role) });
      expect(await notRefused(rt, lacking, asRole, 'forbidden'), role).toEqual([]);
      expect(await notRefused(rt, lacking, asAdmin, 'forbidden'), role).toHaveLength(lacking.length);
    }
  });
});

describe('attachRealtime', () => {
  it("lets anyone into an app's public namespace", async () => {
    const rt = await startRealtime();
    const client = connect(`${rt.url}/probe/open`, { transports: ['websocket'], reconnection: false });
    clients.push(client);
    expect(await new Promise((resolve) => client.once('probe:hello', resolve))).toBe('hi');
  });

  it('refuses the old /overlay namespace, which moved to /producer/overlay', async () => {
    const rt = await startRealtime();
    expect(await rt.open('/overlay')).toBe('Invalid namespace');
  });

  it('refuses everyone on the bare / namespace, even an Admin', async () => {
    const rt = await startRealtime();
    expect(await rt.open('/', { cookie: await rt.cookieFor('admin') })).toBe('not_found');
  });

  it('refuses a signed-in connection opened by another site', async () => {
    const rt = await startRealtime();
    const cookie = await rt.cookieFor('admin');
    expect(await rt.open('/probe/signed-in', { cookie, origin: 'http://evil.example' })).toBe('cross_origin');
  });

  it('refuses a namespace created without access', () => {
    attach();
    expect(() => io!.of('/sneaky')).toThrow('Socket.IO namespace /sneaky has no access; use namespace()');
  });

  it("refuses a namespace outside the app's own /<id>, with a bad declaration, or that already exists", () => {
    for (const [realtime, message] of [
      [
        (rt) => rt.namespace('/producer/overlay', { access: { public: 'x' } }),
        "isn't at or below /probe, so probe can't create it",
      ],
      [
        (rt) => rt.namespace('/probe/typo', { access: { permission: 'probe:wach' } }),
        "needs probe:wach, which probe doesn't declare",
      ],
      [
        (rt) => rt.namespace('/probe/watch', { access: { permission: 'core:users.manage' } }),
        'but probe may only use its own probe:… permissions',
      ],
      [
        (rt) => {
          rt.namespace('/probe/twice', { access: { signedIn: true } });
          rt.namespace('/probe/twice', { access: { signedIn: true } });
        },
        'Socket.IO namespace /probe/twice already exists',
      ],
    ] as const satisfies readonly (readonly [AppModule['realtime'], string])[]) {
      expect(() => attach([appWith(realtime)]), message).toThrow(message);
      io = undefined;
      httpServer = undefined;
    }
  });

  it('refuses the connection instead of crashing when the session check throws', async () => {
    const rt = await startRealtime();
    const cookie = await rt.cookieFor('admin');
    rt.sqlite.close(); // every query against the database now throws
    expect(await rt.open('/probe/signed-in', { cookie })).toBe('internal_error');
    expect(rt.log.error).toHaveBeenCalledOnce();

    // The process and the server are still up: the public namespace still works on the same server.
    const open = connect(`${rt.url}/probe/open`, { transports: ['websocket'], reconnection: false });
    clients.push(open);
    expect(await new Promise((resolve) => open.once('probe:hello', resolve))).toBe('hi');
  });
});
