import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function webBuild() {
  const dir = mkdtempSync(join(tmpdir(), 'op-web-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>OBS Producer</title><div id="root"></div>');
  writeFileSync(join(dir, 'overlay.html'), '<!doctype html><title>Overlay</title><div id="overlay"></div>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("app")');
  return dir;
}

describe('serving the web build', () => {
  it('serves index.html at /', async () => {
    const app = buildApp({ version: '1.0.0', webDir: webBuild() });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('<div id="root">');
    await app.close();
  });

  it('serves built assets', async () => {
    const app = buildApp({ version: '1.0.0', webDir: webBuild() });
    const res = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    await app.close();
  });

  it('falls back to index.html for client-side routes', async () => {
    const app = buildApp({ version: '1.0.0', webDir: webBuild() });
    const res = await app.inject({ method: 'GET', url: '/teams/42' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<div id="root">');
    await app.close();
  });

  it('serves the overlay page for /overlay and anything below it', async () => {
    const app = buildApp({ version: '1.0.0', webDir: webBuild() });
    const urls = ['/overlay', '/overlay/', '/overlay/some-output-token'];
    const responses = await Promise.all(urls.map((url) => app.inject({ method: 'GET', url })));
    responses.forEach((res, i) => {
      expect(res.statusCode, urls[i]).toBe(200);
      expect(res.body, urls[i]).toContain('<div id="overlay">');
    });
    await app.close();
  });

  it('does not treat look-alike paths as the overlay', async () => {
    const app = buildApp({ version: '1.0.0', webDir: webBuild() });
    const res = await app.inject({ method: 'GET', url: '/overlays-list' });
    expect(res.body).toContain('<div id="root">');
    await app.close();
  });

  it('keeps JSON 404s for unknown API routes', async () => {
    const app = buildApp({ version: '1.0.0', webDir: webBuild() });
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    await app.close();
  });

  it('still serves the API when there is no web build yet', async () => {
    const app = buildApp({ version: '1.0.0', webDir: join(tmpdir(), 'op-web-does-not-exist') });
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'Not Found' });
    await app.close();
  });
});
