import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { media, teamMembers, teams } from './db/schema.ts';
import { imageTypeOf, mediaUrl, removeMedia, saveMedia, sweepMedia } from './media.ts';
import { IMAGES, testApp } from './testing.ts';

const NOW = '2026-10-23T10:00:00.000Z';
const apps: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

// An app on a fresh database and media folder.
function fresh() {
  const opened = testApp();
  apps.push(opened.app);
  return opened;
}

describe('imageTypeOf', () => {
  it('knows PNG, JPEG and WebP by their first bytes', () => {
    expect(imageTypeOf(IMAGES.png)).toBe('image/png');
    expect(imageTypeOf(IMAGES.jpeg)).toBe('image/jpeg');
    expect(imageTypeOf(IMAGES.webp)).toBe('image/webp');
  });

  it('refuses anything else, whatever it claims to be', () => {
    for (const bytes of [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      Buffer.from('<!doctype html><title>x</title>'),
      Buffer.from('GIF89a'),
      Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVE'),
      IMAGES.png.subarray(0, 4),
      Buffer.alloc(0),
    ]) {
      expect(imageTypeOf(bytes), bytes.toString('latin1')).toBeUndefined();
    }
  });
});

describe('saveMedia and removeMedia', () => {
  it('saves an image as a file named by a random 32-character id, with a row saying its type', () => {
    const { db, mediaDir } = fresh();
    const id = saveMedia(db, mediaDir, IMAGES.webp);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(readdirSync(mediaDir)).toEqual([id]);
    expect(db.select().from(media).all()).toEqual([
      { id, contentType: 'image/webp', size: IMAGES.webp.length, createdAt: expect.any(String) },
    ]);
    expect(mediaUrl(id)).toBe(`/media/${id}`);
    expect(mediaUrl(null)).toBeNull();
  });

  it('saves nothing that is not an image', () => {
    const { db, mediaDir } = fresh();
    expect(saveMedia(db, mediaDir, Buffer.from('<svg/>'))).toBeNull();
    expect(existsSync(mediaDir)).toBe(false);
    expect(db.select().from(media).all()).toEqual([]);
  });

  it('removes images, rows and files, skipping nulls', () => {
    const { db, mediaDir } = fresh();
    const kept = saveMedia(db, mediaDir, IMAGES.png)!;
    const gone = saveMedia(db, mediaDir, IMAGES.jpeg)!;
    removeMedia(db, mediaDir, [gone, null]);
    expect(readdirSync(mediaDir)).toEqual([kept]);
    expect(db.select({ id: media.id }).from(media).all()).toEqual([{ id: kept }]);
  });
});

describe('sweepMedia', () => {
  it('removes leftover files, rows with no file and rows nothing refers to, and keeps the rest', () => {
    const { db, mediaDir } = fresh();
    const logo = saveMedia(db, mediaDir, IMAGES.png)!;
    const photo = saveMedia(db, mediaDir, IMAGES.jpeg)!;
    saveMedia(db, mediaDir, IMAGES.webp); // referred to by nothing
    const missingFile = saveMedia(db, mediaDir, IMAGES.png)!;
    db.insert(teams).values({ id: 't1', name: 'All Stars', logoMediaId: logo, createdAt: NOW, updatedAt: NOW }).run();
    db.insert(teamMembers)
      .values([
        {
          id: 'm1',
          teamId: 't1',
          kind: 'skater',
          name: 'Jammy',
          number: '7',
          roles: [],
          customRoles: [],
          photoMediaId: photo,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: 'm2',
          teamId: 't1',
          kind: 'skater',
          name: 'Blocky',
          number: '8',
          roles: [],
          customRoles: [],
          photoMediaId: missingFile,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ])
      .run();
    removeMediaFile(mediaDir, missingFile);
    writeFileSync(join(mediaDir, 'abc.uploading'), 'half');
    writeFileSync(join(mediaDir, 'stray.txt'), 'x');
    mkdirSync(join(mediaDir, 'folder'));

    expect(sweepMedia(db, mediaDir)).toEqual({ files: 4, rows: 2 });
    expect(readdirSync(mediaDir).toSorted()).toEqual([logo, photo].toSorted());
    expect(
      db
        .select({ id: media.id })
        .from(media)
        .all()
        .map(({ id }) => id)
        .toSorted(),
    ).toEqual([logo, photo].toSorted());
    // The member whose photo was missing now has none, rather than a broken address.
    expect(db.select({ photo: teamMembers.photoMediaId }).from(teamMembers).all()).toEqual([
      { photo },
      { photo: null },
    ]);
    expect(sweepMedia(db, mediaDir)).toEqual({ files: 0, rows: 0 });
  });

  it('makes the media folder when there is none yet', () => {
    const { db, mediaDir } = fresh();
    expect(sweepMedia(db, mediaDir)).toEqual({ files: 0, rows: 0 });
    expect(existsSync(mediaDir)).toBe(true);
  });
});

// Deletes an image's file but not its row, as a crash or a hand-edited folder might.
const removeMediaFile = (dir: string, id: string) => rmSync(join(dir, id));

describe('GET /media/:id', () => {
  it('serves an image to anyone, with its type, and headers that keep it an image that is cached for good', async () => {
    const { app, db, mediaDir } = fresh();
    const id = saveMedia(db, mediaDir, IMAGES.png)!;
    const res = await app.inject({ method: 'GET', url: `/media/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(IMAGES.png)).toBe(true);
    expect(res.headers).toMatchObject({
      'content-type': 'image/png',
      'content-length': String(IMAGES.png.length),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'cache-control': 'public, max-age=31536000, immutable',
    });
    const head = await app.inject({ method: 'HEAD', url: `/media/${id}` });
    expect(head.statusCode).toBe(200);
    expect(head.headers['content-type']).toBe('image/png');
  });

  it('answers 404 for an unknown id, a malformed one, or a file that is gone', async () => {
    const { app, db, mediaDir } = fresh();
    const id = saveMedia(db, mediaDir, IMAGES.png)!;
    removeMediaFile(mediaDir, id);
    for (const path of [
      `/media/${'0'.repeat(32)}`,
      `/media/${id}`,
      `/media/${id.toUpperCase()}`,
      '/media/..%2Frollcall.db',
      '/media/abc',
      '/media/',
    ]) {
      expect((await app.inject({ method: 'GET', url: path })).statusCode, path).toBe(404);
    }
  });
});
