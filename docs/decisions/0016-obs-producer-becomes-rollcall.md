---
title: OBS Producer becomes Rollcall, a suite of rcl apps
status: accepted
date: 2026-10-08
---
# 0016. OBS Producer becomes Rollcall, a suite of rcl apps

## Context

OBS Producer outgrew one app. Accounts, shared data such as teams and logos, and the CRG and OBS connections serve more than overlay production. The maintainer is building a suite, **Rollcall**, in its own repository, with apps named `rcl-<app>` ([spec](../../design-docs/specs/2026-10-07-rollcall-split-design.md)).

Options considered:
- **A fresh repository with the files copied over.** Rejected: it loses `git blame` and the commit trail behind every ADR.
- **Stay in the GROBS monorepo.** Rejected: GROBS holds unrelated tools that share no code, while Rollcall's apps share a server and its contract.
- **Import with history** using `git filter-repo`. Chosen.

## Decision

- **Name and repository.** The product is **Rollcall**, in `wardmanm/rollcall_derby`. Its history was imported from `obs-producer/` in `wardmanm/GROBS`. Issue numbers here start again at 1, so `#N` in imported commit messages was rewritten to `wardmanm/GROBS#N`. The tag `obs-producer-v0.1.0` and its GitHub Release stay in GROBS; this repo only gets `rcl-<app>-v…` tags.
- **Apps.** Each app is an **rcl app** named `rcl-<app>`:
  - **rcl-core** is the host: the one server process, accounts and access, shared data (teams, players, logos), and the CRG and OBS connections. Its GUI holds setup, sign-in, users, connections and data editors.
  - **rcl-producer** builds and runs overlays: themes, screens, overlay components, Live Mode and dashboards. It has no server process of its own; its server code runs inside rcl-core, as a later ADR records.
- **URLs once the apps split:** `/core/` and `/api/core/*` for rcl-core, `/producer/` and `/api/producer/*` for rcl-producer, `/producer/overlay` for OBS outputs, and `/docs` for the API explorer. Until the split, today's paths stay.
- **Runtime names.**
  - Settings are `ROLLCALL_HOST`, `ROLLCALL_PORT`, `ROLLCALL_DATA_DIR`, `ROLLCALL_WEB_DIR`, `ROLLCALL_API_DOCS` and `ROLLCALL_DEV_SERVER`. The server refuses to start while any `OBS_PRODUCER_*` setting is present, and names the replacement.
  - The session cookie is `rollcall_session`, so everyone signs in again once.
  - The database file is `rollcall.db`.

### Names used in earlier ADRs

Accepted ADRs are never rewritten ([ADR-0001](0001-record-decisions-as-adrs.md)). Read their names as:

| Earlier name | Now |
|---|---|
| OBS Producer, obs-producer (the app) | Rollcall (the suite and repo), or rcl-core / rcl-producer (one app) |
| `OBS_PRODUCER_*` settings | `ROLLCALL_*` |
| `obs_producer_session` cookie | `rollcall_session` |
| `obs-producer.db` | `rollcall.db` |
| `obs-producer/CHANGELOG.md` | `CHANGELOG.md` |

## Consequences

- Existing setups rename their settings, sign in again, and rename the database file to keep their accounts.
- Imported history and the 0.1.0 CHANGELOG refer to GROBS issues as `wardmanm/GROBS#N`. The release workflow only comments on bare `#N` references, so it never touches them.
- No release is cut until per-app releases are decided in a later ADR. Until then the release tooling still names the old `obs-producer-v` prefix, unused.
- OBS browser sources keep their URL until the split moves the overlay.
