---
title: Releasing
---
# Releasing

How OBS Producer work is tracked on GitHub, and how a release is cut. Releases are **always deliberate**: nothing is released by a push, a merge, or an agent acting on its own ([ADR-0009](../decisions/0009-deliberate-milestone-driven-releases.md)).

## Issues

- File OBS Producer work with the **OBS Producer: feature** or **OBS Producer: bug** issue forms. They add the `obs-producer` label and ask which wiki page and requirement numbers the issue covers, e.g. [Team Builder](../features/team-builder.md) R3.
- **The wiki page is the spec.** If an issue changes what a feature should do, the PR that implements it updates the page. Issues link to wiki pages; wiki pages don't list issues, because that list would go stale.
- An open question on a wiki page can get its own issue for discussion. Link back to the page; the answer goes onto the page.
- Close issues from commits or PRs with `Closes #N`.

## Milestones

- **One milestone per release**, titled exactly **`obs-producer v<version>`**, e.g. `obs-producer v0.2.0`. The release workflow finds the milestone by this title.
- **Description:** name the [roadmap](../product/roadmap.md) phase it belongs to, and link to it.
- **Assign every issue that should ship in that release.** The release can't be cut while the milestone has open issues, so move unfinished ones to the next milestone.
- **You don't close it yourself.** The release workflow closes the milestone when it publishes.

## Changelog

[`CHANGELOG.md`](../../CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-visible change adds a line under `## [Unreleased]` in the same commit or PR. Put it under the right heading (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) and end it with the issue number:

```md
### Added

- Team Builder: upload a photo for each team member (#12)
```

These lines become the release notes, so write them for the people who run the app.

## Versions and tags

- **[Semantic Versioning](https://semver.org/).** Stay on `0.x` until the app is ready for general use.
  - **Patch:** fixes.
  - **Minor:** features. During `0.x`, breaking changes also go in a minor release.
- **Pre-releases:** a suffix such as `0.3.0-beta.1` publishes as a GitHub pre-release.
- **Tags:** named `obs-producer-v<version>`. Only the release workflow creates them.
- **Permanence:** release tags and published releases can't be moved, edited or deleted. A bad release is fixed by the next patch release.

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
| Milestone `obs-producer v0.2.0` exists with no open issues | Create it, or finish or move its open issues |
| Docs lint and script tests pass | Fix what they report |

The run summary shows the release notes exactly as they'll be published.

### 3. Publish

Run the workflow again with **Dry run** unticked. Once the checks pass, the **Publish** job waits for approval in the `release` environment. Read the notes in the summary, then choose **Approve and deploy**. The job then:
1. creates the GitHub release `obs-producer-v0.2.0`, tagged on the exact commit that was checked, with the changelog notes, a milestone link and the list of closed issues;
2. closes the milestone.

## AI agents and releases

Agents prepare; people publish. Agents never create release tags or GitHub Releases, and never start the release workflow (not even a dry run), unless you explicitly ask them to for a specific version ([hard rule 7](../../AGENTS.md#hard-rules)). Only you can start the `/release` skill.

## Repository settings the pipeline relies on

If something stops working, check that these are still in place:
- **Environment `release`:** required reviewer `wardmanm`; deployments allowed only from `main`.
- **Tag ruleset "Release tags are permanent":** applies to `refs/tags/*-v*` and restricts updates and deletions.
- **Immutable releases:** enabled in the repository settings.
- **Labels `obs-producer` and `sicc`:** these scope issues by tool.
