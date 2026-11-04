---
title: Releasing
---
# Releasing

How Rollcall work is tracked on GitHub, and how a release is cut. Each rcl app, rcl-core and rcl-producer, is released on its own, with its own versions, release notes and tags. Releases are **always deliberate**: nothing is released by a push, a merge, or an agent acting on its own ([ADR-0021](../decisions/0021-per-app-releases.md)).

## Issues

- File Rollcall work with the **Rollcall: feature** or **Rollcall: bug** issue forms. Every form asks which app the issue is for. Forms can't set labels from that answer, so add the app's label (`rcl-core`, `rcl-producer` or both) when triaging; the label puts the issue on the app's board. The forms ask which wiki page and requirement numbers the issue covers, e.g. [Team Builder](../features/team-builder.md) R3.
- Use the **Rollcall: chore** form for maintenance with no user-visible change: dependencies, tooling and CI, refactoring, docs upkeep. It adds the `chore` label. Chores don't need a CHANGELOG line unless users would notice.
- **The wiki page is the spec.** If an issue changes what a feature should do, the PR that implements it updates the page. Issues link to wiki pages; wiki pages don't list issues, because that list would go stale.
- An open question on a wiki page can get its own issue for discussion. Link back to the page; the answer goes onto the page.
- Close issues from commits or PRs with `Closes #N`.
- Label a fix `patch` if it should ship in the next patch release. Patch releases don't have milestones (see below).

## Milestones

- **Milestones are for planned releases: minor and major versions (`x.y.0`).** Title each one exactly **`<app> v<version>`**, e.g. `rcl-core v0.2.0` or `rcl-producer v0.3.0`. The release workflow finds the milestone by this title and requires it for `x.y.0` releases.
- **Patch releases (`0.2.1`) and pre-releases (`0.3.0-beta.1`) don't need a milestone.** Label the issues `patch` instead. If you do create a milestone with the exact title, the workflow enforces it the same way.
- **Description:** name the [roadmap](../product/roadmap.md) phase it belongs to, and link to it.
- **Assign every issue that should ship in that release.** A release can't be cut while its milestone has open issues, so move unfinished ones to the next milestone.
- **You don't close it yourself.** The release workflow closes the milestone when it publishes.

## Changelog

Each rcl app keeps its own changelog, [`rcl-core/CHANGELOG.md`](../../rcl-core/CHANGELOG.md) and [`rcl-producer/CHANGELOG.md`](../../rcl-producer/CHANGELOG.md), following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-visible change adds a line under `## [Unreleased]` in the changelog of each app it changes, in the same commit or PR. A change to both apps gets a line in each, written for that app's users. Put it under the right heading (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) and end it with the issue number:

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
- **Each app has its own versions.** rcl-producer continues from OBS Producer 0.1.0, so its next release is 0.2.0. rcl-core's first release is 0.1.0.
- **Tags:** named `<app>-v<version>`, e.g. `rcl-core-v0.2.0`. Only the release workflow creates them.
- **Permanence:** release tags can't be moved or deleted, and a published version's tag can never be reused. A bad release is fixed by the next patch release.

## Finding where an issue shipped

- **On the issue:** the publish job comments `Released in Rollcall Core v<version>: <link>`, or `Rollcall Producer`. An issue in both apps' notes gets a comment from each release.
- **Everything in one release:** search issues for `"Released in Rollcall Core v0.1.1" in:comments`.
- **In the repo:** the version's section in the app's changelog lists each entry with its issue number.

## Cutting a release

It takes four deliberate steps. Nothing happens until you do each one. Run `/release <app> <version>` in Claude Code, which takes you through the first two on a branch, `release/<app>-v<version>`.

### 1. Sign off

Before anything is prepared, you check by hand that each new feature does what was planned, the way someone running the app would try it ([ADR-0025](../decisions/0025-release-sign-off.md)). This doesn't repeat the automated tests; it checks the features against their [feature pages](../features/README.md).

