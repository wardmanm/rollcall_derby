import { describe, expect, it } from 'vitest';
import { SessionUserSchema } from '@obs-producer/shared';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { SESSION_LIFETIME_MS } from '../auth/sessions.ts';
import { addUser, testApp } from '../testing.ts';

const PASSWORD = 'correct horse';

async function withAdmin() {
  const { app, db } = testApp();
  await addUser(db, 'admin', PASSWORD, 'admin');
  return { app, db };
}

const login = (app: ReturnType<typeof testApp>['app'], username: string, password: string) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });

const sessionCookie = (res: Awaited<ReturnType<typeof login>>) =>
  res.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '';

describe('POST /api/auth/login', () => {
  it('logs in, ignoring username case and spaces, with a 30-day HttpOnly cookie', async () => {
    const { app } = await withAdmin();
    const res = await login(app, ' ADMIN ', PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(SessionUserSchema.parse(res.json())).toMatchObject({ username: 'admin', role: 'admin' });
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.secure).toBeFalsy();
    expect(Math.abs((cookie?.maxAge ?? 0) - SESSION_LIFETIME_MS / 1000)).toBeLessThanOrEqual(2);
  });

  it('gives the same answer for a wrong password, an unknown user and a malformed body', async () => {
    const { app } = await withAdmin();
    const responses = [
      await login(app, 'admin', 'wrong password'),
      await login(app, 'nobody', PASSWORD),
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: { user: 'admin' } }),
      await login(app, 'admin', 'x'.repeat(300)),
    ];
    for (const res of responses) {
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'invalid_credentials' });
      expect(res.cookies).toEqual([]);
    }
  });

  it('spends about as long on an unknown user as on a wrong password', async () => {
    const { app } = await withAdmin();
    const time = async (username: string) => {
      const start = performance.now();
      await login(app, username, 'wrong password');
      return performance.now() - start;
    };
    const fastest = async (username: string) =>
      Math.min(await time(username), await time(username), await time(username));
    const known = await fastest('admin');
    const unknown = await fastest('nobody');
    expect(unknown).toBeGreaterThan(known * 0.5); // without the dummy hash it would be ~0.05×
  });

  it('allows 10 attempts a minute per address', async () => {
    const { app } = await withAdmin();
    for (let i = 0; i < 10; i++) expect((await login(app, 'admin', 'wrong password')).statusCode).toBe(401);
    expect((await login(app, 'admin', PASSWORD)).statusCode).toBe(429);
  });
});

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  it('returns the current user, and stops working after logout', async () => {
    const { app } = await withAdmin();
    const token = sessionCookie(await login(app, 'admin', PASSWORD));
    const cookies = { [SESSION_COOKIE]: token };
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies });
    expect(me.json()).toMatchObject({ username: 'admin', mustChangePassword: false });

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies });
    expect(out.statusCode).toBe(204);
    expect(out.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies })).statusCode).toBe(401);
  });

  it('requires a session', async () => {
    const { app } = await withAdmin();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).json()).toEqual({ error: 'unauthenticated' });
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout' })).statusCode).toBe(401);
  });
});

describe('POST /api/auth/password', () => {
  it('changes the password, keeps this session and signs out the others', async () => {
    const { app } = await withAdmin();
    const here = sessionCookie(await login(app, 'admin', PASSWORD));
    const elsewhere = sessionCookie(await login(app, 'admin', PASSWORD));
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      cookies: { [SESSION_COOKIE]: here },
      payload: { currentPassword: PASSWORD, newPassword: 'battery staple' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ mustChangePassword: false });
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: here } })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: elsewhere } })).statusCode,
    ).toBe(401);
    expect((await login(app, 'admin', PASSWORD)).statusCode).toBe(401);
    expect((await login(app, 'admin', 'battery staple')).statusCode).toBe(200);
  });

  it('clears the must-change flag', async () => {
    const { app, db } = testApp();
    await addUser(db, 'p1', PASSWORD, 'producer', { mustChangePassword: true });
    const token = sessionCookie(await login(app, 'p1', PASSWORD));
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      cookies: { [SESSION_COOKIE]: token },
      payload: { currentPassword: PASSWORD, newPassword: 'battery staple' },
    });
    expect(res.json()).toMatchObject({ mustChangePassword: false });
  });

  it('rejects a wrong current password and a weak new one', async () => {
    const { app } = await withAdmin();
    const cookies = { [SESSION_COOKIE]: sessionCookie(await login(app, 'admin', PASSWORD)) };
    const change = (currentPassword: string, newPassword: string) =>
      app.inject({ method: 'POST', url: '/api/auth/password', cookies, payload: { currentPassword, newPassword } });
    expect((await change('nope', 'battery staple')).json()).toEqual({ error: 'wrong_password' });
    expect((await change(PASSWORD, 'short')).json()).toMatchObject({ error: 'validation_failed' });
  });

  it('rejects a new password equal to the username, ignoring case', async () => {
    const { app, db } = testApp();
    await addUser(db, 'producer01', PASSWORD, 'producer');
    const cookies = { [SESSION_COOKIE]: sessionCookie(await login(app, 'producer01', PASSWORD)) };
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      cookies,
      payload: { currentPassword: PASSWORD, newPassword: 'PRODUCER01' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });

  it('allows 10 attempts a minute per address', async () => {
    const { app } = await withAdmin();
    const cookies = { [SESSION_COOKIE]: sessionCookie(await login(app, 'admin', PASSWORD)) };
    const change = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/password',
        cookies,
        payload: { currentPassword: 'nope', newPassword: 'battery staple' },
      });
    for (let i = 0; i < 10; i++) expect((await change()).statusCode).toBe(400);
    expect((await change()).statusCode).toBe(429);
  });
});
