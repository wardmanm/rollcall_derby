import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './db/schema.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

// Opens (creating if needed) <dataDir>/obs-producer.db and applies any pending migrations.
export function openDatabase(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  return connect(join(dataDir, 'obs-producer.db'));
}

// A private, empty, fully migrated database for tests.
export function openMemoryDatabase() {
  return connect(':memory:');
}

export type AppDatabase = ReturnType<typeof openDatabase>['db'];

// The database or a transaction inside it, so data-access helpers can run in either.
export type Queryable = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

function connect(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, sqlite };
}
