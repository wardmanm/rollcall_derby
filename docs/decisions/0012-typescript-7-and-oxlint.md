---
title: Technology stack, TypeScript 7 and Oxlint
status: accepted
date: 2026-09-29
---
# 0012. Technology stack, TypeScript 7 and Oxlint

Supersedes [ADR-0011](0011-technology-stack-with-yarn.md).

## Context

The maintainer wants the toolchain as up to date as possible. TypeScript 7.0, the native Go port of the compiler, was released on 2026-07-08. It doesn't include the programmatic compiler API, which is expected to return in 7.1. typescript-eslint is built on that API, so it only supports TypeScript below 6.1.

Options considered:
- **TypeScript 7 + Oxlint.** Oxlint's type-aware linting went stable on 2026-07-22. It runs on `oxlint-tsgolint`, which is built on TypeScript 7 and covers 59 of typescript-eslint's 61 type-aware rules. **Chosen.**
- **TypeScript 7 for `tsc`, plus a TypeScript 6 alias for ESLint.** This is Microsoft's side-by-side setup. Rejected: it means two compilers, and linting sees TypeScript 6's view of the types.
- **Stay on TypeScript 6 until 7.1.** Rejected: it isn't the latest.

For formatting, Oxfmt (0.x, beta) was rejected in favor of stable Prettier.

Everything else in ADR-0011 stands. It is restated below so this ADR is complete on its own.

## Decision

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript 7** (native compiler), `strict` mode, everywhere | Latest compiler and much faster type-checking. One type system from the database to the overlay |
| Package manager and repo layout | **Yarn 4**, pinned with the `packageManager` field and installed through Corepack. **Yarn workspaces**: `apps/server`, `apps/web`, `packages/shared`. `nodeLinker: node-modules` in `.yarnrc.yml`, and `yarn.lock` committed | Yarn classic refuses to run in the project. The `node-modules` linker keeps native modules and editor tooling working without Plug'n'Play setup |
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

## Consequences

- There's no ESLint or typescript-eslint in the project.
  - Two type-aware rules from typescript-eslint have no Oxlint equivalent yet.
  - React's `rules-of-hooks` wasn't found in Oxlint's rule list. Issue #10 must confirm how it's covered: an Oxlint rule, Oxlint's JS-plugin support, or a minimal ESLint config for that one rule.
- `oxlint-tsgolint` embeds its own TypeScript 7.x. Upgrade it together with `typescript`, so linting and `tsc` agree on the types.
- Tools that need TypeScript's programmatic API won't work until 7.1. Check any Vite plugin or codegen tool for this before adopting it.
- TypeScript 7 defaults `types` to `[]`, so a workspace that needs Node or DOM globals lists them explicitly, e.g. `"types": ["node"]` on the server.
- VS Code needs the TypeScript 7 extension so editor errors match `tsc`.
- When TypeScript 7.1 restores the API, revisit ESLint only if a needed rule or plugin is still missing from Oxlint.
- Swapping any single tool later means a new ADR that supersedes this one for that concern.
