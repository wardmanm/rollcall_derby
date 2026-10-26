import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Namespace } from 'socket.io';
import type { ConflictTarget, FontFamily, KindName, Role, TransferFact } from '@rollcall/core-contract';

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

/** The type a media file of an export must be: core checks its bytes, as it does an upload's (ADR-0022). */
export type TransferMediaType = 'image' | 'font';

/** A media file an item of an export file uses: its path in the file, its type, and what it is, for messages. */
export interface TransferMedia {
  path: string;
  type: TransferMediaType;
  /** Such as "the photo for Jammy Dodger". */
  what: string;
}

/** Items of another kind that an item needs, by key, such as a theme's font family: `{ kind: 'core:font-face', key }`. */
export interface TransferNeed {
  kind: KindName;
  key: string;
}

/** An item as it goes into an export file. */
export interface ExportedItem {
  name: string;
  /** Its data, of the kind's current version, with media as paths given by `mediaPath`. */
  data: unknown;
  needs?: readonly TransferNeed[];
}

/** How an item of a file meets what's here. */
export type TransferMatch =
  | { status: 'new' }
  /** Items here with the same name, most recently changed first. */
  | { status: 'conflict'; targets: readonly ConflictTarget[] }
  /** An identical item here is used instead, such as a font face. */
  | { status: 'reused'; reason: string }
  | { status: 'cant'; reason: string };

/** How to save an item: as a new one, as a copy under a free name, or in place of an item here, keeping its id. */
export type TransferSave = { as: 'new' } | { as: 'copy' } | { as: 'replace'; id: string };

/**
 * One kind of item in Rollcall export files, owned by the app that stores it (ADR-0024). Core reads and writes the files
 * and calls these; the kind reads and writes its own data. Saving is synchronous, so it joins core's transaction.
 */
export interface TransferKind<Data = unknown> {
  /** `<app id>:<thing>`, such as `producer:theme`. */
  name: KindName;
  /** For people: `{ one: 'Theme', many: 'themes' }`. */
  label: { one: string; many: string };
  /** The version of its data this app writes. */
  version: number;
  /** From each older version to the next: `migrations[1]` turns version 1 data into version 2. */
  migrations?: Readonly<Record<number, (data: unknown) => unknown>>;
  exportPermission: Permission;
  importPermission: Permission;
  /** It travels only as another item's need, never asked for on its own (font faces). */
  onlyAsNeed?: true;
  /** An import can make one item of it the default (themes). */
  canBeDefault?: true;
  /** Every item that can be exported, by id and name. */
  list(): readonly { id: string; name: string }[];
  /** An item for an export file, with each media id turned into a path by `mediaPath`. Undefined for an unknown id. */
  exportItem(id: string, mediaPath: (mediaId: string) => string): ExportedItem | undefined;
  /** The items a need of another item names, such as the uploaded faces of a font family. */
  exportNeed?(key: string, mediaPath: (mediaId: string) => string): readonly ExportedItem[];
  /** Checks an item's data, of the current version: the data as the kind saves it, or its first problem, in words. */
  check(data: unknown): { ok: true; data: Data } | { ok: false; message: string };
  nameOf(data: Data): string;
  /** The facts shown when it conflicts with an item here, such as a team's number of skaters. */
  facts(data: Data): readonly TransferFact[];
  media(data: Data): readonly TransferMedia[];
  /** The items it needs, such as a theme's font families. */
  needs?(data: Data): readonly TransferNeed[];
  /** The key another item's need names it by, such as a font face's family. */
  needKey?(data: Data): string;
  /** Whether it was the default where it was exported, shown only as a hint. */
  wasDefault?(data: Data): boolean;
  match(data: Data): TransferMatch;
  /** Saves it, with each media path turned into its new media id by `mediaId`, and returns the name it was saved under. */
  save(
    data: Data,
    how: TransferSave,
    mediaId: (path: string) => string,
    options: { makeDefault: boolean },
  ): { name: string };
  /** Runs once an import that saved items of this kind is committed, such as telling overlays about a new default. */
  afterImport?(): void;
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
  /** The kinds of item it stores that travel in export files (ADR-0024). */
  transfer?(ctx: AppContext): readonly TransferKind[];
}
