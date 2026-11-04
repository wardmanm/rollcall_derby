# Status: Rollcall
Updated: 2026-11-04 · Branch: main

## Current focus
Phase 2 (Screens): designing the overlay renderer and the first overlay component, a team roster for the skater intros before a game. So far: it shows one skater at a time on a timer, one at a time on a "next" from a control page (the producer's laptop or a phone), or the whole roster at once; each skater's card has name, role, number and photo, with a configurable entrance and position (bottom centre by default). Card styles are being compared in browser mockups. Screen Builder gets its own design after.

## Recent changes
- 2026-11-04: Fixed #24 (merged and pushed after CI passed on Node 24): exports and imports pack and read their files in a worker thread, an import writes its media files before its transaction and deletes them if anything fails, access is rechecked after each wait, and one export or import runs at a time. The longest stall while packing or reading 150 MB fell from about 200 ms to about 6 ms.
- 2026-11-04: Fixed #12–#16 (built by parallel agents, each on its own branch, then merged into main and pushed). #12: a missing file below an app is a 404, apps may route at `/api/<id>`, `api` and `docs` are reserved ids, and a public route outside the `/api` plugin stops the server. #13: an access declaration is exactly one kind; the API explorer keeps route descriptions, offers keys only where they're accepted, and shows each app's sections. #14: the web apps catch up when your role changes or you return to the tab, and sign-in errors say what went wrong. #15: comments, tests and docs tidied, and the dev front door's `/producer` match fixed. #16: one app list for the docs lint and the release script, and the release workflow and guide reworded.
- 2026-11-04: Decided: build #24 now. Each export or import runs our own zip code in a worker thread of its own (fflate's async API still blocks), the import doesn't reuse the preview's read, and one export or import runs at a time.
- 2026-11-04: Decided: start Phase 2 with the overlay renderer and the team roster, and fix #12–#16 and #24 in parallel with agents.
- 2026-11-04: Merged the release sign-off into main and pushed (Mike).
- 2026-11-04: Built the release sign-off (ADR-0025). `/release` now has Mike sign off each new feature by hand before preparing, with answers in `<app>/sign-off/<version>.md` and failures filed as `bug`/`sign-off` issues with a Priority; `release.mjs check` refuses until the record is signed off.
- 2026-11-04: Decided: sign off every release by hand with a walk-through, as in ProjectMythos. Checks are written at release time, failures are P0 (blocks), P1 (high, doesn't block) or P2 (deferred), and Claude may set Priority on the boards for these bugs.
- 2026-11-04: rcl-producer v0.4.0 released (Mike, through the release workflow). Both Import / export milestones are closed.
- 2026-11-04: rcl-core v0.3.0 released (Mike, through the release workflow). Its Publish job started late during a GitHub Actions outage.
- 2026-10-26: Built Import / export. Teams, themes and their logos, photos and uploaded fonts move between installs as .zip export files. ADR-0024: core hosts import and export; each app owns its kinds.

## Pending decisions
- **File the other server tests that never close their test app as an issue?** (raised 2026-11-04, found while fixing #15: about eight, in `http.test.ts`, `openapi.test.ts`, `setup.test.ts`, `routes/auth.test.ts` and `access.test.ts`). Options: file it / leave it.

## Loose ends
- Calls the agents made on #12–#14 that Mike may want changed: the sign-in gate keeps a page up if a re-check fails when you return to the tab; rcl-producer's changelog has two #14 lines; logging out of a password change you chose still returns to that page; any path below an app that looks like a file is a 404; app tag descriptions were done now.
- The release sign-off's walk-through hasn't run for real yet: the next `/release` is its first use.
- Found while reviewing #24, not filed: if a team's logo is replaced at the exact moment an export reads that file, the export fails with a generic error; trying again works.
- Found while planning Theme Builder: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
