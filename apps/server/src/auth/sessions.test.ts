import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openMemoryDatabase } from '../db.ts';
import { sessions } from '../db/schema.ts';
import {
  SESSION_LIFETIME_MS,
  createSession,
  findSession,
  purgeExpiredSessions,
  revokeSession,
  revokeUserSessions,
} from './sessions.ts';
import { createUser } from './users.ts';

function setup() {
  const { db } = openMemoryDatabase();
  const user = createUser(db, { username: 'admin', passwordHash: 'h', role: 'admin' });
  return { db, user };
}

describe('sessions', () => {
  it('issue a 32-byte base64url token and store only its SHA-256', () => {
    const { db, user } = setup();
    const { token } = createSession(db, user.id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = db.select().from(sessions).all();
    expect(row?.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('last 30 days from creation, not from use', () => {
    const { db, user } = setup();
    const start = new Date('2026-10-02T12:00:00Z');
    const { token, expiresAt } = createSession(db, user.id, start);
    expect(expiresAt.getTime() - start.getTime()).toBe(SESSION_LIFETIME_MS);
    expect(findSession(db, token, new Date(start.getTime() + SESSION_LIFETIME_MS - 1))?.user.username).toBe('admin');
    expect(findSession(db, token, new Date(start.getTime() + SESSION_LIFETIME_MS))).toBeNull();
  });

  it('are not found once revoked', () => {
    const { db, user } = setup();
    const { token } = createSession(db, user.id);
    revokeSession(db, token);
    expect(findSession(db, token)).toBeNull();
  });

  it("can revoke all of a user's sessions except one", () => {
    const { db, user } = setup();
    const keep = createSession(db, user.id).token;
    const drop = createSession(db, user.id).token;
    revokeUserSessions(db, user.id, { exceptToken: keep });
    expect(findSession(db, keep)).not.toBeNull();
    expect(findSession(db, drop)).toBeNull();
  });

  it('purge only expired sessions', () => {
    const { db, user } = setup();
    const old = new Date('2026-01-01T00:00:00Z');
    createSession(db, user.id, old);
    createSession(db, user.id);
    expect(purgeExpiredSessions(db)).toBe(1);
    expect(db.select().from(sessions).all()).toHaveLength(1);
  });

  it('refresh last-seen at most once a minute', () => {
    const { db, user } = setup();
    const start = new Date('2026-10-02T12:00:00Z');
    const { token } = createSession(db, user.id, start);
    findSession(db, token, new Date(start.getTime() + 30_000));
    expect(db.select().from(sessions).get()?.lastSeenAt).toBe(start.toISOString());
    const later = new Date(start.getTime() + 61_000);
    findSession(db, token, later);
    expect(db.select().from(sessions).get()?.lastSeenAt).toBe(later.toISOString());
  });
});
