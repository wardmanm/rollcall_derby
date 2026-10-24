# Status: Rollcall
Updated: 2026-10-24 · Branch: main

## Current focus
The Team Builder (#17) is built and on `main`: teams, their skaters and bench staff, logos and photos, in rcl-core's admin app. It's unreleased, in the `rcl-core v0.2.0` milestone.

## Recent changes
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
- 2026-10-21: Filed the deferred code-review findings as issues #12–#16, and added a note to #9.
- 2026-10-19: Published rcl-producer v0.2.0, the first release since OBS Producer 0.1.0. Both release milestones are closed.
- 2026-10-19: Published rcl-core v0.1.0, the first release of an rcl app on its own.
- 2026-10-19: Decided: a commit that changes only this log may go straight to `main` when no work branch is open.

## Pending decisions
- **What next after the Team Builder** (raised 2026-10-24). Options:
  - A. Release rcl-core v0.2.0 now: its milestone holds only #17.
  - B. Theme Builder (rcl-producer), next on the roadmap.
  - C. File the Team Builder review's 7 small findings as an issue first.

  Blocks: the next piece of work.

## Loose ends
- Issues #12–#16: small fixes from earlier code reviews, not yet scheduled. None blocks a release.
- Seven small findings from the Team Builder review aren't filed yet. They cover:
  - a double save while a photo uploads;
  - a fourth custom role dropped silently;
  - the details form not taking the server's values after Save;
  - one gray "No teams yet." note that fails the contrast check;
  - color swatches screen readers may not announce;
  - a picked photo that can't be un-picked;
  - an extra team load when adding a member.
