# Status: Rollcall
Updated: 2026-10-19 · Branch: docs/status-log

## Current focus
The first releases. rcl-core v0.1.0 is prepared and on `main`; its dry run and publish are next, then rcl-producer v0.2.0.

## Recent changes
- 2026-10-19: Added this status log, and the rule to keep it current, to CLAUDE.md.
- 2026-10-19: Prepared rcl-core v0.1.0: its changelog notes moved under 0.1.0. Merged to `main`; CI passed.
- 2026-10-19: The repo is public. The `release` environment (Mike approves; `main` only), the "Release tags are permanent" tag ruleset and immutable releases are set up. #6 closed.
- 2026-10-17: Each app is now released on its own (#6, ADR-0021): a changelog per app, a release workflow per app, and issue forms and feature pages that say which app.
- 2026-10-16: API keys let devices and scripts such as Bitfocus Companion call the server (#7, ADR-0020).
- 2026-10-12: Sign-in, first-run setup, password changes and a Users page in the web app (#11).
- 2026-10-10: rcl-core hosts each app as a module, so API addresses start with the app (#5, ADR-0019).

## Pending decisions
- **How status-only updates reach `main` when no work branch is open** (raised 2026-10-19). AGENTS.md says never commit straight to `main`, but this log must be updated before every push and at the end of every session. Options: A) allow status-only commits straight to `main`; B) a short branch and merge each time; C) update it only on work branches. Blocks: how this log stays current between pieces of work.

## Loose ends
- rcl-core v0.1.0: the dry run, then publish (Mike, in GitHub Actions).
- rcl-producer v0.2.0: `/release rcl-producer 0.2.0`, then its dry run and publish (Mike), after rcl-core.
- rcl-producer's 0.2.0 notes ask upgraders to refresh their OBS browser sources twice and change their URL once; the URL change covers all three. Worth tidying before its release.
- About 25 small findings deferred from code reviews (Phases 3–5, #7, #11) aren't filed as issues yet. None blocks a release.
