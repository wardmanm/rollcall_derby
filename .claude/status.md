# Status: Rollcall
Updated: 2026-10-19 · Branch: main

## Current focus
The Rollcall split is finished: rcl-core v0.1.0 and rcl-producer v0.2.0 are both released. Choosing the next feature (Phase 1 of the roadmap).

## Recent changes
- 2026-10-19: Published rcl-producer v0.2.0, the first release since OBS Producer 0.1.0. Both release milestones are closed.
- 2026-10-19: Prepared rcl-producer v0.2.0: its notes moved under 0.2.0 and its packages went to 0.2.0. Merged to `main`.
- 2026-10-19: rcl-producer's 0.2.0 notes give one OBS step when upgrading: change each browser source's URL.
- 2026-10-19: Published rcl-core v0.1.0, the first release of an rcl app on its own. Its milestone closed, and its issues got "Released in" comments.
- 2026-10-19: Decided: a commit that changes only this log may go straight to `main` when no work branch is open.
- 2026-10-19: Added this status log, and the rule to keep it current, to CLAUDE.md.
- 2026-10-19: Prepared rcl-core v0.1.0: its changelog notes moved under 0.1.0. Merged to `main`; CI passed.
- 2026-10-19: The repo is public. The `release` environment (Mike approves; `main` only), the "Release tags are permanent" tag ruleset and immutable releases are set up. #6 closed.
- 2026-10-17: Each app is now released on its own (#6, ADR-0021): a changelog per app, a release workflow per app, and issue forms and feature pages that say which app.
- 2026-10-16: API keys let devices and scripts such as Bitfocus Companion call the server (#7, ADR-0020).

## Pending decisions
- **What to build next** (raised 2026-10-19). Options: A) Team Builder, next on the roadmap (rcl-core) / B) Theme Builder (rcl-producer) / C) first file the deferred review findings as issues / D) a backlog issue: #9 CORS allowlist or #10 output token URLs. Blocks: the next spec and milestone.

## Loose ends
- About 25 small findings deferred from code reviews (Phases 3–5, #7, #11) aren't filed as issues yet. None blocks a release.
