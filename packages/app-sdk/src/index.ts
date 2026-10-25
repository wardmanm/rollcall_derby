import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Namespace } from 'socket.io';
import type { FontFamily, Role } from '@rollcall/core-contract';

// What an rcl app gives rcl-core to be hosted, and what core gives it back (ADR-0019). Types only: core does the
// hosting. Apps' servers depend on this package and on contracts, never on rcl-core's server.

/** `<app id>:<action>`, such as `core:users.manage`. Each rcl app declares its own, prefixed with its id. */
export type Permission = `${string}:${string}`;

/** Who may call a route or join a Socket.IO namespace (ADR-0018). Every /api route declares one in `config.access`. */
export type Access =
  /** Anyone, signed in or not. The reason is shown in the API explorer. */
  | { public: string }
  /** Any signed-in user. Only `me` and `password` let a pending password change through. */
  | { signedIn: true; allowPendingPasswordChange?: true }
  /** A signed-in user whose role holds this permission. Admins hold every permission. */
  | { permission: Permission };

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: Access;
  }
}

export interface PermissionDef {
  key: Permission;
  /** What it allows. Shown in the API explorer and on the users-and-access feature page. */
  summary: string;
  /** The roles it's granted to besides Admin, which holds every permission. */
  roles: readonly Role[];
  /** Only people may hold it: it can never go on an API key. Account administration is people-only (ADR-0020). */
  peopleOnly?: true;
}

/** An app's web build, served below `/<id>/`. index.html answers every path its pages don't. */
export interface AppWeb {
  /** The production build folder. Skipped while it has no index.html (e.g. in development). */
  dir: string;
  /** More HTML pages, each answering one path below `/<id>/` and everything under it, such as `{ overlay: 'overlay.html' }`. */
  pages?: Record<string, string>;
}

/** Creates Socket.IO namespaces, each checking every client that joins against its `access`. */
export interface Realtime {
  /** `name` is `/<id>` or below it, such as `/producer/overlay`. */
  namespace(name: `/${string}`, options: { access: Access }): Namespace;
}

/** The font library (docs/features/theme-builder.md). Read-only: fonts change through core's own routes. */
export interface FontsService {
  /** Every family as it is now, bundled first, then uploaded ones by name: the same list as `GET /api/core/fonts`. */
  list(): FontFamily[];
}

/**
 * What core gives each app while hosting it: one object per app, passed to both `register()` and `realtime()`, so an
 * app can share state between them through it. Core's data comes through read-only services, fonts first (ADR-0023).
 * Teams, CRG and OBS come later.
 */
export interface AppContext {
  /** Core's logger, labelled with the app's id. */
  log: FastifyBaseLogger;
  /** The version of rcl-core hosting the app. */
  coreVersion: string;
  /** The shared SQLite connection, typed with the app's own schema. Its tables are named `<id>_…`. */
  db<S extends Record<string, unknown>>(schema: S): BetterSQLite3Database<S>;
  fonts: FontsService;
}

/** An rcl app, as rcl-core hosts it (split spec). */
export interface AppModule {
  /** `producer` → /api/producer, /producer/, namespaces /producer…, permissions `producer:*`, tables `producer_*`. */
  id: string;
  title: string;
  version: string;
  /** The rcl-core versions it works with, as a semver range: its package.json `rollcall.requiresCore`. */
  requiresCore: string;
  permissions: readonly PermissionDef[];
  /** Its Drizzle migrations, run with their own migrations table, `__drizzle_migrations_<id>`. */
  migrationsFolder?: string;
  web?: AppWeb;
  /** Adds its routes. `api` is already below `/api/<id>`, and every route declares `config.access`. */
  register?(api: FastifyInstance, ctx: AppContext): void | Promise<void>;
  /** Adds its Socket.IO namespaces. */
  realtime?(rt: Realtime, ctx: AppContext): void;
}
