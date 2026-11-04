---
name: release
description: Prepare a release of one rcl app (rcl-core or rcl-producer). Walk the user through signing off each new feature by hand, move its CHANGELOG's Unreleased notes under a version and bump its package versions, then hand off to the app's GitHub release workflow. Run only when the user types /release.
disable-model-invocation: true
argument-hint: "<app> <version>, e.g. rcl-core 0.1.0"
---

# Prepare a release of one rcl app

The user ran `/release $ARGUMENTS`. Releases are deliberate (hard rule 7, ADR-0021): **you prepare, the user publishes.** Never approve a release deployment. Never push, create tags, create GitHub Releases, or start a release workflow (even as a dry run) unless the user tells you to in this conversation, for this version.

The full process is in `docs/guides/releasing.md`. The sign-off is ADR-0025.

**Who decides what.** The user decides; you propose, then carry out what they confirmed. They confirm the list of checks, each bug's title and Priority, and the final sign-off. Nothing is posted to GitHub (issues, labels, board fields) before they confirm it.

1. **App and version.** Read both from `$ARGUMENTS`; ask for whichever is missing.
   - The app is `rcl-core` or `rcl-producer`.
   - The version is semver without a leading `v` (e.g. `0.2.0`, `0.3.0-beta.1`).
2. **Show what's shipping.** Print the `## [Unreleased]` section of `<app>/CHANGELOG.md`. If it has no bullet entries, stop, because there's nothing to release.
3. **Check the milestone** (read-only):
   `gh api "repos/wardmanm/rollcall_derby/milestones?state=all&per_page=100" --jq '.[] | select(.title == "<app> v<version>") | {state, open_issues, html_url}'`
   For an `x.y.0` release, report a missing milestone; patch and pre-releases don't need one. For any version, report a milestone that exists but still has open issues. The workflow refuses until that's fixed. Preparation can continue meanwhile.
4. **Branch.** If `release/<app>-v<version>` exists, switch to it: this is a resumed release. If `main` has moved since the branch was made, rebase the branch onto `main`. Otherwise, from `main`, create it.
5. **Sign-off** (below). Don't go on until `<app>/sign-off/<version>.md` has its `Signed off:` line.
6. **Prepare.** From the repo root, run:
   - `node scripts/release.mjs prepare <version> --app <app>`
   - `node scripts/release.mjs check <version> --app <app>` (this also checks the sign-off)
   - `node scripts/check-docs.mjs`

   For an rcl-core release, check each other app's `rollcall.requiresCore` range in `rcl-*/server/package.json`. If the new version is outside it (before 1.0, any new minor version), ask the user whether that app works with it. Widen the range only if they confirm (ADR-0019); `yarn check` fails until it covers the new version.
7. **Review.** Show `git diff`. Ask the user whether the notes read well for the people who run the app. Edit wording in the new version section only if they ask.
8. **Commit** once the user confirms: `chore(<app>): prepare v<version>`, including `<app>/CHANGELOG.md`, the app's `package.json` files, `<app>/sign-off/<version>.md` (plus any `requiresCore` change).
9. **Hand off, then stop.** Tell the user the remaining deliberate steps:
   1. Get this commit onto `main` their usual way. Push or open a PR only if they ask.
   2. GitHub ▸ **Actions** ▸ **<app> release** ▸ **Run workflow** on `main`, version `<version>`, **Dry run ✅**. Read the notes in the run summary.
   3. Run it again with **Dry run ☐**, then approve the `release` environment when asked.

## The sign-off

The user's own check that each new feature does what was planned, the way someone running the app would try it. It is not a list of tests you ran: keep your own testing out of it.

### Draft the checks

