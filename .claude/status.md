# Status: Rollcall
Updated: 2026-11-06 · Branch: main

## Current focus
The six #26 leftovers are fixed, merged into main and pushed (Mike), with the fix for main's red CI. Next: the sign-off and releases (rcl-core first, then rcl-producer). Screen Builder gets its own design after.

## Recent changes
- 2026-11-06: Fixed the six #26 leftovers on `fix/intro-leftovers`, one commit each, then merged it into main and pushed (Mike); CI is green again: the role line check (below); the setup page's OBS address wraps at 360 px instead of squeezing Copy (now in the intro e2e test); the exit keyframe names are checked in the real build (`bundle.test.ts`); the Stepping story notices a removal at the next Next (with a play test); a card's fallback logo loads alongside its photo, so it's ready at the 4 s limit; the `ThemeWhenLoaded` comment. Also gave rcl-core's route-inventory tests 20 s, since one timed out on CI and turned main red. `yarn check` (825 tests), 54 story tests and 14 e2e tests pass; checked in a real browser (role colours, a hung photo, 360 px).
- 2026-11-06: Decided (Mike): an intro card's role line keeps the team's secondary colour when it has at least 4.5:1 contrast with the theme's surface, counted as solid, and otherwise uses the theme's muted text; a team with no secondary keeps the theme's border, unchecked; fix main's CI timeout on this branch.
- 2026-11-06: Merged #26 (`integrate/26`: the on-air, pages and server branches) into main and pushed, and closed #26 (Mike). Decided (Mike): a second Start while the title card is up keeps it up, as the feature page says; keep the app SDK's `afterFailedImport` hook; fix the #26 leftovers now, before the release.
- 2026-11-06: Built #26. `fix/intro-on-air` (the OBS page, from a plan, reviewed by a fresh agent, two review findings fixed): cards come in in order, a row's first card comes straight in, a removed member's card leaves on its own and its place closes as the next opens, a hanging photo, logo or font counts as failed after 4 s, the banner fades toward black or white, plus race tests and a stepping story. `fix/intro-pages` and `fix/intro-server` (built by agents) cover the setup and control pages, and the server, tests and docs. Combined on `integrate/26`: 810 unit tests, 53 story tests and 14 e2e tests pass; checked in a real browser (banners, removals, reload, preview at 360 px).
- 2026-11-05: Mike approved the on-air plan (a 4 s limit, no new changelog lines since intros are unreleased) and its calls: a team without colours gets a plain banner, a slow photo stays on the logo, a colour that isn't hex counts as none.
- 2026-11-05: Decided (Mike) for #26: three branches as above; the title banner fades toward black or white, whichever is opposite its text, instead of into the theme's surface; a member removed mid-row has their card leave on its own, then its gap closes.
- 2026-11-05: Merged the context-handoff rule (CLAUDE.md) into main and pushed (Mike).
- 2026-11-05: Merged the pronouns switch into main and pushed (Mike).
- 2026-11-05: Built the intro "Show pronouns" switch (on by default; when off the OBS page isn't sent pronouns) and a two-line role line on the cards, with cards kept equal height; intros saved before the switch read as on. Checked in a real browser.

## Pending decisions
- **File the other server tests that never close their test app as an issue?** (raised 2026-11-04, found while fixing #15: about eight, in `http.test.ts`, `openapi.test.ts`, `setup.test.ts`, `routes/auth.test.ts` and `access.test.ts`). Options: file it / leave it.

## Loose ends
- Release order: rcl-producer uses `ctx.teams`, so before rcl-producer's next release, rcl-core with `teams` (0.4.0) must be released, and rcl-producer's `requiresCore` raised to `^0.4.0`.
- Flaky test, not filed: `rcl-core/server/src/routes/transfer.test.ts` "builds a big file without holding up the server" failed once in a full `yarn check` (2026-11-05: 48 ms stall against its 40 ms bar) and passed alone five times and in the next full run. It failed once more the same way during the skater intros build, and again while building #26 (2026-11-06: 42.8 ms, with a browser and a server running). The bar leaves little room under load, and CI could hit it too.
- Calls the agents made on #12–#14 that Mike may want changed: the sign-in gate keeps a page up if a re-check fails when you return to the tab; rcl-producer's changelog has two #14 lines; logging out of a password change you chose still returns to that page; any path below an app that looks like a file is a 404; app tag descriptions were done now.
- The release sign-off's walk-through hasn't run for real yet: the next `/release` is its first use.
- Found while reviewing #24, not filed: if a team's logo is replaced at the exact moment an export reads that file, the export fails with a generic error; trying again works.
- Found while planning Theme Builder: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
- #26 isn't on the Producer board (#8), though it has the `rcl-producer` label. Mike may want to add it by hand.
