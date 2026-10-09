import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { io as connect, type Socket } from 'socket.io-client';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/core-contract';
import { startServer, type RunningServer } from './server.ts';
import { openDatabase } from './db.ts';
import { sessions } from './db/schema.ts';
import { dummyHash } from './auth/passwords.ts';
import type * as Passwords from './auth/passwords.ts';
import { createSession } from './auth/sessions.ts';
import { createUser } from './auth/users.ts';

// Wraps dummyHash in a spy that still hashes, so a test can see when startServer first asks for it.
vi.mock('./auth/passwords.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof Passwords>();
  return { ...actual, dummyHash: vi.fn<typeof actual.dummyHash>(actual.dummyHash) };
});

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

describe('startServer at startup', () => {
  it('hashes the stand-in password before it listens, so the first failed login is as slow as the rest', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    vi.mocked(dummyHash).mockClear();
    running = await startServer(
      { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') },
      { version: '1.0.0', logger: false },
    );
    expect(dummyHash).toHaveBeenCalledOnce();
    await expect(vi.mocked(dummyHash).mock.results[0]?.value).resolves.toMatch(/^\$argon2id\$/);
  });

  it('closes the database and stops its timer when it cannot listen', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const { port } = blocker.address() as { port: number };
    const close = vi.spyOn(Database.prototype, 'close');
    const clearTimer = vi.spyOn(globalThis, 'clearInterval');
    try {
      await expect(
        startServer(
          { host: '127.0.0.1', port, dataDir, webDir: join(dataDir, 'no-web-build') },
          { version: '1.0.0', logger: false },
        ),
      ).rejects.toThrow('EADDRINUSE');
      expect(close).toHaveBeenCalledOnce();
      expect(clearTimer).toHaveBeenCalled();
    } finally {
      close.mockRestore();
      clearTimer.mockRestore();
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
