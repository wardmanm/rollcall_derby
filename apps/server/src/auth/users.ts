import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
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
