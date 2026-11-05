# Status: Rollcall
Updated: 2026-11-05 · Branch: main

## Current focus
The #26 follow-ups to skater intros (unreleased), in three branches: `fix/intro-on-air` (the OBS page, planned first), with `fix/intro-pages` and `fix/intro-server` (server, tests and docs) built in parallel by agents. Then the sign-off and releases (rcl-core first, then rcl-producer). Screen Builder gets its own design after.

## Recent changes
- 2026-11-05: Decided (Mike) for #26: three branches as above; the title banner fades toward black or white, whichever is opposite its text, instead of into the theme's surface; a member removed mid-row has their card leave on its own, then its gap closes.
- 2026-11-05: Merged the context-handoff rule (CLAUDE.md) into main and pushed (Mike).
- 2026-11-05: Merged the pronouns switch into main and pushed (Mike).
- 2026-11-05: Built the intro "Show pronouns" switch (on by default; when off the OBS page isn't sent pronouns) and a two-line role line on the cards, with cards kept equal height; intros saved before the switch read as on. Checked in a real browser.
- 2026-11-05: Decided (Mike): pronouns on intro cards are a per-intro "Show pronouns" setting, on by default, and the role line takes two lines when needed; the live-state ADR is written when Live Mode starts, not now; the review follow-ups are filed as #26, to tackle where possible before the next release.
- 2026-11-05: Merged skater intros into main and pushed (Mike).
- 2026-11-05: Built skater intros (#25) with subagents, 11 tasks plus a final review and fix wave: rcl-core gives apps read-only teams (`ctx.teams`); the Producer app has intros (setup page with preview, OBS page at `/producer/overlay/intros/<id>`, phone-first control page), run live from the server with a timer, and docs, changelog line and an end-to-end test. Checked in a real browser: banner, row, long names, equal card heights, reload mid-intro.
- 2026-11-05: Mike approved the skater intros design and plan, chose subagent-driven building, and OK'd filing #25 (Skater intros, rcl-producer).
- 2026-11-05: Decided the skater intros with Mike, using browser mockups. Person cards are photo cards (photo, number badge, name, roles and pronouns), in one centred row that never overlaps. "How many at once" is a setting: each Next (or timer step) adds a card, and a full row clears for the next group. Each team starts by hand with a banner title card in the roster's spot. Four entrances and nine positions. Bench staff are included. The whole team shows for now; active rosters (who's playing, picked when an event starts) come with Live Mode. Admins and Producers set up and run intros, the server keeps the place across reloads, and Stream Deck control is out of this work.
- 2026-11-04: Fixed #24 (merged and pushed after CI passed on Node 24): exports and imports pack and read their files in a worker thread, an import writes its media files before its transaction and deletes them if anything fails, access is rechecked after each wait, and one export or import runs at a time. The longest stall while packing or reading 150 MB fell from about 200 ms to about 6 ms.

## Pending decisions
- **Defaults for #26** (raised 2026-11-05). Building with them unless Mike changes them: a hanging photo, logo or font counts as failed after 4 s; no new changelog lines, since intros are unreleased; every item fixed, none closed with a reason.
- **File the other server tests that never close their test app as an issue?** (raised 2026-11-04, found while fixing #15: about eight, in `http.test.ts`, `openapi.test.ts`, `setup.test.ts`, `routes/auth.test.ts` and `access.test.ts`). Options: file it / leave it.

## Loose ends
- #26: follow-ups from the skater intros review (about 43 items), in progress on the three branches above.
- Release order: rcl-producer uses `ctx.teams`, so before rcl-producer's next release, rcl-core with `teams` (0.4.0) must be released, and rcl-producer's `requiresCore` raised to `^0.4.0`.
- Flaky test, not filed: `rcl-core/server/src/routes/transfer.test.ts` "builds a big file without holding up the server" failed once in a full `yarn check` (2026-11-05: 48 ms stall against its 40 ms bar) and passed alone five times and in the next full run. It failed once more the same way during the skater intros build. The bar leaves little room under load, and CI could hit it too.
- Calls the agents made on #12–#14 that Mike may want changed: the sign-in gate keeps a page up if a re-check fails when you return to the tab; rcl-producer's changelog has two #14 lines; logging out of a password change you chose still returns to that page; any path below an app that looks like a file is a 404; app tag descriptions were done now.
- The release sign-off's walk-through hasn't run for real yet: the next `/release` is its first use.
- Found while reviewing #24, not filed: if a team's logo is replaced at the exact moment an export reads that file, the export fails with a generic error; trying again works.
- Found while planning Theme Builder: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
