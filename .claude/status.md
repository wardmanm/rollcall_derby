# Status: Rollcall
Updated: 2026-10-19 · Branch: main

## Current focus
The first releases. rcl-core v0.1.0 is out; rcl-producer v0.2.0 is next.

## Recent changes
- 2026-10-19: Published rcl-core v0.1.0, the first release of an rcl app on its own. Its milestone closed, and its issues got "Released in" comments.
- 2026-10-19: Decided: a commit that changes only this log may go straight to `main` when no work branch is open.
- 2026-10-19: Added this status log, and the rule to keep it current, to CLAUDE.md.
- 2026-10-19: Prepared rcl-core v0.1.0: its changelog notes moved under 0.1.0. Merged to `main`; CI passed.
- 2026-10-19: The repo is public. The `release` environment (Mike approves; `main` only), the "Release tags are permanent" tag ruleset and immutable releases are set up. #6 closed.
- 2026-10-17: Each app is now released on its own (#6, ADR-0021): a changelog per app, a release workflow per app, and issue forms and feature pages that say which app.
- 2026-10-16: API keys let devices and scripts such as Bitfocus Companion call the server (#7, ADR-0020).
- 2026-10-12: Sign-in, first-run setup, password changes and a Users page in the web app (#11).
- 2026-10-10: rcl-core hosts each app as a module, so API addresses start with the app (#5, ADR-0019).

## Pending decisions
- None.

## Loose ends
- rcl-producer v0.2.0: `/release rcl-producer 0.2.0`, then its dry run and publish (Mike).
- rcl-producer's 0.2.0 notes ask upgraders to refresh their OBS browser sources twice and change their URL once; the URL change covers all three. Worth tidying before its release.
- About 25 small findings deferred from code reviews (Phases 3–5, #7, #11) aren't filed as issues yet. None blocks a release.
