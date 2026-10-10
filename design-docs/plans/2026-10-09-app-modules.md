# rcl-core Hosts rcl Apps as Modules (#5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rcl-core's server hosts each rcl app as an app module, itself included as module `core`. Each module gets:
- its routes below `/api/<id>/`;
- its Socket.IO namespaces at or below `/<id>`;
- its web build at `/<id>/`;
- its own permissions and migrations.

The Producer app's server code moves into `rcl-producer/server`, and the overlay's live connection becomes `/producer/overlay`. ADR-0019 records the decision.

**Architecture:**
- **`packages/app-sdk` (`@rollcall/app-sdk`)** holds types only: `AppModule`, `AppContext`, `Realtime`, `AppWeb`, and the `Access`, `Permission` and `PermissionDef` types. The Fastify `config.access` augmentation moves there from core's `access.ts`.
- **`rcl-core/server/src/apps.ts`** provides `hostApps()`, the startup checks for each app:
  - a valid id that no other app uses;
  - a `requiresCore` range that this core's version satisfies (checked with `semver`);
  - permissions under the app's own id.

  Then it runs the app's migrations in its own table. A failing app is skipped with a logged error, and core keeps running. Core itself is always hosted.
- **`buildApp`** hosts `[coreApp, ...apps]`:
  - Each app's `register()` runs as a child plugin of the authenticated `/api` plugin, at `/api/<id>`. Every app's routes therefore get the cross-site check and caller lookup.
  - `enforceRouteAccess` reads a route's owner from its path.
  - Unknown `/api/*` paths answer `404 {"error":"not_found"}`.
  - The web builds come from the hosted apps.
- **`attachRealtime`** lets each hosted app add its namespaces, at or below `/<id>`.
- **`rcl-core/server/src/installed-apps.ts`** is the only place core's server imports an app.
- **`scripts/check-boundaries.test.mjs`** keeps the dependency rules.

**Tech Stack:** Fastify 5.12, `@fastify/static` 10, Socket.IO 4.8, Drizzle 0.45 + better-sqlite3 (`migrate(..., { migrationsTable })`), `semver` 7.8.5 (new) with `@types/semver` 7.8.0, Zod 4, Node ≥ 24.7, TypeScript 7, Vitest 5, `node --test` for scripts.

**Spec:** [`design-docs/specs/2026-10-07-rollcall-split-design.md`](../specs/2026-10-07-rollcall-split-design.md). This plan implements "AppModule (packages/app-sdk)", the dependency rules under "Target layout", and Phase 4b. Issue: **#5**. It also folds in items deferred from the Phase 3 and 4a reviews; see Decisions.

**How this plan was checked:** every code block was built on a throwaway branch, which ended with:
- `yarn check` passing, with 219 unit tests and 84 script tests;
- the 8 story tests and 5 e2e tests passing;
- the docs lint passing.

The tasks are cut so that each commit stays green.

## Global Constraints

- **The `AppModule` shape**, from the spec:
  ```ts
  export interface AppModule {
    id: string;                 // 'producer' → /api/producer, /producer/, ns /producer…, perms 'producer:*', tables producer_*
    title: string; version: string;
    requiresCore: string;       // semver range from package.json "rollcall.requiresCore"
    permissions: readonly PermissionDef[];        // { key: 'producer:themes.edit', summary, roles: ['producer'] }
    migrationsFolder?: string;  // run with migrationsTable `__drizzle_migrations_<id>`
    web?: { dir: string; pages?: Record<string, string> };   // { overlay: 'overlay.html' }; index.html = SPA fallback
    register(api: FastifyInstance, ctx: AppContext): void | Promise<void>;  // already prefixed /api/<id>
    realtime?(rt: { namespace(name: `/${string}`, o: { access: Access }): Namespace }, ctx: AppContext): void;
  }
  export interface AppContext {
    log: FastifyBaseLogger; coreVersion: string;
    db<S extends Record<string, unknown>>(schema: S): BetterSQLite3Database<S>;   // same SQLite connection
  }
  ```
- **Startup**, from the spec:
  1. Run core's migrations. Core keeps the default migrations table, so existing databases still open.
  2. For each installed module, check that its id is unique and that `semver.satisfies(coreVersion, requiresCore)`. If either check fails, log a clear error, skip that module and keep core running.
  3. Run the module's migrations, then register its routes, namespaces and web dir.
- **Data ownership:** app tables are prefixed `<id>_`, and a test enforces it. There are no foreign keys across apps.
- **`GET /api/core/apps`** (signed in) feeds the app launcher on core's home page.
- **A unit test asserts that every installed app accepts the current core version.**
- **Dependency rules**, checked by `scripts/check-boundaries.test.mjs`:
  - An app's server depends only on `app-sdk` and contract packages. It never depends on `core-server` or on another app's server.
  - `core-server` depends on the app servers through an explicit list, `rcl-core/server/src/installed-apps.ts`. That is the only edge from core to an app.
- **URLs:** routes move under `/api/core/*`, and the overlay namespace becomes `/producer/overlay`. Unknown `/api/*` paths return `404 {error:'not_found'}`. Playwright's health URL moves to `/api/core/health`.
- **Fastify:** `onRoute` also sees the HEAD routes Fastify adds automatically; they inherit `config.access`.
- **Drizzle:** never edit the SQL of existing migrations, because the hashes are checked.
- **ADR-0019** supersedes ADR-0004 and ADR-0007. It restates hard rules 3 and 4 for rcl-core, keeping their wording, so `AGENTS.md` changes only their links.
- **One new third-party dependency:**
  - `semver` `^7.8.5` and `@types/semver` `^7.8.0` in `@rollcall/core-server`. Both were checked current, and both are past Yarn's 24-hour quarantine.
  - Every other new workspace reuses version ranges already in the repo.
  - The lockfile diff only adds the new workspaces, `semver` and `@types/semver`.
- **Runtime and TypeScript (ADR-0013):** `.ts` extensions on relative imports, erasable syntax only, `import type` for types.
- **No `as` casts in `src/`** outside tests, and **no new inline `oxlint-disable`.**
- **Every commit passes `yarn format && yarn check`.** Tasks 2 and 3 also pass `yarn build && yarn test:stories && yarn test:e2e`.
- **Commits** follow Conventional Commits, with scope `sdk`, `rcl-core`, `rcl-producer` or `repo`.
  - Each ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  - Task 6's commit says `Closes #5`.
- **Nothing is pushed** without Mike's explicit OK (Task 7).

## Review Focus

1. **An installed app that can't be hosted:** a `requiresCore` this core doesn't satisfy, a bad id, a foreign permission, or a migration that fails. Core must keep serving and log why, and the app's routes must answer `not_found`. Tests in Task 1 (`hostApps`) and Task 2 (`app.test.ts`).
2. **A route or namespace that strays outside its app:** a route not below a hosted app's `/api/<id>/`, a core route borrowing `producer:…`, or a namespace outside `/<id>`. Each must stop startup with a clear message. Tests in Tasks 2 and 3.
3. **Clients still using old addresses:** `GET /api/health`, or an OBS source with a cached overlay page joining `/overlay`. The first gets `404 not_found`; the second gets `Invalid namespace` until the source is refreshed, and the CHANGELOG says to refresh. Tests in Tasks 2 and 3.
4. **An app's own routes** must get core's cross-site check, caller lookup and guard. This was deferred from the Phase 3 review. Test in Task 2.
5. **An existing database** still opens: core keeps Drizzle's default migrations table, and each app gets its own. Covered by `server.test.ts`'s existing seeded-database test, plus the per-app migrations test in Task 1.

## Decisions this plan makes

The spec leaves these open. Each is decided here so implementers and reviewers don't have to guess.

- **`register` is optional on `AppModule`.** The Producer app has no routes yet, so `/docs` shows no `producer/…` tags until it does.
- **The access types live in `@rollcall/app-sdk`, because apps declare access too.** Enforcement (`createPermissions`, `deny`, `enforceRouteAccess`) stays in rcl-core. Core's `access.ts` re-exports the types, so its own imports don't change.
- **Hosting happens in `buildApp`,** which needs Fastify's logger. `buildApp` decorates the instance with `hostedApps`, and `startServer` passes that to `attachRealtime`.
- **Core's module has `requiresCore` equal to its own version,** and core is always hosted first. It's never skipped.
- **Startup also checks the id's format** (`^[a-z][a-z0-9-]*$`) and that every permission sits under the app's id. An app whose migrations throw is skipped too.
- **Table names are enforced by a test over `INSTALLED_APPS`** (`installed-apps.test.ts`, using `tablesCreatedBy`), as the spec says, not at runtime. A migration can't be undone after it has run.
- **A route's owner is the path segment after `/api/`.** A route under an id no hosted app has stops startup.
- **`testApp` hosts only core by default**, at version 1.0.0. The route inventory and the realtime tests host `INSTALLED_APPS` at the real `CORE_VERSION`.
- **`GET /api/core/apps` lists every hosted app, core included,** with `url` `/<id>/` when the app has a web build. The launcher UI on core's home page comes with #11, since the route needs a session and there's no sign-in page yet.
- **The overlay's `server:hello` contract moves to `@rollcall/producer-contract`** (`git mv`), and its `version` is still rcl-core's version. Core's server tests use the literal event name `'server:hello'`, so core's server never depends on an app's contract.
- **The boundary check follows the existing scripts' pattern:** `scripts/check-boundaries.mjs` plus its `.test.mjs`, run by `yarn test:scripts`. It also checks that every `@rollcall` import is listed in the workspace's `package.json`, because hoisted `node_modules` would otherwise hide a missing one.
- **Folded in from earlier reviews:**
  - each app's routes go inside the `/api` plugin, with a test;
  - web builds come from the hosted apps, and each base must be `/<id>/`;
  - HEAD gets app pages, as GET does;
  - `attachRealtime` runs inside `startServer`'s cleanup `try`;
  - a "don't catch this" note on the `io.of()` tripwire;
  - the stale `config.ts` comment;
  - the testing guide's count of tests that need real Node APIs.
- **Not done:**
  - a 404 for missing assets below an app's base;
  - making `Access` a discriminated union;
  - `describeAccess` overwriting a route's own description;
  - the password-change reply using the user from before the hash;
  - the dev-only proxy details.

  These remain deferred minors.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `packages/app-sdk/**`, `rcl-core/server/src/apps.ts` (+ test), `src/auth/access.ts`, `src/testing.ts`, `rcl-core/server/package.json` | The app SDK and the startup checks | 1 |
| `rcl-core/server/src/{core-app.ts,app.ts,web-apps.ts,server.ts,installed-apps.ts,openapi.ts,config.ts}`, `src/auth/access.ts`, `src/routes/*.ts`, `rcl-producer/server/**`, `packages/web-sdk/src/{api,health}.ts`, `rcl-core/contract/src/health.ts`, `e2e/playwright.config.ts`, and the server tests | Core as module `core` at `/api/core`, hosting apps over HTTP | 2 |
| `rcl-producer/contract/**` (moved from `rcl-core/contract/src/realtime*`), `rcl-producer/server/src/index.ts` (+ test), `rcl-core/server/src/{realtime,server}.ts` (+ tests), `rcl-producer/web/src/overlay/live.ts`, `vitest.config.ts` | Apps' namespaces, and the overlay at `/producer/overlay` | 3 |
| `rcl-core/contract/src/apps.ts` (+ test), `rcl-core/server/src/core-app.ts`, `src/openapi.ts`, `src/routes/apps.test.ts` | `GET /api/core/apps` | 4 |
| `scripts/check-boundaries.mjs` (+ test) | The boundary check | 5 |
| `docs/decisions/0019-…`, `0004`, `0007`, `AGENTS.md`, `rcl-*/AGENTS.md`, `rcl-producer/CLAUDE.md`, `.claude/rules/*`, `docs/**`, `CHANGELOG.md`, ADR-0004/0007 links in code comments | ADR-0019 and the docs | 6 |

All paths are relative to the repo root.

---

### Task 1: The app SDK, and the startup checks for hosted apps

**Files:**
- Create: `packages/app-sdk/{package.json,tsconfig.json,src/index.ts}`, `rcl-core/server/src/apps.ts`, `rcl-core/server/src/apps.test.ts`
- Modify: `rcl-core/server/package.json`, `rcl-core/server/src/auth/access.ts`, `rcl-core/server/src/testing.ts`, `yarn.lock`

**Interfaces:**
- Produces, from `@rollcall/app-sdk`: `Permission`, `Access`, `PermissionDef`, `AppWeb`, `Realtime`, `AppContext` and `AppModule` (shapes in Global Constraints, with `register` optional), plus the augmentation `FastifyContextConfig.access?: Access`.
- Produces, from `rcl-core/server/src/apps.ts`:
  - `interface HostedApps { modules: readonly AppModule[]; permissions: Permissions; webApps: WebApp[]; contextFor(module: AppModule): AppContext }`;
  - `hostApps({ core, apps, coreVersion, db, log }): HostedApps`;
  - `migrateApp(app: AppModule, db: AppDatabase): void`;
  - `migrationsTableFor(id: string): string`.
- Produces, from `testing.ts`: `tableNames(db): string[]` and `tablesCreatedBy(app: AppModule): string[]`.

- [ ] **Step 0: Branch, and commit this plan.**

```bash
git switch -c feat/app-modules
git add design-docs/plans/2026-10-09-app-modules.md
git commit -F - <<'EOF'
docs(repo): plan for rcl apps hosted as modules

Phase 4b of the Rollcall split spec (#5).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Remind Mike, in one line, to move #5 to "In progress" on board #6.

- [ ] **Step 1: Write the failing tests.** Create `rcl-core/server/src/apps.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { AppModule } from '@rollcall/app-sdk';
import { hostApps, migrationsTableFor } from './apps.ts';
import { openMemoryDatabase } from './db.ts';
import { tableNames, tablesCreatedBy } from './testing.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const testLog = (): FastifyBaseLogger =>
  ({
    error: vi.fn<(obj: object, msg: string) => void>(),
    child: vi.fn<() => FastifyBaseLogger>(() => testLog()),
  }) as unknown as FastifyBaseLogger;

