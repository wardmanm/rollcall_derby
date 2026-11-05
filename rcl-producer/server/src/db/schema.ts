import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { IntroPlacement, RosterOptions, ThemeTokens } from '@rollcall/producer-contract';

// The Producer app's tables (docs/architecture/data-model.md), each named producer_… (ADR-0019).

// Themes (docs/features/theme-builder.md). Names are unique exactly as trimmed, and at most one theme is the default.
export const producerThemes = sqliteTable(
  'producer_themes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    tokens: text('tokens', { mode: 'json' }).$type<ThemeTokens>().notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('producer_themes_one_default')
      .on(table.isDefault)
      .where(sql`${table.isDefault} = 1`),
  ],
);

// Intros (docs/features/skater-intros.md): a saved setup of two teams, a theme and how the cards appear. Team ids refer to
// rcl-core's table, so they aren't foreign keys here; the theme falls back to the default when deleted.
export const producerIntros = sqliteTable('producer_intros', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  teamAId: text('team_a_id'),
  teamBId: text('team_b_id'),
  themeId: text('theme_id').references(() => producerThemes.id, { onDelete: 'set null' }),
  placement: text('placement', { mode: 'json' }).$type<IntroPlacement>().notNull(),
  options: text('options', { mode: 'json' }).$type<RosterOptions>().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
