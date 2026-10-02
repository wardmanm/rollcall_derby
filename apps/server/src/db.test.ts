import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROLES } from '@obs-producer/shared';
import { openDatabase, openMemoryDatabase } from './db.ts';
import { sessions, users } from './db/schema.ts';

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-db-'));
  dirs.push(dir);
  return join(dir, 'nested', 'data');
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('openDatabase', () => {
  it('creates the data dir and database file, and runs migrations', () => {
    const dataDir = tempDir();
    const { sqlite } = openDatabase(dataDir);
    expect(existsSync(join(dataDir, 'obs-producer.db'))).toBe(true);
    const table = sqlite.prepare("select name from sqlite_master where type = 'table' and name = 'app_meta'").get();
    expect(table).toEqual({ name: 'app_meta' });
    sqlite.close();
  });

  it('can be reopened without re-running migrations', () => {
    const dataDir = tempDir();
    const first = openDatabase(dataDir);
    const applied = first.sqlite.prepare<[], { n: number }>('select count(*) as n from __drizzle_migrations').get()?.n;
    first.sqlite.close();
    const { sqlite } = openDatabase(dataDir);
    const reapplied = sqlite.prepare<[], { n: number }>('select count(*) as n from __drizzle_migrations').get()?.n;
    expect(reapplied).toBe(applied);
    sqlite.close();
  });
});

describe('auth tables', () => {
  it('exist after migration', () => {
    const { sqlite } = openMemoryDatabase();
    const names = sqlite
      .prepare<[], { name: string }>("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(['users', 'sessions']));
    sqlite.close();
  });

  it('use the same roles as the shared contract', () => {
    expect(users.role.enumValues).toEqual([...ROLES]);
  });

  it('delete a user’s sessions with the user', () => {
    const { db, sqlite } = openMemoryDatabase();
    const now = new Date().toISOString();
    db.insert(users)
      .values({ id: 'u1', username: 'a', passwordHash: 'h', role: 'admin', createdAt: now, updatedAt: now })
      .run();
    db.insert(sessions).values({ tokenHash: 't', userId: 'u1', createdAt: now, expiresAt: now, lastSeenAt: now }).run();
    db.delete(users).run();
    expect(db.select().from(sessions).all()).toEqual([]);
    sqlite.close();
  });
});