const app = (overrides: Partial<AppModule> = {}): AppModule => ({
  id: 'demo',
  title: 'Demo',
  version: '1.0.0',
  requiresCore: '^1.0.0',
  permissions: [],
  ...overrides,
});
const core = app({ id: 'core', title: 'Rollcall', requiresCore: '1.0.0' });

// A Drizzle migrations folder holding one migration.
function migrations(sql: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rollcall-migrations-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'meta'));
  const entries = [{ idx: 0, version: '6', when: 1, tag: '0000_init', breakpoints: true }];
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries }));
  writeFileSync(join(dir, '0000_init.sql'), sql);
  return dir;
}

function host(apps: AppModule[]) {
  const { db } = openMemoryDatabase();
  const log = testLog();
  return { db, log, hosted: hostApps({ core, apps, coreVersion: '1.0.0', db, log }) };
}

describe('hostApps', () => {
  it('hosts core first, then each app that passes its checks, in order', () => {
    const { hosted } = host([app({ id: 'demo' }), app({ id: 'other', requiresCore: '>=0.9' })]);
    expect(hosted.modules.map((m) => m.id)).toEqual(['core', 'demo', 'other']);
  });

  it('skips an app that needs another rcl-core version, says why in the log, and keeps going', () => {
    const { hosted, log } = host([app({ id: 'old', requiresCore: '^2.0.0' }), app()]);
    expect(hosted.modules.map((m) => m.id)).toEqual(['core', 'demo']);
    expect(log.error).toHaveBeenCalledWith(
      { app: 'old' },
      'Skipping rcl app "old": it needs rcl-core ^2.0.0, and this is rcl-core 1.0.0',
    );
  });

  it('skips an app with a bad or taken id, a bad version range, or permissions that are not its own', () => {
    for (const [bad, problem] of [
      [app({ id: 'Demo' }), 'its id "Demo" must be lowercase letters, digits and dashes'],
      [app({ id: 'core' }), 'another app already uses the id "core"'],
      [app({ requiresCore: 'soon' }), 'its requiresCore "soon" isn\'t a version range'],
      [
        app({ permissions: [{ key: 'core:users.manage', summary: 'x', roles: [] }] }),
        "its permission core:users.manage isn't one of its own (demo:…)",
      ],
    ] as const) {
      const { hosted, log } = host([bad]);
      expect(
        hosted.modules.map((m) => m.id),
        problem,
      ).toEqual(['core']);
      expect(log.error).toHaveBeenCalledWith({ app: bad.id }, `Skipping rcl app "${bad.id}": ${problem}`);
    }
  });

  it("runs an app's migrations in its own migrations table, leaving core's alone", () => {
    const folder = migrations('CREATE TABLE `demo_things` (`id` text PRIMARY KEY NOT NULL);');
    const { db, hosted } = host([app({ migrationsFolder: folder })]);
    expect(hosted.modules.map((m) => m.id)).toEqual(['core', 'demo']);
    expect(tableNames(db)).toEqual(expect.arrayContaining(['demo_things', migrationsTableFor('demo')]));
    const coreMigrations = db.$client.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number };
    expect(coreMigrations.n).toBe(2);
  });

  it('skips an app whose migrations fail', () => {
    const { hosted, log } = host([app({ migrationsFolder: migrations('CREATE TABLE oops (') })]);
    expect(hosted.modules.map((m) => m.id)).toEqual(['core']);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ app: 'demo' }),
      'Skipping rcl app "demo": its migrations failed',
    );
  });

  it("gathers the hosted apps' permissions and web builds, core's first", () => {
    const { hosted } = host([
      app({
        permissions: [{ key: 'demo:things.edit', summary: 'Edit things', roles: ['producer'] }],
        web: { dir: '/builds/demo', pages: { overlay: 'overlay.html' } },
      }),
      app({ id: 'old', requiresCore: '^2.0.0', web: { dir: '/builds/old' } }),
    ]);
    expect(hosted.permissions.granted('producer', 'demo:things.edit')).toBe(true);
    expect(hosted.webApps).toEqual([{ base: '/demo/', dir: '/builds/demo', pages: { overlay: 'overlay.html' } }]);
  });
});

