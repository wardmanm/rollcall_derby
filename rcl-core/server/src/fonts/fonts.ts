import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { FONT_TYPES, type FontFamily, type FontStyle, type FontType } from '@rollcall/core-contract';
import type { Queryable } from '../db.ts';
import { fontFaces, media } from '../db/schema.ts';
import { BUNDLED_FAMILIES } from './bundled.ts';

// The font library (docs/features/theme-builder.md): the bundled families, then the uploaded ones, each uploaded face
// a row in font_faces pointing at its file in the media store (ADR-0022).

export interface NewFontFace {
  family: string;
  weightMin: number;
  weightMax: number;
  style: FontStyle;
  mediaId: string;
}

const NAMES = new Intl.Collator('en', { sensitivity: 'base' });
const fontTypeIn = (type: string): FontType | undefined => FONT_TYPES.find((font) => font === type);
// Browsers match family names regardless of case, so the library does too.
const sameName = (a: string, b: string) => NAMES.compare(a, b) === 0;
const byWeight = (a: FontFamily['faces'][number], b: FontFamily['faces'][number]) =>
  a.weightMin - b.weightMin || a.weightMax - b.weightMax || a.style.localeCompare(b.style);

/** Every family, bundled first, then uploaded ones by name, their faces by weight then style. */
export function listFonts(db: Queryable): FontFamily[] {
  const rows = db
    .select({ face: fontFaces, contentType: media.contentType })
    .from(fontFaces)
    .innerJoin(media, eq(fontFaces.mediaId, media.id))
    .all();
  const uploaded = new Map<string, FontFamily>();
  for (const { face, contentType } of rows) {
    const format = fontTypeIn(contentType);
    if (!format) continue;
    const family = uploaded.get(face.family) ?? { name: face.family, bundled: false, faces: [] };
    family.faces.push({
      id: face.id,
      weightMin: face.weightMin,
      weightMax: face.weightMax,
      style: face.style,
      format,
      url: `/media/${face.mediaId}`,
    });
    uploaded.set(face.family, family);
  }
  for (const family of uploaded.values()) family.faces.sort(byWeight);
  const families = [...uploaded.values()].toSorted((a, b) => NAMES.compare(a.name, b.name));
  return [...BUNDLED_FAMILIES, ...families];
}

/** The bundled family with this name, ignoring case, if there is one: uploads may not use a bundled family's name. */
export const bundledFamilyNamed = (name: string) => BUNDLED_FAMILIES.find((family) => sameName(family.name, name));

/** The name an upload's family is stored under: an existing family's spelling when the names differ only in case. */
export function familyName(db: Queryable, name: string): string {
  const existing = db.selectDistinct({ family: fontFaces.family }).from(fontFaces).all();
  return existing.find(({ family }) => sameName(family, name))?.family ?? name;
}

/** Whether `family` already has a face with these weights and style. */
export function fontFaceTaken(db: Queryable, face: Omit<NewFontFace, 'mediaId'>): boolean {
  return db
    .select({
      id: fontFaces.id,
      family: fontFaces.family,
      weightMin: fontFaces.weightMin,
      weightMax: fontFaces.weightMax,
      style: fontFaces.style,
    })
    .from(fontFaces)
    .all()
    .some(
      (row) =>
        sameName(row.family, face.family) &&
        row.weightMin === face.weightMin &&
        row.weightMax === face.weightMax &&
        row.style === face.style,
    );
}

/** Adds an uploaded face, and returns its family as the library lists it. */
export function addFontFace(db: Queryable, face: NewFontFace): FontFamily {
  db.insert(fontFaces)
    .values({ id: randomUUID(), ...face, createdAt: new Date().toISOString() })
    .run();
  const family = listFonts(db).find((f) => !f.bundled && f.name === face.family);
  if (!family) throw new Error(`Font family ${face.family} vanished while adding a face`);
  return family;
}

/** Deletes an uploaded face. Returns its media id for the caller to remove, or undefined when there's no such face. */
export function deleteFontFace(db: Queryable, id: string): string | undefined {
  const row = db.select().from(fontFaces).where(eq(fontFaces.id, id)).get();
  if (!row) return undefined;
  db.delete(fontFaces).where(eq(fontFaces.id, id)).run();
  return row.mediaId;
}
