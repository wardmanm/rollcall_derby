// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer as createVite } from 'vite';
import { DEV_PORTS, frontDoorProxy, redirectRoot, serverProxy } from './vite.ts';

let cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.toReversed()) await cleanup();
  cleanups = [];
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

// A stand-in that answers every request with its name.
const standIn = (name: string) => listen(createServer((_req, res) => res.end(name)));

// rcl-core's Vite as the front door, run for real, with stand-ins for the Rollcall server and the Producer app's Vite.
async function frontDoor() {
  const server = await standIn('server');
  const producer = await standIn('producer');
  const proxy = frontDoorProxy(server);
  // The Producer app's Vite has a fixed port, so its entry points at the stand-in instead, under the same key.
  for (const entry of Object.values(proxy)) {
    if (entry.target === `http://localhost:${DEV_PORTS.producer}`) entry.target = producer;
  }
  const root = mkdtempSync(join(tmpdir(), 'rollcall-front-door-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const vite = await createVite({
    configFile: false,
    root,
    cacheDir: join(root, '.vite'),
    logLevel: 'silent',
    appType: 'custom',
    plugins: [redirectRoot('/core/')],
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, ws: false, watch: null, proxy },
  });
  cleanups.push(() => vite.close());
  const url = await listen(createServer(vite.middlewares));
  return (path: string) => fetch(`${url}${path}`, { redirect: 'manual' });
}

describe('serverProxy', () => {
  it('passes the API, the API explorer, uploaded files, bundled fonts and Socket.IO to the server, keeping Host', () => {
    const proxy = serverProxy('http://localhost:5580');
    expect(Object.keys(proxy)).toEqual(['/api', '/docs', '/media', '/fonts', '/socket.io']);
    for (const [path, entry] of Object.entries(proxy)) {
      expect(entry.target, path).toBe('http://localhost:5580');
      expect(entry.changeOrigin, path).not.toBe(true);
    }
    expect(proxy['/socket.io']?.ws).toBe(true);
  });
});

describe('frontDoorProxy', () => {
  it("adds the Producer app's dev server, WebSockets included, keeping Host as it is", () => {
    const proxy = frontDoorProxy('http://localhost:5580');
    expect(proxy).toMatchObject(serverProxy('http://localhost:5580'));
    expect(Object.values(proxy)).toContainEqual({ target: `http://localhost:${DEV_PORTS.producer}`, ws: true });
    for (const [path, entry] of Object.entries(proxy)) expect(entry.changeOrigin, path).not.toBe(true);
  });
});

describe('the front door', () => {
  it('passes /producer and everything below it to the Producer app, but not paths that only start the same', async () => {
    const get = await frontDoor();
    for (const path of ['/producer', '/producer/', '/producer/screens/3', '/producer?tab=layout']) {
      expect(await (await get(path)).text(), path).toBe('producer');
    }
    for (const path of ['/producerish', '/producers/3']) {
      expect(await (await get(path)).text(), path).not.toBe('producer');
    }
    expect(await (await get('/api/core/health')).text()).toBe('server');
  });

  it('sends / to the home page, with or without a query, as the production server does', async () => {
    const get = await frontDoor();
    for (const path of ['/', '/?from=bookmark']) {
      const res = await get(path);
      expect(res.status, path).toBe(302);
      expect(res.headers.get('location'), path).toBe('/core/');
    }
    expect((await get('/core/?from=bookmark')).status).not.toBe(302);
  });
});
