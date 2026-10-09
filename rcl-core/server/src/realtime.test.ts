import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { FastifyBaseLogger } from 'fastify';
import type { Server as SocketIoServer } from 'socket.io';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema, type Role } from '@rollcall/core-contract';
import { attachRealtime, type RealtimeOptions } from './realtime.ts';
import { openMemoryDatabase } from './db.ts';
import { createPermissions, type Access } from './auth/access.ts';
import { createSession } from './auth/sessions.ts';
import { SESSION_COOKIE } from './auth/guard.ts';
import { CORE_PERMISSIONS } from './auth/permissions.ts';
import { addUser } from './testing.ts';

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

const permissions = createPermissions(CORE_PERMISSIONS);
const testLog = () =>
  ({ error: vi.fn<(obj: { err: unknown }, msg: string) => void>() }) as unknown as FastifyBaseLogger;

// Starts Socket.IO on a real port, with any extra namespaces, and records every namespace as it's created.
async function startRealtime(options: Partial<RealtimeOptions> = {}) {
  const database = openMemoryDatabase();
  const namespaces: { name: string; access: Access }[] = [];
  const log = testLog();
  httpServer = createServer();
  io = attachRealtime(httpServer, {
    version: '1.0.0',
    db: database.db,
    log,
    permissions,
    onNamespace: (name, access) => namespaces.push({ name, access }),
    ...options,
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  let users = 0;
  const cookieFor = async (role: Role, { mustChangePassword = false } = {}) => {
    const user = await addUser(database.db, `user${(users += 1)}`, 'correct horse', role, { mustChangePassword });
    return `${SESSION_COOKIE}=${createSession(database.db, user.id).token}`;
  };
  const open = (name: string, headers: Record<string, string> = {}) => {
    const client = connect(`${url}${name}`, { transports: ['websocket'], reconnection: false, extraHeaders: headers });
    clients.push(client);
    return outcome(client);
  };
  return { ...database, log, url, namespaces, cookieFor, open };
}

// 'connected', or the reason the server refused the connection.
function outcome(socket: Socket): Promise<string> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once('connect_error', (error) => resolve(error.message));
  });
}

// Two namespaces that only tests create, so every kind of declaration has one to sweep.
const probes: RealtimeOptions['registerNamespaces'] = (realtime) => {
  realtime.namespace('/probe/signed-in', { access: { signedIn: true } });
  realtime.namespace('/probe/users', { access: { permission: 'core:users.manage' } });
};

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
  it('pins the public namespaces', async () => {
    const rt = await startRealtime();
    expect(rt.namespaces.filter((n) => 'public' in n.access).map((n) => n.name)).toEqual(['/overlay']);
  });

  it('refuses an anonymous client on every namespace that is not public', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const gated = rt.namespaces.filter((n) => !('public' in n.access)).map((n) => n.name);
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    expect(await notRefused(rt, gated, async () => ({}), 'unauthenticated')).toEqual([]);
    expect(await notRefused(rt, gated, asAdmin, 'unauthenticated')).toHaveLength(gated.length);
  });

  it('refuses every namespace that is not public while a password change is pending', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const gated = rt.namespaces.filter((n) => !('public' in n.access)).map((n) => n.name);
    const pending = async () => ({ cookie: await rt.cookieFor('producer', { mustChangePassword: true }) });
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    expect(await notRefused(rt, gated, pending, 'password_change_required')).toEqual([]);
    expect(await notRefused(rt, gated, asAdmin, 'password_change_required')).toHaveLength(gated.length);
  });

  it('refuses each role every namespace whose permission it lacks', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    for (const role of ['producer', 'announcer'] as const) {
      const lacking = rt.namespaces
        .filter((n) => 'permission' in n.access && !permissions.granted(role, n.access.permission))
        .map((n) => n.name);
      expect(lacking, role).toContain('/probe/users');
      const asRole = async () => ({ cookie: await rt.cookieFor(role) });
      expect(await notRefused(rt, lacking, asRole, 'forbidden'), role).toEqual([]);
      expect(await notRefused(rt, lacking, asAdmin, 'forbidden'), role).toHaveLength(lacking.length);
    }
  });
});

describe('attachRealtime', () => {
  it('lets anyone into /overlay and says hello', async () => {
    const rt = await startRealtime();
    const client = connect(`${rt.url}/overlay`, { transports: ['websocket'], reconnection: false });
    clients.push(client);
    const hello = await new Promise((resolve) => client.once(SERVER_HELLO_EVENT, resolve));
    expect(ServerHelloSchema.parse(hello)).toEqual({ name: APP_NAME, version: '1.0.0' });
  });

  it('refuses everyone on the bare / namespace, even an Admin', async () => {
    const rt = await startRealtime();
    expect(await rt.open('/', { cookie: await rt.cookieFor('admin') })).toBe('not_found');
  });

  it('refuses a signed-in connection opened by another site', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const cookie = await rt.cookieFor('admin');
    expect(await rt.open('/probe/signed-in', { cookie, origin: 'http://evil.example' })).toBe('cross_origin');
  });

  it('refuses a namespace created without access', async () => {
    await startRealtime();
    expect(() => io!.of('/sneaky')).toThrow('Socket.IO namespace /sneaky has no access; use namespace()');
  });

  it('refuses a namespace with a bad declaration, or one that already exists', () => {
    const { db } = openMemoryDatabase();
    for (const [name, access, message] of [
      ['/typo', { permission: 'core:users.mange' }, "needs core:users.mange, which core doesn't declare"],
      ['/overlay', { signedIn: true }, 'Socket.IO namespace /overlay already exists'],
    ] as const) {
      const options = { version: '1.0.0', db, log: testLog(), permissions };
      const attach = () =>
        attachRealtime(createServer(), { ...options, registerNamespaces: (rt) => rt.namespace(name, { access }) });
      expect(attach, name).toThrow(message);
    }
  });

  it('refuses the connection instead of crashing when the session check throws', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const cookie = await rt.cookieFor('admin');
    rt.sqlite.close(); // every query against the database now throws
    expect(await rt.open('/probe/signed-in', { cookie })).toBe('internal_error');
    expect(rt.log.error).toHaveBeenCalledOnce();

    // The process and the server are still up: /overlay still works on the same server.
    const overlayClient = connect(`${rt.url}/overlay`, { transports: ['websocket'], reconnection: false });
    clients.push(overlayClient);
    const hello = await new Promise((resolve) => overlayClient.once(SERVER_HELLO_EVENT, resolve));
    expect(ServerHelloSchema.parse(hello)).toEqual({ name: APP_NAME, version: '1.0.0' });
  });
});
