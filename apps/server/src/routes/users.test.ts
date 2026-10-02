import { describe, expect, it } from 'vitest';
import { CreateUserResponseSchema, PasswordResetResponseSchema, UserSchema, type Role } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { verifyPassword } from '../auth/passwords.ts';
import { createSession, findSession } from '../auth/sessions.ts';
import { countAdmins, findUserForLogin } from '../auth/users.ts';
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

describe('GET /api/users', () => {
  it('is for Admins only', async () => {
    const { app, db, admin } = await withAdmin();
    for (const role of ['producer', 'announcer'] as const) {
      const { cookies } = await signIn(db, `${role}1`, role);
      const res = await app.inject({ method: 'GET', url: '/api/users', cookies });
      expect(res.statusCode, role).toBe(403);
      expect(res.json()).toEqual({ error: 'forbidden' });
    }
    const res = await app.inject({ method: 'GET', url: '/api/users', cookies: admin.cookies });
    expect(res.statusCode).toBe(200);
    expect(
      UserSchema.array()
        .parse(res.json())
        .map((u) => u.username),
    ).toEqual(['admin', 'announcer1', 'producer1']);
  });
});

describe('POST /api/users', () => {
  it('creates a user with a temporary password that is shown once and must be changed', async () => {
    const { app, db, admin } = await withAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      cookies: admin.cookies,
      payload: { username: ' Producer1 ', role: 'producer' },
    });
    expect(res.statusCode).toBe(201);
    const { user, temporaryPassword } = CreateUserResponseSchema.parse(res.json());
    expect(user).toMatchObject({ username: 'producer1', role: 'producer', mustChangePassword: true });
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(await verifyPassword(temporaryPassword, findUserForLogin(db, 'producer1')?.passwordHash ?? '')).toBe(true);
    const list = await app.inject({ method: 'GET', url: '/api/users', cookies: admin.cookies });
    expect(list.body).not.toContain(temporaryPassword);
  });

  it('refuses a username that is taken, in any case', async () => {
    const { app, admin } = await withAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
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
      const res = await app.inject({ method: 'POST', url: '/api/users', cookies: admin.cookies, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'validation_failed' });
    }
  });
});

describe('PATCH /api/users/:id', () => {
  it('changes a role, effective from the very next request', async () => {
    const { app, db, admin } = await withAdmin();
    const second = await signIn(db, 'second', 'admin');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${second.user.id}`,
      cookies: admin.cookies,
      payload: { role: 'producer' },
    });
    expect(res.statusCode).toBe(200);
    expect(UserSchema.parse(res.json())).toMatchObject({ username: 'second', role: 'producer' });
    expect((await app.inject({ method: 'GET', url: '/api/users', cookies: second.cookies })).statusCode).toBe(403);
  });

  it('refuses to demote the last Admin', async () => {
    const { app, admin } = await withAdmin();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${admin.user.id}`,
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
      app.inject({ method: 'PATCH', url: `/api/users/${id}`, cookies, payload: { role: 'producer' } });
    const results = await Promise.all([demote(second.user.id, admin.cookies), demote(admin.user.id, second.cookies)]);
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(countAdmins(db)).toBe(1);
  });
});

describe('POST /api/users/:id/password-reset', () => {
  it('returns a new temporary password once, forces a change and signs the user out', async () => {
    const { app, db, admin } = await withAdmin();
    const producer = await signIn(db, 'producer1', 'producer');
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${producer.user.id}/password-reset`,
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

describe('POST /api/users/:id/sign-out', () => {
  it('signs the user out on every device, and nobody else', async () => {
    const { app, db, admin } = await withAdmin();
    const producer = await signIn(db, 'producer1', 'producer');
    const otherDevice = createSession(db, producer.user.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${producer.user.id}/sign-out`,
      cookies: admin.cookies,
    });
    expect(res.statusCode).toBe(204);
    expect(findSession(db, producer.token)).toBeNull();
    expect(findSession(db, otherDevice.token)).toBeNull();
    expect(findSession(db, admin.token)).not.toBeNull();
  });
});

describe('DELETE /api/users/:id', () => {
  it('deletes a user, whose session stops working at once', async () => {
    const { app, db, admin } = await withAdmin();
    const producer = await signIn(db, 'producer1', 'producer');
    const res = await app.inject({ method: 'DELETE', url: `/api/users/${producer.user.id}`, cookies: admin.cookies });
    expect(res.statusCode).toBe(204);
    expect(findUserForLogin(db, 'producer1')).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: producer.cookies })).statusCode).toBe(401);
  });

  it('refuses to delete the last Admin', async () => {
    const { app, admin } = await withAdmin();
    const res = await app.inject({ method: 'DELETE', url: `/api/users/${admin.user.id}`, cookies: admin.cookies });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'last_admin' });
  });

  it('refuses to delete yourself', async () => {
    const { app, db, admin } = await withAdmin();
    await signIn(db, 'second', 'admin');
    const res = await app.inject({ method: 'DELETE', url: `/api/users/${admin.user.id}`, cookies: admin.cookies });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'cannot_delete_self' });
  });

  it('keeps an Admin when two Admins delete each other at the same moment', async () => {
    const { app, db, admin } = await withAdmin();
    const second = await signIn(db, 'second', 'admin');
    const remove = (id: string, cookies: Record<string, string>) =>
      app.inject({ method: 'DELETE', url: `/api/users/${id}`, cookies });
    const results = await Promise.all([remove(second.user.id, admin.cookies), remove(admin.user.id, second.cookies)]);
    expect(results.filter((r) => r.statusCode === 204)).toHaveLength(1);
    expect(countAdmins(db)).toBe(1);
  });
});

describe('an unknown user id', () => {
  it('gets 404 everywhere', async () => {
    const { app, admin } = await withAdmin();
    for (const [method, url, payload] of [
      ['PATCH', `/api/users/${UNKNOWN_ID}`, { role: 'producer' }],
      ['POST', `/api/users/${UNKNOWN_ID}/password-reset`, undefined],
      ['POST', `/api/users/${UNKNOWN_ID}/sign-out`, undefined],
      ['DELETE', `/api/users/${UNKNOWN_ID}`, undefined],
    ] as const) {
      const res = await app.inject({ method, url, cookies: admin.cookies, payload });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    }
  });
});
