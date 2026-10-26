import { z } from 'zod';
import { FONT_FACE_FIELDS, faceWeights } from './fonts.ts';
import { checkMember, CreateMemberRequestSchema, CreateTeamRequestSchema, rosterProblem } from './teams.ts';

// Export files (docs/features/import-export.md, ADR-0024): a .zip holding a manifest and the media its items use. Core
// reads and writes them; each app owns the kinds of item it stores.

export const EXPORT_FORMAT = 'rollcall-export';
/** The export file's layout this Rollcall writes. A newer one is refused. */
export const EXPORT_FORMAT_VERSION = 1;
export const MANIFEST_FILE = 'rollcall-export.json';

/** The largest export file the server accepts: 200 MB. */
export const MAX_EXPORT_BYTES = 200 * 1024 * 1024;
/** The most an export file may unzip to: 400 MB, judged from each entry's stated size before it's unzipped. */
export const MAX_UNZIPPED_BYTES = 400 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
export const MAX_EXPORT_ENTRIES = 10_000;

/** A kind of item, named `<app id>:<thing>`, such as `core:team`. */
export const KindNameSchema = z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, 'Use a kind like core:team');
export type KindName = `${string}:${string}`;

/** A media file in an export: `media/<sha256>.<ext>`, named by its bytes' SHA-256. */
export const MediaPathSchema = z
  .string()
  .regex(/^media\/[0-9a-f]{64}\.[a-z0-9]{1,5}$/, 'Use a media file of this export, such as media/<sha256>.png');

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/** Enough of a manifest to know whether this Rollcall can read the rest. */
export const ManifestHeadSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.number().int().min(1),
});

export const ManifestItemSchema = z.strictObject({
  kind: KindNameSchema,
  version: z.number().int().min(1),
  data: z.unknown(),
});
export type ManifestItem = z.infer<typeof ManifestItemSchema>;

export const ManifestSchema = z.strictObject({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: z.iso.datetime(),
  /** Each installed app's version when the file was made, for people reading it. */
  apps: z.record(z.string(), z.string()),
  items: z.array(ManifestItemSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

const MemberItemSchema = z
  .strictObject({ ...CreateMemberRequestSchema.shape, photo: MediaPathSchema.nullable().default(null) })
  .superRefine(checkMember);

/** A team in an export file, version 1: its details, logo and members, with no ids or times. */
export const TeamItemSchema = z
  .strictObject({
    ...CreateTeamRequestSchema.shape,
    logo: MediaPathSchema.nullable().default(null),
    members: z.array(MemberItemSchema).max(200, 'Use at most 200 members'),
  })
  .superRefine((team, context) => {
    const problem = rosterProblem(team.members);
    if (problem) {
      context.addIssue({ code: 'custom', path: ['members', problem.index, problem.field], message: problem.message });
    }
  });
export type TeamItem = z.input<typeof TeamItemSchema>;

/** An uploaded font face in an export file, version 1. */
export const FontFaceItemSchema = z.strictObject({ ...FONT_FACE_FIELDS, file: MediaPathSchema }).transform(faceWeights);
export type FontFaceItem = z.input<typeof FontFaceItemSchema>;

/**
 * The name an item kept as a copy gets: "<name> copy" for the first, "<name> copy 2" and so on, with the name
 * shortened so the whole fits in `max` characters.
 */
export function copyName(name: string, n: number, max = 64): string {
  const suffix = n === 1 ? ' copy' : ` copy ${n}`;
  return `${name.slice(0, max - suffix.length).trimEnd()}${suffix}`;
}

/** What to export: chosen items, or everything of some kinds. */
export type ExportSelection = { items: { kind: string; id: string }[] } | { kinds: string[] };

// A comma-separated list, without empty entries.
const commaList = (text: string) => text.split(',').filter((part) => part !== '');

/**
 * `GET /transfer/export`'s query string: `items=core:team:<id>,producer:theme:<id>` for chosen items, or
 * `kinds=core:team,producer:theme` for everything of those kinds.
 */
export const ExportQuerySchema = z
  .strictObject({ items: z.string().optional(), kinds: z.string().optional() })
  .transform(({ items, kinds }, context): ExportSelection => {
    if (items !== undefined && kinds === undefined) {
      const picked = commaList(items).map((item) => /^([a-z][a-z0-9-]*:[a-z][a-z0-9-]*):(.+)$/.exec(item));
      if (picked.length > 0 && picked.every((match): match is RegExpExecArray => match !== null)) {
        return { items: picked.map(([, kind = '', id = '']) => ({ kind, id })) };
      }
    }
    if (kinds !== undefined && items === undefined) return { kinds: commaList(kinds) };
    context.addIssue({ code: 'custom', message: 'Choose items, as kind:id, or kinds to export' });
    return z.NEVER;
  });
export type ExportQuery = z.input<typeof ExportQuerySchema>;

/** One fact about an item, shown when it conflicts with one here, such as "Skaters: 14". */
export const TransferFactSchema = z.strictObject({ label: z.string(), value: z.string() });
export type TransferFact = z.infer<typeof TransferFactSchema>;

export const IMPORT_ACTIONS = ['add', 'replace', 'keep-both', 'skip'] as const;

/** What to do with one item of a file: add it, replace an item here (`target`), keep both, or skip it. */
export const ImportChoiceSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('add') }),
  z.strictObject({ action: z.literal('replace'), target: z.string() }),
  z.strictObject({ action: z.literal('keep-both') }),
  z.strictObject({ action: z.literal('skip') }),
]);
export type ImportChoice = z.infer<typeof ImportChoiceSchema>;

