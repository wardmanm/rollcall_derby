import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { Manifest } from '@rollcall/core-contract';
import { IMAGES } from '../testing.ts';
import { EXPORT_LIMITS, mediaPathFor, packExport, readExport, sha256, TransferError } from './zip.ts';

const MANIFEST: Manifest = {
  format: 'rollcall-export',
  formatVersion: 1,
  exportedAt: '2026-10-26T12:00:00.000Z',
  apps: { core: '0.3.0' },
  items: [],
};

// What readExport throws for `zip`, as [status, code], or undefined when it reads it.
function refusal(zip: Uint8Array, limits = EXPORT_LIMITS) {
  try {
    readExport(zip, limits);
    return undefined;
  } catch (error) {
    if (error instanceof TransferError) return [error.status, error.code, error.message];
    throw error;
  }
}

const zip = (files: Record<string, string | Uint8Array>) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, data]) => [name, typeof data === 'string' ? strToU8(data) : data]),
    ),
  );

describe('mediaPathFor', () => {
  it('names a file by the SHA-256 of its bytes, with its type’s extension', () => {
    expect(mediaPathFor(IMAGES.png, 'image/png')).toBe(`media/${sha256(IMAGES.png)}.png`);
    expect(mediaPathFor(IMAGES.jpeg, 'image/jpeg')).toMatch(/^media\/[0-9a-f]{64}\.jpg$/);
    expect(mediaPathFor(strToU8('wOF2'), 'font/woff2')).toMatch(/\.woff2$/);
  });
});

describe('packExport and readExport', () => {
  it('round-trip a manifest and its media files', () => {
    const path = mediaPathFor(IMAGES.png, 'image/png');
    const read = readExport(packExport(MANIFEST, new Map([[path, IMAGES.png]])));
    expect(read.manifest).toEqual(MANIFEST);
    expect([...read.media.keys()]).toEqual([path]);
    expect(Buffer.from(read.media.get(path)!).equals(IMAGES.png)).toBe(true);
  });

  it('ignores anything in the zip but the manifest and media files', () => {
    const read = readExport(zip({ 'rollcall-export.json': JSON.stringify(MANIFEST), 'notes.txt': 'hi', 'media/': '' }));
    expect(read.media.size).toBe(0);
  });

  it('refuses a file that is not a zip, or a zip that is not a Rollcall export', () => {
    const notAnExport = [400, 'bad_file', "This isn't a Rollcall export file."];
    expect(refusal(strToU8('just some text'))).toEqual(notAnExport);
    expect(refusal(zip({ 'team.json': '{}' }))).toEqual(notAnExport);
    expect(refusal(zip({ 'rollcall-export.json': '{ not json' }))).toEqual(notAnExport);
  });

  it('refuses a file over the limits, judged before anything is unzipped', () => {
    const small = { bytes: 1024 * 1024, unzipped: 2048, manifest: 512, entries: 3 };
    const tooBig = [413, 'too_large', 'That file is too big to import: the limit is 1 MB, unzipped twice that'];
    // Compresses to almost nothing, but unzips past the limit.
    expect(refusal(zip({ 'rollcall-export.json': '{}', 'media/a.png': new Uint8Array(4096) }), small)).toEqual(tooBig);
    expect(refusal(zip({ 'rollcall-export.json': ' '.repeat(600) }), small)).toEqual(tooBig);
    expect(refusal(zip({ 'rollcall-export.json': '{}', 'a.txt': '', 'b.txt': '', 'c.txt': '' }), small)).toEqual(
      tooBig,
    );
    expect(refusal(new Uint8Array(small.bytes + 1), small)).toEqual(tooBig);
    expect(refusal(zip({ 'rollcall-export.json': '{}', 'media/a.png': new Uint8Array(1024) }), small)).toBeUndefined();
  });
});
