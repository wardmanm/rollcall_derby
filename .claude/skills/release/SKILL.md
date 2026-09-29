---
name: release
description: Prepare an obs-producer release by moving the CHANGELOG's Unreleased notes under a version and bumping package versions, then hand off to the GitHub release workflow. Run only when the user types /release.
disable-model-invocation: true
argument-hint: "<version, e.g. 0.2.0>"
---

# Prepare an obs-producer release

The user ran `/release $ARGUMENTS`. Releases are deliberate (obs-producer hard rule 7, ADR-0009): **you prepare, the user publishes.** Never approve a release deployment. Never push, create tags, create GitHub Releases, or start the release workflow (even as a dry run) unless the user tells you to in this conversation, for this version.

The full process is in `obs-producer/docs/guides/releasing.md`.

1. **Version.** Use `$ARGUMENTS`. If it's empty, ask for it. It must be semver without a leading `v` (e.g. `0.2.0`, `0.3.0-beta.1`).
2. **Show what's shipping.** Print the `## [Unreleased]` section of `obs-producer/CHANGELOG.md`. If it has no bullet entries, stop, because there's nothing to release.
3. **Check the milestone** (read-only):
   `gh api "repos/wardmanm/GROBS/milestones?state=all&per_page=100" --jq '.[] | select(.title == "obs-producer v<version>") | {state, open_issues, html_url}'`
   Report it if it's missing or still has open issues. The workflow will refuse until both are fixed. Preparation can continue meanwhile.
4. **Branch.** If on `main`, create `release/obs-producer-v<version>`.
5. **Prepare.** From `obs-producer/`, run:
   - `node scripts/release.mjs prepare <version>`
   - `node scripts/release.mjs check <version>`
   - `node scripts/check-docs.mjs`
6. **Review.** Show `git diff`. Ask the user whether the notes read well for the people who run the app. Edit wording in the new version section only if they ask.
7. **Commit** once the user confirms: `chore(obs-producer): prepare v<version>`, including `CHANGELOG.md` and any `package.json` files.
8. **Hand off, then stop.** Tell the user the remaining deliberate steps:
   1. Get this commit onto `main` their usual way. Push or open a PR only if they ask.
   2. GitHub ▸ **Actions** ▸ **obs-producer release** ▸ **Run workflow** on `main`, version `<version>`, **Dry run ✅**. Read the notes in the run summary.
   3. Run it again with **Dry run ☐**, then approve the `release` environment when asked.
