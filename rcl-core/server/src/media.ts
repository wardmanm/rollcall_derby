import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { eq, inArray, isNotNull } from 'drizzle-orm';
import type { ImageType } from '@rollcall/core-contract';
import type { AppDatabase, Queryable } from './db.ts';
import { media, MEDIA_REFERENCES } from './db/schema.ts';

// Uploaded images (ADR-0022): team logos and member photos now, theme and screen images later. Each is a file in the
// media folder named by its id, with a row saying its type. Images are public at /media/<id> so OBS overlays, which
// have no session, can load them: the id is 128 random bits, so an address can't be guessed, and nothing lists them.

const MEDIA_ID = /^[0-9a-f]{32}$/;
const UPLOADING = '.uploading';

/** Where an image is served. */
export const mediaUrl = (id: string | null): string | null => (id === null ? null : `/media/${id}`);

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  bytes.length >= at + prefix.length && prefix.every((byte, i) => bytes[at + i] === byte);
const ascii = (text: string) => Array.from(Buffer.from(text, 'latin1'));

/** The type an image's first bytes show it to be, or undefined when they aren't a PNG, JPEG or WebP. */
export function imageTypeOf(bytes: Uint8Array): ImageType | undefined {
  if (startsWith(bytes, [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return undefined;
}

/**
 * Saves an upload as a new image: its file, then its row. Returns its id, or null when the bytes aren't a PNG, JPEG
 * or WebP, saving nothing. The caller then points a logo or photo at it.
 */
export function saveMedia(db: Queryable, dir: string, bytes: Uint8Array): string | null {
  const contentType = imageTypeOf(bytes);
  if (!contentType) return null;
  mkdirSync(dir, { recursive: true });
  const id = randomBytes(16).toString('hex');
  // Written under a temporary name first, so a crash mid-write leaves nothing under a real id.
  writeFileSync(join(dir, `${id}${UPLOADING}`), bytes);
  renameSync(join(dir, `${id}${UPLOADING}`), join(dir, id));
  db.insert(media).values({ id, contentType, size: bytes.length, createdAt: new Date().toISOString() }).run();
  return id;
}

/** Deletes images, rows and files, once nothing points at them any more. Nulls are skipped. */
export function removeMedia(db: Queryable, dir: string, ids: readonly (string | null)[]): void {
  const doomed = ids.filter((id): id is string => id !== null);
  if (doomed.length === 0) return;
  db.delete(media).where(inArray(media.id, doomed)).run();
  for (const id of doomed) rmSync(join(dir, id), { force: true });
}

/**
 * Cleans up after a crash, at startup: deletes files with no row (including half-written uploads), rows with no file,
 * and rows nothing refers to. Returns how many of each it removed.
 */
export function sweepMedia(db: AppDatabase, dir: string): { files: number; rows: number } {
  mkdirSync(dir, { recursive: true });
  const referenced = new Set(
    MEDIA_REFERENCES.flatMap(({ table, column }) =>
      db
        .select({ id: column })
        .from(table)
        .where(isNotNull(column))
        .all()
        .flatMap(({ id }) => (id === null ? [] : [id])),
    ),
  );
  const files = new Set(readdirSync(dir));
  const rows = db.select({ id: media.id }).from(media).all();
  const orphanRows = rows.filter(({ id }) => !referenced.has(id) || !files.has(id)).map(({ id }) => id);
  if (orphanRows.length > 0) db.delete(media).where(inArray(media.id, orphanRows)).run();
  const kept = new Set(rows.map(({ id }) => id).filter((id) => !orphanRows.includes(id)));
  const orphanFiles = [...files].filter((name) => !kept.has(name));
  for (const name of orphanFiles) rmSync(join(dir, name), { force: true, recursive: true });
  return { files: orphanFiles.length, rows: orphanRows.length };
}

// Serves images at /media/<id>, to anyone (ADR-0022). An id that isn't 32 hex characters never reaches the file system.
// The replies can only ever be images: the type comes from the row, which saveMedia set from the file's own bytes.
export function serveMedia(app: FastifyInstance, { db, dir }: { db: AppDatabase; dir: string }): void {
  app.get<{ Params: { id: string } }>('/media/:id', async (request, reply) => {
    const { id } = request.params;
    const row = MEDIA_ID.test(id) ? db.select().from(media).where(eq(media.id, id)).get() : undefined;
    const file = join(dir, id);
    if (!row || !existsSync(file)) return reply.code(404).send({ error: 'not_found' });
    return reply
      .type(row.contentType)
      .header('content-length', row.size)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'")
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(file));
  });
}
