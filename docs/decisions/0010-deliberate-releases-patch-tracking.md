---
title: Deliberate releases, milestones for planned versions only
status: accepted
date: 2026-09-29
---
# 0010. Deliberate releases, milestones for planned versions only

Supersedes [ADR-0009](0009-deliberate-milestone-driven-releases.md).

## Context

ADR-0009 required a milestone for every release. Patch releases (`0.1.1`, `0.1.2`, …) are small, unplanned batches of fixes, so a milestone for each is overhead. We still want to know which release each issue shipped in.

Options considered for tracking patch releases:
- **A label per version** (e.g. `v0.1.1`). Rejected: labels pile up forever, since deleting one strips it from every issue and loses the history. They also duplicate milestones, and nothing checks them.
- **A milestone per patch version.** Rejected: this is the overhead we want to avoid.

Everything else in ADR-0009 stands. It is restated below so this ADR is complete on its own.

## Decision

- **Milestones are for planned releases only.**
  - Minor and major releases (`x.y.0`) get a milestone titled `obs-producer v<semver>`, and can only be released once it has no open issues.
  - Patch releases and pre-releases don't need a milestone. If one exists with the exact title anyway, the same check applies.
- **One `patch` label** marks issues that should ship in the next patch release.
- **Where each issue shipped is recorded automatically.** CHANGELOG entries end with their issue number, e.g. `(#12)`. When a release is published, the workflow:
  - comments `Released in OBS Producer v<version>: <release URL>` on every issue referenced in that version's notes, and on the milestone's closed issues;
  - removes the `patch` label from those issues.
- **Release notes come from `obs-producer/CHANGELOG.md`** ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)). Each user-visible change adds a line under `Unreleased` in the same change.
- **Releasing takes two steps, each done by a person:**
  1. **Prepare.** A commit moves the `Unreleased` notes under the new version and bumps the package versions. Use `node scripts/release.mjs prepare <version>` or the user-only `/release` skill.
  2. **Publish.** Start the **obs-producer release** workflow.
     - Its only trigger is `workflow_dispatch`, and it's a dry run by default.
     - It checks the branch, version, tag, changelog, milestone (for `x.y.0`), docs lint and tests.
     - It then waits for approval in the protected `release` environment.
     - After approval it checks the tag and milestone again, creates tag `obs-producer-v<semver>` on the checked commit, and publishes the GitHub Release. The notes are the changelog notes plus, for milestone releases, a milestone link and the closed issues.
     - Finally it closes the milestone and marks the issues as released.
- **Release tags are permanent.** A tag ruleset blocks moving or deleting `*-v*` tags, and GitHub immutable releases is on, so a published version's tag can never be reused. Mistakes are fixed forward with a new patch release.
- **SemVer, `0.x` until the app is ready for general use.** A pre-release suffix (`-beta.1`) publishes a GitHub pre-release.

**Hard rule:** **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never approve a release deployment, and never create release tags or GitHub Releases or start the release workflow (even as a dry run) unless the user explicitly asks them to for a specific version.

## Consequences

- Nothing ships by accident. Every release still takes at least three human actions: the prepare commit, turning off dry run and starting the workflow, and approving.
- Planning a patch costs one label instead of a milestone.
- Every released issue carries a comment linking the release it shipped in. Searching `"Released in OBS Producer v0.1.1" in:comments` finds everything in a release.
- An issue gets a "Released in" comment only if the changelog references it or it's in the release's milestone. A chore with no CHANGELOG line, shipped in a patch, won't get one.
- Keeping `CHANGELOG.md` current, with each entry ending in its issue number, is part of the definition of done.
- The publish job has no build artifacts yet. Build and packaging steps get added to it once the app exists.
