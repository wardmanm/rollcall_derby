import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { copyName } from '@rollcall/core-contract';
import { DEFAULT_TOKENS, type Theme, type ThemeTokens } from '@rollcall/producer-contract';
import type * as schema from '../db/schema.ts';
import { producerThemes } from '../db/schema.ts';

// Themes (docs/features/theme-builder.md), in the Producer app's own table. Each function runs without awaiting, so a
// check and the write after it can't be split by another request.

export type ProducerDatabase = BetterSQLite3Database<typeof schema>;

const NAMES = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const now = () => new Date().toISOString();

/** Every theme, by name. */
export const listThemes = (db: ProducerDatabase): Theme[] =>
  db
    .select()
    .from(producerThemes)
    .all()
    .toSorted((a, b) => NAMES.compare(a.name, b.name));

export const findTheme = (db: ProducerDatabase, id: string): Theme | undefined =>
  db.select().from(producerThemes).where(eq(producerThemes.id, id)).get();

/** The theme the OBS overlay uses, if one is chosen. */
export const findDefaultTheme = (db: ProducerDatabase): Theme | undefined =>
  db.select().from(producerThemes).where(eq(producerThemes.isDefault, true)).get();

/** Whether a theme other than `exceptId` has exactly this name. */
export const themeNameTaken = (db: ProducerDatabase, name: string, exceptId?: string): boolean =>
  db
    .select({ id: producerThemes.id })
    .from(producerThemes)
    .where(eq(producerThemes.name, name))
    .all()
    .some((row) => row.id !== exceptId);

export function createTheme(db: ProducerDatabase, { name, tokens }: { name: string; tokens?: ThemeTokens }): Theme {
  const at = now();
  return db
    .insert(producerThemes)
    .values({ id: randomUUID(), name, tokens: tokens ?? DEFAULT_TOKENS, createdAt: at, updatedAt: at })
    .returning()
    .get();
}

/** Changes what's given. Undefined when there's no such theme. */
export function updateTheme(
  db: ProducerDatabase,
  id: string,
  change: { name?: string; tokens?: ThemeTokens },
): Theme | undefined {
  return db
    .update(producerThemes)
    .set({ ...change, updatedAt: now() })
    .where(eq(producerThemes.id, id))
    .returning()
    .get();
}

/** The first copy name, "<name> copy" or "<name> copy 2" and so on, that no theme has. */
export function freeCopyName(db: ProducerDatabase, name: string): string {
  let n = 1;
  while (themeNameTaken(db, copyName(name, n))) n += 1;
  return copyName(name, n);
}

/** A copy of the theme under the first free copy name, never the default. Undefined when there's no such theme. */
export function duplicateTheme(db: ProducerDatabase, id: string): Theme | undefined {
  const theme = findTheme(db, id);
  if (!theme) return undefined;
  return createTheme(db, { name: freeCopyName(db, theme.name), tokens: theme.tokens });
}

/** Deletes the theme, and returns it. Undefined when there's no such theme. */
export const deleteTheme = (db: ProducerDatabase, id: string): Theme | undefined =>
  db.delete(producerThemes).where(eq(producerThemes.id, id)).returning().get();

/** Makes the theme the default, switching the old one off, or with null leaves no default. False for an unknown id. */
export function setDefaultTheme(db: ProducerDatabase, themeId: string | null): boolean {
  if (themeId !== null && !findTheme(db, themeId)) return false;
  db.transaction((tx) => {
    tx.update(producerThemes).set({ isDefault: false }).where(eq(producerThemes.isDefault, true)).run();
    if (themeId === null) return;
    tx.update(producerThemes).set({ isDefault: true }).where(eq(producerThemes.id, themeId)).run();
  });
  return true;
}
