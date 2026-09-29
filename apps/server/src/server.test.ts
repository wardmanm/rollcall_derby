import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@obs-producer/shared';
import { startServer, type RunningServer } from './server.ts';

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
  it('serves HTTP and greets Socket.IO clients on the same port', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    running = await startServer({ host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') }, { version: '9.9.9', logger: false });

    const health = await fetch(`${running.url}/api/health`);
    expect(health.status).toBe(200);

    client = connect(running.url, { transports: ['websocket'] });
    const hello = await new Promise((resolve) => client!.once(SERVER_HELLO_EVENT, resolve));
    expect(ServerHelloSchema.parse(hello)).toEqual({ name: APP_NAME, version: '9.9.9' });
  });

  it('lets clients reconnect on their own after the server restarts', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    const config = { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') };
    running = await startServer(config, { version: '1.0.0', logger: false });
    const port = Number(new URL(running.url).port);

    client = connect(running.url, { transports: ['websocket'], reconnectionDelay: 50, reconnectionDelayMax: 100 });
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
    running = await startServer({ host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') }, { version: '9.9.9', logger: false });
    client = connect(running.url, { transports: ['websocket'] });
    await new Promise((resolve) => client!.once(SERVER_HELLO_EVENT, resolve));
    await expect(running.close()).resolves.toBeUndefined();
    running = undefined;
  });
});
