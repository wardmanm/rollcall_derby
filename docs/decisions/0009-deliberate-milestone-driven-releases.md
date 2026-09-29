---
title: Deliberate, milestone-driven releases
status: superseded
date: 2026-09-28
superseded_by: "0010"
---
# 0009. Deliberate, milestone-driven releases

> **Superseded by [ADR-0010](0010-deliberate-releases-patch-tracking.md):** milestones are now required only for `x.y.0` releases, and patch releases are tracked with a `patch` label and "Released in" comments.

## Context

OBS Producer releases go to crews running live events. An accidental or half-finished release could put broken overlays on a stream minutes before a game. That includes a release triggered by a merge, a stray tag push, or an AI agent acting on its own. Work is tracked in GitHub issues and milestones, and every release must be a deliberate act by a person.

Options considered:
- **Release on merge or on tag push.** Rejected: a side effect of routine work is not deliberate.
- **A release-please bot keeping a release PR open.** Rejected: automation maintains the release, and a merge publishes it.
- **A manual workflow that edits the changelog and commits to `main` itself.** Rejected: a bot writes to `main`, and the notes aren't reviewed before approval.

## Decision

- **One milestone per release version**, titled `obs-producer v<semver>`. A version can only be released when its milestone has no open issues.
- **Release notes come from `obs-producer/CHANGELOG.md`** ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)). Each user-visible change adds a line under `Unreleased` in the same change.
- **Releasing takes two steps, each done by a person:**
  1. **Prepare.** A commit moves the `Unreleased` notes under the new version and bumps the package versions. Use `node scripts/release.mjs prepare <version>` or the user-only `/release` skill.
  2. **Publish.** Start the **obs-producer release** workflow.
     - Its only trigger is `workflow_dispatch`, and it's a dry run by default.
     - It checks the branch, version, tag, changelog, milestone, docs lint and tests.
     - It then waits for approval in the protected `release` environment before creating tag `obs-producer-v<semver>` on the checked commit, publishing the GitHub Release (changelog notes, milestone link, closed issues), and closing the milestone.
- **Release tags are permanent.** A tag ruleset blocks moving or deleting `*-v*` tags, and GitHub immutable releases is on. A bad release is fixed by a new patch release.
- **SemVer, `0.x` until the app is ready for general use.** A pre-release suffix (`-beta.1`) publishes a GitHub pre-release.

**Hard rule:** **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never approve a release deployment, and never create release tags or GitHub Releases or start the release workflow (even as a dry run) unless the user explicitly asks them to for a specific version.

## Consequences

- Nothing ships by accident. Every release takes at least three human actions: the prepare commit, turning off dry run and starting the workflow, and approving.
- Keeping `CHANGELOG.md` current is part of the definition of done.
- A published release can't be edited or deleted; mistakes are fixed forward.
- The publish job has no build artifacts yet. Build and packaging steps get added to it once the app exists.
