// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

// `yarn dev` must serve the overlay where the production server does (rcl-core/server/src/web-apps.ts):
// /producer/overlay and everything below it, where output URLs will live. Other paths get the Producer app.
const webRoot = fileURLToPath(new URL('..', import.meta.url));
let dev: ViteDevServer;
let origin: string;

beforeAll(async () => {
  dev = await createServer({
    root: webRoot,
    configFile: join(webRoot, 'vite.config.ts'),
    logLevel: 'silent',
    server: { port: 0, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await dev.listen();
  origin = dev.resolvedUrls?.local[0]?.replace(/\/producer\/$/, '') ?? '';
}, 30_000);

afterAll(async () => {
  await dev.close();
});

const titleOf = async (path: string) => /<title>([^<]*)<\/title>/.exec(await (await fetch(origin + path)).text())?.[1];

describe('the dev server', () => {
  it('serves the overlay at /producer/overlay and everything below it', async () => {
    for (const path of [
      '/producer/overlay',
      '/producer/overlay/',
      '/producer/overlay/some-output-token',
      '/producer/overlay?x=1',
    ]) {
      expect(await titleOf(path), path).toBe('Rollcall overlay');
    }
  });

  it('serves the Producer app everywhere else below /producer/', async () => {
    for (const path of ['/producer/', '/producer/screens/3', '/producer/overlays-list']) {
      expect(await titleOf(path), path).toBe('Rollcall Producer');
    }
  });
});
