---
title: rcl-core hosts rcl apps as modules
status: accepted
date: 2026-10-10
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
