---
title: Every release is signed off by hand, feature by feature
status: accepted
date: 2026-11-04
---
# 0025. Every release is signed off by hand, feature by feature

## Context

A release can only be cut once everything CI runs has passed ([ADR-0021](0021-per-app-releases.md)). Those checks show that the code does what its tests say. They don't show that each new feature does what we planned it to do, as the person running it would try it. Mike wants to check that himself, at a high level, before a release can go ahead.

Options considered:
- **A checklist file ticked by hand** (RPGFieldbook types `x` into `- [ ]` lines). Rejected: editing Markdown is slow, and an unticked box doesn't say whether a check failed or hasn't been tried.
- **A sign-off issue on GitHub,** with clickable boxes, kept in the milestone so it blocks the release until it's closed. Rejected for the same two-state boxes, and because failures would sit in comments.
- **A sign-off page,** either a claude.ai artifact or a page served from the repo. Rejected: more to build than a walk-through, and the results would have to be copied into the repo.
- **Checks written on each feature page** when it's designed. Rejected by Mike: they're written at release time instead, from what the release holds.

## Decision

- **Every release of an rcl app is signed off by Mike before it can be cut,** patches and pre-releases included. The sign-off is a step of `/release`, before the release is prepared.
- **The checks are written at release time.** Claude drafts them from the release's changelog entries, the issues they reference and those issues' feature pages. There are one to three checks per feature or fix, each with the feature, the requirement it checks (**Planned**, e.g. `import-export R5`), what to do (**Try**) and what should happen (**Expect**). Mike approves the list before it's used.
- **Claude walks Mike through the checks one at a time.** He answers each with Pass, Fail (saying what happened) or Skip. Each answer is saved as he gives it, so a sign-off can stop and resume.
- **The record is `<app>/sign-off/<version>.md`.** It holds the tested commit, a table with one row per check, and a `Signed off:` line. That line is written only after every check has a result and Mike says yes to signing off. It's committed with the release preparation.
  - A result is `pending`, `pass`, `skip`, or `fail: <what happened> (#<issue>, P0|P1|P2)`.
  - If the code changes after a check has passed, Mike chooses which checks to try again.
- **Each failure is a bug,** labelled `bug`, `sign-off` and the app's label, with a Priority on the app's board:
  - **P0** blocks the release. The bug goes in the release's milestone, which can't be released while it's open. Once it's fixed, the check is tried again.
  - **P1** is high but doesn't block. **P2** is deferred. Neither goes in the milestone.

  Mike confirms each bug's title and Priority before it's filed.
- **The release check enforces it.** `node scripts/release.mjs check` refuses unless the record names the release and the tested commit, has at least one check, every check passed or failed with only a P1 or P2 bug, and it's signed off. The release workflow runs that check before approval, so a release can't be published without a sign-off.

[Hard rule 7](../../AGENTS.md#hard-rules) doesn't change: Claude records the sign-off, and only Mike starts the release workflow and approves it.

## Consequences

- A release now takes Mike's time with the running app as well as with the workflow, and the time grows with the number of features in it.
- Each record shows what was checked for that version, on which commit, and what was found.
- Bugs found at sign-off reach the boards with a Priority, and only a P0 holds a release back.
- There's no standing list of regression checks. The automated tests cover regressions, and the sign-off covers what's new.
- The records aren't wiki pages, so the docs lint doesn't check them. `scripts/release.test.mjs` covers the format the release check reads.