describe("an app's tables", () => {
  it('are found, so a test can check they are named after the app', () => {
    const folder = migrations('CREATE TABLE `things` (`id` text PRIMARY KEY NOT NULL);');
    expect(tablesCreatedBy(app({ migrationsFolder: folder }))).toEqual(['things']);
  });
});
```

Append to `rcl-core/server/src/testing.ts`:

```ts
/** The tables in the database, by name. */
export function tableNames(db: AppDatabase): string[] {
  return db.$client
    .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

/** The tables an app's migrations create, besides its migrations table, on a fresh database with core's tables. */
export function tablesCreatedBy(app: AppModule): string[] {
  const { db, sqlite } = openMemoryDatabase();
  try {
    const before = new Set(tableNames(db));
    migrateApp(app, db);
    return tableNames(db).filter((name) => !before.has(name) && name !== migrationsTableFor(app.id));
  } finally {
    sqlite.close();
  }
}
```

Then, at the top of `testing.ts`:
- add `import type { AppModule } from '@rollcall/app-sdk';` as the first import;
- add `import { migrateApp, migrationsTableFor } from './apps.ts';` after the `app.ts` import.

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server/src/apps.test.ts`
Expected: FAIL. `./apps.ts` and `@rollcall/app-sdk` don't exist yet.

- [ ] **Step 3: Make the SDK.** Create `packages/app-sdk/package.json`:

```json
{
  "name": "@rollcall/app-sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@rollcall/core-contract": "workspace:^"
  },
  "peerDependencies": {
    "drizzle-orm": "^0.45.3",
    "fastify": "^5.12.5",
    "socket.io": "^4.8.4"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^9.6.0",
    "@types/node": "^24",
    "drizzle-orm": "^0.45.3",
    "fastify": "^5.12.5",
    "socket.io": "^4.8.4",
    "typescript": "^7.0.2"
  }
}
```

Create `packages/app-sdk/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src"]
}
```

Create `packages/app-sdk/src/index.ts`:

```ts
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Namespace } from 'socket.io';
import type { Role } from '@rollcall/core-contract';

// What an rcl app gives rcl-core to be hosted, and what core gives it back (ADR-0019). Types only: core does the
// hosting. Apps' servers depend on this package and on contracts, never on rcl-core's server.

/** `<app id>:<action>`, such as `core:users.manage`. Each rcl app declares its own, prefixed with its id. */
export type Permission = `${string}:${string}`;

/** Who may call a route or join a Socket.IO namespace (ADR-0018). Every /api route declares one in `config.access`. */
export type Access =
  /** Anyone, signed in or not. The reason is shown in the API explorer. */
  | { public: string }
  /** Any signed-in user. Only `me`, `password` and `logout` let a pending password change through. */
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

/** What core gives each app while hosting it. Core data services (teams, players, logos), CRG and OBS come later. */
export interface AppContext {
  /** Core's logger, labelled with the app's id. */
  log: FastifyBaseLogger;
  /** The version of rcl-core hosting the app. */
  coreVersion: string;
  /** The shared SQLite connection, typed with the app's own schema. Its tables are named `<id>_…`. */
  db<S extends Record<string, unknown>>(schema: S): BetterSQLite3Database<S>;
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
```

In `rcl-core/server/src/auth/access.ts`:
- **Remove** the `Permission` and `Access` types, the `declare module 'fastify'` block, and the `PermissionDef` interface: everything from the `` /** `<app id>:<action>` `` comment down to (not including) `export interface Permissions {`.
- **Put this** in their place:

```ts
export type { Access, Permission, PermissionDef } from '@rollcall/app-sdk';

```

- **Add** `import type { Access, Permission, PermissionDef } from '@rollcall/app-sdk';` as the second import.

In `rcl-core/server/package.json`:
- add `"@rollcall/app-sdk": "workspace:^"` and `"semver": "^7.8.5"` to `dependencies`;
- add `"@types/semver": "^7.8.0"` to `devDependencies`;
- keep both lists alphabetical.

- [ ] **Step 4: Write the startup checks.** Create `rcl-core/server/src/apps.ts`:

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyBaseLogger } from 'fastify';
import { satisfies, validRange } from 'semver';
import type { AppContext, AppModule } from '@rollcall/app-sdk';
import { createPermissions, type Permissions } from './auth/access.ts';
import type { AppDatabase } from './db.ts';
import type { WebApp } from './web-apps.ts';

/** The rcl apps this server hosts, after their startup checks (ADR-0019). */
export interface HostedApps {
  /** Core first, then each app that passed its checks, in the order installed. */
  modules: readonly AppModule[];
  /** Every hosted app's permissions. */
  permissions: Permissions;
  /** Each hosted app's web build, below `/<id>/`. Core's comes first, so `/` redirects to it. */
  webApps: WebApp[];
  contextFor(module: AppModule): AppContext;
}

const APP_ID = /^[a-z][a-z0-9-]*$/;

/** The migrations table for an app's own migrations. Core keeps Drizzle's default, so existing databases still open. */
export const migrationsTableFor = (id: string) => `__drizzle_migrations_${id}`;

// Why `app` can't be hosted next to the apps already accepted, or null when it can.
function appProblem(app: AppModule, accepted: readonly AppModule[], coreVersion: string): string | null {
  if (!APP_ID.test(app.id)) return `its id "${app.id}" must be lowercase letters, digits and dashes`;
  if (accepted.some((other) => other.id === app.id)) return `another app already uses the id "${app.id}"`;
  if (!validRange(app.requiresCore)) return `its requiresCore "${app.requiresCore}" isn't a version range`;
  if (!satisfies(coreVersion, app.requiresCore)) {
    return `it needs rcl-core ${app.requiresCore}, and this is rcl-core ${coreVersion}`;
  }
  const foreign = app.permissions.find((def) => !def.key.startsWith(`${app.id}:`));
  if (foreign) return `its permission ${foreign.key} isn't one of its own (${app.id}:…)`;
  try {
    createPermissions(app.permissions);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

/** Runs an app's own migrations, in its own migrations table. */
export function migrateApp(app: AppModule, db: AppDatabase): void {
  if (!app.migrationsFolder) return;
  migrate(drizzle(db.$client), { migrationsFolder: app.migrationsFolder, migrationsTable: migrationsTableFor(app.id) });
}

// Startup for rcl apps (split spec). Core's own tables are already migrated (db.ts), and core is always hosted. Each
// other app needs a valid id no other app uses, a requiresCore range this core satisfies, and permissions under its
// own id; then its migrations run. An app that fails is skipped with an error in the log, and core keeps running.
export function hostApps({
  core,
  apps,
  coreVersion,
  db,
  log,
}: {
  core: AppModule;
  apps: readonly AppModule[];
  coreVersion: string;
  db: AppDatabase;
  log: FastifyBaseLogger;
}): HostedApps {
  const modules: AppModule[] = [core];
  for (const app of apps) {
    const problem = appProblem(app, modules, coreVersion);
    if (problem) {
      log.error({ app: app.id }, `Skipping rcl app "${app.id}": ${problem}`);
      continue;
    }
    try {
      migrateApp(app, db);
    } catch (error) {
      log.error({ app: app.id, err: error }, `Skipping rcl app "${app.id}": its migrations failed`);
      continue;
    }
    modules.push(app);
  }
  return {
    modules,
    permissions: createPermissions(modules.flatMap((module) => module.permissions)),
    webApps: modules.flatMap((module) => (module.web ? [{ base: `/${module.id}/`, ...module.web }] : [])),
    contextFor: (module) => ({
      log: log.child({ app: module.id }),
      coreVersion,
      db: (schema) => drizzle(db.$client, { schema }),
    }),
  };
}
```

Run `yarn install`. The lockfile gains `@rollcall/app-sdk`, `semver` and `@types/semver`.

- [ ] **Step 5: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server/src/apps.test.ts`
Expected: PASS, 7 tests. `yarn test` in full shows 207 tests passing.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add -A packages/app-sdk rcl-core/server yarn.lock
git commit -F - <<'EOF'
feat(sdk): app SDK, and rcl-core's startup checks for hosted apps

@rollcall/app-sdk holds the types an rcl app's server module is written
against (AppModule, AppContext, Realtime, Access, permissions). rcl-core's
hostApps() checks each app's id, requiresCore range and permissions, runs its
migrations in its own table, and skips an app that fails with a logged error.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Core becomes module `core`, and the server hosts apps' routes and web builds

**Files:**
- Create:
  - `rcl-core/server/src/{core-app.ts,installed-apps.ts,installed-apps.test.ts}`;
  - `rcl-producer/server/{package.json,tsconfig.json,src/index.ts}`.
- Modify:
  - `rcl-core/server/src/{app.ts,web-apps.ts,server.ts,openapi.ts,config.ts,testing.ts}`, `src/auth/access.ts`, `src/routes/{setup,auth,users}.ts`;
  - `rcl-core/server/package.json`, `rcl-core/contract/src/health.ts`;
  - `packages/web-sdk/src/{api.ts,api.test.ts,health.ts}`, `e2e/playwright.config.ts`, `yarn.lock`.
- Test: `rcl-core/server/src/{app.test.ts,web-apps.test.ts,openapi.test.ts,installed-apps.test.ts}`, `src/auth/{access,guard,route-inventory}.test.ts`, `src/routes/{auth,setup,users}.test.ts`, `src/http.test.ts`, `src/server.test.ts`

**Interfaces:**
- Consumes: `hostApps`, `HostedApps`, `tablesCreatedBy` (Task 1).
- Produces:
  - `coreApp({ version, db, webDir? }): AppModule`, in `core-app.ts`;
  - `AppOptions` loses `webApps` and `permissions`, and gains `coreWebDir?: string` and `apps?: readonly AppModule[]`;
  - `app.hostedApps: HostedApps` (a Fastify decoration);
  - `enforceRouteAccess(app, { appIds, permissions })`;
  - `serveWebApps(app, webApps)` now returns `(path) => { dir, file } | undefined`;
  - `INSTALLED_APPS: readonly AppModule[]` and `CORE_VERSION`, in `testing.ts`;
  - `producerApp: AppModule` from `@rollcall/producer-server`, with only `web` for now.

- [ ] **Step 1: Point the tests at `/api/core/` and at hosted apps.**

1. Rewrite the paths mechanically:

```bash
cd rcl-core/server/src
perl -pi -e 's#([\x27`" }])/api/#$1/api/core/#g' auth/access.test.ts auth/guard.test.ts auth/route-inventory.test.ts \
  http.test.ts openapi.test.ts app.test.ts routes/auth.test.ts routes/setup.test.ts routes/users.test.ts server.test.ts web-apps.test.ts
cd -
```

Every `/api/…` path in those tests is now `/api/core/…`. The only `/api` mentions left are comments and `startsWith('/api')` checks.

2. **In `auth/access.test.ts`:**
   - Add `import type { AppModule } from '@rollcall/app-sdk';` after the `fastify` import.
   - After the `PRODUCER_THEMES` constant, add:

```ts
// A hosted app with only a permission, so core routes can try to borrow it.
const PRODUCER_APP: AppModule = {
  id: 'producer',
  title: 'Producer',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [PRODUCER_THEMES],
};
```

   - Replace `startWith`'s signature and first line with:

```ts
async function startWith(register: (api: FastifyInstance) => void) {
  const { app } = testApp({ apps: [PRODUCER_APP], registerRoutes: register });
```

   - Before `it('leave routes outside /api alone'`, add:

```ts
  it("stop the server at startup when a route isn't below a hosted app's /api/<id>/", async () => {
    await expect(startWith(routeAt('/api/nobody/things', { signedIn: true }))).rejects.toThrow(
      "GET /api/nobody/things isn't below /api/<id>/ for a hosted app (core, producer)",
    );
  });

```

   - At the end of the file, append:

```ts

// A hosted app with one route that only Producers may use (ADR-0019).
const DEMO_APP: AppModule = {
  id: 'demo',
  title: 'Demo',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [{ key: 'demo:things.edit', summary: 'Edit things', roles: ['producer'] }],
  register(api) {
    api.post('/things', { config: { access: { permission: 'demo:things.edit' } } }, async () => ({ ok: true }));
  },
};

describe("a hosted app's routes", () => {
  it("get the same cross-site check, caller lookup and guard as core's", async () => {
    const { app, db } = testApp({ apps: [DEMO_APP] });
    const post = (cookies: Record<string, string>, headers: Record<string, string> = {}) =>
      app.inject({ method: 'POST', url: '/api/demo/things', payload: {}, cookies, headers });
    const producer = await cookieFor(db, 'p1', 'producer');
    expect((await post({})).json()).toEqual({ error: 'unauthenticated' });
    expect((await post(producer, { origin: 'http://evil.example' })).json()).toEqual({ error: 'cross_origin' });
    expect((await post(await cookieFor(db, 'a1', 'announcer'))).json()).toEqual({ error: 'forbidden' });
    expect((await post(producer)).json()).toEqual({ ok: true });
  });
});
```

3. **In `auth/route-inventory.test.ts`:**
   - Replace the four imports of `testing.ts`, `access.ts`, `guard.ts` and `permissions.ts` with:

```ts
import { INSTALLED_APPS } from '../installed-apps.ts';
import { addUser, CORE_VERSION, testApp } from '../testing.ts';
import type { Access } from './access.ts';
import { SESSION_COOKIE } from './guard.ts';
```

   - Delete `const permissions = createPermissions(CORE_PERMISSIONS);`.
   - In `inventory`, the `testApp({` call starts:

```ts
  // Every installed app, hosted at this core's version, so the sweeps cover all of their routes.
  const { app, db } = testApp({
    version: CORE_VERSION,
    apps: INSTALLED_APPS,
    ...options,
```

   - In the role sweep, insert `const { permissions } = inv.app.hostedApps;` as the first line inside the `for (const role of …)` loop.

4. **In `openapi.test.ts`,** the expectation `toEqual(['users'])` becomes `toEqual(['core/users'])`.

5. **Replace `app.test.ts`** with:

```ts
import { describe, expect, it } from 'vitest';
import { APP_NAME, HealthResponseSchema } from '@rollcall/core-contract';
import type { AppModule } from '@rollcall/app-sdk';
import { testApp } from './testing.ts';

describe('GET /api/core/health', () => {
  it('returns the shared health contract', async () => {
    const app = testApp({ version: '1.2.3' }).app;
    const res = await app.inject({ method: 'GET', url: '/api/core/health' });
    expect(res.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(res.json());
    expect(body).toMatchObject({ status: 'ok', name: APP_NAME, version: '1.2.3' });
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it('answers unknown API routes with 404 not_found, whichever app they look like', async () => {
    const app = testApp({ version: '1.2.3' }).app;
    for (const url of ['/api/core/nope', '/api/health', '/api/nobody/nope', '/api']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json(), url).toEqual({ error: 'not_found' });
    }
    await app.close();
  });

  it("keeps serving core when an installed app can't be hosted, and leaves that app's routes out", async () => {
    const old: AppModule = {
      id: 'old',
      title: 'Old',
      version: '1.0.0',
      requiresCore: '^9.0.0',
      permissions: [],
      register(api) {
        api.get('/ping', { config: { access: { public: 'test probe' } } }, async () => ({ ok: true }));
      },
    };
    const app = testApp({ version: '1.2.3', apps: [old] }).app;
    expect((await app.inject({ method: 'GET', url: '/api/core/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/old/ping' })).json()).toEqual({ error: 'not_found' });
    expect(app.hostedApps.modules.map((module) => module.id)).toEqual(['core']);
    await app.close();
  });
});
```

6. **In `web-apps.test.ts`, the builds now come from hosted apps.**
   - Replace `import type { WebApp } from './web-apps.ts';` with:

     ```ts
     import type { AppModule } from '@rollcall/app-sdk';
     import type { AppOptions } from './app.ts';
     ```

     The latter two go above the `testing.ts` import.
   - Replace `appWithBuilds` and `get` with:

```ts
// A hosted app with only a web build, served at /producer/ with an overlay page.
const producerWith = (dir: string): AppModule => ({
  id: 'producer',
  title: 'Producer',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [],
  web: { dir, pages: { overlay: 'overlay.html' } },
});

type Builds = Pick<AppOptions, 'coreWebDir' | 'apps'>;
const missing = join(tmpdir(), 'rollcall-web-does-not-exist');

function appWithBuilds(): Builds {
  return { coreWebDir: build('core'), apps: [producerWith(build('producer', ['overlay']))] };
}

async function get(builds: Builds, url: string, method: 'GET' | 'HEAD' = 'GET') {
  const { app } = testApp(builds);
  const res = await app.inject({ method, url });
  await app.close();
  return res;
}
```

   - Before `it("does not treat look-alike paths as an app's page"`, add:

```ts
  it('answers HEAD for pages and client-side routes as it answers GET', async () => {
    const webApps = appWithBuilds();
    for (const url of ['/core/teams/42', '/producer/overlay/some-output-token']) {
      const res = await get(webApps, url, 'HEAD');
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type'], url).toMatch(/text\/html/);
    }
  });

```

   - In `'serves the apps that are built and skips the rest'`, the `webApps` constant becomes `const webApps = { coreWebDir: missing, apps: [producerWith(build('producer', ['overlay']))] };`.
   - In `'still serves the API when there is no web build yet'`, the first two lines become `const { app } = testApp({ coreWebDir: missing });`.

7. **Create `rcl-core/server/src/installed-apps.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import { satisfies } from 'semver';
import { INSTALLED_APPS } from './installed-apps.ts';
import { CORE_VERSION, tablesCreatedBy } from './testing.ts';

// Bumping rcl-core's version, or an app's requiresCore, is a deliberate decision for both (split spec): before 1.0,
// ^0.1.0 excludes 0.2.0, so this fails until each app says it works with the new core.
describe('the installed apps', () => {
  it('all work with this rcl-core version', () => {
    for (const app of INSTALLED_APPS) {
      expect(satisfies(CORE_VERSION, app.requiresCore), `${app.id} needs rcl-core ${app.requiresCore}`).toBe(true);
    }
  });

  it('only create tables named after themselves (<id>_…)', () => {
    for (const app of INSTALLED_APPS) {
      expect(
        tablesCreatedBy(app).filter((table) => !table.startsWith(`${app.id}_`)),
        app.id,
      ).toEqual([]);
    }
  });
});
```

8. **In `testing.ts`,** add `import pkg from '../package.json' with { type: 'json' };` after the `passwords.ts` import. Above the `// Test helpers:` comment, add:

```ts
/** This rcl-core's version, as main.ts passes it to the server. */
export const CORE_VERSION = pkg.version;

```

9. **In `packages/web-sdk/src/api.test.ts`:**
   - `toBe('/api/health')` becomes `toBe('/api/core/health')`;
   - the test's name becomes `'fetches /api/core/health and returns the parsed contract'`.

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server packages/web-sdk`
Expected: FAIL. The files can't load (`../installed-apps.ts` doesn't exist), and the routes are still at `/api/…`.

- [ ] **Step 3: Core as module `core`.** Create `rcl-core/server/src/core-app.ts`:

```ts
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppModule } from '@rollcall/app-sdk';
import { APP_NAME, HealthResponseSchema, type HealthResponse } from '@rollcall/core-contract';
import type { AppDatabase } from './db.ts';
import { ERROR_RESPONSES } from './http.ts';
import { CORE_APP_ID, CORE_PERMISSIONS } from './auth/permissions.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerSetupRoutes } from './routes/setup.ts';
import { registerUserRoutes } from './routes/users.ts';

// rcl-core as an app module, hosted like any other (ADR-0019): its routes below /api/core and its web build at
// /core/. It owns the database connection, so its routes use it directly rather than through AppContext.
export function coreApp({ version, db, webDir }: { version: string; db: AppDatabase; webDir?: string }): AppModule {
  const startedAt = performance.now();
  return {
    id: CORE_APP_ID,
    title: APP_NAME,
    version,
    requiresCore: version,
    permissions: CORE_PERMISSIONS,
    ...(webDir ? { web: { dir: webDir } } : {}),
    register(fastify) {
      fastify.withTypeProvider<ZodTypeProvider>().get(
        '/health',
        {
          config: { access: { public: 'Shows whether the server is up, before anyone signs in' } },
          schema: {
            tags: ['core/health'],
            summary: 'Check that the server is up',
            response: { 200: HealthResponseSchema, ...ERROR_RESPONSES },
          },
        },
        async () =>
          ({
            status: 'ok',
            name: APP_NAME,
            version,
            uptimeSeconds: (performance.now() - startedAt) / 1000,
          }) satisfies HealthResponse,
      );
      registerSetupRoutes(fastify, db);
      registerAuthRoutes(fastify, db);
      registerUserRoutes(fastify, db);
    },
  };
}
```

Make core's route paths relative to `/api/core`, and their tags `core/…`:

```bash
perl -pi -e "s#'/api/(setup|auth/login|auth/logout|auth/me|auth/password|users|users/:id|users/:id/password-reset|users/:id/sign-out)'#'/\1'#g; s#tags: \['(setup|auth|users)'\]#tags: ['core/\1']#g" \
  rcl-core/server/src/routes/setup.ts rcl-core/server/src/routes/auth.ts rcl-core/server/src/routes/users.ts
grep -n "/api" rcl-core/server/src/routes/setup.ts rcl-core/server/src/routes/auth.ts rcl-core/server/src/routes/users.ts
```

Expected: the `grep` prints nothing.

**Replace `rcl-core/server/src/app.ts`** with:

```ts
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppModule } from '@rollcall/app-sdk';
import { hostApps, type HostedApps } from './apps.ts';
import { coreApp } from './core-app.ts';
import type { AppDatabase } from './db.ts';
import { sendApiError } from './http.ts';
import { enforceRouteAccess } from './auth/access.ts';
import { installAuth } from './auth/guard.ts';
import { registerApiDocs } from './openapi.ts';
import { serveWebApps } from './web-apps.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** The rcl apps this server hosts, core first (ADR-0019). */
    hostedApps: HostedApps;
  }
}

export interface AppOptions {
  version: string;
  logger?: boolean;
  db: AppDatabase;
  /** rcl-core's own web build, served at /core/. */
  coreWebDir?: string;
  /** The rcl apps to host besides core: INSTALLED_APPS in production, the tests' own apps in tests. */
  apps?: readonly AppModule[];
  /** Registers routes inside the authenticated /api plugin, after cookie, rate-limit and auth are wired up (for tests). */
  registerRoutes?: (api: FastifyInstance) => void;
  /** Called for each route as it's registered; the route inventory test uses it. */
  onRoute?: (route: RouteOptions) => void;
  /** Serve the API explorer (Swagger UI) at /docs (ADR-0014). Off unless asked for. */
  apiDocs?: boolean;
}

const API_PATH = /^\/api(\/|$)/;

// The HTTP API and web builds of every hosted rcl app. Kept free of listening and sockets so routes can be tested
// with app.inject().
export function buildApp({
  version,
  logger = false,
  db,
  coreWebDir,
  apps = [],
  registerRoutes,
  onRoute,
  apiDocs = false,
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  const hosted = hostApps({
    core: coreApp({ version, db, webDir: coreWebDir }),
    apps,
    coreVersion: version,
    db,
    log: app.log,
  });
  app.decorate('hostedApps', hosted);
  // Added first, so they see every route, including those inside the /api plugin.
  if (onRoute) app.addHook('onRoute', onRoute);
  enforceRouteAccess(app, { appIds: hosted.modules.map((module) => module.id), permissions: hosted.permissions });
  // Routes validate requests and serialize replies with the Zod schemas they declare (ADR-0014, ADR-0019).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerApiDocs(app, { version, apiDocs, permissions: hosted.permissions });

  // JSON bodies only: removing the text/plain parser turns form-style cross-site posts into 415s.
  app.removeContentTypeParser('text/plain');
  void app.register(fastifyCookie);
  // ipv6Subnet: 128 counts each IPv6 device on its own; by default the plugin lumps a whole /64 network together.
  void app.register(fastifyRateLimit, { global: false, ipv6Subnet: 128 });

  // Every /api route lives in this one plugin, registered after cookie and rate-limit, so each one shares the same
  // error handler, CSRF check and caller lookup. Each hosted app's routes are a child plugin below /api/<id>.
  void app.register(async (api) => {
    api.setErrorHandler(sendApiError);
    installAuth(api, { db, permissions: hosted.permissions });
    for (const module of hosted.modules) {
      const ctx = hosted.contextFor(module);
      void api.register(async (scope) => module.register?.(scope, ctx), { prefix: `/api/${module.id}` });
    }
    registerRoutes?.(api);
  });

  const webPage = serveWebApps(app, hosted.webApps);
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (API_PATH.test(path)) return reply.code(404).send({ error: 'not_found' });
    const page = request.method === 'GET' || request.method === 'HEAD' ? webPage(path) : undefined;
    if (page) return reply.type('text/html').sendFile(page.file, page.dir);
    return reply
      .code(404)
      .send({ message: `Route ${request.method}:${request.url} not found`, error: 'Not Found', statusCode: 404 });
  });

  return app;
}
```

**In `rcl-core/server/src/auth/access.ts`,** replace everything from `const API_ROUTE = /^\/api(\/|$)/;` down to (not including) `    if ('public' in access) return;` with:

```ts
const API_ROUTE = /^\/api(\/|$)/;
const APP_OF_ROUTE = /^\/api\/([^/]+)\//;

// Checks each /api route's declaration as it's registered, then puts the route's guard first in its preValidation
// hooks, so a refused caller never learns what a valid body looks like (ADR-0014). It's installed on the root
// instance, so it sees /api routes wherever they're registered. A route belongs to the app named in its path,
// /api/<id>/…, and may only use that app's permissions (ADR-0019). HEAD routes that Fastify adds for GET routes pass
// through here too, with the same config.
export function enforceRouteAccess(
  app: FastifyInstance,
  options: { appIds: readonly string[]; permissions: Permissions },
): void {
  app.addHook('onRoute', (route) => {
    if (!API_ROUTE.test(route.url)) return;
    const name = `${[route.method].flat().join(',')} ${route.url}`;
    const appId = APP_OF_ROUTE.exec(route.url)?.[1];
    if (!appId || !options.appIds.includes(appId)) {
      throw new Error(`${name} isn't below /api/<id>/ for a hosted app (${options.appIds.join(', ')})`);
    }
    const access = route.config?.access;
    if (!access) throw new Error(`${name} declares no access. Give it config.access: public, signedIn or a permission`);
    const problem = accessProblem(access, { appId, permissions: options.permissions });
    if (problem) throw new Error(`${name} ${problem}`);
```

**In `rcl-core/server/src/web-apps.ts`:**
- Delete the `fileURLToPath` import, the `PRODUCER_WEB_DIR` constant and `installedWebApps`. Hosted apps supply their builds now.
- Change the `WebApp` doc comments:
  - the interface's comment becomes `/** One hosted rcl app's web build, served below \`base\` (ADR-0019). */`;
  - `base`'s comment becomes `/** Where it's served, matching its Vite \`base\`: \`/<id>/\`, such as \`/producer/\`. */`.
- Replace the whole `serveWebApps` function and its comment with:

```ts
// Serves each hosted app's build below its base (ADR-0019): real files as they are, its pages at their paths, and
// index.html for every other path below the base, so client-side routes like /producer/screens/3 load. `/`
// redirects to the first app (core's). Returns the page for a path that no route or file answers, if any; the
// server's not-found handler sends it.
export function serveWebApps(
  app: FastifyInstance,
  webApps: readonly WebApp[],
): (path: string) => { dir: string; file: string } | undefined {
  for (const web of webApps) {
    if (!/^\/[a-z][a-z0-9-]*\/$/.test(web.base)) throw new Error(`Web app base ${web.base} must be /<id>/`);
  }
  const home = webApps[0]?.base;
  if (home) app.get('/', (_request, reply) => reply.redirect(home, 302));
  const built = webApps.filter((web) => existsSync(join(web.dir, 'index.html')));
  built.forEach((web, i) => {
    // Only the first registration may add reply.sendFile; the others share it.
    void app.register(fastifyStatic, { root: web.dir, prefix: web.base, wildcard: false, decorateReply: i === 0 });
  });
  return (path) => {
    const web = appAt(built, path);
    return web && { dir: web.dir, file: pageAt(web, path) };
  };
}
```

`appAt` and `pageAt` stay as they are.

**The Producer app's server package.** Create `rcl-producer/server/package.json`:

```json
{
  "name": "@rollcall/producer-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  },
  "rollcall": {
    "requiresCore": "^0.1.0"
  },
  "dependencies": {
    "@rollcall/app-sdk": "workspace:^",
    "@rollcall/core-contract": "workspace:^"
  },
  "devDependencies": {
    "@types/node": "^24",
    "typescript": "^7.0.2"
  }
}
```

Create `rcl-producer/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src"]
}
```

Create `rcl-producer/server/src/index.ts`:

```ts
import { fileURLToPath } from 'node:url';
import type { AppModule } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import pkg from '../package.json' with { type: 'json' };

// The Producer app's server side, hosted by rcl-core as app module `producer` (ADR-0019). It has no routes or tables
// yet: rcl-core serves its web build at /producer/, with the OBS overlay at /producer/overlay.
export const producerApp: AppModule = {
  id: 'producer',
  title: `${APP_NAME} Producer`,
  version: pkg.version,
  requiresCore: pkg.rollcall.requiresCore,
  permissions: [],
  web: {
    dir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
    pages: { overlay: 'overlay.html' },
  },
};
```

Create `rcl-core/server/src/installed-apps.ts`:

```ts
import type { AppModule } from '@rollcall/app-sdk';
import { producerApp } from '@rollcall/producer-server';

// The rcl apps this server hosts besides core itself (ADR-0019). This is the only place rcl-core's server depends on
// an app: scripts/check-boundaries.test.mjs keeps it that way.
export const INSTALLED_APPS: readonly AppModule[] = [producerApp];
```

**`rcl-core/server/package.json`:** add `"@rollcall/producer-server": "workspace:^"` to `dependencies`, in alphabetical order.

**In `rcl-core/server/src/server.ts`:**
- Drop the imports of `createPermissions`, `CORE_PERMISSIONS` and `installedWebApps`.
- Add `import { INSTALLED_APPS } from './installed-apps.ts';`.
- Replace the four lines from `const permissions = …` through `const io = attachRealtime(…)` with:

```ts
  const app = buildApp({ version, logger, db, coreWebDir: config.webDir, apps: INSTALLED_APPS, apiDocs: config.apiDocs });
  const io = attachRealtime(app.server, { version, db, log: app.log, permissions: app.hostedApps.permissions });
```

**In `rcl-core/server/src/openapi.ts`:**
- `` `POST /api/auth/login` `` becomes `` `POST /api/core/auth/login` ``.
- `` `POST /api/setup` `` becomes `` `POST /api/core/setup` ``.
- The four tag names become `'core/health'`, `'core/setup'`, `'core/auth'` and `'core/users'`; their descriptions stay the same.
- The first `DESCRIPTION` line becomes:

```ts
  'The Rollcall server API. Requests and replies are JSON; `204` replies have no body. Every rcl app has its routes below `/api/<app>/` and its tags named `<app>/…`.',
```

**Three comments and two health paths:**
- **`rcl-core/server/src/config.ts`:** the comment above `DEFAULT_WEB_DIR` becomes:

  ```ts
  // rcl-core's own web build (`yarn workspace @rollcall/core-web build`), served at /core/. Other apps' builds
  // come from their modules.
  ```

- **`rcl-core/contract/src/health.ts`:** `// GET /api/health.` becomes `// GET /api/core/health.`
- **`packages/web-sdk/src/health.ts`:** `GET /api/health` in the comment becomes `GET /api/core/health`.
- **`packages/web-sdk/src/api.ts`:** `query: () => 'health',` becomes `query: () => 'core/health',`.
- **`e2e/playwright.config.ts`:** `/api/health` in the webServer `url` becomes `/api/core/health`.

Run `yarn install`. The lockfile gains `@rollcall/producer-server`.

- [ ] **Step 4: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server packages/web-sdk`
Expected: PASS. `yarn test` in full shows 213 tests passing.

- [ ] **Step 5: Check, build, run the story and end-to-end tests, and commit.**

```bash
yarn format && yarn check && yarn build && yarn test:stories && yarn test:e2e
```

Expected: everything passes: 8 story tests and 5 e2e tests. The Producer app's pages now come from its module.

```bash
git add -A rcl-core rcl-producer packages e2e yarn.lock
git commit -F - <<'EOF'
feat(rcl-core): host rcl apps as modules, with core's routes under /api/core

rcl-core is itself app module `core`. buildApp hosts core and the installed
apps: each app's routes are a child of the authenticated /api plugin at
/api/<id>, a route may only use its own app's permissions, unknown /api
paths answer 404 not_found, and the web builds come from the apps' modules.
The Producer app gets its server package, rcl-producer/server, listed in
installed-apps.ts. A test checks every installed app accepts this core.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Apps' namespaces, and the overlay at `/producer/overlay`

**Files:**
- Move (`git mv`): `rcl-core/contract/src/realtime.ts` and `realtime.test.ts` to `rcl-producer/contract/src/`
- Create: `rcl-producer/contract/{package.json,tsconfig.json,src/index.ts}`, `rcl-producer/server/src/index.test.ts`
- Modify:
  - `rcl-core/contract/src/index.ts`, `rcl-producer/contract/src/realtime.ts`;
  - `rcl-producer/server/{package.json,src/index.ts}`, `rcl-producer/web/{package.json,src/overlay/live.ts}`;
  - `rcl-core/server/src/{realtime.ts,server.ts}`, `vitest.config.ts`, `yarn.lock`.
- Test: `rcl-core/server/src/realtime.test.ts` (rewritten), `rcl-core/server/src/server.test.ts`, `rcl-producer/server/src/index.test.ts`

**Interfaces:**
- Consumes: `HostedApps` (Task 1), `app.hostedApps` and `CORE_VERSION` (Task 2).
- Produces:
  - `attachRealtime(httpServer, { db, log, hosted, onNamespace? }): Server`, which loses `version`, `permissions` and `registerNamespaces`;
  - `@rollcall/producer-contract` with `SERVER_HELLO_EVENT`, `ServerHelloSchema` and `ServerHello`;
  - `producerApp.realtime`.

- [ ] **Step 1: Move the hello contract to the Producer app.**

```bash
mkdir -p rcl-producer/contract/src
git mv rcl-core/contract/src/realtime.ts rcl-producer/contract/src/realtime.ts
git mv rcl-core/contract/src/realtime.test.ts rcl-producer/contract/src/realtime.test.ts
cp rcl-core/contract/tsconfig.json rcl-producer/contract/tsconfig.json
```

Create `rcl-producer/contract/package.json`:

```json
{
  "name": "@rollcall/producer-contract",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "zod": "^4.6.5"
  }
}
```

Create `rcl-producer/contract/src/index.ts`:

```ts
// The Producer app's contract (ADR-0019): Zod schemas for /api/producer and its Socket.IO namespaces, shared by its
// server and web app. Types come from z.infer. Naming: `FooSchema` for the schema, `Foo` for its type.
export * from './realtime.ts';
```

The other edits:
- **`rcl-producer/contract/src/realtime.ts`:** the first comment becomes `// Sent by the server to every client of the /producer/overlay namespace as soon as it connects.`
- **`rcl-core/contract/src/index.ts`:** delete `export * from './realtime.ts';`, and replace its first two comment lines with:

```ts
// rcl-core's contract (ADR-0019): Zod schemas for /api/core, shared by its server, its web app and the web SDK.
// Types come from z.infer. Naming: `FooSchema` for the schema, `Foo` for its type.
```

- **Dependencies:** add `"@rollcall/producer-contract": "workspace:^"` to `dependencies` in both `rcl-producer/server/package.json` and `rcl-producer/web/package.json`, in alphabetical order.
- **`vitest.config.ts`:** the `node` project's `include` becomes `['rcl-*/contract/src/**/*.test.ts', 'rcl-*/server/src/**/*.test.ts']`, and the file's first comment becomes:

```ts
// `yarn test` runs every workspace: Node for the apps' servers and contracts, jsdom + React for the web apps and the
// web SDK.
```

Then run `yarn install`.

- [ ] **Step 2: Write the failing tests.**

Create `rcl-producer/server/src/index.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AppContext, Realtime } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import { SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/producer-contract';
import { producerApp } from './index.ts';

describe('the producer app module', () => {
  it('serves its web build with the OBS overlay page at /producer/overlay', () => {
    expect(producerApp.id).toBe('producer');
    expect(producerApp.web?.dir).toMatch(/rcl-producer\/web\/dist$/);
    expect(producerApp.web?.pages).toEqual({ overlay: 'overlay.html' });
  });

  it('greets every client of the public /producer/overlay namespace with the server it is talking to', () => {
    let onConnection: ((socket: { emit: (event: string, payload: unknown) => void }) => void) | undefined;
    const namespace = vi.fn<Realtime['namespace']>(
      () => ({ on: (_event: string, listener: typeof onConnection) => (onConnection = listener) }) as never,
    );
    producerApp.realtime?.({ namespace }, { coreVersion: '0.1.0' } as AppContext);

    expect(namespace).toHaveBeenCalledWith('/producer/overlay', {
      access: { public: expect.stringContaining('OBS browser sources') as string },
    });
    const emit = vi.fn<(event: string, payload: unknown) => void>();
    onConnection?.({ emit });
    expect(emit).toHaveBeenCalledWith(SERVER_HELLO_EVENT, { name: APP_NAME, version: '0.1.0' });
    expect(ServerHelloSchema.parse(emit.mock.calls[0]?.[1])).toEqual({ name: APP_NAME, version: '0.1.0' });
  });
});
```

Replace `rcl-core/server/src/realtime.test.ts` with:

```ts
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { FastifyBaseLogger } from 'fastify';
import type { Server as SocketIoServer } from 'socket.io';
import type { Access, AppModule } from '@rollcall/app-sdk';
import type { Role } from '@rollcall/core-contract';
import { hostApps } from './apps.ts';
import { coreApp } from './core-app.ts';
import { attachRealtime } from './realtime.ts';
import { openMemoryDatabase } from './db.ts';
import { createSession } from './auth/sessions.ts';
import { SESSION_COOKIE } from './auth/guard.ts';
import { INSTALLED_APPS } from './installed-apps.ts';
import { addUser, CORE_VERSION } from './testing.ts';

let httpServer: HttpServer | undefined;
let io: SocketIoServer | undefined;
let clients: Socket[] = [];

afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await io?.close();
  if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
  io = httpServer = undefined;
});

const testLog = (): FastifyBaseLogger =>
  ({
    error: vi.fn<(obj: { err: unknown }, msg: string) => void>(),
    child: vi.fn<() => FastifyBaseLogger>(() => testLog()),
  }) as unknown as FastifyBaseLogger;

// An app that only tests host: one namespace of each kind, so every kind of declaration has one to sweep.
const PROBE_APP: AppModule = {
  id: 'probe',
  title: 'Probe',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [{ key: 'probe:watch', summary: 'Watch', roles: [] }],
  realtime(rt) {
    rt.namespace('/probe/open', { access: { public: 'test probe' } }).on('connection', (socket) => {
      socket.emit('probe:hello', 'hi');
    });
    rt.namespace('/probe/signed-in', { access: { signedIn: true } });
    rt.namespace('/probe/watch', { access: { permission: 'probe:watch' } });
  },
};

// An app that only creates namespaces, with `realtime` doing whatever the test needs.
const appWith = (realtime: AppModule['realtime']): AppModule => ({ ...PROBE_APP, realtime });

// Hosts the installed apps and `apps` on a real port, and records every namespace as it's created.
function attach(apps: readonly AppModule[] = [...INSTALLED_APPS, PROBE_APP]) {
  const database = openMemoryDatabase();
  const log = testLog();
  const namespaces: { name: string; access: Access }[] = [];
  const hosted = hostApps({
    core: coreApp({ version: CORE_VERSION, db: database.db }),
    apps,
    coreVersion: CORE_VERSION,
    db: database.db,
    log,
  });
  httpServer = createServer();
  io = attachRealtime(httpServer, {
    db: database.db,
    log,
    hosted,
    onNamespace: (name, access) => namespaces.push({ name, access }),
  });
  return { ...database, log, hosted, namespaces };
}

async function startRealtime(apps?: readonly AppModule[]) {
  const rt = attach(apps);
  await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
  const url = `http://127.0.0.1:${(httpServer!.address() as AddressInfo).port}`;
  let users = 0;
  const cookieFor = async (role: Role, { mustChangePassword = false } = {}) => {
    const user = await addUser(rt.db, `user${(users += 1)}`, 'correct horse', role, { mustChangePassword });
    return `${SESSION_COOKIE}=${createSession(rt.db, user.id).token}`;
  };
  const open = (name: string, headers: Record<string, string> = {}) => {
    const client = connect(`${url}${name}`, { transports: ['websocket'], reconnection: false, extraHeaders: headers });
    clients.push(client);
    return outcome(client);
  };
  return { ...rt, url, cookieFor, open };
}

// 'connected', or the reason the server refused the connection.
function outcome(socket: Socket): Promise<string> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once('connect_error', (error) => resolve(error.message));
  });
}

// The namespaces that don't refuse the client with `error`. Each connection gets fresh headers.
async function notRefused(
  rt: Awaited<ReturnType<typeof startRealtime>>,
  names: readonly string[],
  headers: () => Promise<Record<string, string>>,
  error: string,
) {
  const found: string[] = [];
  for (const name of names) {
    const result = await rt.open(name, await headers());
    if (result !== error) found.push(`${name} → ${result}`);
  }
  return found;
}

describe('namespace inventory', () => {
  it('pins the public namespaces of the installed apps', () => {
    const rt = attach(INSTALLED_APPS);
    expect(rt.namespaces.filter((n) => 'public' in n.access).map((n) => n.name)).toEqual(['/producer/overlay']);
  });

  it('refuses an anonymous client on every namespace that is not public', async () => {
    const rt = await startRealtime();
    const gated = rt.namespaces.filter((n) => !('public' in n.access)).map((n) => n.name);
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    expect(await notRefused(rt, gated, async () => ({}), 'unauthenticated')).toEqual([]);
    expect(await notRefused(rt, gated, asAdmin, 'unauthenticated')).toHaveLength(gated.length);
  });

  it('refuses every namespace that is not public while a password change is pending', async () => {
    const rt = await startRealtime();
    const gated = rt.namespaces.filter((n) => !('public' in n.access)).map((n) => n.name);
    const pending = async () => ({ cookie: await rt.cookieFor('producer', { mustChangePassword: true }) });
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    expect(await notRefused(rt, gated, pending, 'password_change_required')).toEqual([]);
    expect(await notRefused(rt, gated, asAdmin, 'password_change_required')).toHaveLength(gated.length);
  });

  it('refuses each role every namespace whose permission it lacks', async () => {
    const rt = await startRealtime();
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    for (const role of ['producer', 'announcer'] as const) {
      const lacking = rt.namespaces
        .filter((n) => 'permission' in n.access && !rt.hosted.permissions.granted(role, n.access.permission))
        .map((n) => n.name);
      expect(lacking, role).toContain('/probe/watch');
      const asRole = async () => ({ cookie: await rt.cookieFor(role) });
      expect(await notRefused(rt, lacking, asRole, 'forbidden'), role).toEqual([]);
      expect(await notRefused(rt, lacking, asAdmin, 'forbidden'), role).toHaveLength(lacking.length);
    }
  });
});

describe('attachRealtime', () => {
  it("lets anyone into an app's public namespace", async () => {
    const rt = await startRealtime();
    const client = connect(`${rt.url}/probe/open`, { transports: ['websocket'], reconnection: false });
    clients.push(client);
    expect(await new Promise((resolve) => client.once('probe:hello', resolve))).toBe('hi');
  });

  it('refuses the old /overlay namespace, which moved to /producer/overlay', async () => {
    const rt = await startRealtime();
    expect(await rt.open('/overlay')).toBe('Invalid namespace');
  });

  it('refuses everyone on the bare / namespace, even an Admin', async () => {
    const rt = await startRealtime();
    expect(await rt.open('/', { cookie: await rt.cookieFor('admin') })).toBe('not_found');
  });

  it('refuses a signed-in connection opened by another site', async () => {
    const rt = await startRealtime();
    const cookie = await rt.cookieFor('admin');
    expect(await rt.open('/probe/signed-in', { cookie, origin: 'http://evil.example' })).toBe('cross_origin');
  });

  it('refuses a namespace created without access', () => {
    attach();
    expect(() => io!.of('/sneaky')).toThrow('Socket.IO namespace /sneaky has no access; use namespace()');
  });

  it("refuses a namespace outside the app's own /<id>, with a bad declaration, or that already exists", () => {
    for (const [realtime, message] of [
      [
        (rt) => rt.namespace('/producer/overlay', { access: { public: 'x' } }),
        "isn't at or below /probe, so probe can't create it",
      ],
      [
        (rt) => rt.namespace('/probe/typo', { access: { permission: 'probe:wach' } }),
        "needs probe:wach, which probe doesn't declare",
      ],
      [
        (rt) => rt.namespace('/probe/watch', { access: { permission: 'core:users.manage' } }),
        'but probe may only use its own probe:… permissions',
      ],
      [
        (rt) => {
          rt.namespace('/probe/twice', { access: { signedIn: true } });
          rt.namespace('/probe/twice', { access: { signedIn: true } });
        },
        'Socket.IO namespace /probe/twice already exists',
      ],
    ] as const satisfies readonly (readonly [AppModule['realtime'], string])[]) {
      expect(() => attach([appWith(realtime)]), message).toThrow(message);
      io = undefined;
      httpServer = undefined;
    }
  });

  it('refuses the connection instead of crashing when the session check throws', async () => {
    const rt = await startRealtime();
    const cookie = await rt.cookieFor('admin');
    rt.sqlite.close(); // every query against the database now throws
    expect(await rt.open('/probe/signed-in', { cookie })).toBe('internal_error');
    expect(rt.log.error).toHaveBeenCalledOnce();

    // The process and the server are still up: the public namespace still works on the same server.
    const open = connect(`${rt.url}/probe/open`, { transports: ['websocket'], reconnection: false });
    clients.push(open);
    expect(await new Promise((resolve) => open.once('probe:hello', resolve))).toBe('hi');
  });
});
```

In `rcl-core/server/src/server.test.ts`, the overlay checks move to `/producer/overlay` at core versions the Producer app accepts:
- **Imports:** replace `import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/core-contract';` with:

  ```ts
  import { inc } from 'semver';
  import { APP_NAME } from '@rollcall/core-contract';
  ```

  Then add `import { CORE_VERSION } from './testing.ts';` after the `users.ts` import.
- **Constants:** above `let running: RunningServer | undefined;`, add:

```ts
// The OBS overlay's live connection belongs to the Producer app (/producer/overlay), which greets each client with
// this event. A core version it accepts, and a later one it still accepts, so it's hosted before and after a restart.
const HELLO = 'server:hello';
const NEXT_VERSION = inc(CORE_VERSION, 'patch') ?? CORE_VERSION;

```

- **Rewrites, everywhere in the file:**
  - `` `${running.url}/overlay` `` becomes `` `${running.url}/producer/overlay` ``;
  - `client!.once(SERVER_HELLO_EVENT, resolve)` becomes `client!.once(HELLO, resolve)`;
  - `{ version: '9.9.9', logger: false }` becomes `{ version: CORE_VERSION, logger: false }`.
- **In the reconnect test:**
  - `{ version: '1.0.0', logger: false }` becomes `{ version: CORE_VERSION, logger: false }`;
  - `{ version: '1.0.1', logger: false }` becomes `{ version: NEXT_VERSION, logger: false }`;
  - the final expectation becomes `expect(helloAgain).toEqual({ name: APP_NAME, version: NEXT_VERSION });`.
- **In `'serves HTTP and greets Socket.IO clients on the same port'`,** the expectation becomes `expect(hello).toEqual({ name: APP_NAME, version: CORE_VERSION });`.

- [ ] **Step 3: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server/src/realtime.test.ts rcl-core/server/src/server.test.ts rcl-producer/server`
Expected: FAIL.
- `attachRealtime` still takes `version` and `permissions` and creates `/overlay` itself, so `hostApps` namespaces never appear.
- The Producer module has no `realtime`.
- `/producer/overlay` doesn't exist.

- [ ] **Step 4: Let apps add their namespaces.** Replace `rcl-core/server/src/realtime.ts` with:

```ts
import type { Server as HttpServer } from 'node:http';
import { parseCookie } from 'cookie';
import type { FastifyBaseLogger } from 'fastify';
import { Server } from 'socket.io';
import type { Access, AppModule, Realtime } from '@rollcall/app-sdk';
import type { HostedApps } from './apps.ts';
import type { AppDatabase } from './db.ts';
import { accessProblem, deny } from './auth/access.ts';
import { isSameOrigin, resolvePrincipal } from './auth/guard.ts';

export interface RealtimeOptions {
  db: AppDatabase;
  log: FastifyBaseLogger;
  hosted: HostedApps;
  /** Called for each namespace as it's created; the namespace inventory test uses it. */
  onNamespace?: (name: string, access: Access) => void;
}

// Socket.IO shares the HTTP server's port (ADR-0019). Each hosted app adds its own namespaces, at or below /<id>, and
// every namespace declares who may join, like every /api route (ADR-0018). The bare `/` namespace serves nothing and
// refuses everyone.
export function attachRealtime(httpServer: HttpServer, { db, log, hosted, onNamespace }: RealtimeOptions): Server {
  const io = new Server(httpServer, { serveClient: false });
  io.use((_socket, next) => next(new Error('not_found')));

  // A namespace made with io.of() directly would let anyone in, so it stops the server instead. Socket.IO has already
  // stored the namespace when this throws, so never catch the error and carry on: the server must not start.
  const names = new Set<string>(['/']);
  let creating: string | undefined;
  io.on('new_namespace', (nsp) => {
    if (nsp.name !== creating) throw new Error(`Socket.IO namespace ${nsp.name} has no access; use namespace()`);
  });

  const realtimeFor = (module: AppModule): Realtime => ({
    namespace(name, { access }) {
      if (name !== `/${module.id}` && !name.startsWith(`/${module.id}/`)) {
        throw new Error(`Socket.IO namespace ${name} isn't at or below /${module.id}, so ${module.id} can't create it`);
      }
      if (names.has(name)) throw new Error(`Socket.IO namespace ${name} already exists`);
      const problem = accessProblem(access, { appId: module.id, permissions: hosted.permissions });
      if (problem) throw new Error(`Socket.IO namespace ${name} ${problem}`);
      names.add(name);
      creating = name;
      const nsp = io.of(name);
      creating = undefined;
      if (!('public' in access)) {
        nsp.use((socket, next) => {
          // Socket.IO awaits this middleware without ever handling a rejection, so a throw here (a closed database
          // handle, a full disk during findSession's last-seen write, any I/O error) would otherwise be an unhandled
          // rejection that crashes the whole process, taking every overlay down mid-game.
          try {
            const { headers } = socket.handshake;
            if (!isSameOrigin(headers.origin, headers.host)) return next(new Error('cross_origin'));
            const principal = resolvePrincipal(db, headers.cookie ? parseCookie(headers.cookie) : {});
            const denial = deny(access, principal, hosted.permissions);
            return next(denial ? new Error(denial.error) : undefined);
          } catch (error) {
            log.error({ err: error }, 'Socket access check failed');
            return next(new Error('internal_error'));
          }
        });
      }
      onNamespace?.(name, access);
      return nsp;
    },
  });

  for (const module of hosted.modules) module.realtime?.(realtimeFor(module), hosted.contextFor(module));
  return io;
}
```

**The Producer module's namespace.** In `rcl-producer/server/src/index.ts`:
- Add `import { SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/producer-contract';` after the `core-contract` import.
- Replace the comment above `producerApp` with:

```ts
// The Producer app's server side, hosted by rcl-core as app module `producer` (ADR-0019). It has no routes or tables
// yet: rcl-core serves its web build at /producer/, with the OBS overlay at /producer/overlay, and the overlay's live
// connection is the /producer/overlay namespace.
```

- After the `web` property, add:

```ts
  realtime(rt, ctx) {
    const hello = ServerHelloSchema.parse({ name: APP_NAME, version: ctx.coreVersion });
    rt.namespace('/producer/overlay', {
      access: { public: "OBS browser sources can't sign in; output token URLs replace this in Live Mode" },
    }).on('connection', (socket) => {
      socket.emit(SERVER_HELLO_EVENT, hello);
    });
  },
```

**Socket.IO inside the cleanup `try`.** In `rcl-core/server/src/server.ts`:
- Add `import type { Server } from 'socket.io';` as the first import.
- Delete the `const io = attachRealtime(…);` line.
- Replace the `preClose` hook with:

```ts
  let io: Server | undefined;
  app.addHook('preClose', async () => {
    io?.engine.close();
  });
```

- The `try` block becomes:

```ts
  try {
    io = attachRealtime(app.server, { db, log: app.log, hosted: app.hostedApps });
    // Hash the stand-in password now, so the first failed login takes as long as later ones.
    await dummyHash();
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    // The port is taken, or a route's or namespace's access declaration is wrong: release the database, timer and
    // sockets.
    await app.close();
    throw error;
  }
```

**The overlay joins `/producer/overlay`.** In `rcl-producer/web/src/overlay/live.ts`:
- The import from `'@rollcall/core-contract'` becomes `'@rollcall/producer-contract'`.
- The comment and default argument of `makeOverlayStore` become:

```ts
// The overlay's own lean store; it shares nothing with the admin store (ADR-0003, ADR-0006). It connects to the
// public /producer/overlay namespace, because OBS browser sources can't log in (ADR-0018).
export function makeOverlayStore(connect: ConnectLive = () => io('/producer/overlay')) {
```

- [ ] **Step 5: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server rcl-producer`
Expected: PASS, including 11 realtime tests, 7 server tests and 2 Producer module tests. `yarn test` in full shows 216 tests passing.

- [ ] **Step 6: Check, build, run the story and end-to-end tests, and commit.**

```bash
yarn format && yarn check && yarn build && yarn test:stories && yarn test:e2e
```

Expected: everything passes. The e2e overlay tests show the card, so the overlay page joined `/producer/overlay` and got its hello.

```bash
git add -A rcl-core rcl-producer vitest.config.ts yarn.lock
git commit -F - <<'EOF'
feat(rcl-producer): the overlay's live connection moves to /producer/overlay

Each hosted app adds its own Socket.IO namespaces, at or below /<id> and
checked against its own permissions. The Producer module now owns the OBS
overlay's public namespace, /producer/overlay, and its hello contract moves
to @rollcall/producer-contract. Socket.IO attaches inside startServer's
cleanup, so a bad namespace no longer leaks the database.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: `GET /api/core/apps`

**Files:**
- Create: `rcl-core/contract/src/apps.ts` (+ `apps.test.ts`), `rcl-core/server/src/routes/apps.test.ts`
- Modify: `rcl-core/contract/src/index.ts`, `rcl-core/server/src/core-app.ts`, `rcl-core/server/src/openapi.ts`

**Interfaces:**
- Consumes: `app.hostedApps` (Task 2).
- Produces: `HostedAppSchema` and `HostedApp` (`{ id, title, version, url: string | null }`), and `GET /api/core/apps` with access `{ signedIn: true }`.

- [ ] **Step 1: Write the failing tests.** Create `rcl-core/contract/src/apps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HostedAppSchema } from './apps.ts';

const producer = { id: 'producer', title: 'Rollcall Producer', version: '0.1.0', url: '/producer/' };

describe('HostedAppSchema', () => {
  it('accepts an app with a web app, and one without', () => {
    expect(HostedAppSchema.parse(producer)).toEqual(producer);
    expect(HostedAppSchema.parse({ ...producer, url: null })).toEqual({ ...producer, url: null });
  });

  it('rejects a missing url and unknown keys', () => {
    const { url: _url, ...withoutUrl } = producer;
    expect(HostedAppSchema.safeParse(withoutUrl).success).toBe(false);
    expect(HostedAppSchema.safeParse({ ...producer, extra: true }).success).toBe(false);
  });
});
```

Create `rcl-core/server/src/routes/apps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AppModule } from '@rollcall/app-sdk';
import { HostedAppSchema } from '@rollcall/core-contract';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { addUser, testApp } from '../testing.ts';

const app = (overrides: Partial<AppModule>): AppModule => ({
  id: 'demo',
  title: 'Demo',
  version: '2.0.0',
  requiresCore: '*',
  permissions: [],
  ...overrides,
});

describe('GET /api/core/apps', () => {
  it('lists the hosted apps, core first, with where each web app is served', async () => {
    const { app: server, db } = testApp({
      coreWebDir: '/builds/core',
      apps: [
        app({ id: 'demo', web: { dir: '/builds/demo' } }),
        app({ id: 'headless', title: 'Headless' }),
        app({ id: 'old', requiresCore: '^9.0.0' }),
      ],
    });
    const user = await addUser(db, 'announcer1', 'correct horse', 'announcer');
    const res = await server.inject({
      method: 'GET',
      url: '/api/core/apps',
      cookies: { [SESSION_COOKIE]: createSession(db, user.id).token },
    });
    expect(res.statusCode).toBe(200);
    expect(HostedAppSchema.array().parse(res.json())).toEqual([
      { id: 'core', title: 'Rollcall', version: '1.0.0', url: '/core/' },
      { id: 'demo', title: 'Demo', version: '2.0.0', url: '/demo/' },
      { id: 'headless', title: 'Headless', version: '2.0.0', url: null },
    ]);
    await server.close();
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/contract/src/apps.test.ts rcl-core/server/src/routes/apps.test.ts`
Expected: FAIL. `./apps.ts` doesn't exist, and `HostedAppSchema` isn't exported.

- [ ] **Step 3: Add the contract and the route.** Create `rcl-core/contract/src/apps.ts`:

```ts
import { z } from 'zod';

// GET /api/core/apps: the rcl apps this server hosts, core first (ADR-0019). It feeds the app launcher on core's home
// page. `url` is where the app's web app is served, or null when it has none.
export const HostedAppSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  version: z.string(),
  url: z.string().nullable(),
});
export type HostedApp = z.infer<typeof HostedAppSchema>;
```

In `rcl-core/contract/src/index.ts`, add `export * from './apps.ts';` above the `health.ts` export.

In `rcl-core/server/src/core-app.ts`:
- The `core-contract` import becomes:

  ```ts
  import {
    APP_NAME,
    HealthResponseSchema,
    HostedAppSchema,
    type HealthResponse,
    type HostedApp,
  } from '@rollcall/core-contract';
  ```

- Insert this route before `registerSetupRoutes(fastify, db);`:

```ts
      fastify.withTypeProvider<ZodTypeProvider>().get(
        '/apps',
        {
          config: { access: { signedIn: true } },
          schema: {
            tags: ['core/apps'],
            summary: 'The rcl apps this server hosts, for the app launcher',
            response: { 200: HostedAppSchema.array(), ...ERROR_RESPONSES },
          },
        },
        async (request) =>
          request.server.hostedApps.modules.map(
            (module): HostedApp => ({
              id: module.id,
              title: module.title,
              version: module.version,
              url: module.web ? `/${module.id}/` : null,
            }),
          ),
      );
```

In `rcl-core/server/src/openapi.ts`, add `{ name: 'core/apps', description: 'The rcl apps this server hosts' },` after the `core/health` tag.

- [ ] **Step 4: Run them and see them pass.**

Run: `yarn vitest run rcl-core/contract rcl-core/server`
Expected: PASS, with the route inventory still green. The new route is signed-in, so the anonymous and pending-password sweeps refuse it. `yarn test` in full shows 219 tests passing.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core
git commit -F - <<'EOF'
feat(rcl-core): GET /api/core/apps lists the hosted apps

Signed-in callers get each hosted app's id, title, version and where its web
app is served, core first, for core's app launcher.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: The boundary check

**Files:**
- Create: `scripts/check-boundaries.mjs`, `scripts/check-boundaries.test.mjs`

**Interfaces:**
- Produces: `boundaryViolations(root: string): string[]`, `kindOf(dir: string): string` and `allowed(kind: string, name: string): boolean`, plus the CLI `node scripts/check-boundaries.mjs`.

- [ ] **Step 1: Write the failing test.** Create `scripts/check-boundaries.test.mjs`:

```js
// Tests for check-boundaries.mjs. Run: node --test "scripts/*.test.mjs"
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundaryViolations, kindOf } from './check-boundaries.mjs';

const dirs = [];
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

// A throwaway repo: `files` maps paths to contents; objects are written as JSON.
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'rollcall-boundaries-'));
  dirs.push(root);
  const all = { 'package.json': { workspaces: ['rcl-core/*', 'rcl-demo/*', 'packages/*'] }, ...files };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

const workspace = (name, dependencies = {}) => ({ name, dependencies });

test('the repo keeps every boundary', () => {
  assert.deepEqual(boundaryViolations(fileURLToPath(new URL('..', import.meta.url))), []);
});

test('kinds of workspace come from their folder', () => {
  assert.equal(kindOf('rcl-core/server'), 'host');
  assert.equal(kindOf('rcl-producer/server'), 'app server');
  assert.equal(kindOf('rcl-producer/contract'), 'contract');
  assert.equal(kindOf('rcl-producer/web'), 'web app');
  assert.equal(kindOf('packages/web-sdk'), 'shared package');
  assert.equal(kindOf('e2e'), 'other');
});

test("an app's server may use only the app SDK and contracts, never rcl-core's server or another app's", () => {
  const root = repo({
    'rcl-demo/server/package.json': workspace('@rollcall/demo-server', {
      '@rollcall/app-sdk': 'workspace:^',
      '@rollcall/demo-contract': 'workspace:^',
      '@rollcall/core-server': 'workspace:^',
      '@rollcall/producer-server': 'workspace:^',
    }),
  });
  assert.deepEqual(boundaryViolations(root), [
    'rcl-demo/server (app server) depends on @rollcall/core-server',
    'rcl-demo/server (app server) depends on @rollcall/producer-server',
  ]);
});

test("rcl-core's server imports an app's server only in src/installed-apps.ts", () => {
  const root = repo({
    'rcl-core/server/package.json': workspace('@rollcall/core-server', { '@rollcall/demo-server': 'workspace:^' }),
    'rcl-core/server/src/installed-apps.ts': "import { demoApp } from '@rollcall/demo-server';",
    'rcl-core/server/src/app.ts': "import { demoApp } from '@rollcall/demo-server';",
  });
  assert.deepEqual(boundaryViolations(root), [
    "rcl-core/server/src/app.ts imports @rollcall/demo-server; only rcl-core/server/src/installed-apps.ts may import an app's server",
  ]);
});

test("a web app, a contract or a shared package can't reach a server, and imports must be listed", () => {
  const root = repo({
    'rcl-demo/web/package.json': workspace('@rollcall/demo-web', { '@rollcall/demo-server': 'workspace:^' }),
    'rcl-demo/contract/package.json': workspace('@rollcall/demo-contract', { '@rollcall/web-sdk': 'workspace:^' }),
    'packages/thing/package.json': workspace('@rollcall/thing', { '@rollcall/app-sdk': 'workspace:^' }),
    'packages/thing/src/index.ts': "export type { X } from '@rollcall/core-contract';",
  });
  assert.deepEqual(boundaryViolations(root), [
    'rcl-demo/contract (contract) depends on @rollcall/web-sdk',
    'rcl-demo/web (web app) depends on @rollcall/demo-server',
    'packages/thing (shared package) depends on @rollcall/app-sdk',
    "packages/thing/src/index.ts imports @rollcall/core-contract, which packages/thing/package.json doesn't list",
  ]);
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node --test scripts/check-boundaries.test.mjs`
Expected: FAIL. `./check-boundaries.mjs` can't be found.

- [ ] **Step 3: Write the check.** Create `scripts/check-boundaries.mjs`:

```js
#!/usr/bin/env node
// Boundary check for Rollcall's workspaces (ADR-0019). Zero dependencies — Node built-ins only.
//
//   node scripts/check-boundaries.mjs   lists every crossing and exits 1, or exits 0
//
// Among @rollcall packages, each kind of workspace may depend on, and import, only these:
// - an app's server (rcl-<app>/server): @rollcall/app-sdk and contracts, never rcl-core's server or another app's;
// - rcl-core's server: the same, plus the installed apps' servers, imported only in src/installed-apps.ts;
// - a contract (rcl-<app>/contract): other contracts;
// - a web app (rcl-<app>/web): @rollcall/web-sdk and contracts;
// - a shared package (packages/*): contracts.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'rcl-core/server';
const INSTALLED_APPS = `${HOST}/src/installed-apps.ts`;
const isContract = (name) => /^@rollcall\/[a-z0-9-]+-contract$/.test(name);
const isAppServer = (name) => /^@rollcall\/[a-z0-9-]+-server$/.test(name) && name !== '@rollcall/core-server';

export function kindOf(dir) {
  if (dir === HOST) return 'host';
  if (/^rcl-[a-z0-9-]+\/server$/.test(dir)) return 'app server';
  if (/^rcl-[a-z0-9-]+\/contract$/.test(dir)) return 'contract';
  if (/^rcl-[a-z0-9-]+\/web$/.test(dir)) return 'web app';
  if (/^packages\/[^/]+$/.test(dir)) return 'shared package';
  return 'other';
}

export function allowed(kind, name) {
  switch (kind) {
    case 'host':
      return name === '@rollcall/app-sdk' || isContract(name) || isAppServer(name);
    case 'app server':
      return name === '@rollcall/app-sdk' || isContract(name);
    case 'contract':
    case 'shared package':
      return isContract(name);
    case 'web app':
      return name === '@rollcall/web-sdk' || isContract(name);
    default:
      return true;
  }
}

// The workspace folders the root package.json lists, as `dir/*` or plain folder names.
function workspaces(root) {
  const { workspaces: patterns = [] } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return patterns.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) return [pattern.replace(/\/$/, '')];
    const parent = pattern.slice(0, -2);
    if (!existsSync(join(root, parent))) return [];
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, parent, entry.name, 'package.json')))
      .map((entry) => `${parent}/${entry.name}`)
      .toSorted();
  });
}

const SKIP = new Set(['node_modules', 'dist', 'storybook-static', 'test-results', 'playwright-report']);

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sourceFiles(path);
    return /\.(m?[jt]sx?)$/.test(entry.name) ? [path] : [];
  });
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](@rollcall\/[a-z0-9-]+)/g;

// Every dependency and import that crosses a boundary, as one line each.
export function boundaryViolations(root) {
  const problems = [];
  for (const dir of workspaces(root)) {
    const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
    const kind = kindOf(dir);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    const declared = new Set(Object.keys(deps).filter((name) => name.startsWith('@rollcall/')));
    for (const name of [...declared].toSorted()) {
      if (!allowed(kind, name)) problems.push(`${dir} (${kind}) depends on ${name}`);
    }
    for (const file of sourceFiles(join(root, dir)).toSorted()) {
      const rel = relative(root, file).split(sep).join('/');
      for (const [, name] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
        if (name === pkg.name) continue;
        if (!declared.has(name)) problems.push(`${rel} imports ${name}, which ${dir}/package.json doesn't list`);
        if (kind === 'host' && isAppServer(name) && rel !== INSTALLED_APPS) {
          problems.push(`${rel} imports ${name}; only ${INSTALLED_APPS} may import an app's server`);
        }
      }
    }
  }
  return problems;
}

if (import.meta.main) {
  const problems = boundaryViolations(fileURLToPath(new URL('..', import.meta.url)));
  for (const problem of problems) console.error(`  - ${problem}`);
  console.log(problems.length ? `check-boundaries: ${problems.length} problem(s)` : 'check-boundaries: OK');
  process.exitCode = problems.length ? 1 : 0;
}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `node --test scripts/check-boundaries.test.mjs && node scripts/check-boundaries.mjs`
Expected: 5 passing tests, then `check-boundaries: OK`. `yarn test:scripts` shows 84 tests passing.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add scripts/check-boundaries.mjs scripts/check-boundaries.test.mjs
git commit -F - <<'EOF'
test(repo): boundary check between apps, SDKs and contracts

scripts/check-boundaries.mjs fails if an app's server depends on rcl-core's
server or another app's, if rcl-core's server imports an app outside
installed-apps.ts, if a web app, contract or shared package reaches a server,
or if a workspace imports a @rollcall package it doesn't list. Its test runs in
yarn test:scripts, with fixture repos for each rule.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: ADR-0019 and the docs

**Files:**
- Create: `docs/decisions/0019-rcl-apps-as-modules.md`, `.claude/rules/rcl-producer-server.md`, `.claude/rules/rcl-producer-contract.md`
- Modify:
  - `docs/decisions/0004-server-is-the-hub.md`, `docs/decisions/0007-shared-zod-contract.md`, `docs/decisions/README.md` (generated);
  - `AGENTS.md`, `CHANGELOG.md`, `rcl-core/AGENTS.md`, `rcl-producer/AGENTS.md`, `rcl-producer/CLAUDE.md`;
  - `.claude/rules/{rcl-core-server,rcl-core-contract,sdk,rcl-producer-overlay}.md`;
  - `docs/architecture/README.md`, `docs/guides/local-development.md`, `docs/guides/testing.md`, `docs/product/glossary.md`;
  - every living page and code comment that cites ADR-0004 or ADR-0007 (Step 2).

**Interfaces:** none. The docs describe Tasks 1–5, and the docs lint checks the links.

Each edit below replaces the quoted text **exactly once**.

- [ ] **Step 1: Write ADR-0019.** Run `node scripts/check-docs.mjs --next-adr` and confirm it prints `0019`. Then create `docs/decisions/0019-rcl-apps-as-modules.md`, setting `date:` to today:

```markdown
---
title: rcl-core hosts rcl apps as modules
status: accepted
date: YYYY-MM-DD
---
# 0019. rcl-core hosts rcl apps as modules

Supersedes [ADR-0004](0004-server-is-the-hub.md) and [ADR-0007](0007-shared-zod-contract.md).

## Context

Rollcall is a suite of rcl apps ([ADR-0016](0016-obs-producer-becomes-rollcall.md)). rcl-core owns accounts, shared data and the CRG and OBS connections. The Producer app needs server code of its own for its themes, screens and Live Mode, but a venue should still run one process on one port, with one sign-in.

Options considered:
- **A server process per app.** Rejected: several ports at the venue, sign-in and connections duplicated in each, and browsers crossing origins between apps.
- **Apps importing rcl-core's server.** Rejected: package cycles, and every app could reach core's internals.
- **App modules that rcl-core hosts, through a small SDK.** Chosen.

ADR-0004's hub and offline rules, and ADR-0007's contract rules, still stand. They're restated below for a suite of apps, so this ADR is complete on its own.

## Decision

- **rcl-core's server is the one server process.** It hosts each rcl app as an app module (`AppModule`, from `@rollcall/app-sdk`). An app with id `producer` gets:
  - its routes below `/api/producer/`;
  - its Socket.IO namespaces at or below `/producer`;
  - its web build at `/producer/`;
  - its permissions named `producer:…`;
  - its tables named `producer_…`, migrated with their own migrations table, `__drizzle_migrations_producer`.
- **rcl-core is module `core`**, hosted the same way. `/` redirects to `/core/`.
- **The installed apps are listed in `rcl-core/server/src/installed-apps.ts`.** It's the only place rcl-core's server depends on an app.
- **Startup checks.** Core's own tables are migrated first, under Drizzle's default migrations table, so existing databases still open. Then each installed app needs:
  1. a lowercase id that no other app uses;
  2. a `requiresCore` semver range, from its package.json `rollcall.requiresCore`, that this core's version satisfies;
  3. permissions under its own id.

  Then its migrations run. An app that fails is skipped with an error in the log, and core keeps running.
- **A test asserts that every installed app accepts the current core version.** Before 1.0, `^0.1.0` excludes 0.2.0, so bumping core's minor version is always a deliberate decision for every app.
- **Boundaries**, checked by `scripts/check-boundaries.test.mjs`:
  - An app's server depends only on `@rollcall/app-sdk` and contracts.
  - rcl-core's server depends on apps' servers only through `installed-apps.ts`.
  - Web apps depend only on `@rollcall/web-sdk` and contracts.
  - Shared packages depend only on contracts.
- **The API.** Every route belongs to the app named in its path, and declares its access with that app's permissions ([ADR-0018](0018-declared-access-and-permissions.md)). Unknown `/api` paths get `404 {"error":"not_found"}`. `GET /api/core/apps` lists the hosted apps for core's app launcher. The API explorer names each tag after its app (`core/users`).
- **Restated from ADR-0004 for the hosting server:**
  - **It owns live state.** The current game on each track, component visibility, live selections and the latest CRG and OBS state all live on the server. Clients render what the server broadcasts.
  - **It owns every external connection.** It keeps exactly one connection per configured OBS instance and one per CRG instance (per track), reconnecting on its own. Apps reach them through core, never on their own.
  - **It relays through Socket.IO rooms.** There are rooms per track, per output and per dashboard, so each client gets only what it needs.
  - **It serves everything from one port.** That means every app's REST API, Socket.IO namespaces and web build, and all media and fonts. The port is bound to `0.0.0.0` so the LAN can reach it.
- **Restated from ADR-0007, per app:**
  - **Each rcl app has its own contract,** `rcl-<app>/contract` (`@rollcall/core-contract`, `@rollcall/producer-contract`). Its Zod schemas are the single contract for that app's REST requests, Socket.IO messages and import/export files. TypeScript types are derived from them (`z.infer`), and nobody hand-writes a duplicate interface. An app may use another app's contract.
  - **The server validates all input against them.** That covers REST bodies, socket payloads and imported files.
  - **Overlay component options are Zod schemas too** ([overlay components](../features/overlay-components.md)), so the builder can validate options and render forms from them.
  - **Import/export files are versioned.** Each file carries an envelope with its format, its kind and a format version. The contract keeps a schema for every version it can still read, plus migrations up to the current one ([import / export](../features/import-export.md)).

**Hard rules:**
- **The server is the hub.** Browsers (dashboards, overlays) never connect to OBS or CRG directly. Secrets such as the OBS password never reach a browser.
- **Works offline at the venue.** Nothing at runtime depends on the internet: no CDNs, no hosted fonts, no cloud APIs. The server serves every asset.

### Names used in earlier ADRs

| Earlier name | Now |
|---|---|
| `packages/shared`, the shared contract | each app's contract: `rcl-core/contract` (`@rollcall/core-contract`), `rcl-producer/contract` (`@rollcall/producer-contract`) |
| `/api/<route>`, such as `/api/health`, `/api/auth/login` or `/api/users` | `/api/core/<route>` |
| the `/overlay` Socket.IO namespace | `/producer/overlay` |
| `server:hello` in the shared contract | `server:hello` in `@rollcall/producer-contract` |

## Consequences

- **Adding an app** takes a module, a line in `installed-apps.ts`, and its workspace folders ([ADR-0017](0017-rcl-app-workspace-layout.md)).
- **Apps can't reach core's internals.** Core's data (teams, players, logos), CRG and OBS must be added to `AppContext` on purpose, one service at a time.
- **An app that fails its startup checks can't stop core.** An app's code still runs in core's process, though, so its handlers must not crash it.
- **Bumping rcl-core's version means updating each app's `requiresCore`.**
- **Each app's sockets live under its own id.** Per-event checks are still needed ([ADR-0018](0018-declared-access-and-permissions.md)).
- **The server is still a single point of failure during an event.** Outputs must therefore rebuild their full state from the server whenever they reconnect or reload.
- **Theme fonts must be uploaded or bundled;** they can't be linked from a font service ([Theme Builder](../features/theme-builder.md)).
- **Changing a shape is a compile error everywhere it matters.** Invalid input fails with a precise error before it can touch the database.
- **Any breaking change to an export format needs a new version and a migration.** Old exports must stay importable.
```

**Mark ADR-0004 and ADR-0007 superseded.** In each, change only:
- in the frontmatter, `status: accepted` becomes `status: superseded`, with `superseded_by: "0019"` on the next line;
- under its `#` title, add a blank line and a note:
  - for ADR-0004: `> **Superseded by [ADR-0019](0019-rcl-apps-as-modules.md):** rcl-core's server is the hub for the whole suite, hosting each rcl app as a module. The hub and offline rules are unchanged.`
  - for ADR-0007: `` > **Superseded by [ADR-0019](0019-rcl-apps-as-modules.md):** each rcl app has its own Zod contract (`rcl-<app>/contract`), with the same rules. ``

- [ ] **Step 2: Point living pages, rules and code comments at ADR-0019.**

```bash
FILES="AGENTS.md docs/architecture/README.md docs/architecture/integrations/obs-websocket.md \
  docs/features/import-export.md docs/features/live-mode.md docs/features/obs-control.md docs/features/overlay-components.md \
  docs/features/team-builder.md docs/features/theme-builder.md docs/product/vision.md \
  .claude/rules/rcl-core-contract.md .claude/rules/rcl-core-server.md .claude/rules/rcl-core-web.md .claude/rules/rcl-producer-web.md \
  rcl-core/web/vite.config.ts rcl-core/server/src/index.ts rcl-producer/web/vite.config.ts rcl-producer/web/src/overlay/live.ts \
  packages/web-sdk/src/api.ts packages/web-sdk/src/vite.ts"
perl -pi -e 's/0004-server-is-the-hub\.md|0007-shared-zod-contract\.md/0019-rcl-apps-as-modules.md/g; s/ADR-0004|ADR-0007/ADR-0019/g; s/(\[ADR-0019\]\([^)]*\)), \1/$1/g; s/\(ADR-0019, ADR-0019\)/(ADR-0019)/g' $FILES
grep -rn -e 'ADR-0004' -e 'ADR-0007' -e '0004-server' -e '0007-shared' $FILES
```

Expected: the `grep` prints nothing. Accepted ADRs and the dated `design-docs/` keep their links.

- [ ] **Step 3: The agent instructions and rules.**

**`AGENTS.md`:**
- The status sentence `` The Producer app's web code is in [rcl-producer](rcl-producer/AGENTS.md) and shared web code in `packages/web-sdk`; all server code stays in [rcl-core](rcl-core/AGENTS.md) until app modules arrive. `` becomes:

  ```markdown
  [rcl-core](rcl-core/AGENTS.md)'s server hosts each app as a module, including [rcl-producer](rcl-producer/AGENTS.md)'s ([ADR-0019](docs/decisions/0019-rcl-apps-as-modules.md)). Code shared across apps is in `packages/`.
  ```

- The Stack line `` - Contract: Zod schemas in `rcl-core/contract` ([ADR-0019](docs/decisions/0019-rcl-apps-as-modules.md)) `` (already relinked by Step 2) becomes:

  ```markdown
  - Contracts: Zod schemas in each app's `contract` workspace, such as `rcl-core/contract` ([ADR-0019](docs/decisions/0019-rcl-apps-as-modules.md))
  ```

- In the Layout block, the `rcl-producer/` and `packages/` lines become:

  ```
  ├── rcl-producer/      the Producer app: its server module, contract, web app and the OBS overlay (see rcl-producer/AGENTS.md)
  ├── packages/          code shared across apps: app-sdk (@rollcall/app-sdk), web-sdk (@rollcall/web-sdk)
  ```

Hard rules 3 and 4 keep their wording; Step 2 changed only their links.

**`rcl-core/AGENTS.md`:**
- `` It also serves every rcl app's web build, each below its own path: its own at `/core/`, the Producer app's at `/producer/`. `` becomes:

  ```markdown
  It hosts every rcl app as a module, itself included as module `core` ([ADR-0019](../docs/decisions/0019-rcl-apps-as-modules.md)): each app's routes below `/api/<id>/`, its Socket.IO namespaces below `/<id>`, and its web build at `/<id>/`. The installed apps are listed in `server/src/installed-apps.ts`.
  ```

- In the Layout block:
  - `├── server/     @rollcall/core-server: Fastify API, Socket.IO, OBS/CRG connections, SQLite` becomes `├── server/     @rollcall/core-server: the host (Fastify, Socket.IO, SQLite, OBS/CRG connections) and core's own module`;
  - `└── contract/   @rollcall/core-contract: Zod schemas and types, used as TypeScript source (no build step)` becomes `└── contract/   @rollcall/core-contract: Zod schemas and types for /api/core, used as TypeScript source (no build step)`.

**`rcl-producer/AGENTS.md`:**
- `` It has no server process of its own. rcl-core's server serves its web build at `/producer/`, and its server code will run inside rcl-core as an app module (Phase 4b of the split spec). `` becomes:

  ```markdown
  It has no server process of its own: rcl-core's server hosts it as app module `producer` ([ADR-0019](../docs/decisions/0019-rcl-apps-as-modules.md)), with its routes below `/api/producer/`, its Socket.IO namespaces below `/producer` and its web build at `/producer/`.
  ```

- Its Layout block becomes:

  ```
  rcl-producer/
  ├── server/    @rollcall/producer-server: the app module rcl-core hosts (depends only on @rollcall/app-sdk and contracts)
  ├── contract/  @rollcall/producer-contract: Zod schemas for /api/producer and its namespaces, such as the overlay's hello
  └── web/       @rollcall/producer-web: the Producer app at /producer/ (Mantine), and the OBS overlay at /producer/overlay (no Mantine)
  ```

**`rcl-producer/CLAUDE.md`:** `` `.claude/rules/rcl-producer-{web,overlay}.md` `` becomes `` `.claude/rules/rcl-producer-{server,contract,web,overlay}.md` ``.

**Create `.claude/rules/rcl-producer-server.md`:**

```markdown
---
paths:
  - "rcl-producer/server/**"
---
# rcl-producer server (`rcl-producer/server/`, ADR-0019)

- **This is an app module, not a server.** `src/index.ts` exports `producerApp`, which rcl-core's server hosts. It never starts a process, opens a port or opens the database itself.
- **Depend only on `@rollcall/app-sdk` and contracts** (`@rollcall/producer-contract`, `@rollcall/core-contract`). Never on `@rollcall/core-server`: `scripts/check-boundaries.test.mjs` fails otherwise.
- **Hard rules 1–5** in `AGENTS.md` apply here, as on rcl-core's server.
- **Everything is named after the app:**
  - routes are relative to `/api/producer` (`/themes`, not `/api/producer/themes`), with tags `producer/<area>`;
  - namespaces are at or below `/producer`;
  - permissions are `producer:<action>`, listed in `permissions` with the roles that hold them, and in the table on `docs/features/users-and-access.md`;
  - tables are `producer_<name>`, in migrations under `migrationsFolder` (`rcl-core/server/src/installed-apps.test.ts` checks the names).
- **Every route and namespace declares its access** (hard rule 5, ADR-0018), and validates its input with schemas from `@rollcall/producer-contract` (ADR-0014).
- **`rollcall.requiresCore`** in `package.json` is the rcl-core range this app works with. Change it deliberately when core's version changes.
```

**Create `.claude/rules/rcl-producer-contract.md`:**

```markdown
---
paths:
  - "rcl-producer/contract/**"
---
# rcl-producer contract (`rcl-producer/contract/`, ADR-0019)

- **The Producer app's Zod schemas:** `/api/producer`, its namespaces (such as the overlay's `server:hello`), and its import/export formats.
  - Types come from `z.infer`.
  - Name schemas `FooSchema` and their types `Foo`.
  - Prefer `z.strictObject`.
- **A schema change is a server *and* web change.** Update both, and their tests, in the same change.
- **Released import/export format versions never change.** Add a new version plus a migration instead (`docs/features/import-export.md`).
- **Keep it lean:** the Producer app's server, its web app and the overlay all use this package. No runtime dependencies beyond `zod`, and no Node-only or DOM-only APIs.
- **Tests:** every schema has tests for an accepted payload and for the rejected shapes that matter.
```

**`.claude/rules/rcl-core-server.md`:**
- The `**Routes go in \`buildApp()\`**` bullet becomes:

  ```markdown
  - **This server hosts every rcl app as a module** (ADR-0019). `src/apps.ts` runs the startup checks and migrations, `src/app.ts` mounts each app's routes below `/api/<id>/`, and `src/realtime.ts` its namespaces. Database, Socket.IO and listening are wired in `startServer()` (`src/server.ts`).
    - Installed apps are listed in `src/installed-apps.ts`, the only file that may import an app's server (`scripts/check-boundaries.test.mjs`).
    - Core's own routes go in its module, `src/core-app.ts`, with paths relative to `/api/core` (`/users`, not `/api/core/users`), so `app.inject()` can test them.
  ```

- In the schema bullet, append ` Tags are named \`core/<area>\`.` after `` with schemas from `@rollcall/core-contract`. ``.
- The `**Socket.IO:**` bullet becomes:

  ```markdown
  - **Socket.IO:** each app creates its namespaces with `rt.namespace(name, { access })` in its module's `realtime()`, at or below `/<id>`. `/` refuses everyone.
  ```

**`.claude/rules/rcl-core-contract.md`:**
- After the `# rcl-core contract` title line, add a blank line and:

  ```markdown
  - **This is rcl-core's contract:** `/api/core` and core's namespaces. Each rcl app has its own (`rcl-<app>/contract`), and an app may use another's.
  ```

- `**Keep it lean:** server, web app and overlay all use this package.` becomes `**Keep it lean:** servers, web apps and the web SDK all use this package.`

**`.claude/rules/sdk.md`:** before the `**\`@rollcall/web-sdk\`**` bullet, add:

```markdown
- **`@rollcall/app-sdk`** (`packages/app-sdk/`) is what an rcl app's server module is written against (ADR-0019): `AppModule`, `AppContext`, `Realtime`, and the `Access`, `Permission` and `PermissionDef` types. Types only: rcl-core's server does the hosting.
  - Change it with care: every app module and rcl-core's host depend on these shapes.
```

**`.claude/rules/rcl-producer-overlay.md`:** the Live state bullet's first line becomes:

```markdown
- **Live state** comes only from Socket.IO, the `/producer/overlay` namespace, into the RTK Query cache in `live.ts` (hard rule 6), and is validated with schemas from `@rollcall/producer-contract`.
```

- [ ] **Step 4: The wiki.**

**`docs/architecture/README.md`, the Pieces table:**
- The `rcl-core/server` row becomes:

  ```markdown
  | `rcl-core/server` | The one server process: hosts every rcl app as a module ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)), plus core's own REST API, Socket.IO hub, accounts and access checks, SQLite, media storage, one connection per OBS and CRG instance, automation engine and live state |
  ```

- The `rcl-core/contract` row becomes:

  ```markdown
  | `rcl-core/contract` | Zod schemas and TypeScript types for core's API, socket messages and import/export formats, used by server and web |
  ```

- Directly after it, add:

  ```markdown
  | `rcl-producer/server` | The Producer app's module: its routes, namespaces (such as the overlay's `/producer/overlay`) and tables, hosted by rcl-core |
  | `rcl-producer/contract` | Zod schemas and types for the Producer app's API and socket messages |
  ```

- Before the `packages/web-sdk` row, add:

  ```markdown
  | `packages/app-sdk` | The types an app module is written against: `AppModule`, `AppContext`, `Access` and permissions |
  ```

- The **Socket.IO namespaces** paragraph becomes:

  ```markdown
  **Socket.IO namespaces.** Each rcl app has its own namespaces, at or below `/<id>`, and each one declares who may join, as each API route does ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)). The OBS overlay's `/producer/overlay` is public, so OBS outputs need no login until output token URLs arrive. Signed-in namespaces, such as Live Mode's dashboards, check the session cookie when a client connects. The bare `/` namespace refuses everyone.
  ```

**`docs/guides/local-development.md`:**
- `` - **Health check:** `http://localhost:5580/api/health` `` becomes `` - **Health check:** `http://localhost:5580/api/core/health` ``.
- The first step under "Trying the API" becomes:

  ```markdown
  1. Open `POST /api/core/auth/login`, choose **Try it out**, and log in. On a fresh data folder, create the first Admin with `POST /api/core/setup` first. Each rcl app's routes are below `/api/<app>/`.
  ```

- In Troubleshooting, `` Check `/api/health` on the same host `` becomes `` Check `/api/core/health` on the same host ``.

**`docs/guides/testing.md`:**
- `` - **`node`:** `rcl-core/contract` and `rcl-core/server`, in Node. `` becomes `` - **`node`:** every app's `server` and `contract`, such as `rcl-core/server`, in Node. ``
- The "One web test needs real Node APIs" bullet becomes:

  ```markdown
  - **A few web tests need real Node APIs:** the dev proxy checks, the dev overlay route and the overlay bundle check. Each opts out of jsdom with `// @vitest-environment node` at the top of the file.
  ```

- `` url: '/api/health' `` becomes `` url: '/api/core/health' ``.
- `` Pass `registerRoutes` to add a throwaway route, with `config: { access: … }` like any route (see `rcl-core/server/src/auth/access.test.ts`). `` becomes:

  ```markdown
  Pass `registerRoutes` to add a throwaway route below `/api/core/`, with `config: { access: … }` like any route, or `apps` to host a throwaway app module with its own routes, namespaces and permissions (see `rcl-core/server/src/auth/access.test.ts`).
  ```

- Before the `**Reconnect after restart` bullet, add:

  ```markdown
  - **Boundaries (`scripts/check-boundaries.test.mjs`).** It fails if an app's server depends on rcl-core's server or on another app's, if rcl-core's server imports an app anywhere but `src/installed-apps.ts`, or if any workspace imports a `@rollcall` package it doesn't list ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)). Fixture repos prove each rule fires.
  - **Installed apps (`rcl-core/server/src/installed-apps.test.ts`).** Every installed app must accept the current rcl-core version, and its migrations may only create tables named after it (`<id>_…`).
  ```

**`docs/product/glossary.md`:** after the **rcl app** row, add:

```markdown
| <a id="app-module"></a>**App module** | How rcl-core's server hosts an rcl app ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)): its routes below `/api/<id>/`, its live connections below `/<id>`, its web build at `/<id>/`, and its permissions and tables named after it. rcl-core is itself module `core`. |
```

- [ ] **Step 5: CHANGELOG.** Under `## [Unreleased]`:
  - Append to **Added**:

```markdown
- The server lists the apps it hosts at `/api/core/apps`, for signed-in users (#5)
```

  - Append to **Changed**:

```markdown
- rcl-core now hosts each app as a module, so every API address starts with its app: `/api/health` is now `/api/core/health`, `/api/auth/login` is `/api/core/auth/login`, and so on. The OBS overlay's live connection moved too: after upgrading, refresh each OBS browser source (right-click ▸ Refresh) (#5)
```

- [ ] **Step 6: Regenerate the indexes, then check and commit.**

```bash
node scripts/check-docs.mjs --fix
yarn format && yarn check
git add -A AGENTS.md CHANGELOG.md docs .claude/rules rcl-core rcl-producer packages
git commit -F - <<'EOF'
docs(repo): ADR-0019, rcl apps hosted as modules

ADR-0019 supersedes ADR-0004 and ADR-0007: rcl-core's server hosts each rcl
app as a module, and each app has its own contract. Hard rules 3 and 4 keep
their wording and now cite ADR-0019. AGENTS files, path rules (new ones for
rcl-producer's server and contract), the architecture page, guides, glossary,
CHANGELOG and code comments follow.

Closes #5

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Expected: `check-docs: OK`. `docs/decisions/README.md` lists 0004 and 0007 as superseded by 0019.

---

### Task 7: Phase 4b hand-off ⏸

- [ ] **Step 1: The full checks the spec requires before merge.**

```bash
yarn install --immutable && yarn check && yarn build && yarn test:stories && yarn test:e2e
```

Expected:
- all pass: 219 unit tests, 84 script tests, 8 story tests and 5 e2e tests;
- `git diff main.. -- yarn.lock` adds only the new `@rollcall/*` workspaces, `semver` and `@types/semver`;
- `node scripts/check-boundaries.mjs` prints `check-boundaries: OK`.

- [ ] **Step 2: Review the whole branch.**
  - Run `git log --oneline main..` (7 commits, including the plan) and `git diff --stat main..`.
  - Check that the moved contract shows as a rename (`git log --follow rcl-producer/contract/src/realtime.ts`).
  - Then use superpowers:requesting-code-review on the branch, and fix what it confirms.

- [ ] **Step 3: Check `yarn dev` and `yarn start` by hand.**
  - With `yarn dev`, through `http://localhost:5173`:
    - `/api/core/health` answers;
    - `/docs` shows tags `core/…`;
    - `/producer/overlay` shows the card.
  - With `yarn build && yarn start`:
    - `/api/core/health` answers;
    - `/api/health` gives `{"error":"not_found"}`;
    - `/producer/overlay` shows the card;
    - the server log names no skipped app.

  Stop both afterwards.

- [ ] **Step 4: ⏸ Ask Mike, then merge and push.**

```bash
git switch main && git merge --ff-only feat/app-modules
git push origin main && git branch -d feat/app-modules
```

Then:
- Check that #5 closed and its card is in "Done" on board #6 (`gh project item-list 6 --owner wardmanm`). If it isn't, remind Mike.
- Update `rollcall-pivot.md` in memory: Phase 4b is done, and next are #11 (the web app's sign-in, setup and users pages, with the app launcher), #7 and Phase 5 (#6).
- Remind Mike to refresh each OBS browser source after upgrading.
