import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lte, ne } from 'drizzle-orm';
import type { SessionUser } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { sessions, users } from '../db/schema.ts';

// Sessions last a fixed 30 days from login; using them doesn't extend them (ADR-0008).
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_SEEN_RESOLUTION_MS = 60_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: AppDatabase, userId: string, now = new Date()): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  db.insert(sessions)
    .values({
      tokenHash: hashToken(token),
      userId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastSeenAt: now.toISOString(),
    })
    .run();
  return { token, expiresAt };
}

export function findSession(
  db: AppDatabase,
  token: string,
  now = new Date(),
): { tokenHash: string; expiresAt: Date; user: SessionUser } | null {
  const tokenHash = hashToken(token);
  const row = db
    .select({
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      id: users.id,
      username: users.username,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now.toISOString())))
    .get();
  if (!row) return null;

  if (now.getTime() - Date.parse(row.lastSeenAt) >= LAST_SEEN_RESOLUTION_MS) {
    db.update(sessions).set({ lastSeenAt: now.toISOString() }).where(eq(sessions.tokenHash, tokenHash)).run();
  }
  const { id, username, role, mustChangePassword } = row;
  return { tokenHash, expiresAt: new Date(row.expiresAt), user: { id, username, role, mustChangePassword } };
}

export function revokeSession(db: AppDatabase, token: string): void {
  db.delete(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .run();
}

export function revokeUserSessions(
  db: AppDatabase,
  userId: string,
  { exceptToken }: { exceptToken?: string } = {},
): void {
  const condition = exceptToken
    ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(exceptToken)))
    : eq(sessions.userId, userId);
  db.delete(sessions).where(condition).run();
}

export function purgeExpiredSessions(db: AppDatabase, now = new Date()): number {
  return db.delete(sessions).where(lte(sessions.expiresAt, now.toISOString())).run().changes;
}
