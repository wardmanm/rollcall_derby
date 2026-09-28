---
title: Initial technology stack
status: accepted
date: 2026-09-28
---
# 0002. Initial technology stack

## Context

OBS Producer is a web app run on a single machine at a venue and used by several browsers on the local network. The app has four main parts:
- a data-heavy admin UI (builders, forms, color pickers);
- a real-time layer driving overlays and dashboards;
- a small relational dataset (teams, themes, screens, games, users);
- integrations with OBS and CRG over WebSockets.

It will be maintained by a small volunteer team working alongside AI agents, so mainstream, well-documented tools matter more than novelty.

## Decision

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript**, `strict` mode, everywhere | One type system from the database to the overlay; catches contract drift |
| Repo layout | **npm workspaces**: `apps/server`, `apps/web`, `packages/shared` | Shared types and schemas without extra tooling; npm ships with Node |
| Runtime | **Node ≥ 24 LTS** | Current LTS line |
| Web app | **Vite + React** single-page app, **React Router** | Fast dev loop, standard React tooling |
| Admin UI kit | **Mantine** | Batteries included: forms, color inputs, modals, notifications, app shell. Overlays don't use it ([ADR-0006](0006-one-overlay-renderer-css-variable-theming.md)) |
| Client state | **Redux Toolkit + RTK Query** | See [ADR-0003](0003-client-state-with-redux-toolkit.md) |
| Server | **Fastify** | Fast, TypeScript-friendly, plugin model, schema validation |
| Real-time | **Socket.IO** | Rooms, automatic reconnection and acknowledgements out of the box. Reconnection matters for OBS browser sources |
| Storage | **SQLite** via **Drizzle ORM** (`better-sqlite3`), with migrations | Single-file database with no server to run; typed schema. Media such as photos, logos and fonts are stored as files in a data directory |
| Testing | **Vitest** (unit and integration), **React Testing Library** (UI), **Playwright** (end-to-end: outputs, dashboards) | Vitest fits Vite; Playwright can check real rendered overlays |
| Code style | **ESLint** (typescript-eslint, React hooks rules) + **Prettier** | Standard and well understood by agents |

Library versions are pinned in `package.json` at scaffold time, not in this ADR.

## Consequences

- One language and one package manager for the whole app. Types and Zod schemas are shared through `packages/shared` ([ADR-0007](0007-shared-zod-contract.md)).
- `better-sqlite3` is a native module. Packaging for venue laptops (roadmap Phase 5) must account for per-platform builds.
- Swapping any single tool later means a new ADR that supersedes this one for that concern.
