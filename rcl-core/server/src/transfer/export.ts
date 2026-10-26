import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportSelection, type ManifestItem } from '@rollcall/core-contract';
import type { AppModule, ExportedItem, TransferKind } from '@rollcall/app-sdk';
import type { Queryable } from '../db.ts';
import { media } from '../db/schema.ts';
import { mediaPathFor, packExport, TransferError } from './zip.ts';

// Building an export file (docs/features/import-export.md, ADR-0024): the chosen items, each from the kind that owns
// it, then the items they need, such as a theme's fonts, with every media file they use.

export interface ExportFile {
  bytes: Uint8Array;
  /** Such as rollcall-team-all-stars-2026-10-26.zip. */
  fileName: string;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '') || 'item';

/** An export file of `selection` and what it needs. `mayExport` says whether the caller may export a kind. */
export function buildExport({
  db,
  mediaDir,
  modules,
  kinds,
  selection,
  mayExport,
}: {
  db: Queryable;
  mediaDir: string;
  modules: readonly AppModule[];
  kinds: ReadonlyMap<string, TransferKind>;
  selection: ExportSelection;
  mayExport: (kind: TransferKind) => boolean;
}): ExportFile {
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
  const wanted =
    'items' in selection
      ? selection.items.map(({ kind, id }) => ({ kind: kindNamed(kind), id }))
      : selection.kinds.flatMap((name) => {
          const kind = kindNamed(name);
          return kind.list().map(({ id }) => ({ kind, id }));
        });
  if (wanted.length === 0) throw new TransferError(400, 'nothing_to_export', 'There’s nothing to export');

  // Each media file, under its path in the file, read once.
  const files = new Map<string, Uint8Array>();
  const paths = new Map<string, string>();
  const mediaPath = (mediaId: string) => {
    const known = paths.get(mediaId);
    if (known) return known;
    const row = db.select().from(media).where(eq(media.id, mediaId)).get();
    if (!row) throw new Error(`Media ${mediaId} has no row`);
    const bytes = readFileSync(join(mediaDir, mediaId));
    const path = mediaPathFor(bytes, row.contentType);
    files.set(path, bytes);
    paths.set(mediaId, path);
    return path;
  };

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
  return { bytes: packExport(manifest, files), fileName: `rollcall-${what}-${today}.zip` };
}
