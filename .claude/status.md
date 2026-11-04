# Status: Rollcall
Updated: 2026-11-04 · Branch: feat/release-sign-off

## Current focus
Release sign-off is built on `feat/release-sign-off`, waiting for Mike to review and merge it. Phase 1 (Builders) is finished and released, and what to build next is still open.

## Recent changes
- 2026-11-04: Built the release sign-off on `feat/release-sign-off` (ADR-0025). `/release` now has Mike sign off each new feature by hand before preparing: Claude drafts checks from the release's changelog entries, their issues and feature pages, then asks about one at a time (Pass, Fail or Skip). Answers go to `<app>/sign-off/<version>.md`. Failures become bugs labelled `bug` and `sign-off`, with Priority on the board; a P0 goes in the milestone and blocks the release. `release.mjs check` (and so the release workflow) refuses until the record is signed off. New GitHub label: `sign-off`.
- 2026-11-04: Decided: sign off every release by hand with a walk-through, as in ProjectMythos. Checks are written at release time, failures are P0 (blocks), P1 (high, doesn't block) or P2 (deferred), and Claude may set Priority on the boards for these bugs.
- 2026-11-04: rcl-producer v0.4.0 released (Mike, through the release workflow). Both Import / export milestones are closed.
- 2026-11-04: Merged the rcl-producer v0.4.0 preparation into main and pushed (Mike).
- 2026-11-04: Decided: release rcl-producer v0.4.0 (themes in export files). Prepared; its notes say to upgrade rcl-core first.
- 2026-11-04: rcl-core v0.3.0 released (Mike, through the release workflow). Its Publish job started late during a GitHub Actions outage.
- 2026-11-04: Merged the rcl-core v0.3.0 preparation into main and pushed (Mike).
- 2026-10-29: Decided: release rcl-core v0.3.0 (import and export). Prepared; the Producer app now requires rcl-core ^0.3.0, and its notes say to upgrade rcl-core first.
- 2026-10-26: Decided: merge Import / export into main and push. Merged and pushed; #22 and #23 close with it.
- 2026-10-26: Fixed seven of the Import / export review's minor findings on the branch: teams of any size import, Keep both on an item with no clash keeps its name, long names in messages are shortened, previews of big files stay quick, every page shows what an import changed, each media type uses its own size limit, and `.superpowers/` is gitignored. Decided: file the eighth, big files blocking the server, as #24 for later.
- 2026-10-26: Built Import / export on `feat/import-export`. Teams, themes and their logos, photos and uploaded fonts move between installs as .zip export files. ADR-0024: core hosts import and export; each app owns its kinds.

## Pending decisions
- **What to build next** (raised 2026-11-04). Options: Phase 2 (Screens: overlay renderer, Screen Builder, team roster component) / #24 first (big export files blocking the server) / the small review fixes #12–#16. Blocks: the next spec.

## Loose ends
- `feat/release-sign-off` isn't merged or pushed. `main` also has one unpushed status commit (bbd1b0c), which this branch includes.
- The release sign-off's walk-through hasn't run for real yet: the next `/release` is its first use.
- #24: big export files block the server while they're read and written. Fix before files grow, such as with screens.
- Issues #12–#16: small fixes from earlier code reviews, not yet scheduled. None blocks a release.
- Found while planning Theme Builder: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
