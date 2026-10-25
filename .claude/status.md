# Status: Rollcall
Updated: 2026-10-25 · Branch: main

## Current focus
The Theme Builder, its font library and its polish (#19, #20, #21) are merged to main. Nothing is in progress; what comes next is Mike's choice.

## Recent changes
- 2026-10-25: Merged #21, the Theme Builder polish: a colleague's change to another token survives your save, a failed font list is shown, the font picker matches families regardless of capitals, and two comments are corrected.
- 2026-10-25: Decided: fix the five Theme Builder review follow-ups now; filed them as #21 (milestone `rcl-producer v0.3.0`).
- 2026-10-25: Merged the Theme Builder and font library (#19, #20). Admins upload fonts and make themes with a live preview; the default theme restyles the open OBS overlay at once. A fresh review found it ready to merge; one rule was added (a token change needs a migration for stored themes).
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

## Pending decisions
- **What next?** (raised 2026-10-25). Options: release rcl-core v0.2.0 (Team Builder, font library) and rcl-producer v0.3.0 (Theme Builder) / start the next roadmap feature. Blocks: nothing.

## Loose ends
- Issues #12–#16: small fixes from earlier code reviews, not yet scheduled. None blocks a release.
- Found while planning: team logo and photo uploads set a `Content-Type` header that RTK Query drops for file bodies. They work because browsers type PNG, JPEG and WebP files. Not filed yet.
