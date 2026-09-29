---
title: Releasing
---
# Releasing

How OBS Producer work is tracked on GitHub, and how a release is cut. Releases are **always deliberate**: nothing is released by a push, a merge, or an agent acting on its own ([ADR-0010](../decisions/0010-deliberate-releases-patch-tracking.md)).

## Issues

- File OBS Producer work with the **OBS Producer: feature** or **OBS Producer: bug** issue forms. They add the `obs-producer` label and ask which wiki page and requirement numbers the issue covers, e.g. [Team Builder](../features/team-builder.md) R3.
- Use the **OBS Producer: chore** form for maintenance with no user-visible change: dependencies, tooling and CI, refactoring, docs upkeep. It adds the `chore` label. Chores don't need a CHANGELOG line unless users would notice.
- **The wiki page is the spec.** If an issue changes what a feature should do, the PR that implements it updates the page. Issues link to wiki pages; wiki pages don't list issues, because that list would go stale.
- An open question on a wiki page can get its own issue for discussion. Link back to the page; the answer goes onto the page.
- Close issues from commits or PRs with `Closes #N`.
- Label a fix `patch` if it should ship in the next patch release. Patch releases don't have milestones (see below).

## Milestones

- **Milestones are for planned releases: minor and major versions (`x.y.0`).** Title each one exactly **`obs-producer v<version>`**, e.g. `obs-producer v0.2.0`. The release workflow finds the milestone by this title and requires it for `x.y.0` releases.
- **Patch releases (`0.2.1`) and pre-releases (`0.3.0-beta.1`) don't need a milestone.** Label the issues `patch` instead. If you do create a milestone with the exact title, the workflow enforces it the same way.
- **Description:** name the [roadmap](../product/roadmap.md) phase it belongs to, and link to it.
- **Assign every issue that should ship in that release.** A release can't be cut while its milestone has open issues, so move unfinished ones to the next milestone.
- **You don't close it yourself.** The release workflow closes the milestone when it publishes.

## Changelog

[`CHANGELOG.md`](../../CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-visible change adds a line under `## [Unreleased]` in the same commit or PR. Put it under the right heading (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) and end it with the issue number:

```md
### Added

- Team Builder: upload a photo for each team member (#12)
```

These lines become the release notes, so write them for the people who run the app. The issue number also matters for tracking: when the release is published, every issue referenced in its notes gets a comment saying which release it shipped in.

## Versions and tags

- **[Semantic Versioning](https://semver.org/).** Stay on `0.x` until the app is ready for general use.
  - **Patch:** fixes.
  - **Minor:** features. During `0.x`, breaking changes also go in a minor release.
- **Pre-releases:** a suffix such as `0.3.0-beta.1` publishes as a GitHub pre-release.
- **Tags:** named `obs-producer-v<version>`. Only the release workflow creates them.
- **Permanence:** release tags can't be moved or deleted, and a published version's tag can never be reused. A bad release is fixed by the next patch release.

## Finding where an issue shipped

- **On the issue:** the publish job comments `Released in OBS Producer v<version>: <link>`.
- **Everything in one release:** search issues for `"Released in OBS Producer v0.1.1" in:comments`.
- **In the repo:** the version's section in [`CHANGELOG.md`](../../CHANGELOG.md) lists each entry with its issue number.

## Cutting a release

It takes three deliberate steps. Nothing happens until you do each one.

### 1. Prepare

Either run `/release <version>` in Claude Code, which walks through this for you, or do it by hand on a branch:

```bash
cd obs-producer
node scripts/release.mjs prepare 0.2.0   # Unreleased → [0.2.0] - today; bumps package.json versions
node scripts/release.mjs check 0.2.0     # confirms the changelog and versions are ready
git diff                                 # read the notes the way users will
git commit -am "chore(obs-producer): prepare v0.2.0"
```

Get the commit onto `main` your usual way.

### 2. Dry run

In GitHub, go to **Actions** ▸ **obs-producer release** ▸ **Run workflow**. Choose branch `main`, version `0.2.0`, and leave **Dry run** ticked (the default). The run checks:

| Check | If it fails |
|---|---|
| The run is on `main` | Pick `main` in the branch dropdown |
| The version is semver without a leading `v` | Type `0.2.0`, not `v0.2.0` |
| Tag `obs-producer-v0.2.0` doesn't exist yet | That version is out already. Use the next one |
| CHANGELOG has a dated `[0.2.0]` section with entries, `Unreleased` is empty, and package versions match | Do step 1 |
| Milestone `obs-producer v0.2.0` exists with no open issues (required for `x.y.0`; enforced for other versions only if it exists) | Create it, or finish or move its open issues |
| Docs lint and script tests pass | Fix what they report |

The run summary shows the release notes exactly as they'll be published.

### 3. Publish

Run the workflow again with **Dry run** unticked. Once the checks pass, the **Publish** job waits for approval in the `release` environment. Read the notes in the summary, then choose **Approve and deploy**. The job then:
1. checks again that the tag doesn't exist and the milestone has no open issues, because approval can come long after the checks ran;
2. creates the GitHub release `obs-producer-v0.2.0`, tagged on the exact commit that was checked. The notes are the changelog notes, plus a milestone link and the list of closed issues when the release has a milestone;
3. closes the milestone, if there is one;
4. comments `Released in OBS Producer v0.2.0: <link>` on each issue referenced in the notes, and removes their `patch` label.

## AI agents and releases

Agents prepare; people publish. Agents never approve a release deployment. They also never create release tags or GitHub Releases, or start the release workflow (not even a dry run), unless you explicitly ask them to for a specific version ([hard rule 7](../../AGENTS.md#hard-rules)). Only you can start the `/release` skill.

## Repository settings the pipeline relies on

If something stops working, check that these are still in place:
- **Environment `release`:** required reviewer `wardmanm`; deployments allowed only from `main`.
- **Tag ruleset "Release tags are permanent":** applies to `refs/tags/*-v*` and restricts updates and deletions.
- **Immutable releases:** enabled in the repository settings.
- **Labels:** `obs-producer` and `sicc` scope issues by tool; `chore` marks maintenance; `patch` marks fixes for the next patch release.
