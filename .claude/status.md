# Status: Rollcall
Updated: 2026-10-26 · Branch: main

## Current focus
Import / export for teams and themes (#22 rcl-core, #23 rcl-producer): the spec is approved and the implementation plan is written, waiting for Mike's review and his choice of how to build it.

## Recent changes
- 2026-10-26: Import / export implementation plan written (9 tasks), built and checked on a throwaway branch first. It adds one package, `fflate` (MIT), to read and write the .zip files.
- 2026-10-26: Import / export spec approved.
- 2026-10-26: Import / export design agreed: a .zip export file with a versioned manifest; core hosts import and export and each app owns its kinds (ADR-0024 planned); an Import dialog that shows conflicts side by side with Replace, Keep both or Skip; a theme becomes the default only by its own switch. Issues #22 and #23, milestones `rcl-core v0.3.0` and `rcl-producer v0.4.0`.
- 2026-10-25: Decided: build Import / export next.
- 2026-10-25: Released rcl-producer v0.3.0 (Theme Builder; needs rcl-core 0.2.0).
- 2026-10-25: Released rcl-core v0.2.0 (Team Builder, font library).
- 2026-10-25: Decided: release rcl-core v0.2.0, then rcl-producer v0.3.0. rcl-core 0.2.0 prepared; the Producer app now requires rcl-core ^0.2.0.
- 2026-10-25: Merged #21, the Theme Builder polish: a colleague's change to another token survives your save, a failed font list is shown, the font picker matches families regardless of capitals, and two comments are corrected.
- 2026-10-25: Decided: fix the five Theme Builder review follow-ups now; filed them as #21 (milestone `rcl-producer v0.3.0`).
- 2026-10-25: Merged the Theme Builder and font library (#19, #20). Admins upload fonts and make themes with a live preview; the default theme restyles the open OBS overlay at once.

## Pending decisions
- **How to build Import / export** (raised 2026-10-26). Options: Subagent-driven (a fresh implementer and reviewer per task) / Native (Claude implements every task, then one fresh review). Blocks: the work on #22 and #23.

## Loose ends
- The Import / export spec and plan are untracked on main. The plan's first step commits them on `feat/import-export`.
- main has three status-only commits not pushed yet.
- Issues #12–#16: small fixes from earlier code reviews, not yet scheduled. None blocks a release.
- Found while planning: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
