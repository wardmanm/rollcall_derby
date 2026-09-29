---
title: Technology stack, with Yarn workspaces
status: superseded
date: 2026-09-29
superseded_by: "0012"
---
# 0011. Technology stack, with Yarn workspaces

> **Superseded by [ADR-0012](0012-typescript-7-and-oxlint.md):** TypeScript 7 with Oxlint (type-aware) and Prettier replaces ESLint + typescript-eslint. The rest of the stack is unchanged.

Supersedes [ADR-0002](0002-initial-technology-stack.md).

## Context

ADR-0002 chose npm workspaces for the monorepo. Before any code was scaffolded (issue #5), the maintainer chose Yarn instead. Everything else in ADR-0002 stands, and it is restated below so this ADR is complete on its own.

The version of Yarn matters:
- **Yarn 1 (classic)** is in maintenance mode.
- **Yarn 4** defaults to Plug'n'Play (PnP). PnP needs extra setup for native modules such as `better-sqlite3`, and for editor tooling such as ESLint and TypeScript.

## Decision

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript**, `strict` mode, everywhere | One type system from the database to the overlay, so a change to the shared contract shows up as a type error everywhere it's used |
| Package manager and repo layout | **Yarn 4**, pinned with the `packageManager` field and installed through Corepack. **Yarn workspaces**: `apps/server`, `apps/web`, `packages/shared`. `nodeLinker: node-modules` in `.yarnrc.yml`, and `yarn.lock` committed | Maintainer's choice. The `node-modules` linker keeps native modules and editor tooling working without PnP setup |
| Runtime | **Node ≥ 24 LTS** | Current LTS line. Node 25+ no longer bundles Corepack, so the dev setup guide explains how to install it |
| Web app | **Vite + React** single-page app, **React Router** | Fast dev loop, standard React tooling |
| Admin UI kit | **Mantine** | Batteries included: forms, color inputs, modals, notifications, app shell. Overlays don't use it ([ADR-0006](0006-one-overlay-renderer-css-variable-theming.md)) |
| Client state | **Redux Toolkit + RTK Query** | See [ADR-0003](0003-client-state-with-redux-toolkit.md) |
| Server | **Fastify** | Fast, TypeScript-friendly, plugin model, schema validation |
| Real-time | **Socket.IO** | Rooms, automatic reconnection and acknowledgements out of the box. Reconnection matters for OBS browser sources |
| Storage | **SQLite** via **Drizzle ORM** (`better-sqlite3`), with migrations | Single-file database with no server to run; typed schema. Media such as photos, logos and fonts are stored as files in a data directory |
| Testing | **Vitest** (unit and integration), **React Testing Library** (UI), **Playwright** (end-to-end: outputs, dashboards) | Vitest fits Vite; Playwright can check real rendered overlays |
| Code style | **ESLint** (typescript-eslint, React hooks rules) + **Prettier** | Standard and well understood by agents |

Library versions, including Yarn's, are pinned in `package.json` at scaffold time, not in this ADR.

## Consequences

- One language and one package manager for the whole app. Types and Zod schemas are shared through `packages/shared` ([ADR-0007](0007-shared-zod-contract.md)).
- Commands are `yarn …`, e.g. `yarn dev`, `yarn test` and `yarn docs:check`. CI and the release workflow enable Corepack and run `yarn install --immutable`.
- `better-sqlite3` is a native module. Packaging for venue laptops (roadmap Phase 5) must account for per-platform builds.
- Swapping any single tool later means a new ADR that supersedes this one for that concern.
