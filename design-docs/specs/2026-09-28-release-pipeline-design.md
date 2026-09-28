# Release pipeline — design

**Date:** 2026-09-28 · **Status:** approved · **Tool:** obs-producer

## Goal

Set up a GitHub release pipeline for obs-producer. Mike will create GitHub issues and milestones that link to the wiki. **Cutting a release must always be a deliberate act by a person.** Nothing may release as a side effect of a push, a merge, a schedule, or an AI agent's own initiative.

## Decisions (confirmed with Mike)

| Topic | Decision |
|---|---|
| Milestones | One milestone per **release version**, titled `obs-producer v<semver>`. A release can only be cut once its milestone has no open issues. |
| Trigger | A **manual `workflow_dispatch`** followed by **approval** in a protected `release` environment. |
| Release notes | Come from **`obs-producer/CHANGELOG.md`** (Keep a Changelog). Each change adds a line under `Unreleased` in the same commit as the change. |
| Flow shape | **Two steps.** A person makes a *prepare* commit; a person runs the workflow, which only verifies and publishes. The workflow never commits. |
| GitHub settings | Claude applies them with `gh`, once the plan is approved. |
| Area labels | Not now. |

## Versions and tags

- SemVer, staying at `0.x` until the app is usable. A version with a pre-release suffix (e.g. `0.3.0-beta.1`) is published as a GitHub **pre-release**.
- The tag is `obs-producer-v<semver>`, e.g. `obs-producer-v0.2.0`. Every tool in the monorepo follows the pattern `<tool>-v<semver>`.
- Releases are cut from `main` only. A hotfix is a normal patch release from `main`; there are no release branches.

## Flow

1. **Prepare** (a person, optionally helped by the `/release` skill):
   - run `node scripts/release.mjs prepare <version>`, which:
     - moves the `## [Unreleased]` entries under `## [<version>] - <YYYY-MM-DD>`;
     - adds the link reference for the new version;
     - bumps `version` in every obs-producer `package.json`, once any exist;
   - review the result;
   - commit it (`chore(obs-producer): prepare v<version>`);
   - get it onto `main` through the normal flow.
2. **Publish:** in GitHub, go to Actions ▸ *obs-producer release* ▸ Run workflow, with inputs `version` and `dry_run`. **`dry_run` defaults to `true`.**
3. **Preflight job** (read-only token). It fails on the first problem, with a clear message:
   - the run is on `refs/heads/main`;
   - `version` is valid semver. The input is passed through an environment variable, never interpolated into a script, and validated with a regex before any other use;
   - tag `obs-producer-v<version>` doesn't exist yet;
   - `release.mjs check <version>` passes:
     - the section exists and isn't empty;
     - `Unreleased` is empty;
     - `<version>` is greater than the previous released version;
     - the `package.json` versions match, once they exist;
   - milestone `obs-producer v<version>` exists and has 0 open issues;
   - `node --test "scripts/*.test.mjs"` and `node scripts/check-docs.mjs` pass (app tests and build are added once the app is scaffolded);
   - it writes the release notes to the job summary so they can be reviewed before approval.
4. **Stop here if `dry_run` is true.**
5. **Publish job:** needs `environment: release`, so it waits for Mike's approval. It runs with `contents: write` and `issues: write`, and:
   - builds the notes: the CHANGELOG section, a link to the milestone, and a list of the milestone's closed issues;
   - runs `gh release create obs-producer-v<version> --target <preflight's commit SHA> --title "OBS Producer v<version>" --notes-file notes.md`, adding `--prerelease` if the version has a suffix;
   - closes the milestone.

   Build artifacts (a packaged app) are added to this job once the app exists (roadmap Phase 0 scaffold / Phase 5 packaging).

## Guards that keep releases deliberate

1. Runs only through `workflow_dispatch`. There are no push, tag, schedule or `workflow_run` triggers.
2. `dry_run` defaults to `true`.
3. The `release` environment needs approval from a required reviewer (wardmanm) and only accepts runs from `main`.
4. The version input is validated before use, so it can't be used to inject shell commands.
5. The tag targets the exact commit the preflight checked.
6. Release tags can't be moved or deleted: a tag ruleset on `refs/tags/*-v*` restricts updates and deletions, and GitHub **immutable releases** is enabled (confirmed available: `GET /repos/wardmanm/GROBS/immutable-releases` → `enabled: false`).
7. **Agents never release.** Hard rule 7 in `obs-producer/AGENTS.md`, canonical in ADR-0009. Its wording:
   > **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never create release tags or GitHub Releases, and never start the release workflow (even as a dry run), unless the user explicitly asks them to for a specific version.
8. The `/release` skill is user-invocable only (`disable-model-invocation: true`).

## Files

