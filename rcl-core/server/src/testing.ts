import type { AppModule } from '@rollcall/app-sdk';
import type { Role } from '@rollcall/core-contract';
import { buildApp, type AppOptions } from './app.ts';
import { migrateApp, migrationsTableFor } from './apps.ts';
import { openMemoryDatabase, type AppDatabase } from './db.ts';
import { hashPassword } from './auth/passwords.ts';
import pkg from '../package.json' with { type: 'json' };
import { createUser, type UserRecord } from './auth/users.ts';

/** This rcl-core's version, as main.ts passes it to the server. */
export const CORE_VERSION = pkg.version;

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

/** The tables in the database, by name. */
export function tableNames(db: AppDatabase): string[] {
  return db.$client
    .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

/** The tables an app's migrations create, besides its migrations table, on a fresh database with core's tables. */
export function tablesCreatedBy(app: AppModule): string[] {
  const { db, sqlite } = openMemoryDatabase();
  try {
    const before = new Set(tableNames(db));
    migrateApp(app, db);
    return tableNames(db).filter((name) => !before.has(name) && name !== migrationsTableFor(app.id));
  } finally {
    sqlite.close();
  }
}
