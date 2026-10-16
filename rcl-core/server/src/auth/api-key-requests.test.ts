import { afterEach, describe, expect, it } from 'vitest';
import type { InjectOptions } from 'fastify';
import type { AppModule } from '@rollcall/app-sdk';
import type { ApiKeyExpiry } from '@rollcall/core-contract';
import { addUser, testApp } from '../testing.ts';
import { createApiKey, revokeApiKey } from './api-keys.ts';
import { SESSION_COOKIE } from './guard.ts';
import { createSession } from './sessions.ts';

// What the POST route does halfway through, after its await: a test can revoke the key there.
let midRequest: () => void = () => undefined;
afterEach(() => {
  midRequest = () => undefined;
});

// A hosted app with two permissions an API key may hold and one only people may, and a route needing each.
const DEMO_APP: AppModule = {
  id: 'demo',
  title: 'Demo',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [
    { key: 'demo:things.read', summary: 'Read things', roles: ['producer'] },
    { key: 'demo:things.edit', summary: 'Edit things', roles: ['producer'] },
    { key: 'demo:secrets.read', summary: 'Read secrets', roles: [], peopleOnly: true },
  ],
  register(api) {
    api.get('/things', { config: { access: { permission: 'demo:things.read' } } }, async () => ({ things: [] }));
    api.post('/things', { config: { access: { permission: 'demo:things.edit' } } }, async (request, reply) => {
      await Promise.resolve();
      midRequest();
      const denial = request.recheckAccess();
      return denial ? reply.code(denial.status).send({ error: denial.error }) : { ok: true };
    });
    api.get('/secrets', { config: { access: { permission: 'demo:secrets.read' } } }, async () => ({ secrets: [] }));
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function withDemo() {
  const { app, db } = testApp({ apps: [DEMO_APP] });
  let keys = 0;
  const keyFor = (permissions: string[], expiresIn: ApiKeyExpiry = 'never', now = new Date()) =>
    createApiKey(db, { name: `key ${(keys += 1)}`, permissions, expiresIn, createdBy: 'admin' }, now);
  const call = (
    method: 'GET' | 'POST',
    url: string,
    { headers = {}, cookies = {} }: { headers?: Record<string, string>; cookies?: Record<string, string> } = {},
  ) => app.inject({ method, url, headers, cookies, ...(method === 'POST' ? { payload: {} } : {}) } as InjectOptions);
  return { app, db, keyFor, call };
}

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

describe('a request with an API key', () => {
  it('gets through to routes whose permission the key holds, and no further', async () => {
    const { keyFor, call } = withDemo();
    const { key } = keyFor(['demo:things.read']);
    expect((await call('GET', '/api/demo/things', { headers: bearer(key) })).json()).toEqual({ things: [] });
    expect((await call('POST', '/api/demo/things', { headers: bearer(key) })).json()).toEqual({ error: 'forbidden' });
  });

  it('is refused with a wrong, revoked or expired key, or a header that is not a bearer key', async () => {
    const { db, keyFor, call } = withDemo();
    const revoked = keyFor(['demo:things.read']);
    revokeApiKey(db, revoked.apiKey.id);
    const expired = keyFor(['demo:things.read'], '1d', new Date(Date.now() - 2 * DAY_MS));
    const { key } = keyFor(['demo:things.read']);
    for (const authorization of [
      'Bearer rcl_not-a-real-key',
      `Bearer ${revoked.key}`,
      `Bearer ${expired.key}`,
      'Bearer',
      `Basic ${key}`,
      '',
    ]) {
      const res = await call('GET', '/api/demo/things', { headers: { authorization } });
      expect(res.statusCode, authorization).toBe(401);
      expect(res.json(), authorization).toEqual({ error: 'unauthenticated' });
    }
  });

  it('keeps public routes open', async () => {
    const { call } = withDemo();
    expect((await call('GET', '/api/core/health', { headers: bearer('rcl_not-a-real-key') })).statusCode).toBe(200);
  });

  it("ignores the session cookie, even an Admin's", async () => {
    const { db, keyFor, call } = withDemo();
    const admin = await addUser(db, 'admin', 'correct horse', 'admin');
    const cookies = { [SESSION_COOKIE]: createSession(db, admin.id).token };
    const { key } = keyFor([]);
    expect((await call('GET', '/api/demo/things', { cookies })).statusCode).toBe(200);
    expect((await call('GET', '/api/demo/things', { cookies, headers: bearer('rcl_wrong') })).statusCode).toBe(401);
    expect((await call('GET', '/api/demo/things', { cookies, headers: bearer(key) })).statusCode).toBe(403);
  });

  it("isn't refused as cross-site: browsers never send an Authorization header on their own", async () => {
    const { db, keyFor, call } = withDemo();
    const origin = 'http://evil.example';
    const { key } = keyFor(['demo:things.edit']);
    expect((await call('POST', '/api/demo/things', { headers: { ...bearer(key), origin } })).json()).toEqual({
      ok: true,
    });
    const producer = await addUser(db, 'producer1', 'correct horse', 'producer');
    const cookies = { [SESSION_COOKIE]: createSession(db, producer.id).token };
    expect((await call('POST', '/api/demo/things', { cookies, headers: { origin } })).json()).toEqual({
      error: 'cross_origin',
    });
  });

  it('is refused on routes for any signed-in user, which are about a person', async () => {
    const { keyFor, call } = withDemo();
    const { key } = keyFor(['demo:things.read']);
    for (const url of ['/api/core/auth/me', '/api/core/apps']) {
      expect((await call('GET', url, { headers: bearer(key) })).json(), url).toEqual({ error: 'forbidden' });
    }
  });

  it('never uses a people-only permission, even one a key was given before it became people-only', async () => {
    const { keyFor, call } = withDemo();
    const { key } = keyFor(['demo:secrets.read', 'core:users.manage']);
    expect((await call('GET', '/api/demo/secrets', { headers: bearer(key) })).json()).toEqual({ error: 'forbidden' });
    expect((await call('GET', '/api/core/users', { headers: bearer(key) })).json()).toEqual({ error: 'forbidden' });
  });

  it('is stopped if the key is revoked while the request is under way', async () => {
    const { db, keyFor, call } = withDemo();
    const { apiKey, key } = keyFor(['demo:things.edit']);
    midRequest = () => revokeApiKey(db, apiKey.id);
    expect((await call('POST', '/api/demo/things', { headers: bearer(key) })).json()).toEqual({
      error: 'unauthenticated',
    });
  });
});
