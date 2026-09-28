---
title: Roadmap
---
# Roadmap

The order we plan to build things in. Each phase links to its feature pages, and each feature's status lives on its own page (collected in the [feature index](../features/README.md)). This page is only about sequence. Reorder it when priorities change.

## Phase 0 — Foundations

Nothing user-facing yet: this phase lays the groundwork every feature depends on.

- [x] Living wiki, agent instructions (`AGENTS.md` / `CLAUDE.md`), docs lint and CI
- [ ] Scaffold the monorepo described in [ADR-0002](../decisions/0002-initial-technology-stack.md): `apps/server`, `apps/web`, `packages/shared`
- [ ] Add the npm scripts (`dev`, `test`, `lint`, `build`, `docs:check`) and document them in `AGENTS.md`
- [ ] Add path-scoped agent rules that map code areas to their doc pages (see `obs-producer/CLAUDE.md`)
- [ ] Auth skeleton: first-run admin account, login, and server-side role checks ([users and access](../features/users-and-access.md))

## Phase 1 — Builders

- [Team Builder](../features/team-builder.md)
- [Theme Builder](../features/theme-builder.md)
- [Import / export](../features/import-export.md) for teams and themes

## Phase 2 — Screens

- The overlay renderer described in [ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)
- [Screen Builder](../features/screen-builder.md)
- The first [overlay components](../features/overlay-components.md), starting with a team roster

## Phase 3 — Live Mode

- [Live Mode](../features/live-mode.md): events, games, tracks and outputs
- Producer dashboards with live preview and component controls

## Phase 4 — Integrations

- [CRG automation](../features/crg-automation.md): read-only CRG listener, triggers and live data bindings
- [OBS control](../features/obs-control.md): scenes, hotkeys and source visibility from dashboards

## Phase 5 — Polish

- Announcer views and limited controls ([users and access](../features/users-and-access.md))
- Operator [guides](../guides/README.md)
- Packaging so non-developers can install and run it at a venue
