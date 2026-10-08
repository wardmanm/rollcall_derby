---
title: Technology stack, with rcl apps in one workspace
status: accepted
date: 2026-10-08
---
# 0017. Technology stack, with rcl apps in one workspace

Supersedes [ADR-0012](0012-typescript-7-and-oxlint.md).

## Context

Rollcall is a suite of rcl apps ([ADR-0016](0016-obs-producer-becomes-rollcall.md)). The apps share a server, its contract and some web code, so they need a layout that keeps each app together and still shares tooling.

Options considered:
- **`apps/` by layer** (`apps/core-server`, `apps/producer-web`, …). Rejected: one app's parts end up far apart, and its rcl name shows only in package names.
- **A separate Yarn project per app.** Rejected: the shared contract and SDKs would have to be published or linked across projects.
- **One folder per app at the root, all in one Yarn workspace.** Chosen.

Everything else in ADR-0012 stands. It is restated below so this ADR is complete on its own.

## Decision

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript 7** (native compiler), `strict` mode, everywhere | Latest compiler and much faster type-checking. One type system from the database to the overlay |
| Package manager and repo layout | **Yarn 4**, pinned with the `packageManager` field and installed through Corepack, with `nodeLinker: node-modules` and `yarn.lock` committed. **One Yarn workspace** for the repo. Each rcl app is a root folder `rcl-<app>/` with `server/`, `web/` and `contract/` workspaces; libraries shared across apps go in `packages/`. The root `package.json` lists each app folder (`"rcl-core/*"`), never a wildcard folder name. Packages use the `@rollcall/` scope: `@rollcall/core-server`, `@rollcall/core-web`, `@rollcall/core-contract`, `@rollcall/e2e` | Each app's parts stay together under the name people use for it. One install, one lockfile and one set of checks for the suite. `scripts/release.mjs` reads `dir/*` patterns only |
| Runtime | **Node ≥ 24 LTS** | Current LTS line. Node 25+ doesn't bundle Corepack, so the dev setup explains how to install it |
| Web app | **Vite + React** single-page app, **React Router** | Fast dev loop, standard React tooling |
| Admin UI kit | **Mantine** | Batteries included. Overlays don't use it ([ADR-0006](0006-one-overlay-renderer-css-variable-theming.md)) |
| Client state | **Redux Toolkit + RTK Query** | See [ADR-0003](0003-client-state-with-redux-toolkit.md) |
| Server | **Fastify** | Fast, TypeScript-friendly, plugin model, schema validation |
| Real-time | **Socket.IO** | Rooms, automatic reconnection and acknowledgements. Reconnection matters for OBS browser sources |
| Storage | **SQLite** via **Drizzle ORM** (`better-sqlite3`), with migrations | Single-file database with no server to run; typed schema. Media is stored as files in a data directory |
| Testing | **Vitest** (unit and integration), **React Testing Library** (UI), **Playwright** (end-to-end: outputs, dashboards) | Vitest fits Vite; Playwright can check real rendered overlays |
| Linting | **Oxlint**, with type-aware linting through `oxlint-tsgolint` | Works with TypeScript 7 today, and runs many times faster than ESLint. Includes TypeScript, React, jsx-a11y and import rules |
| Formatting | **Prettier** | Stable and independent of the TypeScript version |

Library versions are pinned in `package.json`, not in this ADR.

### Names used in earlier ADRs

| Earlier name | Now |
|---|---|
| `apps/server`, `@obs-producer/server` | `rcl-core/server`, `@rollcall/core-server` |
| `apps/web`, `@obs-producer/web` | `rcl-core/web`, `@rollcall/core-web` |
| `packages/shared`, `@obs-producer/shared` | `rcl-core/contract`, `@rollcall/core-contract` |

## Consequences

- An app's workspaces sit at the same depth as before (`rcl-core/server` like `apps/server`), so relative paths such as the default data folder and `tsconfig` `extends` didn't change.
- Adding an app means adding its folder to the root `workspaces`, the Vitest projects, the lint and format ignores, and `.claude/rules`.
- The ADR-0012 consequences about Oxlint, `oxlint-tsgolint`, TypeScript 7's missing API and `types` defaults still apply.
