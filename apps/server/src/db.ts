import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './db/schema.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

export const DATABASE_FILE = 'rollcall.db';
// The database file's name before the rename to Rollcall (ADR-0016).
const OLD_DATABASE_FILE = 'obs-producer.db';

/** Why `dataDir` can't be opened as it is: it holds only the database from before the rename. Null when it can. */
export function oldDatabaseProblem(dataDir: string): string | null {
  const oldFile = join(dataDir, OLD_DATABASE_FILE);
  if (existsSync(join(dataDir, DATABASE_FILE)) || !existsSync(oldFile)) return null;
  return (
    `${oldFile} is from before the rename to Rollcall. Stop the server, then rename it ` +
    `(and any -wal and -shm files next to it) to ${DATABASE_FILE} to keep your accounts, or delete it to start fresh.`
  );
}

// Opens (creating if needed) <dataDir>/rollcall.db and applies any pending migrations. A folder that still holds
// only obs-producer.db is refused, so accounts never silently vanish after the rename.
export function openDatabase(dataDir: string) {
  const problem = oldDatabaseProblem(dataDir);
  if (problem) throw new Error(problem);
  mkdirSync(dataDir, { recursive: true });
  return connect(join(dataDir, DATABASE_FILE));
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
