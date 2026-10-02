import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@obs-producer/shared';
import { startServer, type RunningServer } from './server.ts';
import { openDatabase } from './db.ts';
import { sessions } from './db/schema.ts';
import { createSession } from './auth/sessions.ts';
import { createUser } from './auth/users.ts';
import { SESSION_COOKIE } from './auth/guard.ts';

let running: RunningServer | undefined;
let client: Socket | undefined;
let dataDir: string | undefined;
afterEach(async () => {
  client?.close();
  await running?.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  running = client = dataDir = undefined;
});

describe('startServer', () => {
  it('purges expired sessions at startup and serves setup status from the data directory', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    const seed = openDatabase(dataDir);
    const user = createUser(seed.db, { username: 'admin', passwordHash: 'h', role: 'admin' });
    createSession(seed.db, user.id, new Date('2020-01-01T00:00:00Z'));
    const current = createSession(seed.db, user.id);
    seed.sqlite.close();

    running = await startServer(
      { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') },
      { version: '1.0.0', logger: false },
    );
    const res = await fetch(`${running.url}/api/setup`);
    expect(await res.json()).toEqual({ needsSetup: false, canSetupHere: true });

    const check = openDatabase(dataDir);
    const remaining = check.db.select({ expiresAt: sessions.expiresAt }).from(sessions).all();
    check.sqlite.close();
    expect(remaining).toEqual([{ expiresAt: current.expiresAt.toISOString() }]);
  });

  it('serves HTTP and greets Socket.IO clients on the same port', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    running = await startServer(
      { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') },
      { version: '9.9.9', logger: false },
    );

    const health = await fetch(`${running.url}/api/health`);
    expect(health.status).toBe(200);

    client = connect(`${running.url}/overlay`, { transports: ['websocket'] });
    const hello = await new Promise((resolve) => client!.once(SERVER_HELLO_EVENT, resolve));
    expect(ServerHelloSchema.parse(hello)).toEqual({ name: APP_NAME, version: '9.9.9' });
  });

  it('lets clients reconnect on their own after the server restarts', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    const config = { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') };
    running = await startServer(config, { version: '1.0.0', logger: false });
    const port = Number(new URL(running.url).port);

    client = connect(`${running.url}/overlay`, {
      transports: ['websocket'],
      reconnectionDelay: 50,
      reconnectionDelayMax: 100,
    });
    await new Promise((resolve) => client!.once(SERVER_HELLO_EVENT, resolve));
    const disconnected = new Promise<string>((resolve) => client!.once('disconnect', resolve));

    await running.close();
    const reason = await disconnected;
    running = await startServer({ ...config, port }, { version: '1.0.1', logger: false });

    const helloAgain = await Promise.race([
      new Promise((resolve) => client!.once(SERVER_HELLO_EVENT, resolve)),
      new Promise((resolve) => setTimeout(() => resolve(`no reconnect (disconnect reason: ${reason})`), 3000)),
    ]);
    expect(helloAgain).toEqual({ name: APP_NAME, version: '1.0.1' });
  });

  it('closes cleanly while a client is still connected', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    running = await startServer(
      { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') },
      { version: '9.9.9', logger: false },
    );
    client = connect(`${running.url}/overlay`, { transports: ['websocket'] });
    await new Promise((resolve) => client!.once(SERVER_HELLO_EVENT, resolve));
    await expect(running.close()).resolves.toBeUndefined();
    running = undefined;
  });

  it('keeps the server up if the hourly session purge fails', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    const spy = vi.spyOn(globalThis, 'setInterval');
    try {
      running = await startServer(
        { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') },
        { version: '9.9.9', logger: false },
      );
      const purge = spy.mock.calls.find(([, ms]) => ms === 60 * 60 * 1000)?.[0];
      expect(purge).toBeTypeOf('function');

      await running.close();
      running = undefined; // already closed; the shared afterEach must not close it again

      expect(() => purge?.()).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

// Starts a server whose database holds one signed-in user, and returns their session cookie.
async function serverWithSession({ mustChangePassword = false } = {}) {
  dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
  const seed = openDatabase(dataDir);
  const user = createUser(seed.db, { username: 'admin', passwordHash: 'h', role: 'admin', mustChangePassword });
  const { token } = createSession(seed.db, user.id);
  seed.sqlite.close();
  running = await startServer(
    { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') },
    { version: '1.0.0', logger: false },
  );
  return { url: running.url, cookie: `${SESSION_COOKIE}=${token}` };
}

// 'connected', or the reason the server refused the connection.
function outcome(socket: Socket): Promise<string> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once('connect_error', (error) => resolve(error.message));
  });
}

describe('Socket.IO namespaces', () => {
  it('refuses the default namespace without a session', async () => {
    const { url } = await serverWithSession();
    client = connect(url, { transports: ['websocket'], reconnection: false });
    expect(await outcome(client)).toBe('unauthenticated');
  });

  it('accepts the default namespace with a session', async () => {
    const { url, cookie } = await serverWithSession();
    client = connect(url, { transports: ['websocket'], reconnection: false, extraHeaders: { cookie } });
    expect(await outcome(client)).toBe('connected');
  });

  it('refuses a session that must change its password first', async () => {
    const { url, cookie } = await serverWithSession({ mustChangePassword: true });
    client = connect(url, { transports: ['websocket'], reconnection: false, extraHeaders: { cookie } });
    expect(await outcome(client)).toBe('password_change_required');
  });

  it('refuses a signed-in connection opened by another site', async () => {
    const { url, cookie } = await serverWithSession();
    client = connect(url, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { cookie, origin: 'http://evil.example' },
    });
    expect(await outcome(client)).toBe('cross_origin');
  });

  it('lets anyone into /overlay and says hello', async () => {
    const { url } = await serverWithSession();
    client = connect(`${url}/overlay`, { transports: ['websocket'], reconnection: false });
    const hello = await new Promise((resolve) => client!.once(SERVER_HELLO_EVENT, resolve));
    expect(ServerHelloSchema.parse(hello)).toEqual({ name: APP_NAME, version: '1.0.0' });
  });
});
