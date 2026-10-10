import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { AppModule } from '@rollcall/app-sdk';
import { hostApps, migrationsTableFor } from './apps.ts';
import { openMemoryDatabase } from './db.ts';
import { tableNames, tablesCreatedBy } from './testing.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const testLog = (): FastifyBaseLogger =>
  ({
    error: vi.fn<(obj: object, msg: string) => void>(),
    child: vi.fn<() => FastifyBaseLogger>(() => testLog()),
  }) as unknown as FastifyBaseLogger;

const app = (overrides: Partial<AppModule> = {}): AppModule => ({
  id: 'demo',
  title: 'Demo',
  version: '1.0.0',
  requiresCore: '^1.0.0',
  permissions: [],
  ...overrides,
});
const core = app({ id: 'core', title: 'Rollcall', requiresCore: '1.0.0' });

// A Drizzle migrations folder holding one migration.
function migrations(sql: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rollcall-migrations-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'meta'));
  const entries = [{ idx: 0, version: '6', when: 1, tag: '0000_init', breakpoints: true }];
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries }));
  writeFileSync(join(dir, '0000_init.sql'), sql);
  return dir;
}

function host(apps: AppModule[]) {
  const { db } = openMemoryDatabase();
  const log = testLog();
  return { db, log, hosted: hostApps({ core, apps, coreVersion: '1.0.0', db, log }) };
}

describe('hostApps', () => {
  it('hosts core first, then each app that passes its checks, in order', () => {
    const { hosted } = host([app({ id: 'demo' }), app({ id: 'other', requiresCore: '>=0.9' })]);
    expect(hosted.modules.map((m) => m.id)).toEqual(['core', 'demo', 'other']);
  });

  it('skips an app that needs another rcl-core version, says why in the log, and keeps going', () => {
    const { hosted, log } = host([app({ id: 'old', requiresCore: '^2.0.0' }), app()]);
    expect(hosted.modules.map((m) => m.id)).toEqual(['core', 'demo']);
    expect(log.error).toHaveBeenCalledWith(
      { app: 'old' },
      'Skipping rcl app "old": it needs rcl-core ^2.0.0, and this is rcl-core 1.0.0',
    );
  });

  it('skips an app with a bad or taken id, a bad version range, or permissions that are not its own', () => {
    for (const [bad, problem] of [
      [app({ id: 'Demo' }), 'its id "Demo" must be lowercase letters, digits and dashes'],
      [app({ id: 'core' }), 'another app already uses the id "core"'],
      [app({ requiresCore: 'soon' }), 'its requiresCore "soon" isn\'t a version range'],
      [
        app({ permissions: [{ key: 'core:users.manage', summary: 'x', roles: [] }] }),
        "its permission core:users.manage isn't one of its own (demo:…)",
      ],
    ] as const) {
      const { hosted, log } = host([bad]);
      expect(
        hosted.modules.map((m) => m.id),
        problem,
      ).toEqual(['core']);
      expect(log.error).toHaveBeenCalledWith({ app: bad.id }, `Skipping rcl app "${bad.id}": ${problem}`);
    }
  });

  it("runs an app's migrations in its own migrations table, leaving core's alone", () => {
    const folder = migrations('CREATE TABLE `demo_things` (`id` text PRIMARY KEY NOT NULL);');
    const { db, hosted } = host([app({ migrationsFolder: folder })]);
    expect(hosted.modules.map((m) => m.id)).toEqual(['core', 'demo']);
    expect(tableNames(db)).toEqual(expect.arrayContaining(['demo_things', migrationsTableFor('demo')]));
    const coreMigrations = db.$client.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number };
    expect(coreMigrations.n).toBe(2);
  });

  it('skips an app whose migrations fail', () => {
    const { hosted, log } = host([app({ migrationsFolder: migrations('CREATE TABLE oops (') })]);
    expect(hosted.modules.map((m) => m.id)).toEqual(['core']);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ app: 'demo' }),
      'Skipping rcl app "demo": its migrations failed',
    );
  });

  it("gathers the hosted apps' permissions and web builds, core's first", () => {
    const { hosted } = host([
      app({
        permissions: [{ key: 'demo:things.edit', summary: 'Edit things', roles: ['producer'] }],
        web: { dir: '/builds/demo', pages: { overlay: 'overlay.html' } },
      }),
      app({ id: 'old', requiresCore: '^2.0.0', web: { dir: '/builds/old' } }),
    ]);
    expect(hosted.permissions.granted('producer', 'demo:things.edit')).toBe(true);
    expect(hosted.webApps).toEqual([{ base: '/demo/', dir: '/builds/demo', pages: { overlay: 'overlay.html' } }]);
  });
});

describe("an app's tables", () => {
  it('are found, so a test can check they are named after the app', () => {
    const folder = migrations('CREATE TABLE `things` (`id` text PRIMARY KEY NOT NULL);');
    expect(tablesCreatedBy(app({ migrationsFolder: folder }))).toEqual(['things']);
  });
});
