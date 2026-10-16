import { describe, expect, it } from 'vitest';
import { ApiKeySchema, type ApiKeyExpiry } from '@rollcall/core-contract';
import { openMemoryDatabase } from '../db.ts';
import { apiKeyNameTaken, createApiKey, findApiKey, listApiKeys, revokeApiKey } from './api-keys.ts';

const NOW = new Date('2026-10-16T12:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

function withKey(expiresIn: ApiKeyExpiry = 'never', permissions: string[] = ['demo:things.read']) {
  const { db } = openMemoryDatabase();
  const created = createApiKey(db, { name: 'Stream Deck', permissions, expiresIn, createdBy: 'admin' }, NOW);
  return { db, ...created };
}

const expiry = (expiresIn: ApiKeyExpiry) => withKey(expiresIn).apiKey.expiresAt;

describe('API keys', () => {
  it('are rcl_ and 43 characters, shown once, with only their hash and first characters stored', () => {
    const { db, apiKey, key } = withKey();
    expect(key).toMatch(/^rcl_[\w-]{43}$/);
    expect(ApiKeySchema.parse(apiKey)).toEqual({
      id: apiKey.id,
      name: 'Stream Deck',
      prefix: key.slice(0, 8),
      permissions: ['demo:things.read'],
      createdAt: NOW.toISOString(),
      createdBy: 'admin',
      expiresAt: null,
      lastUsedAt: null,
    });
    const stored = JSON.stringify(db.$client.prepare('SELECT * FROM api_keys').all());
    expect(stored).not.toContain(key);
    expect(stored).not.toContain(key.slice(8));
  });

  it('expire after their chosen time, or never', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(expiry('never')).toBeNull();
    expect(expiry('1d')).toBe(new Date(NOW.getTime() + day).toISOString());
    expect(expiry('7d')).toBe(new Date(NOW.getTime() + 7 * day).toISOString());
    expect(expiry('30d')).toBe(new Date(NOW.getTime() + 30 * day).toISOString());
    expect(expiry('1y')).toBe(new Date(NOW.getTime() + 365 * day).toISOString());
  });

  it('are found by the key itself, with their permissions, until they expire', () => {
    const { db, apiKey, key } = withKey('1d');
    const holder = { id: apiKey.id, name: 'Stream Deck', permissions: ['demo:things.read'] };
    expect(findApiKey(db, key, NOW)).toEqual(holder);
    expect(findApiKey(db, key, minutes(24 * 60 - 1))).toEqual(holder);
    expect(findApiKey(db, key, minutes(24 * 60))).toBeNull();
    expect(findApiKey(db, `${key}x`, NOW)).toBeNull();
  });

  it('are gone once revoked', () => {
    const { db, apiKey, key } = withKey();
    expect(revokeApiKey(db, apiKey.id)).toBe(true);
    expect(findApiKey(db, key, NOW)).toBeNull();
    expect(revokeApiKey(db, apiKey.id)).toBe(false);
  });

  it('record when they were last used, at most once a minute', () => {
    const { db, key } = withKey();
    const lastUsed = () => listApiKeys(db)[0]?.lastUsedAt;
    findApiKey(db, key, NOW);
    expect(lastUsed()).toBe(NOW.toISOString());
    findApiKey(db, key, new Date(NOW.getTime() + 59_000));
    expect(lastUsed()).toBe(NOW.toISOString());
    findApiKey(db, key, minutes(1));
    expect(lastUsed()).toBe(minutes(1).toISOString());
  });

  it('are listed newest first, expired ones included, and keep their names unique', () => {
    const { db } = withKey('1d');
    createApiKey(db, { name: 'Companion', permissions: [], expiresIn: 'never', createdBy: 'admin' }, minutes(5));
    expect(listApiKeys(db).map((k) => k.name)).toEqual(['Companion', 'Stream Deck']);
    expect(apiKeyNameTaken(db, 'Companion')).toBe(true);
    expect(apiKeyNameTaken(db, 'companion')).toBe(false);
  });
});
