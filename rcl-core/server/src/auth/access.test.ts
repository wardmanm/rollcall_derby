import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AppModule } from '@rollcall/app-sdk';
import type { Role } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import { addUser, testApp } from '../testing.ts';
import { createPermissions, deny, type Access, type PermissionDef, type Principal } from './access.ts';
import { SESSION_COOKIE } from './guard.ts';
import { CORE_PERMISSIONS } from './permissions.ts';
import { createSession } from './sessions.ts';

const PRODUCER_THEMES: PermissionDef = { key: 'producer:themes.edit', summary: 'Edit themes', roles: ['producer'] };

// A hosted app with only a permission, so core routes can try to borrow it.
const PRODUCER_APP: AppModule = {
  id: 'producer',
  title: 'Producer',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [PRODUCER_THEMES],
};

describe('createPermissions', () => {
  it('grants Admin every declared permission, and other roles only those that list them', () => {
    const permissions = createPermissions([
      { key: 'core:users.manage', summary: 'Manage users', roles: [] },
      { key: 'core:teams.edit', summary: 'Edit teams', roles: ['producer'] },
    ]);
    expect(permissions.granted('admin', 'core:users.manage')).toBe(true);
    expect(permissions.granted('producer', 'core:teams.edit')).toBe(true);
    expect(permissions.granted('producer', 'core:users.manage')).toBe(false);
    expect(permissions.granted('announcer', 'core:teams.edit')).toBe(false);
    expect(permissions.granted('admin', 'core:undeclared')).toBe(false);
  });

  it('refuses a permission declared twice, or one that is not app:action in lowercase', () => {
    const def: PermissionDef = { key: 'core:users.manage', summary: 'x', roles: [] };
    expect(() => createPermissions([def, def])).toThrow('Permission core:users.manage is declared twice');
    for (const key of ['users.manage', 'Core:users', 'core:', ':users'] as const) {
      // @ts-expect-error -- deliberately malformed keys; only some of them fail the type check
      expect(() => createPermissions([{ key, summary: 'x', roles: [] }]), key).toThrow('must look like app:action');
    }
  });
});

const session = (role: Role, mustChangePassword = false): Principal => ({
  kind: 'session',
  token: 't',
  user: { id: 'u', username: 'u', role, mustChangePassword },
});

describe('deny', () => {
  const permissions = createPermissions(CORE_PERMISSIONS);
  const manageUsers: Access = { permission: 'core:users.manage' };

  it('lets anyone use a public declaration', () => {
    expect(deny({ public: 'why' }, null, permissions)).toBeUndefined();
  });

  it('checks in order: signed in, then no pending password change, then the permission', () => {
    expect(deny(manageUsers, null, permissions)).toEqual({ status: 401, error: 'unauthenticated' });
    expect(deny(manageUsers, session('producer', true), permissions)).toEqual({
      status: 403,
      error: 'password_change_required',
    });
    expect(deny(manageUsers, session('producer'), permissions)).toEqual({ status: 403, error: 'forbidden' });
    expect(deny(manageUsers, session('admin'), permissions)).toBeUndefined();
  });

  it('lets a pending password change through only where the declaration allows it', () => {
    const pending = session('announcer', true);
    expect(deny({ signedIn: true }, pending, permissions)).toMatchObject({ error: 'password_change_required' });
    expect(deny({ signedIn: true, allowPendingPasswordChange: true }, pending, permissions)).toBeUndefined();
  });
});

// Builds an app with one extra route and waits for it to start, which is when declarations are checked.
async function startWith(register: (api: FastifyInstance) => void) {
  const { app } = testApp({ apps: [PRODUCER_APP], registerRoutes: register });
  try {
    await app.ready();
  } finally {
    await app.close();
  }
}

// A route at `url` declaring `access`, or nothing at all.
const routeAt = (url: string, access?: Access) => (api: FastifyInstance) => {
  api.get(url, access ? { config: { access } } : {}, async () => ({}));
};

