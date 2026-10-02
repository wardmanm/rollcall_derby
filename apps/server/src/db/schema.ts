import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Drizzle schema: the source of truth for tables (docs/architecture/data-model.md maps the concepts).

// Key/value facts about this installation.
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Local accounts (ADR-0008). Usernames are stored lowercase; passwords only as argon2id PHC strings.
// The role values must match ROLES in @obs-producer/shared (a test checks this).
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'producer', 'announcer'] }).notNull(),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Server-side sessions. Only the SHA-256 of the cookie token is stored.
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);
