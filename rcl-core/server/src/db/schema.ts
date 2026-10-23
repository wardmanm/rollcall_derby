import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { IMAGE_TYPES, MEMBER_KINDS, type MemberRole } from '@rollcall/core-contract';

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

// Uploaded images, such as team logos and member photos (ADR-0022). Each is a file named by its id in the data
// folder's media/ folder. The id is 128 random bits, so an image's address can't be guessed.
export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  contentType: text('content_type', { enum: IMAGE_TYPES }).notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
});

// Teams and their members (docs/features/team-builder.md).
export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  leagueName: text('league_name'),
  shortName: text('short_name'),
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  logoMediaId: text('logo_media_id').references(() => media.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Skaters and bench staff. A number is text, so 00 and 07 keep their zeros; only skaters have one, and no two skaters
// on a team share it (bench staff's null numbers never clash).
export const teamMembers = sqliteTable(
  'team_members',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: MEMBER_KINDS }).notNull(),
    name: text('name').notNull(),
    number: text('number'),
    pronouns: text('pronouns'),
    roles: text('roles', { mode: 'json' }).$type<MemberRole[]>().notNull(),
    customRoles: text('custom_roles', { mode: 'json' }).$type<string[]>().notNull(),
    photoMediaId: text('photo_media_id').references(() => media.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  // Also serves lookups of a team's members.
  (table) => [uniqueIndex('team_members_team_number_idx').on(table.teamId, table.number)],
);

// Every column that refers to media. The startup sweep keeps only media that one of them refers to: add new ones here.
export const MEDIA_REFERENCES = [
  { table: teams, column: teams.logoMediaId },
  { table: teamMembers, column: teamMembers.photoMediaId },
] as const;
