# Status: Rollcall
Updated: 2026-10-26 · Branch: feat/import-export

## Current focus
Import / export for teams and themes (#22 rcl-core, #23 rcl-producer) is built on `feat/import-export`, reviewed, and its one important finding fixed. Waiting for Mike to choose how to finish the branch.

## Recent changes
- 2026-10-26: Built Import / export on `feat/import-export`. Teams, themes and their logos, photos and uploaded fonts move between installs as .zip export files. The Import dialog shows conflicts side by side with Replace, Keep both or Skip, and a theme becomes the default only by its own switch. There's an Import / export page in rcl-core, and export buttons on the Teams, Team and Themes pages. ADR-0024: core hosts import and export; each app owns its kinds.
- 2026-10-26: A fresh review of Import / export found one important issue, now fixed: names that clashed within one file (such as a theme kept as a copy when the file also held "<name> copy") made the import fail. It also found 8 minor issues, not fixed yet.
- 2026-10-26: Decided: build Import / export with the Native method (Claude implements every task, then one fresh review).
- 2026-10-26: Import / export implementation plan written (9 tasks), built and checked on a throwaway branch first. It adds one package, `fflate` (MIT), to read and write the .zip files.
- 2026-10-26: Import / export spec approved.
- 2026-10-26: Import / export design agreed. Issues #22 and #23, milestones `rcl-core v0.3.0` and `rcl-producer v0.4.0`.
- 2026-10-25: Decided: build Import / export next.
- 2026-10-25: Released rcl-producer v0.3.0 (Theme Builder; needs rcl-core 0.2.0).
- 2026-10-25: Released rcl-core v0.2.0 (Team Builder, font library).
- 2026-10-25: Merged #21, the Theme Builder polish.

## Pending decisions
- **How to finish `feat/import-export`** (raised 2026-10-26). Options: merge into main locally / push and open a PR / keep the branch. Blocks: #22 and #23 closing, and the next releases.
- **What to do with the Import / export review's 8 minor findings** (raised 2026-10-26). Options: file them as one issue / fix some now / leave them. Blocks: nothing.
  - keep-both sent by hand for a font face gives an internal error;
  - teams over 200 members export but can't be imported;
  - big files are read and written without yielding to other work;
  - very large previews scale badly;
  - other pages' lists stay stale for up to a minute after an import;
  - fonts use the image size limit's constant;
  - refusals echo an item's name before a length cap;
  - `.superpowers/` isn't gitignored.

## Loose ends
- main has three status-only commits not pushed yet.
- When rcl-core 0.3.0 is released, the Producer app's `requiresCore` becomes `^0.3.0`.
- Issues #12–#16: small fixes from earlier code reviews, not yet scheduled. None blocks a release.
- Found while planning Theme Builder: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
