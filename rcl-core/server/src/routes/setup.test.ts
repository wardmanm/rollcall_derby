import { describe, expect, it } from 'vitest';
import { SessionUserSchema, SetupStatusSchema } from '@rollcall/core-contract';
import { countUsers } from '../auth/users.ts';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { testApp } from '../testing.ts';

const LAN = '192.168.1.50';
const admin = { username: 'Admin', password: 'correct horse' };

describe('GET /api/core/setup', () => {
  it('reports that setup is needed, and whether this machine may do it', async () => {
    const { app } = testApp();
    const here = await app.inject({ method: 'GET', url: '/api/core/setup' });
    expect(SetupStatusSchema.parse(here.json())).toEqual({ needsSetup: true, canSetupHere: true });
    const elsewhere = await app.inject({ method: 'GET', url: '/api/core/setup', remoteAddress: LAN });
    expect(elsewhere.json()).toEqual({ needsSetup: true, canSetupHere: false });
  });
});

describe('POST /api/core/setup', () => {
  it('creates the first Admin from the server machine and logs them in', async () => {
    const { app } = testApp();
    const res = await app.inject({ method: 'POST', url: '/api/core/setup', payload: admin });
    expect(res.statusCode).toBe(201);
    expect(SessionUserSchema.parse(res.json())).toMatchObject({
      username: 'admin',
      role: 'admin',
      mustChangePassword: false,
    });
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect((await app.inject({ method: 'GET', url: '/api/core/setup' })).json()).toMatchObject({ needsSetup: false });
  });

  it('refuses other machines on the network', async () => {
    const { app, db } = testApp();
    const res = await app.inject({ method: 'POST', url: '/api/core/setup', payload: admin, remoteAddress: LAN });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'setup_not_allowed' });
    expect(countUsers(db)).toBe(0);
  });

  it('refuses once any user exists', async () => {
    const { app } = testApp();
    await app.inject({ method: 'POST', url: '/api/core/setup', payload: admin });
    const again = await app.inject({
      method: 'POST',
      url: '/api/core/setup',
      payload: { ...admin, username: 'second' },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'already_set_up' });
  });

  it('creates exactly one Admin when two setups race', async () => {
    const { app, db } = testApp();
    const results = await Promise.all([
      app.inject({ method: 'POST', url: '/api/core/setup', payload: admin }),
      app.inject({ method: 'POST', url: '/api/core/setup', payload: { ...admin, username: 'other' } }),
    ]);
    expect(results.map((r) => r.statusCode).toSorted((a, b) => a - b)).toEqual([201, 409]);
    expect(countUsers(db)).toBe(1);
  });

  it('validates the username and password, saying what is wrong in words a person can act on', async () => {
    const { app } = testApp();
    for (const [payload, message] of [
      [{ username: 'ab', password: 'correct horse' }, 'Use 3–32 letters, digits, dots, dashes or underscores'],
      [{ username: 'admin', password: 'short' }, 'Use at least 10 characters'],
      [{ username: 'admin', password: 'x'.repeat(300) }, 'Use at most 256 characters'],
      [{ username: 'producer01', password: 'Producer01' }, 'The password must not be the username'],
    ] as const) {
      const res = await app.inject({ method: 'POST', url: '/api/core/setup', payload });
      expect(res.statusCode, message).toBe(400);
      expect(res.json(), message).toEqual({ error: 'validation_failed', message });
    }
  });

  it('allows 10 attempts a minute per address', async () => {
    const { app } = testApp();
    const attempt = () =>
      app.inject({ method: 'POST', url: '/api/core/setup', payload: { username: 'x', password: 'y' } });
    for (let i = 0; i < 10; i++) expect((await attempt()).statusCode).toBe(400);
    expect((await attempt()).statusCode).toBe(429);
  });

  it('refuses a request from this machine that arrives under another name', async () => {
    // A web page whose domain is rebound to 127.0.0.1 would arrive like this, in the server machine's browser.
    const { app, db } = testApp();
    const headers = { host: 'rebind.evil.example:5580', origin: 'http://rebind.evil.example:5580' };
    const status = await app.inject({ method: 'GET', url: '/api/core/setup', headers });
    expect(status.json()).toEqual({ needsSetup: true, canSetupHere: false });
    const res = await app.inject({ method: 'POST', url: '/api/core/setup', payload: admin, headers });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'setup_not_allowed' });
    expect(countUsers(db)).toBe(0);
  });

  it('accepts the loopback names localhost, 127.0.0.1 and [::1]', async () => {
    for (const host of ['localhost:5580', '127.0.0.1:5580', '[::1]:5580']) {
      const { app } = testApp();
      const res = await app.inject({ method: 'GET', url: '/api/core/setup', headers: { host } });
      expect(res.json(), host).toEqual({ needsSetup: true, canSetupHere: true });
    }
  });

  it('refuses another machine before looking at the body', async () => {
    const { app } = testApp();
    const res = await app.inject({ method: 'POST', url: '/api/core/setup', payload: {}, remoteAddress: LAN });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'setup_not_allowed' });
  });

  it('refuses once set up before looking at the body', async () => {
    const { app } = testApp();
    await app.inject({ method: 'POST', url: '/api/core/setup', payload: admin });
    const res = await app.inject({ method: 'POST', url: '/api/core/setup', payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'already_set_up' });
  });
});
