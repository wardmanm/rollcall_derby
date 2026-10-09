import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import { addUser, testApp } from '../testing.ts';
import { createPermissions, deny, type Access, type PermissionDef, type Principal } from './access.ts';
import { SESSION_COOKIE } from './guard.ts';
import { CORE_PERMISSIONS } from './permissions.ts';
import { createSession } from './sessions.ts';

const PRODUCER_THEMES: PermissionDef = { key: 'producer:themes.edit', summary: 'Edit themes', roles: ['producer'] };

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
async function startWith(register: (api: FastifyInstance) => void, defs = [...CORE_PERMISSIONS, PRODUCER_THEMES]) {
  const { app } = testApp({ permissions: createPermissions(defs), registerRoutes: register });
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
    await expect(startWith(routeAt('/api/forgetful'))).rejects.toThrow('GET /api/forgetful declares no access');
  });

  it('stop the server at startup when a public route gives no reason', async () => {
    await expect(startWith(routeAt('/api/open', { public: ' ' }))).rejects.toThrow(
      'GET /api/open is public but gives no reason',
    );
  });

  it('stop the server at startup when a permission is undeclared', async () => {
    await expect(startWith(routeAt('/api/typo', { permission: 'core:users.mange' }))).rejects.toThrow(
      "GET /api/typo needs core:users.mange, which core doesn't declare",
    );
  });

  it("stop the server at startup when a core route uses another app's permission", async () => {
    await expect(startWith(routeAt('/api/borrowed', { permission: 'producer:themes.edit' }))).rejects.toThrow(
      'GET /api/borrowed needs producer:themes.edit, but core may only use its own core:… permissions',
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
        '/api/probe/users',
        {
          config: { access: { permission: 'core:users.manage' } },
          // A route's own preValidation runs after the guard.
          preValidation: async () => void seen.push('route preValidation'),
        },
        async () => ({ ok: true }),
      );
      api.get('/api/probe/signed-in', { config: { access: { signedIn: true } } }, async () => ({ ok: true }));
    },
  });
  return { app, db, seen };
}

describe('the route guard', () => {
  it('refuses before the route sees the request, and lets a permitted caller through', async () => {
    const { app, db, seen } = appWithProbes();
    const probe = (cookies: Record<string, string>) =>
      app.inject({ method: 'POST', url: '/api/probe/users', payload: {}, cookies });
    expect((await probe({})).json()).toEqual({ error: 'unauthenticated' });
    expect((await probe(await cookieFor(db, 'p1', 'producer'))).json()).toEqual({ error: 'forbidden' });
    expect(seen).toEqual([]);
    expect((await probe(await cookieFor(db, 'admin', 'admin'))).statusCode).toBe(200);
    expect(seen).toEqual(['route preValidation']);
  });

  it('also guards the HEAD route Fastify adds for each GET route', async () => {
    const { app } = appWithProbes();
    expect((await app.inject({ method: 'HEAD', url: '/api/probe/signed-in' })).statusCode).toBe(401);
  });
});

describe('an /api route registered outside the /api plugin', () => {
  it('still needs a declaration', async () => {
    const { app } = testApp();
    // Registered straight on the app, the route is checked the moment it's added.
    expect(() => app.get('/api/outside', async () => ({}))).toThrow('GET /api/outside declares no access');
    await app.close();
  });

  it('refuses everyone, since only the /api plugin knows who is calling', async () => {
    const { app, db } = testApp();
    app.get('/api/outside', { config: { access: { signedIn: true } } }, async () => ({ ok: true }));
    const cookies = await cookieFor(db, 'admin', 'admin');
    expect((await app.inject({ method: 'GET', url: '/api/outside' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/outside', cookies })).statusCode).toBe(401);
  });
});
