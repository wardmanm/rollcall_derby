# Status: Rollcall
Updated: 2026-10-25 · Branch: feat/theme-builder

## Current focus
The Theme Builder (#20, rcl-producer) and its font library (#19, rcl-core) are built and reviewed on `feat/theme-builder`, waiting for Mike to choose how to merge.

## Recent changes
- 2026-10-25: Built the Theme Builder and font library on `feat/theme-builder` (9 tasks). Admins upload fonts and make themes with a live preview; the default theme restyles the open OBS overlay at once. A fresh review found it ready to merge, with one rule added (a token change needs a migration) and five small follow-ups.
- 2026-10-25: Decided: build the Theme Builder with the Native method (Claude implements every task, then one fresh review).
- 2026-10-24: Theme Builder implementation plan written (9 tasks), built and checked on a throwaway branch first.
- 2026-10-24: Theme Builder spec approved. Decided: the font library (#19) stays in `rcl-core v0.2.0`, released with the Team Builder.
- 2026-10-24: Theme Builder design agreed: a font library in rcl-core (bundled open-licence fonts plus uploads), themes in rcl-producer with a fixed token set plus extra colors, a live preview, and one default theme the OBS overlay uses live. Issues #19 and #20; #19 joins `rcl-core v0.2.0`, #20 a new `rcl-producer v0.3.0`.
- 2026-10-24: Decided: build the Theme Builder next.
- 2026-10-24: Fixed #18, the Team Builder polish: no double adds while a photo uploads, a clear limit on custom roles, a details form that keeps colleagues' changes, a changeable chosen photo, readable colors.
- 2026-10-24: Decided: fix #18 before the next feature or release.
- 2026-10-24: Filed the Team Builder review's seven small findings as #18.
- 2026-10-24: Merged the Team Builder (#17).
  - Admins and Producers set up teams; Announcers view them.
  - Logos and photos are served to OBS overlays without signing in (ADR-0022).
  - A code review led to three fixes:
    - every route now refuses a caller before reading the request body;
    - `yarn dev` shows images;
    - a new member's photo can't land on someone else's member.
- 2026-10-23: Decided: build the Team Builder with the Native method (Claude implements every task, then one fresh review).
- 2026-10-23: Team Builder spec approved. Implementation plan written (6 tasks), built and checked on a throwaway branch first.
- 2026-10-23: Team Builder design agreed: the editor only (CRG and file import later), with team fields, members with fixed and custom roles, pronouns, and photos and logos stored as uploaded in a small media store. Announcers can view. Issue #17 and milestone `rcl-core v0.2.0` created.

## Pending decisions
- None.

## Loose ends
- Issues #12–#16: small fixes from earlier code reviews, not yet scheduled. None blocks a release.
- Five small follow-ups from the Theme Builder review, not filed yet: a failed font list is hidden in the theme editor; last write wins between two Admins editing one theme; stale "images" comments on `/media`; bundled fonts need a new file name if one ever changes; the font picker shows the wrong option when a family's case differs.
- Found while planning: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
