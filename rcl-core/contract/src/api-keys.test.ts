import { describe, expect, it } from 'vitest';
import { ApiKeySchema, CreateApiKeyRequestSchema, GrantablePermissionSchema } from './api-keys.ts';

const KEY = {
  id: 'k1',
  name: 'Stream Deck',
  prefix: 'rcl_abcd',
  permissions: ['demo:things.read'],
  createdAt: '2026-10-16T12:00:00.000Z',
  createdBy: 'admin',
  expiresAt: null,
  lastUsedAt: '2026-10-16T13:00:00.000Z',
};

describe('ApiKeySchema', () => {
  it('accepts a key as the server lists it, which never includes the key itself', () => {
    expect(ApiKeySchema.parse(KEY)).toEqual(KEY);
    expect(ApiKeySchema.safeParse({ ...KEY, key: 'rcl_secret' }).success).toBe(false);
  });
});

describe('CreateApiKeyRequestSchema', () => {
  it('trims the name, and allows a key with no permissions', () => {
    expect(CreateApiKeyRequestSchema.parse({ name: '  Companion ', permissions: [], expiresIn: 'never' })).toEqual({
      name: 'Companion',
      permissions: [],
      expiresIn: 'never',
    });
  });

  it('refuses an empty or overlong name, and an expiry that is not one of the presets', () => {
    for (const request of [
      { name: '   ', permissions: [], expiresIn: 'never' },
      { name: 'x'.repeat(65), permissions: [], expiresIn: 'never' },
      { name: 'Companion', permissions: [], expiresIn: '2d' },
    ]) {
      expect(CreateApiKeyRequestSchema.safeParse(request).success, JSON.stringify(request)).toBe(false);
    }
  });
});

describe('GrantablePermissionSchema', () => {
  it('is a permission and what it allows', () => {
    const permission = { key: 'demo:things.read', summary: 'Read things' };
    expect(GrantablePermissionSchema.parse(permission)).toEqual(permission);
    expect(GrantablePermissionSchema.safeParse({ ...permission, roles: [] }).success).toBe(false);
  });
});
