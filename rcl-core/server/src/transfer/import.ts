import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPORT_FORMAT_VERSION,
  ManifestHeadSchema,
  ManifestSchema,
  MAX_FONT_BYTES,
  MAX_IMAGE_BYTES,
  type ConflictTarget,
  type ImportPreview,
  type ImportResult,
  type PreviewItem,
  type TransferFact,
} from '@rollcall/core-contract';
import type { TransferKind, TransferMediaType, TransferSave } from '@rollcall/app-sdk';
import type { z } from 'zod';
import type { ImportChoicesSchema } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import { fontTypeOf, imageTypeOf, removeMedia, saveMedia } from '../media.ts';
import { NOT_AN_EXPORT, readExport, sha256, TransferError } from './zip.ts';

// Importing an export file (docs/features/import-export.md, ADR-0024), in two steps that each read the whole file: a
// preview that checks everything and saves nothing, then the import, which checks again and saves the chosen items in
// one transaction, or nothing.

type Choices = z.output<typeof ImportChoicesSchema>;

/** One item of a file, checked and matched with what's here. */
export interface PlannedItem {
  index: number;
  kindName: string;
  kind: TransferKind | undefined;
  label: string;
  name: string;
  /** Its data, migrated to its kind's current version and checked by it. */
  data: unknown;
  facts: readonly TransferFact[];
  status: PreviewItem['status'];
  reason: string | null;
  targets: readonly ConflictTarget[];
  needs: number[];
  canBeDefault: boolean;
  wasDefault: boolean;
  /** Each media file it uses, by path, with the type it must be. */
  media: ReadonlyMap<string, TransferMediaType>;
}

export interface ImportPlan {
  /** The file's SHA-256, which the import's choices must name. */
  file: string;
  items: PlannedItem[];
  media: ReadonlyMap<string, Uint8Array>;
}

const NEWER = 'This file was made by a newer Rollcall. Update Rollcall to import it.';
const CHANGED = 'Something changed since you checked this file. Check it again.';
const TYPE_CHECKS = { image: imageTypeOf, font: fontTypeOf } as const;
const SIZE_LIMITS = { image: MAX_IMAGE_BYTES, font: MAX_FONT_BYTES } as const;
const TYPE_WORDS = { image: "isn't a PNG, JPEG or WebP image", font: "isn't a WOFF2, WOFF, TTF or OTF font" } as const;

// A kind this server doesn't store, for people: core:screen → "Screens".
const thingsOf = (kindName: string) => {
  const thing = (kindName.split(':')[1] ?? kindName).replaceAll('-', ' ');
  return `${thing.charAt(0).toUpperCase()}${thing.slice(1)}s`;
};
// An item's name before its kind has checked it, for messages: at most 64 characters, as names here are.
const rawName = (data: unknown) => {
  const name =
    typeof data === 'object' && data !== null && 'name' in data && typeof data.name === 'string' ? data.name : '';
  return name.length > 64 ? `${name.slice(0, 63)}…` : name;
};

