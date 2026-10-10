import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppModule } from '@rollcall/app-sdk';
import type { AppOptions } from './app.ts';
import { testApp } from './testing.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

// A fake production build: index.html saying which app it is, any extra pages, and one asset.
function build(app: string, pages: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), `rollcall-${app}-web-`));
  dirs.push(dir);
  writeFileSync(join(dir, 'index.html'), `<!doctype html><title>${app}</title><div id="${app}-root"></div>`);
  for (const page of pages) writeFileSync(join(dir, `${page}.html`), `<!doctype html><div id="${app}-${page}"></div>`);
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', `${app}.js`), `console.log("${app}")`);
  return dir;
}

// A hosted app with only a web build, served at /producer/ with an overlay page.
const producerWith = (dir: string): AppModule => ({
  id: 'producer',
  title: 'Producer',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [],
  web: { dir, pages: { overlay: 'overlay.html' } },
});

type Builds = Pick<AppOptions, 'coreWebDir' | 'apps'>;
const missing = join(tmpdir(), 'rollcall-web-does-not-exist');

function appWithBuilds(): Builds {
  return { coreWebDir: build('core'), apps: [producerWith(build('producer', ['overlay']))] };
}

async function get(builds: Builds, url: string, method: 'GET' | 'HEAD' = 'GET') {
  const { app } = testApp(builds);
  const res = await app.inject({ method, url });
  await app.close();
  return res;
}

describe('serving the web apps', () => {
  it("serves each app's index.html at its base", async () => {
    const webApps = appWithBuilds();
    for (const [url, root] of [
      ['/core/', 'core-root'],
      ['/producer/', 'producer-root'],
    ] as const) {
      const res = await get(webApps, url);
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type'], url).toMatch(/text\/html/);
      expect(res.body, url).toContain(`<div id="${root}">`);
    }
  });

  it("serves each app's built assets below its base", async () => {
    const webApps = appWithBuilds();
    for (const url of ['/core/assets/core.js', '/producer/assets/producer.js']) {
      const res = await get(webApps, url);
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type'], url).toMatch(/javascript/);
    }
  });

  it("falls back to the right app's index.html for client-side routes", async () => {
    const webApps = appWithBuilds();
    for (const [url, root] of [
      ['/core', 'core-root'],
      ['/core/teams/42', 'core-root'],
      ['/producer', 'producer-root'],
      ['/producer/screens/3?tab=layout', 'producer-root'],
    ] as const) {
      expect((await get(webApps, url)).body, url).toContain(`<div id="${root}">`);
    }
  });

  it("serves an app's page at its path and everything below it", async () => {
    const webApps = appWithBuilds();
    for (const url of [
      '/producer/overlay',
      '/producer/overlay/',
      '/producer/overlay/some-output-token',
      '/producer/overlay?x=1',
    ]) {
      const res = await get(webApps, url);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toContain('<div id="producer-overlay">');
    }
  });

  it('answers HEAD for pages and client-side routes as it answers GET', async () => {
    const webApps = appWithBuilds();
    for (const url of ['/core/teams/42', '/producer/overlay/some-output-token']) {
      const res = await get(webApps, url, 'HEAD');
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type'], url).toMatch(/text\/html/);
    }
  });

  it("does not treat look-alike paths as an app's page", async () => {
    expect((await get(appWithBuilds(), '/producer/overlays-list')).body).toContain('<div id="producer-root">');
  });

  it('sends / to the first app', async () => {
    const res = await get(appWithBuilds(), '/');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/core/');
  });

  it('answers paths no app claims, and unknown API routes, with a JSON 404', async () => {
    // /overlay is where the OBS overlay was before it moved to /producer/overlay; it has no redirect.
    for (const url of ['/api/core/nope', '/overlay', '/teams/42', '/producerish']) {
      const res = await get(appWithBuilds(), url);
      expect(res.statusCode, url).toBe(404);
      expect(res.headers['content-type'], url).toMatch(/application\/json/);
    }
  });

  it('serves the apps that are built and skips the rest', async () => {
    const webApps = { coreWebDir: missing, apps: [producerWith(build('producer', ['overlay']))] };
    expect((await get(webApps, '/producer/screens/3')).body).toContain('<div id="producer-root">');
    expect((await get(webApps, '/producer/overlay')).body).toContain('<div id="producer-overlay">');
    expect((await get(webApps, '/core/')).statusCode).toBe(404);
  });

  it('still serves the API when there is no web build yet', async () => {
    const { app } = testApp({ coreWebDir: missing });
    expect((await app.inject({ method: 'GET', url: '/api/core/health' })).statusCode).toBe(200);
    const res = await app.inject({ method: 'GET', url: '/core/' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'Not Found' });
    await app.close();
  });
});
