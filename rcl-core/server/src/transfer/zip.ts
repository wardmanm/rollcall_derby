import { createHash } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  MANIFEST_FILE,
  MAX_EXPORT_BYTES,
  MAX_EXPORT_ENTRIES,
  MAX_MANIFEST_BYTES,
  MAX_UNZIPPED_BYTES,
  type Manifest,
} from '@rollcall/core-contract';
import type { MediaType } from '../media.ts';

// Export files are zips (ADR-0024): the manifest, and each media file under media/<sha256>.<ext>. Media files are
// stored as they are, since images and fonts are compressed already.

/** A refusal of an export or import, with its HTTP status, error code and the words to show. */
export class TransferError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 413 | 415;
  readonly code: string;

  constructor(status: TransferError['status'], code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const NOT_AN_EXPORT = "This isn't a Rollcall export file.";

export interface ExportLimits {
  bytes: number;
  unzipped: number;
  manifest: number;
  entries: number;
}

export const EXPORT_LIMITS: ExportLimits = {
  bytes: MAX_EXPORT_BYTES,
  unzipped: MAX_UNZIPPED_BYTES,
  manifest: MAX_MANIFEST_BYTES,
  entries: MAX_EXPORT_ENTRIES,
};

const EXTENSIONS: Record<MediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
};

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Where a media file goes in an export: named by its bytes, so the same file is stored once. */
export const mediaPathFor = (bytes: Uint8Array, type: MediaType) => `media/${sha256(bytes)}.${EXTENSIONS[type]}`;

/** An export file: the manifest, then each media file by its path. */
export function packExport(manifest: Manifest, media: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const entries: Zippable = { [MANIFEST_FILE]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }] };
  for (const [path, bytes] of media) entries[path] = [bytes, { level: 0 }];
  return zipSync(entries);
}

/**
 * Reads an export file: its manifest, parsed as JSON but not yet checked, and its media files by path. Anything else in
 * the zip is ignored. The sizes each entry states are checked before anything is unzipped, so a small file can't
 * unzip to fill the memory.
 */
export function readExport(
  zip: Uint8Array,
  limits: ExportLimits = EXPORT_LIMITS,
): { manifest: unknown; media: Map<string, Uint8Array> } {
  if (zip.length > limits.bytes) throw tooLarge(limits);
  let entries = 0;
  let unzipped = 0;
  let files;
  try {
    files = unzipSync(zip, {
      filter: ({ name, originalSize }) => {
        entries += 1;
        unzipped += originalSize;
        if (entries > limits.entries) throw tooLarge(limits);
        if (unzipped > limits.unzipped) throw tooLarge(limits);
        if (name === MANIFEST_FILE && originalSize > limits.manifest) throw tooLarge(limits);
        return name === MANIFEST_FILE || (name.startsWith('media/') && !name.endsWith('/'));
      },
    });
  } catch (error) {
    if (error instanceof TransferError) throw error;
    throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);
  }
  const manifestBytes = files[MANIFEST_FILE];
  if (!manifestBytes) throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);
  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);
  }
  const media = new Map(Object.entries(files).filter(([name]) => name !== MANIFEST_FILE));
  return { manifest, media };
}

function tooLarge(limits: ExportLimits) {
  const mb = Math.round(limits.bytes / (1024 * 1024));
  return new TransferError(
    413,
    'too_large',
    `That file is too big to import: the limit is ${mb} MB, unzipped twice that`,
  );
}
