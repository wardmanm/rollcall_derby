---
title: Guides
---
# Guides

Step-by-step how-tos. A guide is written when the feature it describes exists, so that every step is accurate. Until then, planned guides are listed here rather than created as empty pages ([wiki guide](../wiki-guide.md#principles)).

## For maintainers

| Guide | Covers |
|---|---|
| [Releasing](releasing.md) | Issues and milestones, the changelog, and cutting a release |

## For operators (game day)

These are for Admins, Producers and Announcers running an event.

| Guide | Covers | Written when |
|---|---|---|
| Adding an output to OBS | Creating the browser source, output URL, size, and recommended source settings | Outputs exist (Phase 2–3) |
| Game-day checklist | Starting the server, connecting OBS and CRG, turning off CRG device writes, checking outputs | Live Mode ships (Phase 3–4) |
| Announcer quick start | Logging in and using assigned screens | Announcer views ship (Phase 5) |

## For developers

| Guide | Covers |
|---|---|
| [Local development](local-development.md) | Prerequisites (Node, Corepack, Yarn 4), first run, `yarn dev` and production mode, server settings, database migrations, editor setup, troubleshooting |
| [Testing](testing.md) | Vitest, React Testing Library and Playwright: what to test where, patterns used here, architecture guards |

Planned: running a local CRG scoreboard and OBS for integration tests, written with the [CRG](../features/crg-automation.md) and [OBS](../features/obs-control.md) features (Phase 4).
