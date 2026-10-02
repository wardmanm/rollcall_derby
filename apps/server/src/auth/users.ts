import { randomUUID } from 'node:crypto';
import { and, count, eq, ne } from 'drizzle-orm';
import type { Role, SessionUser } from '@obs-producer/shared';
import type { AppDatabase, Queryable } from '../db.ts';
import { users } from '../db/schema.ts';

export interface UserRecord {
  id: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  createdAt: string;
}

const publicColumns = {
  id: users.id,
  username: users.username,
  role: users.role,
  mustChangePassword: users.mustChangePassword,
  createdAt: users.createdAt,
};

export function countUsers(db: Queryable): number {
  return db.select({ n: count() }).from(users).get()?.n ?? 0;
}

export function createUser(
  db: Queryable,
  input: { username: string; passwordHash: string; role: Role; mustChangePassword?: boolean },
  now = new Date(),
): UserRecord {
  const timestamp = now.toISOString();
  const record = {
    id: randomUUID(),
    username: input.username,
    role: input.role,
    mustChangePassword: input.mustChangePassword ?? false,
    createdAt: timestamp,
  };
  db.insert(users)
    .values({ ...record, passwordHash: input.passwordHash, updatedAt: timestamp })
    .run();
  return record;
}

export function findUserForLogin(db: AppDatabase, username: string): (UserRecord & { passwordHash: string }) | null {
  const row = db
    .select({ ...publicColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.username, username.trim().toLowerCase()))
    .get();
  return row ?? null;
}

export function setPassword(
  db: AppDatabase,
  userId: string,
  passwordHash: string,
  { mustChangePassword }: { mustChangePassword: boolean },
  now = new Date(),
): void {
  db.update(users)
    .set({ passwordHash, mustChangePassword, updatedAt: now.toISOString() })
    .where(eq(users.id, userId))
    .run();
}

export function toSessionUser(user: UserRecord): SessionUser {
  return { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword };
}

export function listUsers(db: AppDatabase): UserRecord[] {
  return db.select(publicColumns).from(users).orderBy(users.username).all();
}

export function findUserById(db: AppDatabase, id: string): UserRecord | null {
  return db.select(publicColumns).from(users).where(eq(users.id, id)).get() ?? null;
}

export function setRole(db: AppDatabase, userId: string, role: Role, now = new Date()): void {
  db.update(users).set({ role, updatedAt: now.toISOString() }).where(eq(users.id, userId)).run();
}

// The user's sessions are deleted with them (ON DELETE CASCADE).
export function deleteUser(db: AppDatabase, userId: string): void {
  db.delete(users).where(eq(users.id, userId)).run();
}

// For the "always at least one Admin" rule: how many Admins there are, optionally not counting one user.
export function countAdmins(db: AppDatabase, { excluding }: { excluding?: string } = {}): number {
  const isAdmin = eq(users.role, 'admin');
  const where = excluding ? and(isAdmin, ne(users.id, excluding)) : isAdmin;
  return db.select({ n: count() }).from(users).where(where).get()?.n ?? 0;
}
