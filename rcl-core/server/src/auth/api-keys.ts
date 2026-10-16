import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { ApiKey, ApiKeyExpiry } from '@rollcall/core-contract';
import type { Queryable } from '../db.ts';
import { apiKeys } from '../db/schema.ts';
import { hashToken, newToken } from './tokens.ts';

// API keys for devices and scripts (ADR-0020): `rcl_` and 32 random bytes, shown once and stored only as a hash.

export const API_KEY_PREFIX = 'rcl_';
// The characters kept to tell keys apart: `rcl_` and the first 4 of the secret.
const SHOWN_LENGTH = 8;
const LAST_USED_RESOLUTION_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIFETIMES: Record<ApiKeyExpiry, number | null> = {
  never: null,
  '1d': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '1y': 365 * DAY_MS,
};

/** What a request made with a key may do: its own permissions, and nothing else. */
export interface ApiKeyHolder {
  id: string;
  name: string;
  permissions: readonly string[];
}

const toApiKey = (row: typeof apiKeys.$inferSelect): ApiKey => ({
  id: row.id,
  name: row.name,
  prefix: row.tokenPrefix,
  permissions: row.permissions,
  createdAt: row.createdAt,
  createdBy: row.createdBy,
  expiresAt: row.expiresAt,
  lastUsedAt: row.lastUsedAt,
});

/** Creates a key. The key itself is in this reply only; the database keeps its hash. */
export function createApiKey(
  db: Queryable,
  input: { name: string; permissions: readonly string[]; expiresIn: ApiKeyExpiry; createdBy: string },
  now = new Date(),
): { apiKey: ApiKey; key: string } {
  const key = `${API_KEY_PREFIX}${newToken()}`;
  const lifetime = LIFETIMES[input.expiresIn];
  const row = {
    id: randomUUID(),
    name: input.name,
    tokenHash: hashToken(key),
    tokenPrefix: key.slice(0, SHOWN_LENGTH),
    permissions: [...input.permissions],
    createdAt: now.toISOString(),
    createdBy: input.createdBy,
    expiresAt: lifetime === null ? null : new Date(now.getTime() + lifetime).toISOString(),
    lastUsedAt: null,
  };
  db.insert(apiKeys).values(row).run();
  return { apiKey: toApiKey(row), key };
}

/** Every key, newest first, expired ones included. */
export function listApiKeys(db: Queryable): ApiKey[] {
  return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)).all().map(toApiKey);
}

export function apiKeyNameTaken(db: Queryable, name: string): boolean {
  return db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.name, name)).get() !== undefined;
}

/** Deletes a key; false if there was none. Devices and scripts using it are refused from the next request. */
export function revokeApiKey(db: Queryable, id: string): boolean {
  return db.delete(apiKeys).where(eq(apiKeys.id, id)).run().changes > 0;
}

/** The key `key` names, unless it's unknown or expired. Records its use, at most once a minute. */
export function findApiKey(db: Queryable, key: string, now = new Date()): ApiKeyHolder | null {
  const row = db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.tokenHash, hashToken(key)))
    .get();
  if (!row || (row.expiresAt !== null && Date.parse(row.expiresAt) <= now.getTime())) return null;
  if (row.lastUsedAt === null || now.getTime() - Date.parse(row.lastUsedAt) >= LAST_USED_RESOLUTION_MS) {
    db.update(apiKeys).set({ lastUsedAt: now.toISOString() }).where(eq(apiKeys.id, row.id)).run();
  }
  return { id: row.id, name: row.name, permissions: row.permissions };
}