describe('route access declarations', () => {
  it('stop the server at startup when a route has none', async () => {
    await expect(startWith(routeAt('/api/core/forgetful'))).rejects.toThrow(
      'GET /api/core/forgetful declares no access',
    );
  });

  it('stop the server at startup when a public route gives no reason', async () => {
    await expect(startWith(routeAt('/api/core/open', { public: ' ' }))).rejects.toThrow(
      'GET /api/core/open is public but gives no reason',
    );
  });

  it('stop the server at startup when a permission is undeclared', async () => {
    await expect(startWith(routeAt('/api/core/typo', { permission: 'core:users.mange' }))).rejects.toThrow(
      "GET /api/core/typo needs core:users.mange, which core doesn't declare",
    );
  });

  it("stop the server at startup when a core route uses another app's permission", async () => {
    await expect(startWith(routeAt('/api/core/borrowed', { permission: 'producer:themes.edit' }))).rejects.toThrow(
      'GET /api/core/borrowed needs producer:themes.edit, but core may only use its own core:… permissions',
    );
  });

  it("stop the server at startup when a route isn't below a hosted app's /api/<id>/", async () => {
    await expect(startWith(routeAt('/api/nobody/things', { signedIn: true }))).rejects.toThrow(
      "GET /api/nobody/things isn't below /api/<id>/ for a hosted app (core, producer)",
    );
  });

  it('leave routes outside /api alone', async () => {
    await expect(startWith(routeAt('/not-api'))).resolves.toBeUndefined();
  });
});

async function cookieFor(db: AppDatabase, username: string, role: Role, mustChangePassword = false) {
  const user = await addUser(db, username, 'correct horse', role, { mustChangePassword });
  return { [SESSION_COOKIE]: createSession(db, user.id).token };
}

// Two probe routes; `seen` records when the users probe's own preValidation hook runs.
function appWithProbes() {
  const seen: string[] = [];
  const { app, db } = testApp({
    registerRoutes: (api) => {
      api.post(
        '/api/core/probe/users',
        {
          config: { access: { permission: 'core:users.manage' } },
          // A route's own preValidation runs after the guard.
          preValidation: async () => void seen.push('route preValidation'),
        },
        async () => ({ ok: true }),
      );
      api.get('/api/core/probe/signed-in', { config: { access: { signedIn: true } } }, async () => ({ ok: true }));
    },
  });
  return { app, db, seen };
}

describe('the route guard', () => {
  it('refuses before the route sees the request, and lets a permitted caller through', async () => {
    const { app, db, seen } = appWithProbes();
    const probe = (cookies: Record<string, string>) =>
      app.inject({ method: 'POST', url: '/api/core/probe/users', payload: {}, cookies });
    expect((await probe({})).json()).toEqual({ error: 'unauthenticated' });
    expect((await probe(await cookieFor(db, 'p1', 'producer'))).json()).toEqual({ error: 'forbidden' });
    expect(seen).toEqual([]);
    expect((await probe(await cookieFor(db, 'admin', 'admin'))).statusCode).toBe(200);
    expect(seen).toEqual(['route preValidation']);
  });

  it('also guards the HEAD route Fastify adds for each GET route', async () => {
    const { app } = appWithProbes();
    expect((await app.inject({ method: 'HEAD', url: '/api/core/probe/signed-in' })).statusCode).toBe(401);
  });
});

describe('an /api route registered outside the /api plugin', () => {
  it('still needs a declaration', async () => {
    const { app } = testApp();
    // Registered straight on the app, the route is checked the moment it's added.
    expect(() => app.get('/api/core/outside', async () => ({}))).toThrow('GET /api/core/outside declares no access');
    await app.close();
  });

  it('refuses everyone, since only the /api plugin knows who is calling', async () => {
    const { app, db } = testApp();
    app.get('/api/core/outside', { config: { access: { signedIn: true } } }, async () => ({ ok: true }));
    const cookies = await cookieFor(db, 'admin', 'admin');
    expect((await app.inject({ method: 'GET', url: '/api/core/outside' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/core/outside', cookies })).statusCode).toBe(401);
  });
});

// A hosted app with one route that only Producers may use (ADR-0019).
const DEMO_APP: AppModule = {
  id: 'demo',
  title: 'Demo',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [{ key: 'demo:things.edit', summary: 'Edit things', roles: ['producer'] }],
  register(api) {
    api.post('/things', { config: { access: { permission: 'demo:things.edit' } } }, async () => ({ ok: true }));
  },
};

describe("a hosted app's routes", () => {
  it("get the same cross-site check, caller lookup and guard as core's", async () => {
    const { app, db } = testApp({ apps: [DEMO_APP] });
    const post = (cookies: Record<string, string>, headers: Record<string, string> = {}) =>
      app.inject({ method: 'POST', url: '/api/demo/things', payload: {}, cookies, headers });
    const producer = await cookieFor(db, 'p1', 'producer');
    expect((await post({})).json()).toEqual({ error: 'unauthenticated' });
    expect((await post(producer, { origin: 'http://evil.example' })).json()).toEqual({ error: 'cross_origin' });
    expect((await post(await cookieFor(db, 'a1', 'announcer'))).json()).toEqual({ error: 'forbidden' });
    expect((await post(producer)).json()).toEqual({ ok: true });
  });
});
