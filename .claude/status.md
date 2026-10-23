# Status: Rollcall
Updated: 2026-10-23 · Branch: main

## Current focus
Team Builder (rcl-core, #17, milestone `rcl-core v0.2.0`): the spec is approved and the implementation plan is written, waiting for Mike's review and choice of how to run it.

## Recent changes
- 2026-10-23: Team Builder spec approved. Implementation plan written (6 tasks), built and checked on a throwaway branch first: unit, story and end-to-end tests all pass.
- 2026-10-23: Team Builder design agreed: the editor only (CRG and file import later), with team fields, members with fixed and custom roles, pronouns, and photos and logos stored as uploaded in a small media store. Announcers can view. Issue #17 and milestone `rcl-core v0.2.0` created.
- 2026-10-21: Filed the deferred code-review findings as issues #12–#16, and added a note to #9.
- 2026-10-21: Decided: file the review findings first, then build Team Builder.
- 2026-10-19: Published rcl-producer v0.2.0, the first release since OBS Producer 0.1.0. Both release milestones are closed.
- 2026-10-19: Prepared rcl-producer v0.2.0: its notes moved under 0.2.0 and its packages went to 0.2.0. Merged to `main`.
- 2026-10-19: rcl-producer's 0.2.0 notes give one OBS step when upgrading: change each browser source's URL.
- 2026-10-19: Published rcl-core v0.1.0, the first release of an rcl app on its own. Its milestone closed, and its issues got "Released in" comments.
- 2026-10-19: Decided: a commit that changes only this log may go straight to `main` when no work branch is open.
- 2026-10-19: Added this status log, and the rule to keep it current, to CLAUDE.md.

## Pending decisions
- **Approve the Team Builder plan, and choose how to run it** (raised 2026-10-23), `design-docs/plans/2026-10-23-team-builder.md`, not yet committed (it's committed with the spec when work starts). Options: Native / Subagent-driven. Blocks: building the Team Builder.

## Loose ends
- Issues #12–#16: small fixes from code reviews, not yet scheduled. None blocks a release.
