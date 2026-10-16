import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Drizzle schema: the source of truth for tables (docs/architecture/data-model.md maps the concepts).

// Key/value facts about this installation.
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Local accounts (ADR-0018). Usernames are stored lowercase; passwords only as argon2id PHC strings.
// The role values must match ROLES in @rollcall/core-contract (a test checks this).
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

// API keys for devices and scripts (ADR-0020). Only the SHA-256 of each key is stored, with its first characters so a
// person can tell keys apart. `created_by` keeps the creating Admin's username even after that account is deleted.
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
});
