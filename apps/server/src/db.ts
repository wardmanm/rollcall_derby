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
  const sqlite = new Database(join(dataDir, 'obs-producer.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, sqlite };
}

export type AppDatabase = ReturnType<typeof openDatabase>['db'];
