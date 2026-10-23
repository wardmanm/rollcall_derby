# Status: Rollcall
Updated: 2026-10-23 · Branch: main

## Current focus
Team Builder (rcl-core, #17, milestone `rcl-core v0.2.0`): the design is agreed in sections and the written spec is with Mike for review. Next comes the implementation plan.

## Recent changes
- 2026-10-23: Team Builder design agreed: the editor only (CRG and file import later), with team fields, members with fixed and custom roles, pronouns, and photos and logos stored as uploaded in a small media store. Announcers can view. Issue #17 and milestone `rcl-core v0.2.0` created.
- 2026-10-21: Filed the deferred code-review findings as issues #12–#16, and added a note to #9.
- 2026-10-21: Decided: file the review findings first, then build Team Builder.
- 2026-10-19: Published rcl-producer v0.2.0, the first release since OBS Producer 0.1.0. Both release milestones are closed.
- 2026-10-19: Prepared rcl-producer v0.2.0: its notes moved under 0.2.0 and its packages went to 0.2.0. Merged to `main`.
- 2026-10-19: rcl-producer's 0.2.0 notes give one OBS step when upgrading: change each browser source's URL.
- 2026-10-19: Published rcl-core v0.1.0, the first release of an rcl app on its own. Its milestone closed, and its issues got "Released in" comments.
- 2026-10-19: Decided: a commit that changes only this log may go straight to `main` when no work branch is open.
- 2026-10-19: Added this status log, and the rule to keep it current, to CLAUDE.md.
- 2026-10-19: The repo is public. The `release` environment (Mike approves; `main` only), the "Release tags are permanent" tag ruleset and immutable releases are set up. #6 closed.

## Pending decisions
- **Approve the Team Builder spec** (raised 2026-10-23), `design-docs/specs/2026-10-23-team-builder-design.md`, not yet committed: it's committed with the plan. Options: approve / request changes. Blocks: the implementation plan.

## Loose ends
- Issues #12–#16: small fixes from code reviews, not yet scheduled. None blocks a release.
