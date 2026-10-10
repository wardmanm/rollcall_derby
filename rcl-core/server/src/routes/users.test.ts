import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CreateUserResponseSchema, PasswordResetResponseSchema, UserSchema, type Role } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { verifyPassword } from '../auth/passwords.ts';
import { createSession, findSession } from '../auth/sessions.ts';
import { countAdmins, deleteUser, findUserForLogin, setRole } from '../auth/users.ts';
import { addUser, testApp } from '../testing.ts';

const PASSWORD = 'correct horse';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

async function signIn(db: AppDatabase, username: string, role: Role) {
  const user = await addUser(db, username, PASSWORD, role);
  const { token } = createSession(db, user.id);
  return { user, token, cookies: { [SESSION_COOKIE]: token } };
}

async function withAdmin() {
  const { app, db } = testApp();
  return { app, db, admin: await signIn(db, 'admin', 'admin') };
}

describe('GET /api/core/users', () => {
  it('is for Admins only', async () => {
    const { app, db, admin } = await withAdmin();
    for (const role of ['producer', 'announcer'] as const) {
      const { cookies } = await signIn(db, `${role}1`, role);
      const res = await app.inject({ method: 'GET', url: '/api/core/users', cookies });
      expect(res.statusCode, role).toBe(403);
      expect(res.json()).toEqual({ error: 'forbidden' });
    }
    const res = await app.inject({ method: 'GET', url: '/api/core/users', cookies: admin.cookies });
    expect(res.statusCode).toBe(200);
    expect(
      UserSchema.array()
        .parse(res.json())
        .map((u) => u.username),
    ).toEqual(['admin', 'announcer1', 'producer1']);
  });
});

describe('POST /api/core/users', () => {
  it('creates a user with a temporary password that is shown once and must be changed', async () => {
    const { app, db, admin } = await withAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/api/core/users',
      cookies: admin.cookies,
      payload: { username: ' Producer1 ', role: 'producer' },
    });
    expect(res.statusCode).toBe(201);
    const { user, temporaryPassword } = CreateUserResponseSchema.parse(res.json());
    expect(user).toMatchObject({ username: 'producer1', role: 'producer', mustChangePassword: true });
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(await verifyPassword(temporaryPassword, findUserForLogin(db, 'producer1')?.passwordHash ?? '')).toBe(true);
    const list = await app.inject({ method: 'GET', url: '/api/core/users', cookies: admin.cookies });
    expect(list.body).not.toContain(temporaryPassword);
  });

  it('refuses a username that is taken, in any case', async () => {
    const { app, admin } = await withAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/api/core/users',
      cookies: admin.cookies,
      payload: { username: 'ADMIN', role: 'producer' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'username_taken' });
  });

  it('validates the username and role', async () => {
    const { app, admin } = await withAdmin();
    for (const payload of [
      { username: 'ab', role: 'producer' },
      { username: 'producer1', role: 'owner' },
      { username: 'producer1' },
    ]) {
      const res = await app.inject({ method: 'POST', url: '/api/core/users', cookies: admin.cookies, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'validation_failed' });
    }
  });

  it('refuses a non-Admin before looking at the body', async () => {
    const { app, db } = await withAdmin();
    const { cookies } = await signIn(db, 'producer1', 'producer');
    const res = await app.inject({ method: 'POST', url: '/api/core/users', cookies, payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
  });
});

describe('PATCH /api/core/users/:id', () => {
  it('changes a role, effective from the very next request', async () => {
    const { app, db, admin } = await withAdmin();
    const second = await signIn(db, 'second', 'admin');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/core/users/${second.user.id}`,
      cookies: admin.cookies,
      payload: { role: 'producer' },
    });
    expect(res.statusCode).toBe(200);
    expect(UserSchema.parse(res.json())).toMatchObject({ username: 'second', role: 'producer' });
    expect((await app.inject({ method: 'GET', url: '/api/core/users', cookies: second.cookies })).statusCode).toBe(403);
  });

  it('refuses to demote the last Admin', async () => {
    const { app, admin } = await withAdmin();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/core/users/${admin.user.id}`,
      cookies: admin.cookies,
      payload: { role: 'producer' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'last_admin' });
  });

  it('keeps an Admin when two Admins demote each other at the same moment', async () => {
    const { app, db, admin } = await withAdmin();
    const second = await signIn(db, 'second', 'admin');
    const demote = (id: string, cookies: Record<string, string>) =>
      app.inject({ method: 'PATCH', url: `/api/core/users/${id}`, cookies, payload: { role: 'producer' } });
    const results = await Promise.all([demote(second.user.id, admin.cookies), demote(admin.user.id, second.cookies)]);
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(countAdmins(db)).toBe(1);
  });
});

describe('POST /api/core/users/:id/password-reset', () => {
  it('returns a new temporary password once, forces a change and signs the user out', async () => {
    const { app, db, admin } = await withAdmin();
    const producer = await signIn(db, 'producer1', 'producer');
    const res = await app.inject({
      method: 'POST',
      url: `/api/core/users/${producer.user.id}/password-reset`,
      cookies: admin.cookies,
    });
    expect(res.statusCode).toBe(200);
    const { temporaryPassword } = PasswordResetResponseSchema.parse(res.json());
    const stored = findUserForLogin(db, 'producer1');
    expect(stored?.mustChangePassword).toBe(true);
    expect(await verifyPassword(temporaryPassword, stored?.passwordHash ?? '')).toBe(true);
    expect(await verifyPassword(PASSWORD, stored?.passwordHash ?? '')).toBe(false);
    expect(findSession(db, producer.token)).toBeNull();
  });
});