/** The choices for a file, item by item in its order, and the theme (by index) to make the default, if any. */
export const ImportChoicesSchema = z.strictObject({
  /** The SHA-256 of the file the choices were made for, from its preview. */
  file: Sha256Schema,
  items: z.array(ImportChoiceSchema),
  default: z.number().int().min(0).nullable().default(null),
});
export type ImportChoices = z.input<typeof ImportChoicesSchema>;

/** `POST /transfer/import`'s query string: the choices, as JSON. */
export const ImportQuerySchema = z.strictObject({
  choices: z
    .string()
    .transform((text, context) => {
      try {
        const choices: unknown = JSON.parse(text);
        return choices;
      } catch {
        context.addIssue({ code: 'custom', message: 'Send the choices as JSON' });
        return z.NEVER;
      }
    })
    .pipe(ImportChoicesSchema),
});

/** What happens to an item: it's new, it conflicts, one here is used instead, or it can't be imported. */
export const PREVIEW_STATUSES = ['new', 'conflict', 'reused', 'cant'] as const;

export const ConflictTargetSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  facts: z.array(TransferFactSchema),
  updatedAt: z.iso.datetime().nullable(),
});
export type ConflictTarget = z.infer<typeof ConflictTargetSchema>;

export const PreviewItemSchema = z.strictObject({
  index: z.number().int().min(0),
  kind: z.string(),
  /** The kind for people, such as "Team". */
  label: z.string(),
  name: z.string(),
  facts: z.array(TransferFactSchema),
  status: z.enum(PREVIEW_STATUSES),
  /** Why it can't be imported, or which item here is used instead. */
  reason: z.string().nullable(),
  /** The items here it conflicts with, most recently changed first. */
  conflicts: z.array(ConflictTargetSchema),
  /** The items of the file it needs, by index, such as a theme's fonts. */
  needs: z.array(z.number().int().min(0)),
  /** Whether it can be made the default (a theme), and whether it was the default where it was exported. */
  canBeDefault: z.boolean(),
  wasDefault: z.boolean(),
});
export type PreviewItem = z.infer<typeof PreviewItemSchema>;

/** What `POST /transfer/import/preview` replies: the file's SHA-256, for the import, and each of its items. */
export const ImportPreviewSchema = z.strictObject({ file: Sha256Schema, items: z.array(PreviewItemSchema) });
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

/** What an import did. `copies` are the names items kept as copies were given. */
export const ImportResultSchema = z.strictObject({
  added: z.number().int(),
  replaced: z.number().int(),
  keptBoth: z.number().int(),
  skipped: z.number().int(),
  copies: z.array(z.string()),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;
