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

  it('closes cleanly while a client is still connected', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    running = await startServer({ host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') }, { version: '9.9.9', logger: false });
    client = connect(running.url, { transports: ['websocket'] });
    await new Promise((resolve) => client!.once(SERVER_HELLO_EVENT, resolve));
    await expect(running.close()).resolves.toBeUndefined();
    running = undefined;
  });
});
