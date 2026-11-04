# Status: Rollcall
Updated: 2026-11-04 · Branch: main

## Current focus
Phase 1 (Builders) is finished and released. Choosing what to build next; the roadmap's next phase is Phase 2 (Screens).

## Recent changes
- 2026-11-04: rcl-producer v0.4.0 released (Mike, through the release workflow). Both Import / export milestones are closed.
- 2026-11-04: Merged the rcl-producer v0.4.0 preparation into main and pushed (Mike).
- 2026-11-04: Decided: release rcl-producer v0.4.0 (themes in export files). Prepared; its notes say to upgrade rcl-core first.
- 2026-11-04: rcl-core v0.3.0 released (Mike, through the release workflow). Its Publish job started late during a GitHub Actions outage.
- 2026-11-04: Merged the rcl-core v0.3.0 preparation into main and pushed (Mike).
- 2026-10-29: Decided: release rcl-core v0.3.0 (import and export). Prepared; the Producer app now requires rcl-core ^0.3.0, and its notes say to upgrade rcl-core first.
- 2026-10-26: Decided: merge Import / export into main and push. Merged and pushed; #22 and #23 close with it.
- 2026-10-26: Fixed seven of the Import / export review's minor findings on the branch: teams of any size import, Keep both on an item with no clash keeps its name, long names in messages are shortened, previews of big files stay quick, every page shows what an import changed, each media type uses its own size limit, and `.superpowers/` is gitignored. Decided: file the eighth, big files blocking the server, as #24 for later.
- 2026-10-26: Built Import / export on `feat/import-export`. Teams, themes and their logos, photos and uploaded fonts move between installs as .zip export files. The Import dialog shows conflicts side by side with Replace, Keep both or Skip, and a theme becomes the default only by its own switch. There's an Import / export page in rcl-core, and export buttons on the Teams, Team and Themes pages. ADR-0024: core hosts import and export; each app owns its kinds.
- 2026-10-26: A fresh review of Import / export found one important issue, now fixed: names that clashed within one file (such as a theme kept as a copy when the file also held "<name> copy") made the import fail. It also found 8 minor issues.
- 2026-10-26: Decided: build Import / export with the Native method (Claude implements every task, then one fresh review).
- 2026-10-26: Import / export implementation plan written (9 tasks), built and checked on a throwaway branch first. It adds one package, `fflate` (MIT), to read and write the .zip files.
- 2026-10-26: Import / export spec approved.
- 2026-10-26: Import / export design agreed. Issues #22 and #23, milestones `rcl-core v0.3.0` and `rcl-producer v0.4.0`.

## Pending decisions
- **What to build next** (raised 2026-11-04). Options: Phase 2 (Screens: overlay renderer, Screen Builder, team roster component) / #24 first (big export files blocking the server) / the small review fixes #12–#16. Blocks: the next spec.

## Loose ends
- #24: big export files block the server while they're read and written. Fix before files grow, such as with screens.
- Issues #12–#16: small fixes from earlier code reviews, not yet scheduled. None blocks a release.
- Found while planning Theme Builder: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
