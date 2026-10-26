import { eq } from 'drizzle-orm';
import { FontFaceItemSchema, type FontFaceItem } from '@rollcall/core-contract';
import type { ExportedItem, TransferKind } from '@rollcall/app-sdk';
import type { z } from 'zod';
import type { Queryable } from '../db.ts';
import { fontFaces } from '../db/schema.ts';
import { addFontFace, bundledFamilyNamed, familyName, fontFaceTaken } from './fonts.ts';

// Uploaded font faces in export files (docs/features/import-export.md, ADR-0024). They travel only with the themes
// that use them; bundled families never travel, since every install has them.

type FontFaceData = z.output<typeof FontFaceItemSchema>;
type FaceRow = typeof fontFaces.$inferSelect;

const weightsOf = (face: { weightMin: number; weightMax: number }) =>
  face.weightMin === face.weightMax ? `${face.weightMin}` : `${face.weightMin}-${face.weightMax}`;
const faceName = (face: { family: string; weightMin: number; weightMax: number; style: string }) =>
  `${face.family} ${weightsOf(face).replace('-', '–')}${face.style === 'italic' ? ' italic' : ''}`;

/** The `core:font-face` kind: it travels with themes, so holders of core:fonts.read export it; Admins import it. */
export function fontFaceKind({ db }: { db: Queryable }): TransferKind<FontFaceData> {
  const exported = (face: FaceRow, mediaPath: (mediaId: string) => string): ExportedItem => {
    const data: FontFaceItem = {
      family: face.family,
      weight: weightsOf(face),
      style: face.style,
      file: mediaPath(face.mediaId),
    };
    return { name: faceName(face), data };
  };
  const faces = () => db.select().from(fontFaces).all();

  return {
    name: 'core:font-face',
    label: { one: 'Font', many: 'fonts' },
    version: 1,
    exportPermission: 'core:fonts.read',
    importPermission: 'core:fonts.manage',
    onlyAsNeed: true,

    list: () => faces().map((face) => ({ id: face.id, name: faceName(face) })),

    exportItem(id, mediaPath) {
      const face = db.select().from(fontFaces).where(eq(fontFaces.id, id)).get();
      return face && exported(face, mediaPath);
    },

    // A family's uploaded faces. A bundled family has none to send.
    exportNeed: (family, mediaPath) =>
      faces()
        .filter((face) => face.family.toLowerCase() === family.toLowerCase())
        .map((face) => exported(face, mediaPath)),

    check(data) {
      const checked = FontFaceItemSchema.safeParse(data);
      return checked.success
        ? { ok: true, data: checked.data }
        : { ok: false, message: checked.error.issues[0]?.message ?? 'Not a font face' };
    },

    nameOf: faceName,
    needKey: (data) => data.family,
    facts: (data) => [
      { label: 'Family', value: data.family },
      { label: 'Weights', value: weightsOf(data) },
      { label: 'Style', value: data.style },
    ],
    media: (data) => [{ path: data.file, type: 'font', what: 'the font file' }],

    match(data) {
      const bundled = bundledFamilyNamed(data.family);
      if (bundled) return { status: 'cant', reason: `${bundled.name} comes with Rollcall, so themes use that` };
      if (fontFaceTaken(db, data)) return { status: 'reused', reason: 'Already here: the one here is used' };
      return { status: 'new' };
    },

    // Faces never conflict, so they're only ever added, joining a family here whose name differs only in case.
    save(data, how, mediaId) {
      if (how.as !== 'new') throw new Error('Font faces are only ever added');
      const { file, ...face } = data;
      const family = familyName(db, face.family);
      addFontFace(db, { ...face, family, mediaId: mediaId(file) });
      return { name: faceName({ ...face, family }) };
    },
  };
}
