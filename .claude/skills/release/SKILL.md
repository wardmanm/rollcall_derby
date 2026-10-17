---
name: release
description: Prepare a release of one rcl app (rcl-core or rcl-producer) by moving its CHANGELOG's Unreleased notes under a version and bumping its package versions, then hand off to the app's GitHub release workflow. Run only when the user types /release.
disable-model-invocation: true
argument-hint: "<app> <version>, e.g. rcl-core 0.1.0"
---

# Prepare a release of one rcl app

The user ran `/release $ARGUMENTS`. Releases are deliberate (hard rule 7, ADR-0021): **you prepare, the user publishes.** Never approve a release deployment. Never push, create tags, create GitHub Releases, or start a release workflow (even as a dry run) unless the user tells you to in this conversation, for this version.

The full process is in `docs/guides/releasing.md`.

1. **App and version.** Read both from `$ARGUMENTS`; ask for whichever is missing.
   - The app is `rcl-core` or `rcl-producer`.
   - The version is semver without a leading `v` (e.g. `0.2.0`, `0.3.0-beta.1`).
2. **Show what's shipping.** Print the `## [Unreleased]` section of `<app>/CHANGELOG.md`. If it has no bullet entries, stop, because there's nothing to release.
3. **Check the milestone** (read-only):
   `gh api "repos/wardmanm/rollcall_derby/milestones?state=all&per_page=100" --jq '.[] | select(.title == "<app> v<version>") | {state, open_issues, html_url}'`
   For an `x.y.0` release, report a missing milestone; patch and pre-releases don't need one. For any version, report a milestone that exists but still has open issues. The workflow refuses until that's fixed. Preparation can continue meanwhile.
4. **Branch.** If on `main`, create `release/<app>-v<version>`.
5. **Prepare.** From the repo root, run:
   - `node scripts/release.mjs prepare <version> --app <app>`
   - `node scripts/release.mjs check <version> --app <app>`
   - `node scripts/check-docs.mjs`

   For an rcl-core release, check each other app's `rollcall.requiresCore` range in `rcl-*/server/package.json`. If the new version is outside it (before 1.0, any new minor version), ask the user whether that app works with it. Widen the range only if they confirm (ADR-0019); `yarn check` fails until it covers the new version.
6. **Review.** Show `git diff`. Ask the user whether the notes read well for the people who run the app. Edit wording in the new version section only if they ask.
7. **Commit** once the user confirms: `chore(<app>): prepare v<version>`, including `<app>/CHANGELOG.md` and the app's `package.json` files (plus any `requiresCore` change).
8. **Hand off, then stop.** Tell the user the remaining deliberate steps:
   1. Get this commit onto `main` their usual way. Push or open a PR only if they ask.
   2. GitHub ▸ **Actions** ▸ **<app> release** ▸ **Run workflow** on `main`, version `<version>`, **Dry run ✅**. Read the notes in the run summary.
   3. Run it again with **Dry run ☐**, then approve the `release` environment when asked.