/** Reads and checks an export file, and matches its items with what's here. Throws a TransferError if it can't. */
export function planImport({
  zip,
  kinds,
  mayImport,
}: {
  zip: Uint8Array;
  kinds: ReadonlyMap<string, TransferKind>;
  mayImport: (kind: TransferKind) => boolean;
}): ImportPlan {
  const { manifest, media } = readExport(zip);
  const head = ManifestHeadSchema.safeParse(manifest);
  if (!head.success) throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);
  if (head.data.formatVersion > EXPORT_FORMAT_VERSION) throw new TransferError(400, 'newer_format', NEWER);
  const parsed = ManifestSchema.safeParse(manifest);
  if (!parsed.success) throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);

  const items = parsed.data.items.map((item, index): PlannedItem => {
    const kind = kinds.get(item.kind);
    const name = rawName(item.data);
    const cant = (reason: string, label = kind?.label.one ?? thingsOf(item.kind).slice(0, -1)): PlannedItem => ({
      index,
      kindName: item.kind,
      kind,
      label,
      name,
      data: item.data,
      facts: [],
      status: 'cant',
      reason,
      targets: [],
      needs: [],
      canBeDefault: false,
      wasDefault: false,
      media: new Map(),
    });
    if (!kind) return cant(`${thingsOf(item.kind)} aren't known here yet`);
    if (item.version > kind.version) return cant(NEWER);
    if (!mayImport(kind)) return cant(`Your account can't import ${kind.label.many}`);

    let data = item.data;
    for (let version = item.version; version < kind.version; version += 1) {
      const migrate = kind.migrations?.[version];
      if (!migrate) throw new Error(`${kind.name} has no migration from version ${version}`);
      data = migrate(data);
    }
    const where = (named: string) => `Item ${index + 1} (${kind.label.one.toLowerCase()} “${named || '?'}”)`;
    const checked = kind.check(data);
    if (!checked.ok) throw new TransferError(400, 'invalid_item', `${where(name)}: ${checked.message}`);
    const used = new Map<string, TransferMediaType>();
    for (const file of kind.media(checked.data)) {
      const bytes = media.get(file.path);
      const problem = !bytes
        ? 'is missing from the file'
        : bytes.length > SIZE_LIMITS[file.type]
          ? `is over ${SIZE_LIMITS[file.type] / (1024 * 1024)} MB`
          : TYPE_CHECKS[file.type](bytes)
            ? undefined
            : TYPE_WORDS[file.type];
      if (problem)
        throw new TransferError(400, 'bad_media', `${where(kind.nameOf(checked.data))}: ${file.what} ${problem}`);
      used.set(file.path, file.type);
    }
    const match = kind.match(checked.data);
    return {
      index,
      kindName: item.kind,
      kind,
      label: kind.label.one,
      name: kind.nameOf(checked.data),
      data: checked.data,
      facts: kind.facts(checked.data),
      status: match.status,
      reason: match.status === 'reused' || match.status === 'cant' ? match.reason : null,
      targets: match.status === 'conflict' ? match.targets : [],
      needs: [],
      canBeDefault: match.status !== 'cant' && kind.canBeDefault === true,
      wasDefault: kind.wasDefault?.(checked.data) ?? false,
      media: used,
    };
  });

  // Of two items in the file that would be saved under one name, of a kind whose names are unique, the later can't be.
  for (const [n, item] of items.entries()) {
    const unique = item.kind?.uniqueNames;
    if (!unique || (item.status !== 'new' && item.status !== 'conflict')) continue;
    const key = (name: string) => (unique === 'exact' ? name : name.toLowerCase());
    const first = items
      .slice(0, n)
      .find(
        (other) =>
          other.kindName === item.kindName &&
          (other.status === 'new' || other.status === 'conflict') &&
          key(other.name) === key(item.name),
      );
    if (first) {
      const reason = `Same name as item ${first.index + 1} of this file`;
      items[n] = { ...item, status: 'cant', reason, targets: [], canBeDefault: false };
    }
  }

  // Which items of the file each needs, such as a theme's fonts.
  for (const item of items) {
    if (item.status === 'cant' || !item.kind?.needs) continue;
    for (const need of item.kind.needs(item.data)) {
      for (const other of items) {
        const key = other.status === 'cant' ? undefined : other.kind?.needKey?.(other.data);
        if (other.kindName === need.kind && key?.toLowerCase() === need.key.toLowerCase()) item.needs.push(other.index);
      }
    }
  }
  return { file: sha256(zip), items, media };
}

/** What the preview replies. */
export const previewOf = (plan: ImportPlan): ImportPreview => ({
  file: plan.file,
  items: plan.items.map((item) => ({
    index: item.index,
    kind: item.kindName,
    label: item.label,
    name: item.name,
    facts: [...item.facts],
    status: item.status,
    reason: item.reason,
    conflicts: [...item.targets],
    needs: item.needs,
    canBeDefault: item.canBeDefault,
    wasDefault: item.wasDefault,
  })),
});

