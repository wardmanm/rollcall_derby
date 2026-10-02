import type { Role } from '@obs-producer/shared';
import { buildApp, type AppOptions } from './app.ts';
import { openMemoryDatabase, type AppDatabase } from './db.ts';
import { hashPassword } from './auth/passwords.ts';
import { createUser, type UserRecord } from './auth/users.ts';

// Test helpers: an app on a private in-memory database, and a quick way to add users.
export function testApp(options: Partial<AppOptions> = {}) {
  const { db, sqlite } = openMemoryDatabase();
  const app = buildApp({ version: '1.0.0', db, ...options });
  app.addHook('onClose', async () => {
    sqlite.close();
  });
  return { app, db };
}

export async function addUser(
  db: AppDatabase,
  username: string,
  password: string,
  role: Role,
  options: { mustChangePassword?: boolean } = {},
): Promise<UserRecord> {
  return createUser(db, { username, passwordHash: await hashPassword(password), role, ...options });
}
