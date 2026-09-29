import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Drizzle schema: the source of truth for tables (docs/architecture/data-model.md maps the concepts).
// Key/value facts about this installation; the first table, so migrations exist from day one.
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