1. **The checks.** Claude drafts one to three for each feature or fix in the `Unreleased` notes, from their issues and feature pages. Each names the feature, the requirement it checks (e.g. `import-export R5`), what to try and what should happen. You approve the list, or change it.
2. **The walk-through.** Run the build of the release branch (`yarn build && yarn start`, with OBS when a check needs it). Claude asks about one check at a time, and you answer **Pass**, **Fail** (saying what happened) or **Skip for now**. Each answer is saved straight away, so you can stop and run `/release` again later to pick up where you left off.
3. **Bugs.** Each failure becomes an issue (see [sign-off bugs](#sign-off-bugs)).
4. **Signing off.** Once every check has a result, Claude asks whether you sign the release off, and records it.

The record is `<app>/sign-off/<version>.md`: the commit you tested, a table with one row per check and its result, and the `Signed off:` line. A result is `pending`, `pass`, `skip`, or `fail: <what happened> (#<issue>, P0|P1|P2)`. If `main` changes after a check has passed, Claude lists what changed and you choose which checks to try again.

#### Sign-off bugs

Claude drafts each one from what you said. You confirm its title and Priority before it's filed. It gets the labels `bug`, `sign-off` and the app's label, and its Priority is set on the app's board:

| Priority | Meaning | The release |
|---|---|---|
| P0 | Blocking | Waits. The bug goes in the release's milestone, which can't be released while it has open issues. Fix it on a branch as usual, then run `/release` again to try the check again. |
| P1 | High, not blocking | Goes ahead. The check stays failed, with the bug linked. |
| P2 | Deferred | Goes ahead. The bug waits on the board for a later release. |

P1 and P2 bugs don't go in the milestone.

### 2. Prepare

`/release` does this once the sign-off is done. By hand, on the release branch, for rcl-core 0.2.0:

```bash
node scripts/release.mjs prepare 0.2.0 --app rcl-core   # Unreleased → [0.2.0] - today; bumps rcl-core/*/package.json
node scripts/release.mjs check 0.2.0 --app rcl-core     # confirms the changelog, versions and sign-off are ready
git diff                                                # read the notes the way users will
git add rcl-core/sign-off/0.2.0.md
git commit -am "chore(rcl-core): prepare v0.2.0"
```

When you release rcl-core, check each other app's `rollcall.requiresCore` range in `rcl-*/server/package.json`. If the new version is outside it (before 1.0, any new minor version such as 0.2.0), decide whether that app works with it and widen the range before you commit ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)). Until you do, `yarn check` fails in `rcl-core/server/src/installed-apps.test.ts`.

Get the commit onto `main` your usual way.

### 3. Dry run

In GitHub, go to **Actions** ▸ **rcl-core release** (or **rcl-producer release**) ▸ **Run workflow**. Choose branch `main`, version `0.2.0`, and leave **Dry run** ticked (the default). Both run the same checks, in `release.yml`:

| Check | If it fails |
|---|---|
| The run is on `main` | Pick `main` in the branch dropdown |
| The version is semver without a leading `v` | Type `0.2.0`, not `v0.2.0` |
| Tag `rcl-core-v0.2.0` doesn't exist yet | That version is out already. Use the next one |
| `rcl-core/CHANGELOG.md` has a dated `[0.2.0]` section with entries, `Unreleased` is empty, and every `rcl-core/*/package.json` version matches | Do step 2 |
| `rcl-core/sign-off/0.2.0.md` is signed off, and each check passed or failed with only a P1 or P2 bug | Run `/release rcl-core 0.2.0` and finish the sign-off (step 1) |
| Milestone `rcl-core v0.2.0` exists with no open issues (required for `x.y.0`; enforced for other versions only if it exists) | Create it, or finish or move its open issues |
| `yarn check`, the production build, the story tests and the Playwright tests pass, for the whole repository | Run the same commands locally and fix what they report |

The run summary shows the release notes exactly as they'll be published.

### 4. Publish

Run the workflow again with **Dry run** unticked. Once the checks pass, the **Publish** job waits for approval in the `release` environment. Read the notes in the summary, then choose **Approve and deploy**. The job then:
1. checks again that the tag doesn't exist and the milestone has no open issues, because approval can come long after the checks ran;
2. creates the GitHub release "Rollcall Core v0.2.0" with tag `rcl-core-v0.2.0`, on the exact commit that was checked. The notes are the changelog notes, plus a milestone link and the list of closed issues when the release has a milestone;
3. closes the milestone, if there is one;
4. comments `Released in Rollcall Core v0.2.0: <link>` on each issue referenced in the notes, and removes their `patch` label.

## AI agents and releases

Agents prepare; people publish. Agents never approve a release deployment. They also never create release tags or GitHub Releases, or start the release workflow (not even a dry run), unless you explicitly ask them to for a specific version ([hard rule 7](../../AGENTS.md#hard-rules)). Only you can start the `/release` skill.

## Repository settings the pipeline relies on

If something stops working, check that these are still in place:
- **Workflows:** `rcl-core-release.yml` and `rcl-producer-release.yml` each call `release.yml` with their app. A script test (`scripts/release-workflows.test.mjs`) keeps them in step with `scripts/release.mjs`.
- **Environment `release`:** required reviewer `wardmanm`; deployments allowed only from `main`.
- **Visibility:** the repository stays public. On this GitHub plan, the `release` environment's required reviewer works only on a public repository ([ADR-0021](../decisions/0021-per-app-releases.md)).
- **Tag ruleset "Release tags are permanent":** applies to `refs/tags/*-v*` and restricts updates and deletions.
- **Immutable releases:** enabled in the repository settings.
- **Labels:** `rcl-core` and `rcl-producer` put issues on boards #6 and #8; `chore` marks maintenance; `patch` marks fixes for the next patch release; `sign-off` marks bugs found while signing off a release.
- **Boards:** #6 and #8 each have a **Priority** field with the options P0, P1 and P2, which sign-off bugs use.
