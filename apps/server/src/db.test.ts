import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db.ts';

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
    openDatabase(dataDir).sqlite.close();
    const { sqlite } = openDatabase(dataDir);
    const applied = sqlite.prepare('select count(*) as n from __drizzle_migrations').get() as { n: number };
    expect(applied.n).toBe(1);
    sqlite.close();
  });
});
