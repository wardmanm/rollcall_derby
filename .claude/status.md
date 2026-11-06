# Status: Rollcall
Updated: 2026-11-06 · Branch: integrate/26

## Current focus
The #26 follow-ups to skater intros are built on three branches and combined on `integrate/26`, which passes `yarn check`, the story tests and e2e. Waiting on Mike to merge it into main. Then the sign-off and releases (rcl-core first, then rcl-producer). Screen Builder gets its own design after.

## Recent changes
- 2026-11-06: Built #26. `fix/intro-on-air` (the OBS page, from a plan, reviewed by a fresh agent, two review findings fixed): cards come in in order, a row's first card comes straight in, a removed member's card leaves on its own and its place closes as the next opens, a hanging photo, logo or font counts as failed after 4 s, the banner fades toward black or white, plus race tests and a stepping story. `fix/intro-pages` and `fix/intro-server` (built by agents) cover the setup and control pages, and the server, tests and docs. Combined on `integrate/26`: 810 unit tests, 53 story tests and 14 e2e tests pass; checked in a real browser (banners, removals, reload, preview at 360 px).
- 2026-11-05: Mike approved the on-air plan (a 4 s limit, no new changelog lines since intros are unreleased) and its calls: a team without colours gets a plain banner, a slow photo stays on the logo, a colour that isn't hex counts as none.
- 2026-11-05: Decided (Mike) for #26: three branches as above; the title banner fades toward black or white, whichever is opposite its text, instead of into the theme's surface; a member removed mid-row has their card leave on its own, then its gap closes.
- 2026-11-05: Merged the context-handoff rule (CLAUDE.md) into main and pushed (Mike).
- 2026-11-05: Merged the pronouns switch into main and pushed (Mike).
- 2026-11-05: Built the intro "Show pronouns" switch (on by default; when off the OBS page isn't sent pronouns) and a two-line role line on the cards, with cards kept equal height; intros saved before the switch read as on. Checked in a real browser.
- 2026-11-05: Decided (Mike): pronouns on intro cards are a per-intro "Show pronouns" setting, on by default, and the role line takes two lines when needed; the live-state ADR is written when Live Mode starts, not now; the review follow-ups are filed as #26, to tackle where possible before the next release.
- 2026-11-05: Merged skater intros into main and pushed (Mike).
- 2026-11-05: Built skater intros (#25) with subagents, 11 tasks plus a final review and fix wave: rcl-core gives apps read-only teams (`ctx.teams`); the Producer app has intros (setup page with preview, OBS page at `/producer/overlay/intros/<id>`, phone-first control page), run live from the server with a timer, and docs, changelog line and an end-to-end test. Checked in a real browser: banner, row, long names, equal card heights, reload mid-intro.
- 2026-11-05: Decided the skater intros with Mike, using browser mockups. Person cards are photo cards (photo, number badge, name, roles and pronouns), in one centred row that never overlaps. "How many at once" is a setting: each Next (or timer step) adds a card, and a full row clears for the next group. Each team starts by hand with a banner title card in the roster's spot. Four entrances and nine positions. Bench staff are included. The whole team shows for now; active rosters (who's playing, picked when an event starts) come with Live Mode. Admins and Producers set up and run intros, the server keeps the place across reloads, and Stream Deck control is out of this work.

## Pending decisions
- **Merge `integrate/26` into main and push?** (raised 2026-11-06). Options: merge and push / changes first. Blocks: closing #26, the sign-off.
- **A second Start while the title card is up doesn't replay it** (raised 2026-11-06; the OBS page can't tell it from a reconnect's re-send). Options: keep it, as the feature page now says / make a second Start replay (an overlay change).
- **`afterFailedImport`, a new optional hook in the app SDK's `TransferKind`** (raised 2026-11-06, added on `fix/intro-server` so a failed import's themes aren't announced by the next import; it changes rcl-core). Options: keep / do it another way.
- **The review's deferred minors** (raised 2026-11-06): the keyframe-name test can't fail under Vitest (production is fine); the stepping story shows a removal at once, not at the next Next; a card's fallback logo can be blank for a moment at the limit; one comment wraps short. Options: fix now / file an issue / leave.
- **File the other server tests that never close their test app as an issue?** (raised 2026-11-04, found while fixing #15: about eight, in `http.test.ts`, `openapi.test.ts`, `setup.test.ts`, `routes/auth.test.ts` and `access.test.ts`). Options: file it / leave it.

## Loose ends
- #26: built on `integrate/26` (merging `fix/intro-on-air`, `fix/intro-pages`, `fix/intro-server`); close it once merged. Their worktrees are in `.claude/worktrees/`.
- Release order: rcl-producer uses `ctx.teams`, so before rcl-producer's next release, rcl-core with `teams` (0.4.0) must be released, and rcl-producer's `requiresCore` raised to `^0.4.0`.
- Flaky test, not filed: `rcl-core/server/src/routes/transfer.test.ts` "builds a big file without holding up the server" failed once in a full `yarn check` (2026-11-05: 48 ms stall against its 40 ms bar) and passed alone five times and in the next full run. It failed once more the same way during the skater intros build. The bar leaves little room under load, and CI could hit it too.
- Calls the agents made on #12–#14 that Mike may want changed: the sign-in gate keeps a page up if a re-check fails when you return to the tab; rcl-producer's changelog has two #14 lines; logging out of a password change you chose still returns to that page; any path below an app that looks like a file is a 404; app tag descriptions were done now.
- The release sign-off's walk-through hasn't run for real yet: the next `/release` is its first use.
- Found while reviewing #24, not filed: if a team's logo is replaced at the exact moment an export reads that file, the export fails with a generic error; trying again works.
- Found while planning Theme Builder: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
- Found while checking #26, not filed: a person card's role line is in the team's secondary colour with no contrast check, so a dark secondary is unreadable on the dark card. And at 360 px the setup page's OBS address clips its Copy button.
