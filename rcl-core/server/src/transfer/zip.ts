import { createHash } from 'node:crypto';
import { isMarkedAsUntransferable, Worker } from 'node:worker_threads';
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
// stored as they are, since images and fonts are compressed already. Each zip is packed or read in a worker thread of
// its own (zip-worker.ts), so a big file doesn't hold up the server, and one export or import runs at a time.

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

/** An export file as read: its SHA-256, its manifest, parsed as JSON but not yet checked, and its media files by path. */
export interface ExportRead {
  sha256: string;
  manifest: unknown;
  media: Map<string, Uint8Array>;
}

/** An export file: the manifest, then each media file by its path. The worker runs this. */
export function packZip(manifest: Manifest, media: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const entries: Zippable = { [MANIFEST_FILE]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }] };
  for (const [path, bytes] of media) entries[path] = [bytes, { level: 0 }];
  return zipSync(entries);
}

/**
 * Reads an export file. Anything in the zip but the manifest and media files is ignored. The sizes each entry states
 * are checked before anything is unzipped, so a small file can't unzip to fill the memory. The worker runs this.
 */
export function readZip(zip: Uint8Array, limits: ExportLimits): ExportRead {
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
  return { sha256: sha256(zip), manifest, media };
}

function tooLarge(limits: ExportLimits) {
  const mb = Math.round(limits.bytes / (1024 * 1024));
  return new TransferError(
    413,
    'too_large',
    `That file is too big to import: the limit is ${mb} MB, unzipped twice that`,
  );
}

/** What the worker is asked to do. */
export type ZipJob =
  | { job: 'pack'; manifest: Manifest; media: ReadonlyMap<string, Uint8Array> }
  | { job: 'read'; zip: Uint8Array; limits: ExportLimits };

/** What the worker replies: its result, or a TransferError as its parts. */
export type ZipReply =
  | { packed: Uint8Array }
  | { read: ExportRead }
  | { refusal: { status: TransferError['status']; code: string; message: string } };

// Bytes are handed to and from a worker by moving their buffer rather than copying it. Bytes that share a buffer,
// such as Node's small pooled ones, can't be moved, and would bring the whole buffer with them, so they're copied.
const ownBuffer = (bytes: Uint8Array): ArrayBuffer | undefined => {
  const { buffer } = bytes;
  return buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === buffer.byteLength &&
    !isMarkedAsUntransferable(buffer)
    ? buffer
    : undefined;
};

/** Bytes in a buffer of their own, to hand to or from a worker: as they are, or copied if they share one. */
export const owned = (bytes: Uint8Array): Uint8Array => (ownBuffer(bytes) ? bytes : new Uint8Array(bytes));

/** The buffers to move, rather than copy, with bytes that have buffers of their own. */
export const buffersOf = (views: Iterable<Uint8Array>): ArrayBuffer[] => [
  ...new Set([...views].flatMap((bytes) => ownBuffer(bytes) ?? [])),
];

const WORKER = new URL('./zip-worker.ts', import.meta.url);

// Runs one job in a worker of its own, which exits once it has replied. A refusal is thrown as the TransferError it was.
async function inWorker(job: ZipJob, transferList: ArrayBuffer[]): Promise<Exclude<ZipReply, { refusal: unknown }>> {
  const reply = await new Promise<ZipReply>((resolve, reject) => {
    const worker = new Worker(WORKER, { workerData: job, transferList });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => reject(new Error(`The zip worker stopped (exit code ${code}) without replying`)));
  });
  if ('refusal' in reply) throw new TransferError(reply.refusal.status, reply.refusal.code, reply.refusal.message);
  return reply;
}

/** An export file, packed in a worker. The media files' bytes are handed to it, so they can't be used afterwards. */
export async function packExport(manifest: Manifest, media: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array> {
  const handed = new Map([...media].map(([path, bytes]) => [path, owned(bytes)]));
  const reply = await inWorker({ job: 'pack', manifest, media: handed }, buffersOf(handed.values()));
  if (!('packed' in reply)) throw new Error('The zip worker replied with something else');
  return reply.packed;
}

/**
 * Reads an export file in a worker, as `readZip` does, refusing it with the same TransferErrors. Its bytes are handed
 * to the worker, so they can't be used afterwards.
 */
export async function readExport(zip: Uint8Array, limits: ExportLimits = EXPORT_LIMITS): Promise<ExportRead> {
  const handed = owned(zip);
  const reply = await inWorker({ job: 'read', zip: handed, limits }, buffersOf([handed]));
  if (!('read' in reply)) throw new Error('The zip worker replied with something else');
  return reply.read;
}
