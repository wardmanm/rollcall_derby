import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// Test helpers: an app on a private in-memory database, with its own media folder (made only when an image is saved,
// and deleted when the app closes), and a quick way to add users.
export function testApp(options: Partial<AppOptions> = {}) {
  const { db, sqlite } = openMemoryDatabase();
  const mediaDir = join(tmpdir(), `rollcall-media-${randomUUID()}`);
  const app = buildApp({ version: '1.0.0', db, mediaDir, ...options });
  app.addHook('onClose', async () => {
    sqlite.close();
    rmSync(mediaDir, { recursive: true, force: true });
  });
  return { app, db, mediaDir };
}

/** The first bytes of each image type: enough for the server, which checks an image's bytes, not its pixels. */
export const IMAGES = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([26, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
};

/** The first bytes of each font type: enough for the server, which checks a font's bytes, not its glyphs. */
export const FONTS = {
  woff2: Buffer.concat([Buffer.from('wOF2'), Buffer.from([0, 1, 0, 0, 0, 0, 4, 0])]),
  woff: Buffer.concat([Buffer.from('wOFF'), Buffer.from([0, 1, 0, 0, 0, 0, 4, 0])]),
  ttf: Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x80, 0x00, 0x03, 0x00, 0x40]),
  appleTtf: Buffer.concat([Buffer.from('true'), Buffer.from([0x00, 0x0c, 0x00, 0x80])]),
  otf: Buffer.concat([Buffer.from('OTTO'), Buffer.from([0x00, 0x0c, 0x00, 0x80])]),
};

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
