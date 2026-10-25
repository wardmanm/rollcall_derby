import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ThemeTokens } from '@rollcall/producer-contract';

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
