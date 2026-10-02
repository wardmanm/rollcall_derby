import { describe, expect, it } from 'vitest';
import { createSession } from './sessions.ts';
import { requireUser, SESSION_COOKIE } from './guard.ts';
import { addUser, testApp } from '../testing.ts';

// A tiny protected route registered the same way real routes are.
function appWithProbe() {
  return testApp({
    registerRoutes: (api) => {
      // oxlint-disable-next-line oxc/no-async-endpoint-handlers -- Fastify awaits async handlers natively; this isn't Express
      api.post('/api/probe', { preHandler: requireUser }, async (request) => ({ user: request.user?.username }));
    },
  });
}

describe('requireUser', () => {
  it('rejects a request without a session', async () => {
    const { app } = appWithProbe();
    const res = await app.inject({ method: 'POST', url: '/api/probe', payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('accepts a valid session cookie', async () => {
    const { app, db } = appWithProbe();
    const user = await addUser(db, 'admin', 'correct horse', 'admin');
    const { token } = createSession(db, user.id);
    const res = await app.inject({
      method: 'POST',
      url: '/api/probe',
      payload: {},
      cookies: { [SESSION_COOKIE]: token },
    });
    expect(res.json()).toEqual({ user: 'admin' });
  });

  it('treats an unknown or expired token as no session', async () => {
    const { app, db } = appWithProbe();
    const user = await addUser(db, 'admin', 'correct horse', 'admin');
    const { token } = createSession(db, user.id, new Date('2020-01-01T00:00:00Z'));
    for (const cookie of [token, 'not-a-real-token']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- two cheap sequential checks; order and isolation don't matter
      const res = await app.inject({
        method: 'POST',
        url: '/api/probe',
        payload: {},
        cookies: { [SESSION_COOKIE]: cookie },
      });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe('CSRF protection', () => {
  it('rejects a state-changing request from another origin, including Origin: null', async () => {
    const { app } = appWithProbe();
    for (const origin of ['http://evil.example', 'null']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- two cheap sequential checks; order and isolation don't matter
      const res = await app.inject({ method: 'POST', url: '/api/probe', payload: {}, headers: { origin } });
      expect(res.statusCode, origin).toBe(403);
      expect(res.json()).toEqual({ error: 'cross_origin' });
    }
  });

  it('allows same-origin requests and requests without an Origin header', async () => {
    const { app } = appWithProbe();
    const same = await app.inject({
      method: 'POST',
      url: '/api/probe',
      payload: {},
      headers: { host: 'localhost:5580', origin: 'http://localhost:5580' },
    });
    expect(same.statusCode).toBe(401); // reached the route; no session
    const none = await app.inject({ method: 'POST', url: '/api/probe', payload: {} });
    expect(none.statusCode).toBe(401);
  });

  it('refuses non-JSON bodies', async () => {
    const { app } = appWithProbe();
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- two cheap sequential checks; order and isolation don't matter
      const res = await app.inject({
        method: 'POST',
        url: '/api/probe',
        payload: 'a=b',
        headers: { 'content-type': contentType },
      });
      expect(res.statusCode, contentType).toBe(415);
    }
  });

  it('leaves GET requests from other origins alone', async () => {
    const { app } = appWithProbe();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'http://evil.example' } });
    expect(res.statusCode).toBe(200);
  });
});
