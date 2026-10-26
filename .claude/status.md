# Status: Rollcall
Updated: 2026-10-26 · Branch: feat/import-export

## Current focus
Import / export for teams and themes (#22 rcl-core, #23 rcl-producer) is built on `feat/import-export`, reviewed, and every review finding is fixed or filed. Waiting for Mike to choose how to finish the branch.

## Recent changes
- 2026-10-26: Fixed seven of the Import / export review's minor findings on the branch: teams of any size import, Keep both on an item with no clash keeps its name, long names in messages are shortened, previews of big files stay quick, every page shows what an import changed, each media type uses its own size limit, and `.superpowers/` is gitignored. Decided: file the eighth, big files blocking the server, as #24 for later.
- 2026-10-26: Built Import / export on `feat/import-export`. Teams, themes and their logos, photos and uploaded fonts move between installs as .zip export files. The Import dialog shows conflicts side by side with Replace, Keep both or Skip, and a theme becomes the default only by its own switch. There's an Import / export page in rcl-core, and export buttons on the Teams, Team and Themes pages. ADR-0024: core hosts import and export; each app owns its kinds.
- 2026-10-26: A fresh review of Import / export found one important issue, now fixed: names that clashed within one file (such as a theme kept as a copy when the file also held "<name> copy") made the import fail. It also found 8 minor issues.
- 2026-10-26: Decided: build Import / export with the Native method (Claude implements every task, then one fresh review).
- 2026-10-26: Import / export implementation plan written (9 tasks), built and checked on a throwaway branch first. It adds one package, `fflate` (MIT), to read and write the .zip files.
- 2026-10-26: Import / export spec approved.
- 2026-10-26: Import / export design agreed. Issues #22 and #23, milestones `rcl-core v0.3.0` and `rcl-producer v0.4.0`.
- 2026-10-25: Decided: build Import / export next.
- 2026-10-25: Released rcl-producer v0.3.0 (Theme Builder; needs rcl-core 0.2.0).
- 2026-10-25: Released rcl-core v0.2.0 (Team Builder, font library).

## Pending decisions
- **How to finish `feat/import-export`** (raised 2026-10-26). Options: merge into main locally / push and open a PR / keep the branch. Blocks: #22 and #23 closing, and the next releases.

## Loose ends
- main has three status-only commits not pushed yet.
- #24: big export files block the server while they're read and written. Fix before files grow, such as with screens.
- When rcl-core 0.3.0 is released, the Producer app's `requiresCore` becomes `^0.3.0`.
- Issues #12–#16: small fixes from earlier code reviews, not yet scheduled. None blocks a release.
- Found while planning Theme Builder: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
