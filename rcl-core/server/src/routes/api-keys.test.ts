import { describe, expect, it } from 'vitest';
import type { AppModule } from '@rollcall/app-sdk';
import { ApiKeySchema, CreateApiKeyResponseSchema, GrantablePermissionSchema } from '@rollcall/core-contract';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { addUser, testApp } from '../testing.ts';

// A hosted app with one permission an API key may hold and one only people may.
const DEMO_APP: AppModule = {
  id: 'demo',
  title: 'Demo',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [
    { key: 'demo:things.read', summary: 'Read things', roles: ['producer'] },
    { key: 'demo:secrets.read', summary: 'Read secrets', roles: [], peopleOnly: true },
  ],
};

async function asAdmin() {
  const { app, db } = testApp({ apps: [DEMO_APP] });
  const admin = await addUser(db, 'admin', 'correct horse', 'admin');
  const cookies = { [SESSION_COOKIE]: createSession(db, admin.id).token };
  const create = (payload: object) => app.inject({ method: 'POST', url: '/api/core/api-keys', cookies, payload });
  const list = async () =>
    ApiKeySchema.array().parse((await app.inject({ method: 'GET', url: '/api/core/api-keys', cookies })).json());
  return { app, db, cookies, create, list };
}

describe('/api/core/api-keys', () => {
  it('creates a key, shows it once, then lists it without the key', async () => {
    const { create, list } = await asAdmin();
    const res = await create({ name: ' Stream Deck ', permissions: ['demo:things.read'], expiresIn: '30d' });
    expect(res.statusCode).toBe(201);
    const { apiKey, key } = CreateApiKeyResponseSchema.parse(res.json());
    expect(key).toMatch(/^rcl_/);
    expect(apiKey).toMatchObject({ name: 'Stream Deck', permissions: ['demo:things.read'], createdBy: 'admin' });
    const listed = await list();
    expect(listed).toEqual([apiKey]);
    expect(JSON.stringify(listed)).not.toContain(key);
  });

  it('lists the permissions a key may hold, from every hosted app, and none that only people may', async () => {
    const { app, cookies } = await asAdmin();
    const res = await app.inject({ method: 'GET', url: '/api/core/api-keys/grantable', cookies });
    expect(GrantablePermissionSchema.array().parse(res.json())).toEqual([
      { key: 'core:teams.read', summary: 'View teams and their members' },
      { key: 'core:teams.manage', summary: 'Create, edit and delete teams, members, logos and photos' },
      { key: 'demo:things.read', summary: 'Read things' },
    ]);
  });

  it('refuses people-only and unknown permissions, saying which', async () => {
    const { create, list } = await asAdmin();
    const res = await create({
      name: 'Too much',
      permissions: ['demo:things.read', 'core:users.manage', 'demo:secrets.read', 'demo:nothing'],
      expiresIn: 'never',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'not_grantable',
      message: "An API key can't hold core:users.manage, demo:secrets.read, demo:nothing.",
    });
    expect(await list()).toEqual([]);
  });

  it('refuses a name already in use, and a bad name or expiry', async () => {
    const { create } = await asAdmin();
    expect((await create({ name: 'Companion', permissions: [], expiresIn: 'never' })).statusCode).toBe(201);
    expect((await create({ name: 'Companion', permissions: [], expiresIn: 'never' })).json()).toEqual({
      error: 'name_taken',
    });
    for (const payload of [
      { name: '', permissions: [], expiresIn: 'never' },
      { name: 'Laptop', permissions: [], expiresIn: '2d' },
    ]) {
      expect((await create(payload)).json(), JSON.stringify(payload)).toMatchObject({ error: 'validation_failed' });
    }
  });

  it('revokes a key, then says there is no such key', async () => {
    const { app, cookies, create, list } = await asAdmin();
    const { apiKey } = CreateApiKeyResponseSchema.parse(
      (await create({ name: 'Laptop', permissions: [], expiresIn: '1d' })).json(),
    );
    const revoke = () => app.inject({ method: 'DELETE', url: `/api/core/api-keys/${apiKey.id}`, cookies });
    expect((await revoke()).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect((await revoke()).json()).toEqual({ error: 'not_found' });
  });

  it('is for Admins only', async () => {
    const { app, db } = await asAdmin();
    const producer = await addUser(db, 'producer1', 'correct horse', 'producer');
    const cookies = { [SESSION_COOKIE]: createSession(db, producer.id).token };
    expect((await app.inject({ method: 'GET', url: '/api/core/api-keys', cookies })).json()).toEqual({
      error: 'forbidden',
    });
  });
});