// How each item is saved, or null to skip it, from the choices. Choices that no longer fit what's here are refused as
// changed since the preview; choices that never fit the file are refused as bad choices.
function decide(plan: ImportPlan, choices: Choices): (TransferSave | null)[] {
  if (choices.file !== plan.file) throw new TransferError(409, 'changed_since_preview', CHANGED);
  if (choices.items.length !== plan.items.length) {
    throw new TransferError(400, 'bad_choices', 'Choose what happens to each item of the file');
  }
  return plan.items.map((item, index) => {
    const choice = choices.items[index] ?? { action: 'skip' };
    if (choice.action === 'skip' || item.status === 'reused') return null;
    if (item.status === 'cant') throw new TransferError(400, 'bad_choices', `Item ${index + 1} can't be imported`);
    if (choice.action === 'keep-both') return { as: 'copy' };
    if (choice.action === 'add') {
      if (item.status === 'conflict') throw new TransferError(409, 'changed_since_preview', CHANGED);
      return { as: 'new' };
    }
    if (!item.targets.some((target) => target.id === choice.target)) {
      throw new TransferError(409, 'changed_since_preview', CHANGED);
    }
    return { as: 'replace', id: choice.target };
  });
}

// The order to save in: each item after the items it needs, and items kept as copies after the rest, so a copy's
// free name is free of the names the file's other items are saved under.
function saveOrder(plan: ImportPlan, how: readonly (TransferSave | null)[]): PlannedItem[] {
  const ordered: PlannedItem[] = [];
  const visit = (item: PlannedItem, path: Set<number>) => {
    if (ordered.includes(item) || path.has(item.index)) return;
    path.add(item.index);
    for (const need of item.needs) {
      const needed = plan.items[need];
      if (needed) visit(needed, path);
    }
    ordered.push(item);
  };
  const isCopy = (item: PlannedItem) => (how[item.index]?.as === 'copy' ? 1 : 0);
  for (const item of plan.items.toSorted((a, b) => isCopy(a) - isCopy(b))) visit(item, new Set());
  return ordered;
}

/** Saves the chosen items of a planned file in one transaction, or nothing, and says what it did. */
export function applyImport({
  db,
  mediaDir,
  plan,
  choices,
}: {
  db: AppDatabase;
  mediaDir: string;
  plan: ImportPlan;
  choices: Choices;
}): ImportResult {
  const how = decide(plan, choices);
  if (choices.default !== null) {
    const chosen = plan.items[choices.default];
    if (!chosen?.canBeDefault || !how[choices.default]) {
      throw new TransferError(400, 'bad_choices', 'Only a theme being imported can be made the default');
    }
  }
  const result: ImportResult = { added: 0, replaced: 0, keptBoth: 0, skipped: 0, copies: [] };
  const saved = new Map<string, string>();
  const unused: (string | null)[] = [];
  const kindsSaved = new Set<TransferKind>();
  try {
    db.$client.transaction(() => {
      for (const item of saveOrder(plan, how)) {
        const save = how[item.index];
        if (!save || !item.kind) {
          result.skipped += 1;
          continue;
        }
        const mediaId = (path: string) => {
          const known = saved.get(path);
          const bytes = plan.media.get(path);
          const type = item.media.get(path);
          if (known) return known;
          const id = bytes && type ? saveMedia(db, mediaDir, bytes, TYPE_CHECKS[type]) : null;
          if (!id) throw new Error(`Media ${path} wasn't checked`);
          saved.set(path, id);
          return id;
        };
        const done = item.kind.save(item.data, save, mediaId, { makeDefault: choices.default === item.index });
        unused.push(...(done.unusedMedia ?? []));
        kindsSaved.add(item.kind);
        if (save.as === 'new') result.added += 1;
        else if (save.as === 'replace') result.replaced += 1;
        else {
          result.keptBoth += 1;
          result.copies.push(done.name);
        }
      }
    })();
  } catch (error) {
    // The rows rolled back; the files saved for them go too.
    for (const id of saved.values()) rmSync(join(mediaDir, id), { force: true });
    throw error;
  }
  removeMedia(db, mediaDir, unused);
  for (const kind of kindsSaved) kind.afterImport?.();
  return result;
}
