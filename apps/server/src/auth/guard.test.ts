import { describe, expect, it } from 'vitest';
import type { Role } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { createSession } from './sessions.ts';
import { requireRole, requireSession, requireUser, SESSION_COOKIE } from './guard.ts';
import { addUser, testApp } from '../testing.ts';

// A tiny protected route registered the same way real routes are.
function appWithProbe() {
  return testApp({
    registerRoutes: (api) => {
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
    const res = await app.inject({ method: 'GET', url: '/api/setup', headers: { origin: 'http://evil.example' } });
    expect(res.statusCode).toBe(200);
  });
});

// One probe per guard, registered the same way real routes are.
function appWithGuards() {
  return testApp({
    registerRoutes: (api) => {
      api.get('/api/probe/user', { preHandler: requireUser }, async () => ({ ok: true }));
      api.get('/api/probe/session', { preHandler: requireSession }, async () => ({ ok: true }));
      api.get('/api/probe/admin', { preHandler: requireRole('admin') }, async () => ({ ok: true }));
    },
  });
}

async function cookieFor(db: AppDatabase, username: string, role: Role, mustChangePassword = false) {
  const user = await addUser(db, username, 'correct horse', role, { mustChangePassword });
  return { [SESSION_COOKIE]: createSession(db, user.id).token };
}

describe('a pending password change', () => {
  it('is refused by requireUser and requireRole', async () => {
    const { app, db } = appWithGuards();
    const cookies = await cookieFor(db, 'admin', 'admin', true);
    for (const url of ['/api/probe/user', '/api/probe/admin']) {
      const res = await app.inject({ method: 'GET', url, cookies });
      expect(res.statusCode, url).toBe(403);
      expect(res.json()).toEqual({ error: 'password_change_required' });
    }
  });

  it('is let through by requireSession', async () => {
    const { app, db } = appWithGuards();
    const cookies = await cookieFor(db, 'admin', 'admin', true);
    expect((await app.inject({ method: 'GET', url: '/api/probe/session', cookies })).statusCode).toBe(200);
  });
});

describe('requireRole', () => {
  it('lets the named roles through and refuses the others', async () => {
    const { app, db } = appWithGuards();
    const probe = (cookies: Record<string, string>) => app.inject({ method: 'GET', url: '/api/probe/admin', cookies });
    expect((await probe(await cookieFor(db, 'admin', 'admin'))).statusCode).toBe(200);
    for (const role of ['producer', 'announcer'] as const) {
      const res = await probe(await cookieFor(db, role, role));
      expect(res.statusCode, role).toBe(403);
      expect(res.json()).toEqual({ error: 'forbidden' });
    }
    expect((await probe({})).json()).toEqual({ error: 'unauthenticated' });
  });
});
