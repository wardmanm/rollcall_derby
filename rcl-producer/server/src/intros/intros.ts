import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  DEFAULT_PLACEMENT,
  DEFAULT_ROSTER_OPTIONS,
  RosterOptionsSchema,
  type Intro,
  type RosterOptions,
  type UpdateIntroRequest,
} from '@rollcall/producer-contract';
import { producerIntros } from '../db/schema.ts';
import type { ProducerDatabase } from '../themes/themes.ts';

// Intros (docs/features/skater-intros.md), in the Producer app's own table. Each function runs without awaiting, so a
// check and the write after it can't be split by another request.

const NAMES = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const now = () => new Date().toISOString();

// A stored row, with its options parsed so a setting added since it was saved has its default.
type IntroRow = typeof producerIntros.$inferSelect;
const fromRow = (row: IntroRow): Intro => ({ ...row, options: RosterOptionsSchema.parse(row.options) });

/** Every intro, by name. */
export const listIntros = (db: ProducerDatabase): Intro[] =>
  db
    .select()
    .from(producerIntros)
    .all()
    .map(fromRow)
    .toSorted((a, b) => NAMES.compare(a.name, b.name));

const orUndefined = (row: IntroRow | undefined): Intro | undefined => (row ? fromRow(row) : undefined);

export const findIntro = (db: ProducerDatabase, id: string): Intro | undefined =>
  orUndefined(db.select().from(producerIntros).where(eq(producerIntros.id, id)).get());

/** Whether an intro other than `exceptId` has exactly this name. */
export const introNameTaken = (db: ProducerDatabase, name: string, exceptId?: string): boolean =>
  db
    .select({ id: producerIntros.id })
    .from(producerIntros)
    .where(eq(producerIntros.name, name))
    .all()
    .some((row) => row.id !== exceptId);

export function createIntro(db: ProducerDatabase, { name }: { name: string }): Intro {
  const at = now();
  const row = db
    .insert(producerIntros)
    .values({
      id: randomUUID(),
      name,
      teamAId: null,
      teamBId: null,
      themeId: null,
      placement: DEFAULT_PLACEMENT,
      options: DEFAULT_ROSTER_OPTIONS,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
    .get();
  return fromRow(row);
}

/** Changes what's given. Undefined when there's no such intro. */
export const updateIntro = (
  db: ProducerDatabase,
  id: string,
  // The route's body is parsed, so its options have every setting.
  changes: Omit<UpdateIntroRequest, 'options'> & { options?: RosterOptions },
): Intro | undefined =>
  orUndefined(
    db
      .update(producerIntros)
      .set({ ...changes, updatedAt: now() })
      .where(eq(producerIntros.id, id))
      .returning()
      .get(),
  );

/** Deletes the intro, and returns it. Undefined when there's no such intro. */
export const deleteIntro = (db: ProducerDatabase, id: string): Intro | undefined =>
  orUndefined(db.delete(producerIntros).where(eq(producerIntros.id, id)).returning().get());
