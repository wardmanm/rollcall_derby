import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportSelection, type ManifestItem } from '@rollcall/core-contract';
import type { AppModule, ExportedItem, TransferKind } from '@rollcall/app-sdk';
import type { Queryable } from '../db.ts';
import { media } from '../db/schema.ts';
import { mediaPathFor, mediaPathOf, packExport, TransferError } from './zip.ts';

// Building an export file (docs/features/import-export.md, ADR-0024): the chosen items, each from the kind that owns
// it, then the items they need, such as a theme's fonts, with every media file they use. The kinds are asked twice:
// first to learn which media files to read, which is done without holding up the server, then for the items as they
// are by then, with the files' real paths.

export interface ExportFile {
  /** The zip, as a Buffer over the worker's bytes, so replying with it copies nothing. */
  bytes: Buffer;
  /** Such as rollcall-team-all-stars-2026-10-26.zip. */
  fileName: string;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '') || 'item';

/**
 * An export file of `selection` and what it needs. `mayExport` says whether the caller may export a kind; `recheck`
 * is called once the media files are read, and throws if the caller may no longer export.
 */
export async function buildExport({
  db,
  mediaDir,
  modules,
  kinds,
  selection,
  mayExport,
  recheck,
}: {
  db: Queryable;
  mediaDir: string;
  modules: readonly AppModule[];
  kinds: ReadonlyMap<string, TransferKind>;
  selection: ExportSelection;
  mayExport: (kind: TransferKind) => boolean;
  recheck: () => void;
}): Promise<ExportFile> {
  const kindNamed = (name: string) => {
    const kind = kinds.get(name);
    if (!kind) throw new TransferError(404, 'not_found', `Nothing here is a ${name}`);
    if (!mayExport(kind)) throw new TransferError(403, 'forbidden', `Your account can't export ${kind.label.many}`);
    if (kind.onlyAsNeed) {
      const things = `${kind.label.many.charAt(0).toUpperCase()}${kind.label.many.slice(1)}`;
      throw new TransferError(400, 'bad_selection', `${things} travel only with what uses them`);
    }
    return kind;
  };

  // The chosen items as they are now, with each media id they use turned into a path by `mediaPath`.
  const collect = (mediaPath: (mediaId: string) => string) => {
    const wanted =
      'items' in selection
        ? selection.items.map(({ kind, id }) => ({ kind: kindNamed(kind), id }))
        : selection.kinds.flatMap((name) => {
            const kind = kindNamed(name);
            return kind.list().map(({ id }) => ({ kind, id }));
          });
    if (wanted.length === 0) throw new TransferError(400, 'nothing_to_export', 'There’s nothing to export');
    const items: ManifestItem[] = [];
    const add = (kind: TransferKind, item: ExportedItem) =>
      items.push({ kind: kind.name, version: kind.version, data: item.data });
    const needsSent = new Set<string>();
    const names: string[] = [];
    for (const { kind, id } of wanted) {
      const item = kind.exportItem(id, mediaPath);
      if (!item) throw new TransferError(404, 'not_found', `There's no such ${kind.label.one.toLowerCase()}`);
      add(kind, item);
      names.push(item.name);
      for (const need of item.needs ?? []) {
        const key = `${need.kind}|${need.key.toLowerCase()}`;
        const needKind = kinds.get(need.kind);
        if (needsSent.has(key) || !needKind?.exportNeed) continue;
        if (!mayExport(needKind)) {
          throw new TransferError(403, 'forbidden', `Your account can't export ${needKind.label.many}`);
        }
        needsSent.add(key);
        for (const needed of needKind.exportNeed(need.key, mediaPath)) add(needKind, needed);
      }
    }
    return { wanted, items, names };
  };

  const typeOf = (mediaId: string) => {
    const row = db.select().from(media).where(eq(media.id, mediaId)).get();
    if (!row) throw new Error(`Media ${mediaId} has no row`);
    return row.contentType;
  };

  // First, which media files the items use. Each is read, and named by its bytes, without holding up the server.
  const firstUsed = new Set<string>();
  collect((mediaId) => {
    firstUsed.add(mediaId);
    return mediaId;
  });
  const files = new Map<string, { path: string; bytes: Uint8Array }>();
  for (const mediaId of firstUsed) {
    const type = typeOf(mediaId);
    // One file at a time, so a big export never holds many files open.
    // oxlint-disable-next-line eslint/no-await-in-loop -- read in turn on purpose
    const bytes = await readFile(join(mediaDir, mediaId));
    // oxlint-disable-next-line eslint/no-await-in-loop -- hashed as it's read
    files.set(mediaId, { path: await mediaPathOf(bytes, type), bytes });
  }
  recheck();

  // Then the items again, as they are now, with the real paths: nothing awaits from here until the manifest is made.
  // A media file first used now, by an item changed meanwhile, is read here, and is at most 5 MB.
  const used = new Map<string, Uint8Array>();
  const { wanted, items, names } = collect((mediaId) => {
    let file = files.get(mediaId);
    if (!file) {
      const bytes = readFileSync(join(mediaDir, mediaId));
      file = { path: mediaPathFor(bytes, typeOf(mediaId)), bytes };
      files.set(mediaId, file);
    }
    used.set(file.path, file.bytes);
    return file.path;
  });

  const manifest = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    apps: Object.fromEntries(modules.map((module) => [module.id, module.version])),
    items,
  } as const;
  const today = manifest.exportedAt.slice(0, 10);
  const [first] = wanted;
  const what =
    wanted.length === 1 && first
      ? `${slug(first.kind.label.one)}-${slug(names[0] ?? '')}`
      : wanted.every(({ kind }) => kind === first?.kind) && first
        ? slug(first.kind.label.many)
        : 'export';
  const zip = await packExport(manifest, used);
  return { bytes: Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength), fileName: `rollcall-${what}-${today}.zip` };
}