- **Sources:** each entry under `## [Unreleased]`, the issue it ends with (`gh issue view <N>`: the issue names its feature page and requirement numbers), and that feature page's Requirements and Behavior.
- **One to three checks per feature or fix**, at a high level: a scenario to try and what should hold, in the words of someone running the app. A fix's check is that it's fixed.
- **Each check has:**
  - **Feature:** its name and issue, e.g. `Import / export (#22)`;
  - **Planned:** the requirement it checks, as `<feature page> R<n>` (e.g. `import-export R5`), or the bug's issue for a fix;
  - **Try:** what to do;
  - **Expect:** what should happen.
- Show the list as a table and ask whether to start with it, or what to change. Only the user can drop or reword a check.

### The record

Create `<app>/sign-off/<version>.md` once the list is agreed, with every result `pending`:

```markdown
# Sign-off: Rollcall Core v0.5.0

Tested: `abc1234` on 2026-11-20

| # | Feature | Planned | Try | Expect | Result |
|---|---|---|---|---|---|
| 1 | Screen Builder (#30) | screen-builder R2 | … | … | pending |
```

- The title is `# Sign-off: <release name>`, as `node scripts/release.mjs name <version> --app <app>` prints it.
- `Tested:` is `git rev-parse --short HEAD` on the release branch, and today's date. Ask the user to run that build (`yarn build && yarn start`, with OBS open when a check needs it).
- Each cell is one line. Write a `|` inside a cell as `\|`.
- A result is `pending`, `pass`, `skip`, or `fail: <what happened> (#<issue>, P0|P1|P2)`. `release.mjs check` reads exactly these.

### Walk through it

- **One check per question,** with `AskUserQuestion`: the Feature, Planned, Try and Expect in the question, and the options **Pass**, **Fail** and **Skip for now**.
- **Write each answer into the record as soon as it's given,** so the user can stop at any point. On a resumed release, start at the first `pending` check.
- **On Fail:** ask what happened, plus a follow-up if you need one. Record `fail: <what happened>` and file the bug (below) before the next check.
- **On Skip:** record `skip`. A skipped check still blocks the release; offer it again at the end.

### A bug for each failure

1. **Draft it:**
   - the title;
   - the steps (Try), what was expected and what happened;
   - where it was found: the check's number, the tested commit and the release.
2. **Suggest a Priority:**
   - **P0** blocks the release;
   - **P1** is high, but doesn't block;
   - **P2** is deferred.
3. **Wait for the user** to confirm the title and Priority.
4. **File it:** `gh issue create` with the labels `bug`, `sign-off` and the app's label.
   - A P0 also gets `--milestone "<app> v<version>"`, so the release can't be published while it's open.
   - P1 and P2 bugs get no milestone.
5. **Set Priority on the board.** That's #6 for rcl-core and #8 for rcl-producer; the app label adds the issue to it within a few seconds.
   - Find the card's item id with `gh project item-list <board> --owner wardmanm --format json`.
   - Find the Priority field's id and the option's id with `gh project field-list <board> --owner wardmanm --format json`, and the project's id with `gh project view <board> --owner wardmanm --format json --jq .id`.
   - Then run `gh project item-edit --id <item> --project-id <project> --field-id <field> --single-select-option-id <option>`.
6. **Finish the result** as `fail: <what happened> (#<issue>, <priority>)`.

**A P0 stops the sign-off.** It's fixed through the normal branch flow and merged to `main`. Then `/release` resumes: the branch is rebased, and that check is tried again.

### When `main` moves

If `main` has moved past `Tested:` (a P0 fix, or other work), list the commits and changed files since then, and ask which checks to try again. Set those back to `pending`, move `Tested:` to the new commit, and remove any `Signed off:` line.

### Sign it off

When every check has a result, show the table and ask: "Sign off <app> <version>?"
- On yes, add `Signed off: YYYY-MM-DD by Mike` below `Tested:`, then run `node scripts/release.mjs check <version> --app <app>`.
- Until prepare runs, it reports only the changelog and versions. Any sign-off error in it means the record is wrong: fix it.
- Changing a result afterwards removes the `Signed off:` line until the user is asked again.