describe('POST /api/core/users/:id/sign-out', () => {
  it('signs the user out on every device, and nobody else', async () => {
    const { app, db, admin } = await withAdmin();
    const producer = await signIn(db, 'producer1', 'producer');
    const otherDevice = createSession(db, producer.user.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/core/users/${producer.user.id}/sign-out`,
      cookies: admin.cookies,
    });
    expect(res.statusCode).toBe(204);
    expect(findSession(db, producer.token)).toBeNull();
    expect(findSession(db, otherDevice.token)).toBeNull();
    expect(findSession(db, admin.token)).not.toBeNull();
  });
});

describe('DELETE /api/core/users/:id', () => {
  it('deletes a user, whose session stops working at once', async () => {
    const { app, db, admin } = await withAdmin();
    const producer = await signIn(db, 'producer1', 'producer');
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/core/users/${producer.user.id}`,
      cookies: admin.cookies,
    });
    expect(res.statusCode).toBe(204);
    expect(findUserForLogin(db, 'producer1')).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/core/auth/me', cookies: producer.cookies })).statusCode).toBe(
      401,
    );
  });

  it('refuses to delete the last Admin', async () => {
    const { app, admin } = await withAdmin();
    const res = await app.inject({ method: 'DELETE', url: `/api/core/users/${admin.user.id}`, cookies: admin.cookies });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'last_admin' });
  });

  it('refuses to delete yourself', async () => {
    const { app, db, admin } = await withAdmin();
    await signIn(db, 'second', 'admin');
    const res = await app.inject({ method: 'DELETE', url: `/api/core/users/${admin.user.id}`, cookies: admin.cookies });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'cannot_delete_self' });
  });

  it('keeps an Admin when two Admins delete each other at the same moment', async () => {
    const { app, db, admin } = await withAdmin();
    const second = await signIn(db, 'second', 'admin');
    const remove = (id: string, cookies: Record<string, string>) =>
      app.inject({ method: 'DELETE', url: `/api/core/users/${id}`, cookies });
    const results = await Promise.all([remove(second.user.id, admin.cookies), remove(admin.user.id, second.cookies)]);
    expect(results.filter((r) => r.statusCode === 204)).toHaveLength(1);
    expect(countAdmins(db)).toBe(1);
  });
});

describe('an unknown user id', () => {
  it('gets 404 everywhere', async () => {
    const { app, admin } = await withAdmin();
    for (const [method, url, payload] of [
      ['PATCH', `/api/core/users/${UNKNOWN_ID}`, { role: 'producer' }],
      ['POST', `/api/core/users/${UNKNOWN_ID}/password-reset`, undefined],
      ['POST', `/api/core/users/${UNKNOWN_ID}/sign-out`, undefined],
      ['DELETE', `/api/core/users/${UNKNOWN_ID}`, undefined],
    ] as const) {
      const res = await app.inject({ method, url, cookies: admin.cookies, payload });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    }
  });
});

// Runs `change` after the route has checked the caller and before its handler starts: the same window as the
// handler's own await while it hashes a password.
function afterAccessCheck(app: FastifyInstance, route: string, change: () => void) {
  app.addHook('preHandler', async (request) => {
    if (request.routeOptions.url === route) change();
  });
}

const createProducer = (app: FastifyInstance, cookies: Record<string, string>) =>
  app.inject({ method: 'POST', url: '/api/core/users', cookies, payload: { username: 'producer1', role: 'producer' } });

describe('an Admin who loses access while a password is hashing', () => {
  it('creates no user once demoted', async () => {
    const { app, db, admin } = await withAdmin();
    afterAccessCheck(app, '/api/core/users', () => setRole(db, admin.user.id, 'producer'));
    const res = await createProducer(app, admin.cookies);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    expect(findUserForLogin(db, 'producer1')).toBeNull();
  });

  it('creates no user once deleted', async () => {
    const { app, db, admin } = await withAdmin();
    afterAccessCheck(app, '/api/core/users', () => deleteUser(db, admin.user.id));
    const res = await createProducer(app, admin.cookies);
    expect(res.statusCode).toBe(401);
    expect(findUserForLogin(db, 'producer1')).toBeNull();
  });

  it('resets no password once demoted', async () => {
    const { app, db, admin } = await withAdmin();
    const producer = await signIn(db, 'producer1', 'producer');
    afterAccessCheck(app, '/api/core/users/:id/password-reset', () => setRole(db, admin.user.id, 'producer'));
    const res = await app.inject({
      method: 'POST',
      url: `/api/core/users/${producer.user.id}/password-reset`,
      cookies: admin.cookies,
    });
    expect(res.statusCode).toBe(403);
    expect(await verifyPassword(PASSWORD, findUserForLogin(db, 'producer1')?.passwordHash ?? '')).toBe(true);
    expect(findSession(db, producer.token)).not.toBeNull();
  });
});