| File | Content |
|---|---|
| `.github/workflows/obs-producer-release.yml` | The workflow above. Uses only `actions/checkout`, `actions/setup-node` and the preinstalled `gh`. `concurrency: obs-producer-release`. |
| `obs-producer/scripts/release.mjs` | Node built-ins only. Commands: `prepare`, `check`, `notes`, plus `--root` for tests. Exports functions for testing. |
| `obs-producer/scripts/release.test.mjs` | `node:test`, using temporary fixture trees. |
| `obs-producer/CHANGELOG.md` | Keep a Changelog header, then `## [Unreleased]` with entries for the wiki, docs lint and release pipeline. |
| `.github/ISSUE_TEMPLATE/feature.yml` | Issue form. **Tool** (dropdown), **wiki feature page** (e.g. `obs-producer/docs/features/team-builder.md`), **requirements covered** (e.g. R3, R5), **description**, **acceptance criteria**. Adds the `enhancement` label. |
| `.github/ISSUE_TEMPLATE/bug.yml` | Issue form. **Tool**, **version** (a release tag or `main`), **steps**, **expected**, **actual**, **logs**. Adds the `bug` label. |
| `.github/ISSUE_TEMPLATE/config.yml` | Blank issues allowed. A contact link to the wiki home page. |
| `.github/pull_request_template.md` | `Closes #`, then a checklist: docs updated in the same change; CHANGELOG `Unreleased` line added (if user-visible); `check-docs` passes; hard rules hold. |
| `.claude/skills/release/SKILL.md` | `disable-model-invocation: true`. Given `/release <version>`, it: shows the Unreleased notes; runs `prepare`; shows the diff; commits after the user confirms; then gives the exact steps for the dry run and the real run. It never pushes, tags or dispatches unless the user tells it to in that moment. |

## Links between GitHub and the wiki

- Links go one way: **GitHub → wiki.** Issues link to feature pages and requirement numbers. Milestone descriptions name the roadmap phase and link to `roadmap.md`. Wiki pages don't list issues or milestone status, because that would go stale.
- The wiki's `## Open questions` sections stay the master list of open questions. An issue can be opened to discuss one, linking back to it; the answer lands on the page.
- Commits and PRs use `Closes #N` so issues close, and move to the milestone's closed list, when the change reaches `main`.

## GitHub settings (applied with `gh`)

- **Environment `release`:**
  - required reviewer: wardmanm;
  - self-review allowed, since he's the only maintainer;
  - deployment branch policy: custom, with `main` only.
- **Labels:** `obs-producer` and `sicc`, to scope issues by tool. The default labels stay.
- **Tag ruleset "release tags":** targets `refs/tags/*-v*` and has the rules `update` and `deletion` (creation is left to the workflow).
- **Immutable releases:** enabled.

## Docs changes

- **ADR-0009, "Deliberate, milestone-driven releases"** (accepted): records the decisions above and defines hard rule 7.
- **`docs/guides/releasing.md`**, a new guide covering:
  - issue and milestone conventions;
  - changelog discipline;
  - how to cut a release (prepare, dry run, real run, approve);
  - pre-releases;
  - what to do when preflight fails;
  - a one-time setup checklist, for reference.
- **`docs/guides/README.md`:** add the releasing guide.
- **`obs-producer/AGENTS.md`:**
  - add hard rule 7;
  - add the release commands to the commands table;
  - add to the definition of done: "user-visible change → CHANGELOG `Unreleased` line".
- **Root `AGENTS.md`:** the `<tool>-v<semver>` tag convention; `Closes #N` in commits and PRs; a link to the releasing guide.
- **`docs/wiki-guide.md`:** a new row in "where things go": *what changed in a release → `CHANGELOG.md`*.
- **`check-docs.mjs`:** add `CHANGELOG.md` to the root files it link-checks (test first).
- **`obs-producer/CLAUDE.md`:** mention the `/release` skill.

## Testing

- **`release.mjs`, test first.** The tests cover:
  - `prepare` moves entries, dates the section, adds link refs, and bumps `package.json` files;
  - `prepare` refuses an empty Unreleased section, an invalid semver, or a version that isn't greater than the last;
  - `check` passes for a prepared changelog and fails with a specific error for each broken condition;
  - `notes` prints exactly the section body;
  - pre-release versions compare correctly (`0.3.0-beta.1` < `0.3.0`).
- **`actionlint`**, downloaded into the scratchpad, must report no problems for both workflows.
- **After merge to `main`, two dry runs, started by Mike or by Claude only when Mike explicitly asks** (see hard rule 7):
  - `v0.0.1` must fail at version validation;
  - `0.0.1` must fail the changelog check, because there is no `[0.0.1]` section.

  No tag or release may exist afterwards.

## Out of scope

- Build artifacts or packaging (there's no app yet).
- Release automation for `simple-ip-camera-controls`. Its tag convention is reserved.
- Branch protection on `main`.
