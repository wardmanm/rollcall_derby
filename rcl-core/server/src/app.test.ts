import { describe, expect, it } from 'vitest';
import { APP_NAME, HealthResponseSchema } from '@rollcall/core-contract';
import type { AppModule } from '@rollcall/app-sdk';
import { testApp } from './testing.ts';

describe('GET /api/core/health', () => {
  it('returns the shared health contract', async () => {
    const app = testApp({ version: '1.2.3' }).app;
    const res = await app.inject({ method: 'GET', url: '/api/core/health' });
    expect(res.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(res.json());
    expect(body).toMatchObject({ status: 'ok', name: APP_NAME, version: '1.2.3' });
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it('answers unknown API routes with 404 not_found, whichever app they look like', async () => {
    const app = testApp({ version: '1.2.3' }).app;
    for (const url of ['/api/core/nope', '/api/health', '/api/nobody/nope', '/api']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json(), url).toEqual({ error: 'not_found' });
    }
    await app.close();
  });

  it("keeps serving core when an installed app can't be hosted, and leaves that app's routes out", async () => {
    const old: AppModule = {
      id: 'old',
      title: 'Old',
      version: '1.0.0',
      requiresCore: '^9.0.0',
      permissions: [],
      register(api) {
        api.get('/ping', { config: { access: { public: 'test probe' } } }, async () => ({ ok: true }));
      },
    };
    const app = testApp({ version: '1.2.3', apps: [old] }).app;
    expect((await app.inject({ method: 'GET', url: '/api/core/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/old/ping' })).json()).toEqual({ error: 'not_found' });
    expect(app.hostedApps.modules.map((module) => module.id)).toEqual(['core']);
    await app.close();
  });
});
