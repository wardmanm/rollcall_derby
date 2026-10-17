# Per-App Releases (#6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rcl-core and rcl-producer are released separately, each with its own changelog, versions, tags, milestones and release workflow, so Mike can cut rcl-core v0.1.0 and then rcl-producer v0.2.0.

**Architecture:**
- **`scripts/release.mjs` takes `--app` on every command** and derives everything else from it:
  - `<app>/CHANGELOG.md` and `<app>/*/package.json`;
  - tag `<app>-v<version>` and milestone `<app> v<version>`;
  - the release name, from `APPS`.
- **The changelog splits.** The root `CHANGELOG.md` moves to `rcl-producer/`, keeping OBS Producer 0.1.0, and rcl-core starts its own.
- **One release workflow, started per app.** `.github/workflows/release.yml` becomes reusable (`workflow_call` with input `app`), and `rcl-core-release.yml` and `rcl-producer-release.yml` start it. Its checks before approval add the story tests.
- **Docs and forms say which app:**
  - the docs lint checks the app folders' files and the feature pages' new `app:` field;
  - the issue forms ask which app;
  - ADR-0021 supersedes ADR-0010.

**Tech Stack:** Node 24 scripts with no dependencies, tested with `node --test`; GitHub Actions reusable workflows; the Markdown wiki and its docs lint. **No new dependencies.**

**Spec:** Phase 5 of [`design-docs/specs/2026-10-07-rollcall-split-design.md`](../specs/2026-10-07-rollcall-split-design.md#phase-5-per-app-releases-and-process). Issue **#6**. The spec numbers its ADR 0020, but ADR-0020 went to API keys, so this one is **0021**.

**How this plan was checked:** the work was built on a throwaway branch, one commit per task (two for Task 2).
- Every commit passed `yarn check`.
- The last commit also passed `yarn build`, the 14 story tests and the 8 e2e tests, and actionlint 1.7.12 found nothing in the workflows.
- Script tests go from 84 to 107. App tests stay at 307, because no app code changes.
- Each task's tests were run against the previous task's files and failed as its "Expected: FAIL" says.
- Every code block below is copied from those commits. Every "Replace … with" instruction was checked mechanically: applied to the previous task's files, it gives this task's files exactly.

## Global Constraints

- **From the spec:**
  - **Helper:** "Every command takes `--app rcl-core|rcl-producer`." "Per app it uses `<app>/CHANGELOG.md`, `<app>/*/package.json`, tag prefix `<app>-v`, milestone prefix `<app> v`, and the titles "Rollcall Core" / "Rollcall Producer"."
  - **Workflows:** "a reusable `release.yml` (`workflow_call`, input `app`) with two callers, `rcl-core-release.yml` and `rcl-producer-release.yml`. The preflight also runs `test:stories`".
  - **Changelogs:** "`git mv CHANGELOG.md rcl-producer/CHANGELOG.md` to keep the 0.1.0 lineage. Start a new `rcl-core/CHANGELOG.md`." "Unreleased entries for accounts, users and the API explorer move to core. The overlay namespace and URL entries stay with producer."
  - **Docs lint:** "Link-check the `rcl-*/` AGENTS, CLAUDE, README and CHANGELOG files. Feature pages need `app:` frontmatter, and the features table gets an App column."
  - **Process:** "`/release` takes `<app> <version>`." "Issue forms get a required App dropdown. Labels are applied at triage, since forms can't set labels from a dropdown."
  - **Release order:** "core first (`rcl-core v0.1.0`), then producer (`rcl-producer v0.2.0`)."
- **Hard rule 7, word for word:** "**Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never approve a release deployment, and never create release tags or GitHub Releases or start the release workflow (even as a dry run) unless the user explicitly asks them to for a specific version." This plan builds the tooling only. No step cuts a release, creates a tag or starts a release workflow, not even a dry run.
- **GitHub settings are Mike's (Task 5).** Making the repo public, the `release` environment, the tag ruleset and immutable releases change only with his explicit OK.
- **Scripts keep zero dependencies:** Node built-ins only, so the workflow tests read YAML as text.
- **Every commit passes `yarn format && yarn check`.**
- **Commits** follow Conventional Commits with scope `repo`. Each body ends with `Refs #6` and then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Nothing is pushed** without Mike's explicit OK.

## Review Focus

1. **The reusable workflow running on GitHub.** No test can run GitHub, so these four behaviors are unproven by tests:
   - `environment: release` on a job inside a called workflow;
   - the caller job's `permissions`;
   - `inputs` in the called workflow's top-level `env`;
   - `github.ref` being the caller's.

   actionlint 1.7.12 passes. GitHub's docs say the `github` context belongs to the caller, that a called workflow can only lower the caller's token permissions, and that environments are set on the called workflow's jobs. **Check:** the reviewer reads `release.yml` against GitHub's reusable-workflow docs. Mike's first dry run (rcl-core 0.1.0) is the proof.
2. **rcl-core's first release, when its packages already say 0.1.0.** Every package has been 0.1.0 since GROBS, and prepare and check must accept that. Test in Task 1: "prepare and check accept an app's first release when its packages already have that version".
3. **The real changelogs going through prepare.** Prepare rewrites the whole file, so the parser must give back exactly what it read. That includes the preamble paragraphs with links, and OBS Producer's 0.1.0 linked to its tag in GROBS. Tests in Task 2:
   - "each app's changelog survives being prepared";
   - "rcl-producer's changelog keeps OBS Producer 0.1.0".
4. **A wrong or missing app anywhere:** a forgotten `--app`, an old habit like `obs-producer`, or a caller workflow passing the wrong name. Tests:
   - Task 1: "CLI without --app prints usage…" and "CLI refuses an unknown app or an unsafe version for every command";
   - Task 3: "each app has a release workflow that calls the shared one with its name".
5. **The issue forms as GitHub renders them.** If GitHub's form schema rejects a field, the form breaks only on GitHub. Test in Task 4: it checks the App dropdown's `id`, options and `required`. After merging, Mike opens **New issue** once to see the App field.

## Decisions this plan makes

The spec leaves these open. Each is decided here so implementers and reviewers don't have to guess.

**Release helper:**
- **`APPS`** maps each app to its release name. `appError` runs first on every command, so a wrong app changes nothing.
- **A new `name` command** prints the release name for the workflow, so release names live only in `release.mjs`.
- **An app's versions** are the `package.json` in each folder directly inside it. The root, `packages/*` and `e2e/` aren't released, so their versions stay at 0.1.0.
- **The workspace-pattern logic goes,** with its tests. The per-app rule replaces it.

**Changelogs:**
- **The move is its own commit,** so `git log --follow rcl-producer/CHANGELOG.md` reaches the old history. In a single commit, git pairs the old file with rcl-core's new one, because that one keeps more of its lines.
- **Each entry goes to the app whose users see the change.** The server, accounts, settings and the admin app belong to rcl-core, because it runs the server. An entry about both apps is split into one line for each, with the same issue number:
  - #4's "each app has its own address" becomes rcl-core's `/core/` line and rcl-producer's overlay-move line;
  - #5's module entry becomes rcl-core's API-address line and rcl-producer's overlay-connection line;
  - #2's rename stays with rcl-core, and rcl-producer gets a line pointing to rcl-core's notes before upgrading;
  - #11's sign-in gate gets a line in rcl-producer too.
- **Entries don't link to the other changelog,** because notes are copied into GitHub Releases, where relative links break. Only the preamble links.

**Workflows:**
- **One concurrency group per app** (`rcl-core-release`), so one app's release never waits on the other's.
- **Permissions:** the caller job grants `contents: write` and `issues: write`, and the preflight job asks for read access only.
- **Names:** the workflow builds the tag and milestone names in its `env` from `inputs.app`, and a script test checks they match `release.mjs`. The release name comes from `release.mjs name`.
- **The workflow tests read YAML as text,** because the scripts have no YAML parser.

**Docs lint and forms:**
- **A feature's `app:`** is `rcl-core`, `rcl-producer` or `both`, set from the spec's list. The App column sits between Feature and Status.
- **The root `CHANGELOG.md`** leaves the lint's root files, and a release test fails if it comes back.
- **Issue form options:** the feature and chore forms offer rcl-core, rcl-producer and Both; the bug form offers Not sure instead of Both. Repo-wide chores choose Both.

**Docs:**
- **ADR-0021** restates ADR-0010 per app, with hard rule 7 word for word. AGENTS.md's rule 7 now links to it.
- **When each doc changes:**
  - Task 2: the releasing guide's changelog section, with the changelogs;
  - Task 3: the rest of the guide, the `/release` skill and CLAUDE.md, with the workflows.

  Between Tasks 1 and 3, the guide still shows the old commands. The branch merges as one.
- **No CHANGELOG entry,** because nothing changes for the people who run the apps.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `scripts/release.mjs` + test | Every command per app | 1 |
| `CHANGELOG.md` → `rcl-producer/CHANGELOG.md`, new `rcl-core/CHANGELOG.md`, `scripts/check-docs.mjs` + test, docs that link the changelog | A changelog for each app, link-checked | 2 |
| `.github/workflows/{release,rcl-core-release,rcl-producer-release}.yml`, `scripts/release-workflows.test.mjs`, ADR-0021, releasing guide, `/release` skill | The release workflows per app, and the decision | 3 |
| `scripts/check-docs.mjs` + test, `docs/features/*.md`, `.github/ISSUE_TEMPLATE/*.yml`, `scripts/issue-forms.test.mjs` | Features and issues say which app | 4 |
| GitHub settings | ⏸ Mike: public repo, `release` environment, tag ruleset, immutable releases | 5 |

All paths are relative to the repo root.

---

### Task 1: The release helper works per app

**Files:**
- Modify: `scripts/release.mjs`
- Test: `scripts/release.test.mjs`

**Interfaces:**
- Produces, in `scripts/release.mjs`:
  - `APPS = { 'rcl-core': 'Rollcall Core', 'rcl-producer': 'Rollcall Producer' }`;
  - `appError(app)`, which returns `null` or `unknown app "<app>": use rcl-core or rcl-producer`;
  - `tagPrefix(app)` → `` `${app}-v` ``, `milestonePrefix(app)` → `` `${app} v` ``, and `releaseName(app, version)` → `Rollcall Core v0.1.0`.
- Signatures that gain `app`:
  - `readChangelog(root, app)`, `packageFiles(root, app)`;
  - `prepare(root, app, version, { date })`, `check(root, app, version)`, `notes(root, app, version)`;
  - `tagStatus(app, version, { cwd, remote })`, `milestoneCheck(milestones, app, version)`.
- The CLI: `node scripts/release.mjs <prepare|check|notes|name|tag-absent|milestone|issues> <version> --app <rcl-core|rcl-producer> [--date YYYY-MM-DD] [--root dir]`.
  - Without `--app`, it prints usage and exits 2.
  - With an unknown app or a bad version, it exits 1.

- [ ] **Step 0: Branch, and commit this plan.**

```bash
git switch -c chore/per-app-releases
git add design-docs/plans/2026-10-16-per-app-releases.md
git commit -F - <<'EOF'
docs(repo): plan for per-app releases

Phase 5 of the split spec: each rcl app gets its own changelog, versions,
tags, milestones and release workflow. ADR-0021 supersedes ADR-0010.

Refs #6

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Remind Mike, in one line, to move #6 to "In progress" on boards #6 and #8.

- [ ] **Step 1: Write the failing tests.**

The fixtures move into `rcl-core/`, and every call names the app. The workspace-pattern tests go, and tests for per-app files, tags, milestones and the CLI's `--app` and `name` take their place.

Replace `scripts/release.test.mjs` with:

```js
// Tests for release.mjs. Run: node --test "scripts/*.test.mjs"
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseVersion,
  versionError,
  compareVersions,
  parseChangelog,
  formatChangelog,
  prepare,
  check,
  notes,
  REPO_URL,
  APPS,
  appError,
  releaseName,
  tagStatus,
  milestoneCheck,
  milestoneRequired,
  issueRefs,
} from './release.mjs';

// --- apps ---

test('APPS names the rcl apps released on their own', () => {
  assert.deepEqual(APPS, { 'rcl-core': 'Rollcall Core', 'rcl-producer': 'Rollcall Producer' });
});

test('appError accepts each app and rejects anything else without echoing it raw', () => {
  assert.equal(appError('rcl-core'), null);
  assert.equal(appError('rcl-producer'), null);
  for (const bad of ['obs-producer', 'packages', '', undefined, 'constructor', '__proto__', 'rcl-core\n::error::x']) {
    const error = appError(bad);
    assert.match(error, /^unknown app .*: use rcl-core or rcl-producer$/, JSON.stringify(bad));
    assert.ok(!error.includes('\n'), `raw newline echoed for ${JSON.stringify(bad)}`);
  }
});

test('releaseName gives the title of the GitHub Release', () => {
  assert.equal(releaseName('rcl-core', '0.1.0'), 'Rollcall Core v0.1.0');
  assert.equal(releaseName('rcl-producer', '0.2.0-rc.1'), 'Rollcall Producer v0.2.0-rc.1');
});

// --- versions ---

test('parseVersion accepts plain and pre-release semver', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] });
  assert.deepEqual(parseVersion('0.3.0-beta.1'), { major: 0, minor: 3, patch: 0, prerelease: ['beta', '1'] });
});

test('parseVersion rejects malformed versions', () => {
  for (const bad of ['1.2', '01.2.3', '1.2.3+build.5', '1.2.3-', '1.2.3-beta..1', '', ' 1.2.3', '1.2.3-01']) {
    assert.equal(parseVersion(bad), null, JSON.stringify(bad));
  }
});

test('versionError rejects shell metacharacters and newlines without echoing them raw', () => {
  for (const bad of ['0.2.0; rm -rf /', '0.2.0$(id)', '0.2.0\n::error::x', '0.2.0 && true']) {
    const error = versionError(bad);
    assert.match(error, /^invalid version /, JSON.stringify(bad));
    assert.ok(!error.includes('\n'), `raw newline echoed for ${JSON.stringify(bad)}`);
  }
});

test('versionError explains a leading v', () => {
  assert.match(versionError('v0.2.0'), /leave off the leading "v"/);
});

test('versionError accepts valid versions', () => {
  assert.equal(versionError('0.2.0'), null);
  assert.equal(versionError('0.3.0-rc.2'), null);
});

test('compareVersions follows semver precedence', () => {
  const ascending = [
    '0.1.9',
    '0.2.0',
    '0.3.0-1',
    '0.3.0-alpha',
    '0.3.0-beta',
    '0.3.0-beta.1',
    '0.3.0-beta.2',
    '0.3.0-beta.10',
    '0.3.0-rc.1',
    '0.3.0',
    '1.0.0',
  ];
  for (let i = 0; i < ascending.length - 1; i++) {
    assert.equal(compareVersions(ascending[i], ascending[i + 1]), -1, `${ascending[i]} < ${ascending[i + 1]}`);
    assert.equal(compareVersions(ascending[i + 1], ascending[i]), 1, `${ascending[i + 1]} > ${ascending[i]}`);
  }
  assert.equal(compareVersions('0.3.0-beta.1', '0.3.0-beta.1'), 0);
});

// --- fixtures ---

const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'release-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const APP = 'rcl-core';
const LOG = `${APP}/CHANGELOG.md`;
const pkg = (version) => JSON.stringify({ name: 'x', version, private: true }, null, 2) + '\n';

const HEADER = '# Changelog\n\nAll notable changes are documented here.';

const FIRST = `${HEADER}

## [Unreleased]

### Added

- Team Builder (#12)

[Unreleased]: ${REPO_URL}/commits/main
`;

const FIRST_PREPARED = `${HEADER}

## [Unreleased]

## [0.1.0] - 2026-10-14

### Added

- Team Builder (#12)

[Unreleased]: ${REPO_URL}/compare/rcl-core-v0.1.0...HEAD
[0.1.0]: ${REPO_URL}/releases/tag/rcl-core-v0.1.0
`;

const SECOND = `${HEADER}

## [Unreleased]

### Fixed

- Roster paging (#20)

## [0.1.0] - 2026-10-14

### Added

- Team Builder (#12)

[Unreleased]: ${REPO_URL}/compare/rcl-core-v0.1.0...HEAD
[0.1.0]: ${REPO_URL}/releases/tag/rcl-core-v0.1.0
`;

const SECOND_PREPARED = `${HEADER}

## [Unreleased]

## [0.2.0] - 2026-11-01

### Fixed

- Roster paging (#20)

## [0.1.0] - 2026-10-14

### Added

- Team Builder (#12)

[Unreleased]: ${REPO_URL}/compare/rcl-core-v0.2.0...HEAD
[0.2.0]: ${REPO_URL}/releases/tag/rcl-core-v0.2.0
[0.1.0]: ${REPO_URL}/releases/tag/rcl-core-v0.1.0
`;

const EMPTY_HEADINGS = FIRST.replace('- Team Builder (#12)\n\n', '');

// --- changelog parsing ---

test('parseChangelog and formatChangelog round-trip a changelog unchanged', () => {
  for (const text of [FIRST, FIRST_PREPARED, SECOND, SECOND_PREPARED]) {
    assert.equal(formatChangelog(parseChangelog(text)), text);
  }
});

test('parseChangelog reads CRLF line endings and formatChangelog writes LF', () => {
  assert.equal(formatChangelog(parseChangelog(FIRST.replace(/\n/g, '\r\n'))), FIRST);
});

test('parseChangelog keeps link references out of the last section', () => {
  const log = parseChangelog(FIRST_PREPARED);
  assert.equal(log.sections.at(-1).body, '### Added\n\n- Team Builder (#12)');
  assert.equal(log.footer.length, 2);
});

// --- prepare ---

test('prepare moves Unreleased entries into a dated section on the first release', () => {
  const root = makeTree({ [LOG]: FIRST });
  prepare(root, APP, '0.1.0', { date: '2026-10-14' });
  assert.equal(read(root, LOG), FIRST_PREPARED);
});

test('prepare adds the new section above earlier releases', () => {
  const root = makeTree({ [LOG]: SECOND });
  prepare(root, APP, '0.2.0', { date: '2026-11-01' });
  assert.equal(read(root, LOG), SECOND_PREPARED);
});

test("prepare bumps the package.json in each of the app's folders, and nothing else", () => {
  const root = makeTree({
    [LOG]: FIRST,
    'package.json': pkg('0.0.0'),
    'rcl-core/web/package.json': pkg('0.0.0'),
    'rcl-core/server/package.json': pkg('0.0.0'),
    'rcl-core/contract/package.json': pkg('0.0.0'),
    'rcl-core/README.md': 'not a package dir',
    'rcl-core/notes/todo.md': 'a folder with no package.json',
    'rcl-producer/web/package.json': pkg('0.0.0'),
    'packages/app-sdk/package.json': pkg('0.0.0'),
  });
  const { packages } = prepare(root, APP, '0.1.0', { date: '2026-10-14' });
  assert.deepEqual(packages, [
    'rcl-core/contract/package.json',
    'rcl-core/server/package.json',
    'rcl-core/web/package.json',
  ]);
  for (const file of packages) assert.equal(read(root, file), pkg('0.1.0'), file);
  for (const file of ['package.json', 'rcl-producer/web/package.json', 'packages/app-sdk/package.json']) {
    assert.equal(read(root, file), pkg('0.0.0'), file);
  }
});

// The same changelog as rcl-producer's, whose links point at its own tags.
const producer = (text) => text.replaceAll('rcl-core-v', 'rcl-producer-v');

test("prepare reads and writes only the app's own changelog", () => {
  const root = makeTree({ [LOG]: FIRST, 'rcl-producer/CHANGELOG.md': producer(SECOND) });
  prepare(root, 'rcl-producer', '0.2.0', { date: '2026-11-01' });
  assert.equal(read(root, 'rcl-producer/CHANGELOG.md'), producer(SECOND_PREPARED));
  assert.equal(read(root, LOG), FIRST);
});

test('prepare refuses an app that is not released on its own', () => {
  const root = makeTree({ [LOG]: FIRST, 'packages/CHANGELOG.md': FIRST });
  for (const app of ['packages', 'obs-producer', undefined]) {
    assert.throws(() => prepare(root, app, '0.1.0', { date: '2026-10-14' }), /unknown app/);
  }
  assert.equal(read(root, 'packages/CHANGELOG.md'), FIRST);
});

test("prepare and check accept an app's first release when its packages already have that version", () => {
  const root = makeTree({ [LOG]: FIRST, 'rcl-core/server/package.json': pkg('0.1.0') });
  const { packages } = prepare(root, APP, '0.1.0', { date: '2026-10-14' });
  assert.deepEqual(packages, ['rcl-core/server/package.json']);
  assert.equal(read(root, 'rcl-core/server/package.json'), pkg('0.1.0'));
  assert.deepEqual(check(root, APP, '0.1.0'), []);
});

test('prepare refuses when Unreleased has no entries, even with empty headings', () => {
  const root = makeTree({ [LOG]: EMPTY_HEADINGS });
  assert.throws(() => prepare(root, APP, '0.1.0', { date: '2026-10-14' }), /no entries to release/);
  assert.equal(read(root, LOG), EMPTY_HEADINGS);
});

test('prepare refuses a version that is not greater than the latest release', () => {
  const root = makeTree({ [LOG]: SECOND });
  assert.throws(
    () => prepare(root, APP, '0.0.9', { date: '2026-11-01' }),
    /0\.0\.9 is not greater than the latest release 0\.1\.0/,
  );
  assert.throws(
    () => prepare(root, APP, '0.1.0-beta.1', { date: '2026-11-01' }),
    /not greater than the latest release 0\.1\.0/,
  );
});

test('prepare refuses a version that already has a section', () => {
  const root = makeTree({ [LOG]: SECOND });
  assert.throws(() => prepare(root, APP, '0.1.0', { date: '2026-11-01' }), /already has a section for 0\.1\.0/);
});

test('prepare refuses invalid versions and dates', () => {
  const root = makeTree({ [LOG]: FIRST });
  assert.throws(() => prepare(root, APP, 'v0.1.0'), /leave off the leading "v"/);
  assert.throws(() => prepare(root, APP, '0.1'), /invalid version/);
  assert.throws(() => prepare(root, APP, '0.1.0', { date: 'tomorrow' }), /invalid date "tomorrow"/);
  assert.equal(read(root, LOG), FIRST);
});

test('prepare accepts a lowercase [unreleased] heading without duplicating its link', () => {
  const root = makeTree({ [LOG]: FIRST.replace('## [Unreleased]', '## [unreleased]') });
  prepare(root, APP, '0.1.0', { date: '2026-10-14' });
  const text = read(root, LOG);
  assert.match(text, /^## \[0\.1\.0\] - 2026-10-14$/m);
  assert.equal(text.split('\n').filter((l) => /^\[unreleased\]:/i.test(l)).length, 1);
});

test('prepare fails clearly when the app has no CHANGELOG.md', () => {
  assert.throws(() => prepare(makeTree({}), APP, '0.1.0'), /rcl-core\/CHANGELOG\.md not found/);
});

// --- check ---

test('check passes for a prepared changelog', () => {
  const root = makeTree({ [LOG]: FIRST });
  prepare(root, APP, '0.1.0', { date: '2026-10-14' });
  assert.deepEqual(check(root, APP, '0.1.0'), []);
});

test('check reports Unreleased entries that were never prepared', () => {
  const errors = check(makeTree({ [LOG]: FIRST }), APP, '0.1.0');
  assert.deepEqual(errors, [
    'the Unreleased section of rcl-core/CHANGELOG.md still has entries; run: node scripts/release.mjs prepare 0.1.0 --app rcl-core',
    'rcl-core/CHANGELOG.md has no section for 0.1.0; run: node scripts/release.mjs prepare 0.1.0 --app rcl-core',
  ]);
});

test('check ignores empty subsection headings under Unreleased', () => {
  const text = FIRST_PREPARED.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Added\n');
  assert.deepEqual(check(makeTree({ [LOG]: text }), APP, '0.1.0'), []);
});

test('check requires a dated section with entries', () => {
  const undated = FIRST_PREPARED.replace(' - 2026-10-14', '');
  assert.ok(check(makeTree({ [LOG]: undated }), APP, '0.1.0').some((e) => /needs a date/.test(e)));
  const empty = FIRST_PREPARED.replace('- Team Builder (#12)', '');
  assert.ok(check(makeTree({ [LOG]: empty }), APP, '0.1.0').some((e) => /0\.1\.0 section has no entries/.test(e)));
});

test('check requires the version to be newer than every other release', () => {
  const text = `${HEADER}\n\n## [Unreleased]\n\n## [0.1.5] - 2026-12-01\n\n- Late fix\n\n## [0.2.0] - 2026-11-01\n\n- Feature\n`;
  const errors = check(makeTree({ [LOG]: text }), APP, '0.1.5');
  assert.ok(errors.includes('0.1.5 is not greater than the previous release 0.2.0'), errors.join('\n'));
});

test("check requires the app's package.json versions to match, and ignores everyone else's", () => {
  const root = makeTree({
    [LOG]: FIRST_PREPARED,
    'package.json': pkg('0.0.0'),
    'rcl-core/server/package.json': pkg('0.1.0'),
    'rcl-core/web/package.json': pkg('0.0.0'),
    'rcl-producer/web/package.json': pkg('0.0.0'),
    'packages/web-sdk/package.json': pkg('0.0.0'),
  });
  assert.deepEqual(check(root, APP, '0.1.0'), ['rcl-core/web/package.json has version 0.0.0, expected 0.1.0']);
});

test('check reports an unknown app', () => {
  assert.deepEqual(check(makeTree({ [LOG]: FIRST_PREPARED }), 'rcl-nope', '0.1.0'), [
    'unknown app "rcl-nope": use rcl-core or rcl-producer',
  ]);
});

test('check rejects an unsafe version string without echoing it raw', () => {
  const errors = check(makeTree({ [LOG]: FIRST_PREPARED }), APP, '0.1.0\n::error::pwned');
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes('\n'));
});

// --- notes ---

test('notes returns the section body without link references', () => {
  assert.equal(notes(makeTree({ [LOG]: FIRST_PREPARED }), APP, '0.1.0'), '### Added\n\n- Team Builder (#12)');
});

test('notes fails for a version with no section, or an unknown app', () => {
  const root = makeTree({ [LOG]: FIRST_PREPARED });
  assert.throws(() => notes(root, APP, '9.9.9'), /rcl-core\/CHANGELOG\.md has no section for 9\.9\.9/);
  assert.throws(() => notes(root, 'rcl-nope', '0.1.0'), /unknown app "rcl-nope"/);
});

// --- CLI ---

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'release.mjs');
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('CLI prepare writes the changelog, exits 0 and names the commit to make', () => {
  const root = makeTree({ [LOG]: FIRST });
  const out = cli('prepare', '0.1.0', '--app', APP, '--date', '2026-10-14', '--root', root);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /prepared rcl-core 0\.1\.0: rcl-core\/CHANGELOG\.md/);
  assert.match(out.stdout, /commit: chore\(rcl-core\): prepare v0\.1\.0/);
  assert.equal(read(root, LOG), FIRST_PREPARED);
});

test('CLI check exits 1 and lists problems', () => {
  const out = cli('check', '0.1.0', '--app', APP, '--root', makeTree({ [LOG]: FIRST }));
  assert.equal(out.status, 1);
  assert.match(out.stderr, /release check failed for rcl-core "0\.1\.0"/);
});

test('CLI notes prints the section body', () => {
  const out = cli('notes', '0.1.0', '--app', APP, '--root', makeTree({ [LOG]: FIRST_PREPARED }));
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, '### Added\n\n- Team Builder (#12)\n');
});

test("CLI name prints the release's name", () => {
  const out = cli('name', '0.2.0', '--app', 'rcl-producer');
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, 'Rollcall Producer v0.2.0\n');
});

test('CLI without a command prints usage and exits 2', () => {
  const out = cli();
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage: node scripts\/release\.mjs/);
});

test('CLI without --app prints usage and exits 2, changing nothing', () => {
  const root = makeTree({ [LOG]: FIRST });
  const out = cli('prepare', '0.1.0', '--date', '2026-10-14', '--root', root);
  assert.equal(out.status, 2);
  assert.match(out.stderr, /--app <rcl-core\|rcl-producer>/);
  assert.equal(read(root, LOG), FIRST);
});

test('CLI refuses an unknown app or an unsafe version for every command, without echoing it raw', () => {
  for (const command of ['prepare', 'check', 'notes', 'name', 'tag-absent', 'milestone', 'issues']) {
    const app = cli(command, '0.1.0', '--app', 'obs-producer');
    assert.equal(app.status, 1, command);
    assert.match(app.stderr, /unknown app "obs-producer": use rcl-core or rcl-producer/, command);
    const version = cli(command, '0.1.0\n::error::x', '--app', APP);
    assert.equal(version.status, 1, command);
    assert.match(version.stderr, /invalid version "0\.1\.0\\n::error::x"/, command);
  }
});

// --- tag and milestone guards (used by both workflow jobs) ---

function git(cwd, ...args) {
  const r = spawnSync(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd, encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

function gitRepoWithRemote(tags) {
  const root = mkdtempSync(join(tmpdir(), 'release-git-'));
  roots.push(root);
  const remote = join(root, 'remote.git');
  const work = join(root, 'work');
  git(root, 'init', '-q', '--bare', remote);
  git(root, 'init', '-q', work);
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'x');
  git(work, 'remote', 'add', 'origin', remote);
  for (const tag of tags) git(work, 'tag', tag);
  git(work, 'push', '-q', '--tags', 'origin', 'HEAD:refs/heads/main');
  return work;
}

test('tagStatus reports an existing release tag', () => {
  assert.equal(tagStatus(APP, '0.1.0', { cwd: gitRepoWithRemote(['rcl-core-v0.1.0']) }), 'exists');
});

test('tagStatus reports a release tag that does not exist yet', () => {
  assert.equal(tagStatus(APP, '0.2.0', { cwd: gitRepoWithRemote(['rcl-core-v0.1.0']) }), 'absent');
});

test("tagStatus looks only at the app's own tags", () => {
  const cwd = gitRepoWithRemote(['rcl-core-v0.1.0', 'obs-producer-v0.2.0']);
  assert.equal(tagStatus('rcl-producer', '0.1.0', { cwd }), 'absent');
  assert.equal(tagStatus('rcl-producer', '0.2.0', { cwd }), 'absent');
});

test('tagStatus fails loudly when the remote cannot be read, instead of assuming absent', () => {
  assert.throws(
    () => tagStatus(APP, '0.1.0', { cwd: gitRepoWithRemote([]), remote: 'no-such-remote' }),
    /could not check tags on no-such-remote/,
  );
});

const MILESTONES = [
  { title: 'rcl-core v0.1.0', number: 1, open_issues: 0, html_url: 'https://example.com/m/1' },
  { title: 'rcl-core v0.2.0', number: 2, open_issues: 3, html_url: 'https://example.com/m/2' },
  { title: 'rcl-producer v0.1.0', number: 3, open_issues: 4, html_url: 'https://example.com/m/3' },
];

test('milestoneCheck returns the milestone when it exists with no open issues', () => {
  assert.deepEqual(milestoneCheck(MILESTONES, APP, '0.1.0'), {
    milestone: { number: 1, url: 'https://example.com/m/1' },
    errors: [],
  });
});

test("milestoneCheck looks only at the app's own milestones", () => {
  assert.deepEqual(milestoneCheck(MILESTONES, 'rcl-producer', '0.1.0').errors, [
    "milestone 'rcl-producer v0.1.0' still has 4 open issue(s): https://example.com/m/3",
  ]);
  assert.deepEqual(milestoneCheck(MILESTONES, 'rcl-producer', '0.2.0').errors, [
    "no milestone titled 'rcl-producer v0.2.0'. Create it and assign this release's issues to it.",
  ]);
});

test('milestoneCheck reports open issues', () => {
  assert.deepEqual(milestoneCheck(MILESTONES, APP, '0.2.0').errors, [
    "milestone 'rcl-core v0.2.0' still has 3 open issue(s): https://example.com/m/2",
  ]);
});

test('milestoneCheck reports a missing milestone, including when the API returned nothing', () => {
  for (const list of [MILESTONES, [], null]) {
    assert.deepEqual(milestoneCheck(list, APP, '0.3.0').errors, [
      "no milestone titled 'rcl-core v0.3.0'. Create it and assign this release's issues to it.",
    ]);
  }
});

test('CLI tag-absent exits 1 when the tag already exists', () => {
  const root = gitRepoWithRemote(['rcl-core-v0.1.0']);
  const out = cli('tag-absent', '0.1.0', '--app', APP, '--root', root);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /tag rcl-core-v0\.1\.0 already exists/);
  assert.equal(cli('tag-absent', '0.2.0', '--app', APP, '--root', root).status, 0);
  assert.equal(cli('tag-absent', '0.1.0', '--app', 'rcl-producer', '--root', root).status, 0);
});

test('CLI milestone reads the API response on stdin and prints number and url', () => {
  const ok = spawnSync(process.execPath, [SCRIPT, 'milestone', '0.1.0', '--app', APP], {
    input: JSON.stringify(MILESTONES),
    encoding: 'utf8',
  });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), { number: 1, url: 'https://example.com/m/1' });
  const open = spawnSync(process.execPath, [SCRIPT, 'milestone', '0.2.0', '--app', APP], {
    input: JSON.stringify(MILESTONES),
    encoding: 'utf8',
  });
  assert.equal(open.status, 1);
  assert.match(open.stderr, /still has 3 open issue\(s\)/);
});

// --- patch releases: milestones only for x.y.0, issues tracked from the notes ---

test('milestoneRequired is true only for x.y.0 releases', () => {
  assert.equal(milestoneRequired('0.2.0'), true);
  assert.equal(milestoneRequired('1.0.0'), true);
  assert.equal(milestoneRequired('0.1.1'), false);
  assert.equal(milestoneRequired('0.3.0-beta.1'), false);
});

test('milestoneCheck lets patch and pre-releases go without a milestone', () => {
  assert.deepEqual(milestoneCheck(MILESTONES, APP, '0.1.1'), { milestone: null, errors: [] });
  assert.deepEqual(milestoneCheck(null, APP, '0.3.0-beta.1'), { milestone: null, errors: [] });
});

test('milestoneCheck still enforces a patch milestone that exists', () => {
  const list = [{ title: 'rcl-core v0.1.1', number: 5, open_issues: 1, html_url: 'https://example.com/m/5' }];
  assert.deepEqual(milestoneCheck(list, APP, '0.1.1').errors, [
    "milestone 'rcl-core v0.1.1' still has 1 open issue(s): https://example.com/m/5",
  ]);
});

test('issueRefs lists each referenced issue once, in order, ignoring headings, URLs and cross-repo refs', () => {
  const text =
    '### Fixed\n\n- Roster paging (#20)\n- Photo crop (#7, #20)\n- See owner/repo#99, https://example.com/page#12 and &#38;';
  assert.deepEqual(issueRefs(text), [20, 7]);
});

test("CLI issues prints the issue numbers in a version's notes", () => {
  const text = FIRST_PREPARED.replace('- Team Builder (#12)', '- Team Builder (#12)\n- Member photos (#15)');
  const out = cli('issues', '0.1.0', '--app', APP, '--root', makeTree({ [LOG]: text }));
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, '12\n15\n');
});

test('CLI issues prints plain numbers even when FORCE_COLOR is set', () => {
  // The release workflow pipes this output into `gh issue comment`; colour codes would break every comment.
  const out = spawnSync(
    process.execPath,
    [SCRIPT, 'issues', '0.1.0', '--app', APP, '--root', makeTree({ [LOG]: FIRST_PREPARED })],
    {
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '1' },
    },
  );
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, '12\n');
});

test('CLI milestone prints null for a patch release without a milestone', () => {
  const out = spawnSync(process.execPath, [SCRIPT, 'milestone', '0.1.1', '--app', APP], {
    input: JSON.stringify(MILESTONES),
    encoding: 'utf8',
  });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), 'null');
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `node --test scripts/release.test.mjs`
Expected: FAIL. The file doesn't load: `SyntaxError: The requested module './release.mjs' does not provide an export named 'APPS'`.

- [ ] **Step 3: Write the code.**

Replace `scripts/release.mjs` with:

```js
#!/usr/bin/env node
// Release helper for Rollcall. Zero dependencies — Node built-ins only.
// Process and rules: docs/guides/releasing.md · docs/decisions/0021-per-app-releases.md
//
// Each rcl app is released on its own (ADR-0021), so every command names one with --app rcl-core|rcl-producer:
//   node scripts/release.mjs prepare <version> --app <app> [--date YYYY-MM-DD]  move Unreleased → <version>, bump the app's package.json files
//   node scripts/release.mjs check <version> --app <app>                        verify the app's CHANGELOG and package versions are ready
//   node scripts/release.mjs notes <version> --app <app>                        print the release notes for <version>
//   node scripts/release.mjs name <version> --app <app>                         print the release's name, e.g. "Rollcall Core v0.1.0"
//   node scripts/release.mjs tag-absent <version> --app <app>                   exit 1 unless the release tag is absent on origin
//   node scripts/release.mjs milestone <version> --app <app> < milestones.json  exit 1 unless the milestone is ready (required for x.y.0)
//   node scripts/release.mjs issues <version> --app <app>                       print the issue numbers referenced in <version>'s notes
//   --root <dir>                                                                project root (default: this script's parent)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const REPO_URL = 'https://github.com/wardmanm/rollcall_derby';

// The rcl apps released on their own, and the names their releases go by. Each has its own folder, CHANGELOG.md,
// package.json files, tags (`rcl-core-v0.1.0`) and milestones (`rcl-core v0.1.0`).
export const APPS = { 'rcl-core': 'Rollcall Core', 'rcl-producer': 'Rollcall Producer' };

// Error text for an app that isn't released on its own, or null. JSON-escaped, like versionError.
export function appError(app) {
  if (Object.hasOwn(APPS, app)) return null;
  return `unknown app ${JSON.stringify(app ?? '')}: use ${Object.keys(APPS).join(' or ')}`;
}

export const tagPrefix = (app) => `${app}-v`;
export const milestonePrefix = (app) => `${app} v`;
export const releaseName = (app, version) => `${APPS[app]} v${version}`;
const changelogFile = (app) => `${app}/CHANGELOG.md`;

// ---------- versions (SemVer 2.0 precedence, no build metadata) ----------

const IDENT = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const SEMVER = new RegExp(`^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(${IDENT}(?:\\.${IDENT})*))?$`);

export function parseVersion(text) {
  const m = SEMVER.exec(text);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease: m[4] ? m[4].split('.') : [] };
}

// Error text for an unusable version, or null. The input is JSON-escaped so a hostile value can't
// inject newlines (or GitHub workflow commands) into logs.
export function versionError(text) {
  if (/^v\d/.test(text)) return `invalid version ${JSON.stringify(text)}: leave off the leading "v" (the tag adds it)`;
  if (!parseVersion(text)) return `invalid version ${JSON.stringify(text)}: use semver like 1.2.3 or 1.2.3-beta.1`;
  return null;
}

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (!x.prerelease.length || !y.prerelease.length) return Math.sign(y.prerelease.length - x.prerelease.length);
  for (let i = 0; i < Math.max(x.prerelease.length, y.prerelease.length); i++) {
    const p = x.prerelease[i];
    const q = y.prerelease[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pNum = /^\d+$/.test(p);
    const qNum = /^\d+$/.test(q);
    if (pNum && qNum) return Number(p) < Number(q) ? -1 : 1;
    if (pNum !== qNum) return pNum ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

// ---------- CHANGELOG.md (Keep a Changelog) ----------
// A changelog is a preamble, "## [name] - date" sections (newest first), and a footer of
// link reference definitions. formatChangelog(parseChangelog(x)) === x for normalized files.

const SECTION = /^## \[([^\]]+)\](?: - (\S+))?\s*$/;
const LINK_REF = /^\[[^\]]+\]: \S+/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isUnreleased = (section) => section.name.toLowerCase() === 'unreleased';
export const hasEntries = (body) => /^\s*[-*]\s+\S/m.test(body);
const linkLabel = (line) => line.slice(1, line.indexOf(']')).toLowerCase();

export function parseChangelog(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let end = lines.length;
  while (end > 0 && (lines[end - 1].trim() === '' || LINK_REF.test(lines[end - 1]))) end--;
  const footer = lines.slice(end).filter((l) => LINK_REF.test(l));
  const preamble = [];
  const sections = [];
  for (const line of lines.slice(0, end)) {
    const m = SECTION.exec(line);
    if (m) sections.push({ name: m[1], date: m[2] ?? null, body: [] });
    else (sections.length ? sections.at(-1).body : preamble).push(line);
  }
  return {
    preamble: preamble.join('\n').trim(),
    sections: sections.map(({ name, date, body }) => ({ name, date, body: body.join('\n').trim() })),
    footer,
  };
}

export function formatChangelog({ preamble, sections, footer }) {
  const parts = [preamble];
  for (const s of sections) {
    parts.push(`## [${s.name}]${s.date ? ` - ${s.date}` : ''}`);
    if (s.body) parts.push(s.body);
  }
  if (footer.length) parts.push(footer.join('\n'));
  return parts.join('\n\n') + '\n';
}

export function readChangelog(root, app) {
  const file = join(root, changelogFile(app));
  if (!existsSync(file)) throw new Error(`${changelogFile(app)} not found in ${root}`);
  return readFileSync(file, 'utf8');
}

export function releasedVersions(sections, except) {
  return sections.filter((s) => !isUnreleased(s) && s.name !== except && parseVersion(s.name)).map((s) => s.name);
}

export function latestVersion(versions) {
  return versions.reduce((best, v) => (best === null || compareVersions(v, best) > 0 ? v : best), null);
}

// The package.json files that carry an app's version: one in each of its folders (`rcl-core/server`, `rcl-core/web`,
// …). Shared packages and the repo root aren't released, so they keep their own versions.
export function packageFiles(root, app) {
  if (!existsSync(join(root, app))) return [];
  return readdirSync(join(root, app), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, app, e.name, 'package.json')))
    .map((e) => `${app}/${e.name}/package.json`)
    .toSorted((a, b) => a.localeCompare(b));
}

// ---------- prepare ----------

export function prepare(root, app, version, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const bad = appError(app) ?? versionError(version);
  if (bad) throw new Error(bad);
  if (!DATE.test(date)) throw new Error(`invalid date ${JSON.stringify(date)}: use YYYY-MM-DD`);
  const file = changelogFile(app);
  const log = parseChangelog(readChangelog(root, app));
  const unreleased = log.sections.find(isUnreleased);
  if (!unreleased) throw new Error(`${file} has no "## [Unreleased]" section`);
  if (log.sections.some((s) => s.name === version)) throw new Error(`${file} already has a section for ${version}`);
  if (!hasEntries(unreleased.body)) throw new Error('the Unreleased section has no entries to release');
  const previous = latestVersion(releasedVersions(log.sections));
  if (previous && compareVersions(version, previous) <= 0) {
    throw new Error(`${version} is not greater than the latest release ${previous}`);
  }

  log.sections.splice(log.sections.indexOf(unreleased) + 1, 0, { name: version, date, body: unreleased.body });
  unreleased.body = '';
  const tag = `${tagPrefix(app)}${version}`;
  log.footer = [
    `[${unreleased.name}]: ${REPO_URL}/compare/${tag}...HEAD`,
    `[${version}]: ${REPO_URL}/releases/tag/${tag}`,
    ...log.footer.filter((l) => !['unreleased', version.toLowerCase()].includes(linkLabel(l))),
  ];
  writeFileSync(join(root, file), formatChangelog(log));

  const packages = packageFiles(root, app);
  for (const pkgFile of packages) {
    const data = JSON.parse(readFileSync(join(root, pkgFile), 'utf8'));
    data.version = version;
    writeFileSync(join(root, pkgFile), JSON.stringify(data, null, 2) + '\n');
  }
  return { packages };
}

// ---------- check / notes ----------

export function check(root, app, version) {
  const bad = appError(app) ?? versionError(version);
  if (bad) return [bad];
  let log;
  try {
    log = parseChangelog(readChangelog(root, app));
  } catch (e) {
    return [e.message];
  }
  const file = changelogFile(app);
  const prepareCommand = `node scripts/release.mjs prepare ${version} --app ${app}`;
  const errors = [];
  const unreleased = log.sections.find(isUnreleased);
  if (!unreleased) errors.push(`${file} has no "## [Unreleased]" section`);
  else if (hasEntries(unreleased.body)) {
    errors.push(`the Unreleased section of ${file} still has entries; run: ${prepareCommand}`);
  }
  const section = log.sections.find((s) => s.name === version);
  if (!section) {
    errors.push(`${file} has no section for ${version}; run: ${prepareCommand}`);
  } else {
    if (!hasEntries(section.body)) errors.push(`the ${version} section has no entries`);
    if (!section.date || !DATE.test(section.date))
      errors.push(`the ${version} section needs a date: ## [${version}] - YYYY-MM-DD`);
  }
  const previous = latestVersion(releasedVersions(log.sections, version));
  if (previous && compareVersions(version, previous) <= 0) {
    errors.push(`${version} is not greater than the previous release ${previous}`);
  }
  for (const pkgFile of packageFiles(root, app)) {
    const { version: actual } = JSON.parse(readFileSync(join(root, pkgFile), 'utf8'));
    if (actual !== version) errors.push(`${pkgFile} has version ${actual ?? '(none)'}, expected ${version}`);
  }
  return errors;
}

export function notes(root, app, version) {
  const bad = appError(app);
  if (bad) throw new Error(bad);
  const section = parseChangelog(readChangelog(root, app)).sections.find((s) => s.name === version);
  if (!section) throw new Error(`${changelogFile(app)} has no section for ${version}`);
  return section.body;
}

// ---------- tag and milestone guards (run by both workflow jobs) ----------

// 'exists' | 'absent'. Throws when the remote can't be read: a failed lookup must never pass as "absent".
export function tagStatus(app, version, { cwd, remote = 'origin' } = {}) {
  const ref = `refs/tags/${tagPrefix(app)}${version}`;
  const r = spawnSync('git', ['ls-remote', '--exit-code', '--tags', remote, ref], { cwd, encoding: 'utf8' });
  if (r.status === 0) return 'exists';
  if (r.status === 2) return 'absent';
  throw new Error(`could not check tags on ${remote} (git exit ${r.status}): ${(r.stderr || '').trim()}`);
}

// Minor and major releases (x.y.0) are planned with a milestone; patch and pre-releases don't need one.
export function milestoneRequired(version) {
  const v = parseVersion(version);
  return v.patch === 0 && v.prerelease.length === 0;
}

// milestones: the GitHub API's milestone list (null when the API returned nothing).
// A milestone that exists is always enforced, even for a patch release.
export function milestoneCheck(milestones, app, version) {
  const title = `${milestonePrefix(app)}${version}`;
  const found = (milestones ?? []).find((m) => m.title === title);
  if (!found && !milestoneRequired(version)) return { milestone: null, errors: [] };
  if (!found)
    return {
      milestone: null,
      errors: [`no milestone titled '${title}'. Create it and assign this release's issues to it.`],
    };
  const milestone = { number: found.number, url: found.html_url };
  if (found.open_issues !== 0) {
    return {
      milestone,
      errors: [`milestone '${title}' still has ${found.open_issues} open issue(s): ${found.html_url}`],
    };
  }
  return { milestone, errors: [] };
}

// Issue numbers referenced as #N in release notes, each once, in order of appearance.
// Skips headings, URL fragments (page#12), cross-repo refs (owner/repo#12) and HTML entities (&#38;).
export function issueRefs(text) {
  const seen = new Set();
  for (const [, n] of text.matchAll(/(?<![\w/&#])#(\d+)\b/g)) seen.add(Number(n));
  return [...seen];
}

// ---------- CLI ----------

const COMMANDS = ['prepare', 'check', 'notes', 'name', 'tag-absent', 'milestone', 'issues'];
const USAGE = `usage: node scripts/release.mjs <${COMMANDS.join('|')}> <version> --app <${Object.keys(APPS).join('|')}> [--date YYYY-MM-DD] [--root dir]`;

function main(args) {
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const [command, version] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  const root = option('--root') ? resolve(option('--root')) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const app = option('--app');
  if (!COMMANDS.includes(command) || !version || app === undefined) {
    console.error(USAGE);
    return 2;
  }
  try {
    const bad = appError(app) ?? versionError(version);
    if (bad) throw new Error(bad);
    if (command === 'prepare') {
      const { packages } = prepare(root, app, version, option('--date') ? { date: option('--date') } : {});
      console.log(`prepared ${app} ${version}: ${changelogFile(app)}${packages.map((p) => `, ${p}`).join('')}`);
      console.log(`review the diff, then commit: chore(${app}): prepare v${version}`);
      return 0;
    }
    if (command === 'notes') {
      console.log(notes(root, app, version));
      return 0;
    }
    if (command === 'name') {
      console.log(releaseName(app, version));
      return 0;
    }
    if (command === 'issues') {
      // Print strings: console.log colours numbers when FORCE_COLOR is set, even into a pipe.
      for (const n of issueRefs(notes(root, app, version))) console.log(String(n));
      return 0;
    }
    const tag = `${tagPrefix(app)}${version}`;
    if (command === 'tag-absent') {
      if (tagStatus(app, version, { cwd: root }) === 'exists') {
        console.error(`tag ${tag} already exists; that version is already released. Pick the next one.`);
        return 1;
      }
      console.log(`tag ${tag} does not exist yet`);
      return 0;
    }
    if (command === 'milestone') {
      const { milestone, errors } = milestoneCheck(JSON.parse(readFileSync(0, 'utf8') || 'null'), app, version);
      if (errors.length) {
        console.error(errors.join('\n'));
        return 1;
      }
      console.log(JSON.stringify(milestone));
      return 0;
    }
    const errors = check(root, app, version);
    if (errors.length) {
      console.error(
        `release check failed for ${app} ${JSON.stringify(version)}:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
      );
      return 1;
    }
    console.log(`release check OK for ${app} ${version}`);
    return 0;
  } catch (e) {
    console.error(`release ${command} failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
```

- [ ] **Step 4: Run them and see them pass.**

Run: `node --test scripts/release.test.mjs`
Expected: PASS, 58 tests. `node --test "scripts/*.test.mjs"` passes 93.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add scripts/release.mjs scripts/release.test.mjs
git commit -F - <<'EOF'
feat(repo): release helper works per app

Every release.mjs command takes --app rcl-core|rcl-producer and works on
that app's CHANGELOG.md, package.json files, tags and milestones. A new
name command prints the release's name, such as "Rollcall Core v0.1.0".

Refs #6

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: A changelog for each app

**Files:**
- Move: `CHANGELOG.md` → `rcl-producer/CHANGELOG.md`, then rewrite it
- Create: `rcl-core/CHANGELOG.md`
- Modify: `scripts/check-docs.mjs`, `AGENTS.md`, `rcl-core/AGENTS.md`, `rcl-producer/AGENTS.md`, `README.md`, `.github/pull_request_template.md`, `docs/guides/local-development.md`, `docs/guides/releasing.md`, `docs/wiki-guide.md`
- Test: `scripts/release.test.mjs`, `scripts/check-docs.test.mjs`

**Interfaces:**
- Consumes from Task 1: `APPS`, `parseChangelog`, `formatChangelog`, `isUnreleased` (all already exported).
- Produces:
  - `rcl-core/CHANGELOG.md` and `rcl-producer/CHANGELOG.md`, each with an `## [Unreleased]` section;
  - no root `CHANGELOG.md`;
  - the docs lint link-checks `AGENTS.md`, `CLAUDE.md`, `README.md` and `CHANGELOG.md` in every `rcl-*` folder.

- [ ] **Step 1: Move the changelog on its own, and commit.**

If the move and the rewrite share a commit, git pairs the old file with rcl-core's new changelog, because that one keeps more of its lines. A move on its own keeps `git log --follow rcl-producer/CHANGELOG.md` on OBS Producer's history.

```bash
git mv CHANGELOG.md rcl-producer/CHANGELOG.md
```

In the moved `rcl-producer/CHANGELOG.md`, the link to the guide is now one folder up:

Replace:

```markdown
All notable changes to Rollcall are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](docs/guides/releasing.md).
```
with:

```markdown
All notable changes to Rollcall are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](../docs/guides/releasing.md).
```


The links to it follow the file for now. Step 4 rewrites them.

In `README.md`:

Replace:

```markdown
- **[CHANGELOG](CHANGELOG.md)**: what changed in each release.
```
with:

```markdown
- **[CHANGELOG](rcl-producer/CHANGELOG.md)**: what changed in each release.
```


In `AGENTS.md`:

Replace:

```markdown
- User-visible changes have a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), ending with the issue number.
```
with:

```markdown
- User-visible changes have a line under `## [Unreleased]` in [CHANGELOG.md](rcl-producer/CHANGELOG.md), ending with the issue number.
```


In `docs/wiki-guide.md`:

Replace:

```markdown
| What changed in each release | [CHANGELOG.md](../CHANGELOG.md), under `Unreleased` until released |
```
with:

```markdown
| What changed in each release | [CHANGELOG.md](../rcl-producer/CHANGELOG.md), under `Unreleased` until released |
```


In `docs/guides/releasing.md`:

Replace:

```markdown
[`CHANGELOG.md`](../../CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-visible change adds a line under `## [Unreleased]` in the same commit or PR. Put it under the right heading (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) and end it with the issue number:
```
with:

```markdown
[`CHANGELOG.md`](../../rcl-producer/CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-visible change adds a line under `## [Unreleased]` in the same commit or PR. Put it under the right heading (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) and end it with the issue number:
```


Replace:

```markdown
- **In the repo:** the version's section in [`CHANGELOG.md`](../../CHANGELOG.md) lists each entry with its issue number.
```
with:

```markdown
- **In the repo:** the version's section in [`CHANGELOG.md`](../../rcl-producer/CHANGELOG.md) lists each entry with its issue number.
```


```bash
yarn check
git add -A CHANGELOG.md rcl-producer/CHANGELOG.md README.md AGENTS.md docs/wiki-guide.md docs/guides/releasing.md
git commit -F - <<'EOF'
chore(repo): move the changelog to rcl-producer

The move is a commit of its own, so git log --follow keeps OBS
Producer's history with rcl-producer's changelog. The links follow the
file. The next commit splits it.

Refs #6

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git show --stat -M HEAD   # shows CHANGELOG.md => rcl-producer/CHANGELOG.md
```

- [ ] **Step 2: Write the failing tests.**

In `scripts/release.test.mjs`:

Replace:

```js
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
```
with:

```js
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
```


Replace:

```js
  formatChangelog,
```
with:

```js
  formatChangelog,
  isUnreleased,
```


Replace:

```js

// --- patch releases: milestones only for x.y.0, issues tracked from the notes ---
```
with:

```js

// --- this repo's apps ---

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

test('every rcl-* folder in this repo is an app with its own changelog, and the root has none', () => {
  const folders = readdirSync(REPO, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('rcl-'))
    .map((e) => e.name)
    .toSorted();
  assert.deepEqual(folders, Object.keys(APPS).toSorted());
  for (const app of folders) {
    const log = parseChangelog(read(REPO, `${app}/CHANGELOG.md`));
    assert.ok(log.sections.some(isUnreleased), `${app}/CHANGELOG.md has no Unreleased section`);
  }
  assert.equal(existsSync(join(REPO, 'CHANGELOG.md')), false, 'each app keeps its own CHANGELOG.md');
});

test("each app's changelog survives being prepared: the parser gives back exactly what it read", () => {
  for (const app of Object.keys(APPS)) {
    const text = read(REPO, `${app}/CHANGELOG.md`);
    assert.equal(formatChangelog(parseChangelog(text)), text, app);
  }
});

test("rcl-producer's changelog keeps OBS Producer 0.1.0, linked to its release in GROBS", () => {
  const log = parseChangelog(read(REPO, 'rcl-producer/CHANGELOG.md'));
  assert.ok(log.sections.some((s) => s.name === '0.1.0' && s.date === '2026-10-02'));
  assert.ok(log.footer.includes('[0.1.0]: https://github.com/wardmanm/GROBS/releases/tag/obs-producer-v0.1.0'));
});

// --- patch releases: milestones only for x.y.0, issues tracked from the notes ---
```


In `scripts/check-docs.test.mjs`:

Replace:

```js
test('checks links in CHANGELOG.md but not its link reference definitions', () => {
  const changelog =
    '# Changelog\n\nSee the [guide](docs/nope.md).\n\n## [Unreleased]\n\n[Unreleased]: https://example.com\n';
  const errors = errorsFor({ 'CHANGELOG.md': changelog });
  assert.deepEqual(errors, ['CHANGELOG.md: broken link "docs/nope.md"']);
```
with:

```js
test("checks links in each rcl app's instruction files and changelog, but not the changelog's link references", () => {
  const changelog =
    '# Changelog\n\nSee the [guide](../docs/nope.md).\n\n## [Unreleased]\n\n[Unreleased]: https://example.com\n';
  const errors = errorsFor({
    'rcl-core/CHANGELOG.md': changelog,
    'rcl-core/AGENTS.md': '# rcl-core\n\nSee the [wiki](../docs/README.md) and [nothing](nope.md).\n',
    'rcl-producer/CLAUDE.md': '@AGENTS.md\n\n[nothing](../nope.md)\n',
    'rcl-producer/README.md': '# rcl-producer\n\n[nothing](docs/nope.md)\n',
    'packages/web-sdk/README.md': '[not an app, so not checked](nope.md)\n',
  });
  assert.deepEqual(
    errors.toSorted((a, b) => a.localeCompare(b)),
    [
      'rcl-core/AGENTS.md: broken link "nope.md"',
      'rcl-core/CHANGELOG.md: broken link "../docs/nope.md"',
      'rcl-producer/CLAUDE.md: broken link "../nope.md"',
      'rcl-producer/README.md: broken link "docs/nope.md"',
    ],
  );
```


- [ ] **Step 3: Run them and see them fail.**

Run: `node --test scripts/release.test.mjs scripts/check-docs.test.mjs`
Expected: FAIL, 3 tests.
- The two repo tests fail because `rcl-core/CHANGELOG.md` doesn't exist.
- The link test fails because the lint doesn't read the `rcl-*` folders yet.
- "rcl-producer's changelog keeps OBS Producer 0.1.0" already passes, since the move kept that section.

- [ ] **Step 4: Split the changelog, and teach the lint about app folders.**

In `scripts/check-docs.mjs`:

Replace:

```js
const ROOT_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'CHANGELOG.md']; // link-checked only
```
with:

```js
// Link-checked only: these files at the repo root, and APP_FILES in each rcl-* app folder.
const ROOT_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md'];
const APP_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'CHANGELOG.md'];
```


Replace:

```js
  return { abs, rel: toPosix(relative(root, abs)), text, ...parseFrontmatter(text) };
```
with:

```js
  return { abs, rel: toPosix(relative(root, abs)), text, ...parseFrontmatter(text) };
}

function appFiles(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('rcl-'))
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => APP_FILES.map((f) => join(root, e.name, f)));
```


Replace:

```js
  const rootFiles = ROOT_FILES.map((f) => join(root, f))
```
with:

```js
  const rootFiles = [...ROOT_FILES.map((f) => join(root, f)), ...appFiles(root)]
```


Replace `rcl-producer/CHANGELOG.md` with:

```markdown
# Changelog

All notable changes to rcl-producer, Rollcall's Producer app and its OBS overlay, are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](../docs/guides/releasing.md).

rcl-producer runs on rcl-core, Rollcall's server, which has [its own changelog](../rcl-core/CHANGELOG.md). Before Rollcall, the Producer app and its server were one app, OBS Producer, released as 0.1.0 below.

## [Unreleased]

### Added

- The Producer app at `/producer/`. For now it shows the address to add to OBS for the overlay (#4)
- The Producer app asks you to sign in first, on rcl-core's sign-in page, and brings you back afterwards (#11)

### Changed

- OBS Producer is now **Rollcall**, in its own repository, and this is its Producer app. Its server is now rcl-core: read rcl-core's release notes before upgrading, because settings and the database file are renamed (#2)
- The OBS overlay now uses its own public live connection. After upgrading, refresh each OBS browser source (right-click ▸ Refresh) so it picks up the change (wardmanm/GROBS#14)
- **The OBS overlay moved from `/overlay` to `/producer/overlay`, with no redirect:** change the URL of each OBS browser source (#4)
- The OBS overlay's live connection moved with the app. After upgrading, refresh each OBS browser source (right-click ▸ Refresh) (#5)

## [0.1.0] - 2026-10-02

### Added

- Project wiki: vision, roadmap, glossary, feature pages, architecture and decision records (wardmanm/GROBS#1)
- Agent instructions (`AGENTS.md` / `CLAUDE.md`) shared by AI coding agents and contributors (wardmanm/GROBS#2)
- Docs lint (`scripts/check-docs.mjs`) with CI (wardmanm/GROBS#1)
- Release pipeline: changelog, and a deliberate, approval-gated release workflow (wardmanm/GROBS#3)
- Issue forms (feature, bug, chore), PR template and labels (wardmanm/GROBS#4)
- Server with a health endpoint, and a web app shell that shows whether the server is reachable (wardmanm/GROBS#6, wardmanm/GROBS#8)
- OBS overlay page at `/overlay`: transparent, fed live by the server, and reconnects on its own after a server restart (wardmanm/GROBS#9)

[Unreleased]: https://github.com/wardmanm/rollcall_derby/commits/main
[0.1.0]: https://github.com/wardmanm/GROBS/releases/tag/obs-producer-v0.1.0
```

Create `rcl-core/CHANGELOG.md`:

```markdown
# Changelog

All notable changes to rcl-core, Rollcall's server and admin app, are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](../docs/guides/releasing.md).

rcl-core hosts the other rcl apps, which have their own changelogs, such as [rcl-producer's](../rcl-producer/CHANGELOG.md). Before Rollcall, rcl-core's server and the Producer app were one app, OBS Producer, whose 0.1.0 release is in rcl-producer's changelog.

## [Unreleased]

### Added

- Accounts on the server: first-run Admin setup from the server machine, sign-in with 30-day sessions, sign-out and password changes (wardmanm/GROBS#13)
- Admins can create users, change roles, reset passwords and sign users out. Every API route and live connection checks who's asking, and a reset-password command rescues a locked-out Admin (wardmanm/GROBS#14)
- API explorer for developers: Swagger UI at `/docs`, generated from the shared schemas. It's on in `yarn dev`, and on a venue server only with `ROLLCALL_API_DOCS=1` (wardmanm/GROBS#16)
- The API explorer shows who may call each route: anyone, any signed-in user, or the permission it needs, such as `core:users.manage` (#3)
- The server lists the apps it hosts at `/api/core/apps`, for signed-in users (#5)
- Sign-in, first-run setup and password changes in the web app. Every app asks you to sign in first, and someone given a temporary password chooses their own before anything else (#11)
- A Users page for Admins: create users (each temporary password is shown once), change roles, reset passwords, sign users out and delete accounts (#11)
- rcl-core's home page lists the other installed apps (#11)
- API keys for devices and scripts such as Bitfocus Companion. On the API keys page, Admins create keys scoped to permissions, with an optional expiry, and revoke them. A key is shown once, and never holds account-admin permissions (#7)

### Changed

- OBS Producer is now **Rollcall**, in its own repository. Settings are renamed from `OBS_PRODUCER_*` to `ROLLCALL_*`; the server refuses to start while an old name is still set, so update any launch scripts. Sign in again after upgrading, because the session cookie is renamed (#2)
- The database file is now `rollcall.db`. Rollcall is a new clone, so copy your old `obs-producer/data/` folder into the new clone's `data/` first; the server refuses to start while the data folder holds only the old `obs-producer.db`, and explains how to keep your accounts. `reset-password` refuses a folder with no database and prints the path it checked (#2)
- Access is checked by permission instead of by role. Admins hold every permission, so who can do what is unchanged (#3)
- The admin app is now at `/core/`, and `/` takes you there (#4)
- rcl-core now hosts each app as a module, so every API address starts with its app: `/api/health` is now `/api/core/health`, `/api/auth/login` is `/api/core/auth/login`, and so on (#5)
- The server explains a rejected form in plain words, such as "Use at least 10 characters" (#11)

### Fixed

- The header's server badge has enough contrast to read (wardmanm/GROBS#17)
- An Admin who is demoted, deleted or signed out while creating a user or resetting a password no longer completes the change, and a password change made after an Admin's reset no longer overwrites it (#8)
- The first failed sign-in after the server starts takes as long as later ones, so it doesn't reveal whether the username exists (#8)
- Logging out works even after the session has ended, and always clears the cookie (#11)

[Unreleased]: https://github.com/wardmanm/rollcall_derby/commits/main
```

Now point the docs at each app's changelog:

In `AGENTS.md`:

Replace:

```markdown
├── CHANGELOG.md       release notes; add a line under Unreleased for user-visible changes
├── scripts/           check-docs.mjs (docs lint), release.mjs (release helper) + tests
├── rcl-core/          the host app: server, admin web app and contract (see rcl-core/AGENTS.md)
├── rcl-producer/      the Producer app: its server module, contract, web app and the OBS overlay (see rcl-producer/AGENTS.md)
```
with:

```markdown
├── scripts/           check-docs.mjs (docs lint), release.mjs (release helper) + tests
├── rcl-core/          the host app: server, admin web app, contract and CHANGELOG.md (see rcl-core/AGENTS.md)
├── rcl-producer/      the Producer app: its server module, contract, web app, the OBS overlay and CHANGELOG.md (see rcl-producer/AGENTS.md)
```


Replace:

```markdown
- User-visible changes have a line under `## [Unreleased]` in [CHANGELOG.md](rcl-producer/CHANGELOG.md), ending with the issue number.
```
with:

```markdown
- User-visible changes have a line under `## [Unreleased]` in the changelog of each app they change, [rcl-core's](rcl-core/CHANGELOG.md) or [rcl-producer's](rcl-producer/CHANGELOG.md), ending with the issue number.
```


In `rcl-core/AGENTS.md`:

Replace:

```markdown
└── contract/   @rollcall/core-contract: Zod schemas and types for /api/core, used as TypeScript source (no build step)
```
with:

```markdown
├── contract/   @rollcall/core-contract: Zod schemas and types for /api/core, used as TypeScript source (no build step)
└── CHANGELOG.md  rcl-core's release notes: add a line under Unreleased for each user-visible change
```


In `rcl-producer/AGENTS.md`:

Replace:

```markdown
└── web/       @rollcall/producer-web: the Producer app at /producer/ (Mantine), and the OBS overlay at /producer/overlay (no Mantine)
```
with:

```markdown
├── web/       @rollcall/producer-web: the Producer app at /producer/ (Mantine), and the OBS overlay at /producer/overlay (no Mantine)
└── CHANGELOG.md  rcl-producer's release notes: add a line under Unreleased for each user-visible change
```


In `README.md`:

Replace:

```markdown
- **[CHANGELOG](rcl-producer/CHANGELOG.md)**: what changed in each release.
```
with:

```markdown
- **Changelogs**: what changed in each release of [rcl-core](rcl-core/CHANGELOG.md) and [rcl-producer](rcl-producer/CHANGELOG.md).
```


In `.github/pull_request_template.md`:

Replace:

```markdown
- [ ] `CHANGELOG.md` has a line under `Unreleased` for each user-visible change
```
with:

```markdown
- [ ] The changelog of each app this changes (`rcl-core/CHANGELOG.md`, `rcl-producer/CHANGELOG.md`) has a line under `Unreleased` for each user-visible change
```


In `docs/guides/local-development.md`:

Replace:

```markdown
3. Update the wiki and `CHANGELOG.md` in the same change. See the [wiki guide](../wiki-guide.md) and [AGENTS.md](../../AGENTS.md#definition-of-done).
```
with:

```markdown
3. Update the wiki and the changelog of each app you changed (`rcl-core/CHANGELOG.md`, `rcl-producer/CHANGELOG.md`) in the same change. See the [wiki guide](../wiki-guide.md) and [AGENTS.md](../../AGENTS.md#definition-of-done).
```


In `docs/wiki-guide.md`:

Replace:

```markdown
| What changed in each release | [CHANGELOG.md](../rcl-producer/CHANGELOG.md), under `Unreleased` until released |
```
with:

```markdown
| What changed in each release | Each app's changelog, [rcl-core's](../rcl-core/CHANGELOG.md) and [rcl-producer's](../rcl-producer/CHANGELOG.md), under `Unreleased` until released |
```


Replace:

```markdown
2. **Links.** Every relative link and `#anchor` in the wiki and in `AGENTS.md`, `CLAUDE.md`, `README.md` and `CHANGELOG.md` resolves.
```
with:

```markdown
2. **Links.** Every relative link and `#anchor` resolves: in the wiki, in the root `AGENTS.md`, `CLAUDE.md` and `README.md`, and in each `rcl-*` app's `AGENTS.md`, `CLAUDE.md`, `README.md` and `CHANGELOG.md`.
```


In `docs/guides/releasing.md`:

Replace:

```markdown
[`CHANGELOG.md`](../../rcl-producer/CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-visible change adds a line under `## [Unreleased]` in the same commit or PR. Put it under the right heading (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) and end it with the issue number:
```
with:

```markdown
Each rcl app keeps its own changelog, [`rcl-core/CHANGELOG.md`](../../rcl-core/CHANGELOG.md) and [`rcl-producer/CHANGELOG.md`](../../rcl-producer/CHANGELOG.md), following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every user-visible change adds a line under `## [Unreleased]` in the changelog of each app it changes, in the same commit or PR. A change to both apps gets a line in each, written for that app's users. Put it under the right heading (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) and end it with the issue number:
```


Replace:

```markdown
- **In the repo:** the version's section in [`CHANGELOG.md`](../../rcl-producer/CHANGELOG.md) lists each entry with its issue number.
```
with:

```markdown
- **In the repo:** the version's section in the app's changelog lists each entry with its issue number.
```


- [ ] **Step 5: Run them and see them pass.**

Run: `node --test "scripts/*.test.mjs" && node scripts/check-docs.mjs`
Expected: PASS, 96 tests, then `check-docs: OK`.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add scripts rcl-core/CHANGELOG.md rcl-producer/CHANGELOG.md AGENTS.md rcl-core/AGENTS.md rcl-producer/AGENTS.md README.md .github/pull_request_template.md docs/guides/local-development.md docs/guides/releasing.md docs/wiki-guide.md
git commit -F - <<'EOF'
feat(repo): a changelog for each rcl app

rcl-producer keeps OBS Producer's changelog and its 0.1.0 release, and
rcl-core starts its own. Each Unreleased entry goes to the app whose
users see it; entries about both apps are split. The docs lint now
checks links in each rcl-* folder's AGENTS, CLAUDE, README and CHANGELOG
files.

Refs #6

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Release workflows per app, and ADR-0021

**Files:**
- Modify: `.github/workflows/release.yml` (it becomes reusable)
- Create: `.github/workflows/rcl-core-release.yml`, `.github/workflows/rcl-producer-release.yml`, `docs/decisions/0021-per-app-releases.md`
- Modify: `docs/decisions/0010-deliberate-releases-patch-tracking.md`, `docs/decisions/README.md` (generated), `docs/guides/releasing.md`, `.claude/skills/release/SKILL.md`, `AGENTS.md`, `CLAUDE.md`
- Test: `scripts/release-workflows.test.mjs`

**Interfaces:**
- Consumes from Task 1:
  - `APPS`, `tagPrefix(app)`, `milestonePrefix(app)`;
  - the CLI's `--app` on every command, and `name`.
- Produces:
  - `release.yml`, called with inputs `app` (string), `version` (string) and `dry_run` (boolean);
  - workflows named **rcl-core release** and **rcl-producer release**, which start it by hand, as a dry run unless unticked;
  - ADR-0021, which ADR-0010's `superseded_by` and AGENTS.md's hard rule 7 link to.

- [ ] **Step 1: Write the failing test.**

Create `scripts/release-workflows.test.mjs`:

```js
// Keeps the release workflows in step with release.mjs (ADR-0021). Run: node --test "scripts/*.test.mjs"
// The workflows are read as text: these scripts have no dependencies, so there's no YAML parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS, tagPrefix, milestonePrefix } from './release.mjs';

const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');
const read = (name) => readFileSync(join(WORKFLOWS, name), 'utf8');
const SHARED = read('release.yml');

// The text of a top-level block such as `on:` or `env:`, up to the next top-level key.
const block = (text, key) => new RegExp(`^${key}:\\n((?:[ #].*\\n|\\n)*)`, 'm').exec(text)?.[1] ?? '';

test('each app has a release workflow that calls the shared one with its name, and no other app does', () => {
  const callers = readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith('-release.yml'))
    .toSorted((a, b) => a.localeCompare(b));
  assert.deepEqual(
    callers,
    Object.keys(APPS).map((app) => `${app}-release.yml`),
  );
  for (const app of Object.keys(APPS)) {
    const text = read(`${app}-release.yml`);
    assert.match(text, new RegExp(`^name: ${app} release$`, 'm'), app);
    assert.match(text, /^ {4}uses: \.\/\.github\/workflows\/release\.yml$/m, app);
    assert.match(text, new RegExp(`^ {6}app: ${app}$`, 'm'), app);
    assert.match(text, new RegExp(`^ {2}group: ${app}-release$`, 'm'), app);
  }
});

test('a release is started by hand and is a dry run unless you say otherwise', () => {
  for (const app of Object.keys(APPS)) {
    const on = block(read(`${app}-release.yml`), 'on');
    assert.match(on, /^ {2}workflow_dispatch:$/m, app);
    assert.doesNotMatch(on, /^ {2}(push|pull_request|schedule|workflow_run|release):/m, app);
    assert.match(on, /dry_run:\n(?: {8}.*\n)*? {8}default: true\n/, app);
  }
});

test('the shared workflow can only be called, never started on its own', () => {
  const on = block(SHARED, 'on');
  assert.match(on, /^ {2}workflow_call:$/m);
  assert.doesNotMatch(on, /^ {2}(?!workflow_call:)\S/m);
});

test('the shared workflow names tags and milestones the way release.mjs does', () => {
  const env = block(SHARED, 'env');
  const app = '${{ inputs.app }}';
  const version = '${{ inputs.version }}';
  assert.ok(env.includes(`  TAG: ${tagPrefix(app)}${version}\n`), env);
  assert.ok(env.includes(`  MILESTONE: ${milestonePrefix(app)}${version}\n`), env);
});

test('every release.mjs command in the shared workflow names the app', () => {
  const calls = SHARED.match(/node scripts\/release\.mjs [^\n)]*/g);
  assert.ok(calls.length >= 8, `found only ${calls.length} calls`);
  for (const call of calls) assert.match(call, / --app "\$APP"/, call);
});

test('publishing waits for approval in the release environment, after every check CI runs', () => {
  assert.match(SHARED, /^ {2}publish:\n(?: {4}.*\n)*? {4}environment: release\n/m);
  for (const command of ['yarn check', 'yarn build', 'yarn test:stories', 'yarn test:e2e']) {
    assert.match(SHARED, new RegExp(`^ {8}run: ${command}$`, 'm'), command);
  }
});

test('no release workflow still names OBS Producer', () => {
  for (const name of ['release.yml', ...Object.keys(APPS).map((app) => `${app}-release.yml`)]) {
    assert.doesNotMatch(read(name), /obs-producer|OBS Producer/i, name);
  }
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node --test scripts/release-workflows.test.mjs`
Expected: FAIL, all 7 tests. There's no `rcl-*-release.yml` yet, and `release.yml` is still the dispatchable "obs-producer release" with no `--app`.

- [ ] **Step 3: Write the workflows.**

The shared workflow keeps every check and step. It changes in four ways:
- it can only be called;
- it takes the app as an input, and passes `--app "$APP"` to every `release.mjs` command;
- it builds the tag, milestone and release names from the app;
- its checks before approval add the story tests.

Replace `.github/workflows/release.yml` with:

```yaml
# Cuts a release of one rcl app. Each app starts it from its own workflow, rcl-core-release.yml or
# rcl-producer-release.yml, which calls this one with the app's name (ADR-0021). Deliberate by design:
# manual start only, dry run by default, and publishing waits for approval in the protected "release"
# environment. Only callers in this repo can use it, and it can't be started on its own.
# Guide: docs/guides/releasing.md
name: release

on:
  workflow_call:
    inputs:
      app:
        description: 'The rcl app to release: rcl-core or rcl-producer'
        required: true
        type: string
      version:
        description: 'Version to release, without a leading v (e.g. 0.2.0 or 0.3.0-beta.1)'
        required: true
        type: string
      dry_run:
        description: 'Dry run: run every check, publish nothing'
        required: true
        type: boolean

permissions: {}

# Names as scripts/release.mjs builds them: tag rcl-core-v0.1.0, milestone 'rcl-core v0.1.0'.
env:
  APP: ${{ inputs.app }}
  VERSION: ${{ inputs.version }}
  TAG: ${{ inputs.app }}-v${{ inputs.version }}
  MILESTONE: ${{ inputs.app }} v${{ inputs.version }}

jobs:
  preflight:
    name: Preflight checks
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: read
    outputs:
      sha: ${{ steps.commit.outputs.sha }}
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - name: Must run on main
        if: github.ref != 'refs/heads/main'
        run: |
          echo "::error::Releases are cut from main only. Choose main in the branch dropdown."
          exit 1

      - name: Validate the version format
        run: |
          if [[ ! "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$ ]]; then
            echo "::error::Invalid version input. Use semver without a leading v, e.g. 0.2.0 or 0.3.0-beta.1."
            exit 1
          fi

      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - name: Record the commit being released
        id: commit
        run: echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"

      - name: Tag must not exist yet
        run: node scripts/release.mjs tag-absent "$VERSION" --app "$APP"

      - name: The app's CHANGELOG and package versions are ready
        run: node scripts/release.mjs check "$VERSION" --app "$APP"

      - name: Milestone is ready (required for x.y.0 releases)
        run: |
          gh api --paginate "repos/${GITHUB_REPOSITORY}/milestones?state=all&per_page=100" \
            | jq -s 'add' \
            | node scripts/release.mjs milestone "$VERSION" --app "$APP"

      # The app itself must pass everything CI checks before anyone is asked to approve it.
      - name: Enable Corepack (Yarn 4 from packageManager)
        run: corepack enable

      - name: Install dependencies
        run: yarn install --immutable

      - name: App checks (types, lint, formatting, unit tests, script tests, docs lint)
        run: yarn check

      - name: Build
        run: yarn build

      - name: Install Playwright's Chromium
        run: yarn workspace @rollcall/e2e playwright install --with-deps chromium

      - name: Story tests
        run: yarn test:stories

      - name: End-to-end tests
        run: yarn test:e2e

      - name: Show the release notes
        run: |
          {
            echo "## Release notes for ${TAG}"
            echo
            node scripts/release.mjs notes "$VERSION" --app "$APP"
            echo
            if [ "${{ inputs.dry_run }}" = "true" ]; then
              echo "> **Dry run:** every check passed. Nothing was published."
            else
              echo "> Checks passed. **Publish** is waiting for approval in the \`release\` environment."
            fi
          } >> "$GITHUB_STEP_SUMMARY"

  publish:
    name: Publish (needs approval)
    needs: preflight
    if: ${{ !inputs.dry_run }}
    runs-on: ubuntu-latest
    environment: release
    permissions:
      contents: write
      issues: write
    env:
      SHA: ${{ needs.preflight.outputs.sha }}
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ needs.preflight.outputs.sha }}

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      # Approval can come long after preflight: check again right before anything permanent happens.
      - name: Re-check the tag and milestone after approval
        run: |
          node scripts/release.mjs tag-absent "$VERSION" --app "$APP"
          milestone=$(gh api --paginate "repos/${GITHUB_REPOSITORY}/milestones?state=all&per_page=100" \
            | jq -s 'add' \
            | node scripts/release.mjs milestone "$VERSION" --app "$APP")
          # Patch and pre-releases may have no milestone; then the milestone env stays unset.
          if [ "$milestone" != "null" ]; then
            echo "MILESTONE_NUMBER=$(jq -r '.number' <<< "$milestone")" >> "$GITHUB_ENV"
            echo "MILESTONE_URL=$(jq -r '.url' <<< "$milestone")" >> "$GITHUB_ENV"
          fi

      - name: Build the release notes
        run: |
          : > "$RUNNER_TEMP/milestone-issues.txt"
          {
            node scripts/release.mjs notes "$VERSION" --app "$APP"
            if [ -n "${MILESTONE_NUMBER:-}" ]; then
              gh api --paginate "repos/${GITHUB_REPOSITORY}/issues?milestone=${MILESTONE_NUMBER}&state=closed&per_page=100" \
                | jq -s '[add // [] | .[] | select(.pull_request | not)]' > "$RUNNER_TEMP/milestone-issues.json"
              jq -r '.[].number' "$RUNNER_TEMP/milestone-issues.json" > "$RUNNER_TEMP/milestone-issues.txt"
              echo
              echo "---"
              echo
              echo "**Milestone:** [${MILESTONE}](${MILESTONE_URL})"
              echo
              echo "**Closed issues:**"
              echo
              jq -r '.[] | "- #\(.number) \(.title)"' "$RUNNER_TEMP/milestone-issues.json"
            fi
          } > "$RUNNER_TEMP/notes.md"

      - name: Name the release
        run: echo "RELEASE_NAME=$(node scripts/release.mjs name "$VERSION" --app "$APP")" >> "$GITHUB_ENV"

      - name: Create the GitHub release
        run: |
          flags=()
          if [[ "$VERSION" == *-* ]]; then flags+=(--prerelease); fi
          gh release create "$TAG" \
            --target "$SHA" \
            --title "$RELEASE_NAME" \
            --notes-file "$RUNNER_TEMP/notes.md" \
            "${flags[@]}"

      - name: Close the milestone
        if: env.MILESTONE_NUMBER != ''
        run: gh api -X PATCH "repos/${GITHUB_REPOSITORY}/milestones/${MILESTONE_NUMBER}" -f state=closed

      # Record on each issue where it shipped. Best effort: the release already exists at this point,
      # so a missing or unexpected issue number is a warning, not a failure.
      - name: Mark issues as released
        run: |
          url=$(gh release view "$TAG" --json url --jq .url)
          { node scripts/release.mjs issues "$VERSION" --app "$APP"; cat "$RUNNER_TEMP/milestone-issues.txt"; } | sort -un |
            while read -r n; do
              gh issue comment "$n" --body "Released in ${RELEASE_NAME}: ${url}" \
                || echo "::warning::Could not comment on #${n}"
              gh issue edit "$n" --remove-label patch > /dev/null 2>&1 || true
            done
```

Create `.github/workflows/rcl-core-release.yml`:

```yaml
# Cuts an rcl-core release: the shared release workflow, release.yml, run for rcl-core (ADR-0021).
# Start it from the Actions tab on main. It's a dry run unless you untick "Dry run".
# Guide: docs/guides/releasing.md
name: rcl-core release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release, without a leading v (e.g. 0.2.0 or 0.3.0-beta.1)'
        required: true
        type: string
      dry_run:
        description: 'Dry run: run every check, publish nothing'
        required: true
        type: boolean
        default: true

# One rcl-core release at a time; a run waiting for approval holds the next one back.
concurrency:
  group: rcl-core-release
  cancel-in-progress: false

permissions: {}

jobs:
  release:
    uses: ./.github/workflows/release.yml
    # The most the release may do; its preflight job asks for less.
    permissions:
      contents: write
      issues: write
    with:
      app: rcl-core
      version: ${{ inputs.version }}
      dry_run: ${{ inputs.dry_run }}
```

Create `.github/workflows/rcl-producer-release.yml`:

```yaml
# Cuts an rcl-producer release: the shared release workflow, release.yml, run for rcl-producer (ADR-0021).
# Start it from the Actions tab on main. It's a dry run unless you untick "Dry run".
# Guide: docs/guides/releasing.md
name: rcl-producer release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release, without a leading v (e.g. 0.2.0 or 0.3.0-beta.1)'
        required: true
        type: string
      dry_run:
        description: 'Dry run: run every check, publish nothing'
        required: true
        type: boolean
        default: true

# One rcl-producer release at a time; a run waiting for approval holds the next one back.
concurrency:
  group: rcl-producer-release
  cancel-in-progress: false

permissions: {}

jobs:
  release:
    uses: ./.github/workflows/release.yml
    # The most the release may do; its preflight job asks for less.
    permissions:
      contents: write
      issues: write
    with:
      app: rcl-producer
      version: ${{ inputs.version }}
      dry_run: ${{ inputs.dry_run }}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `node --test scripts/release-workflows.test.mjs`
Expected: PASS, 7 tests.

If actionlint is installed, `actionlint .github/workflows/*.yml` should report nothing; the prototype passed actionlint 1.7.12. It's optional: the repo doesn't install it.

- [ ] **Step 5: Record the decision, and update the process docs.**

Create `docs/decisions/0021-per-app-releases.md`:

```markdown
---
title: Each rcl app is released on its own
status: accepted
date: 2026-10-16
---
# 0021. Each rcl app is released on its own

Supersedes [ADR-0010](0010-deliberate-releases-patch-tracking.md).

## Context

Rollcall is a suite of rcl apps in one repository ([ADR-0016](0016-obs-producer-becomes-rollcall.md)). rcl-core is the server, and it hosts each app as a module ([ADR-0019](0019-rcl-apps-as-modules.md)). ADR-0010's release process was built for one app, OBS Producer. It used one changelog, one tag prefix (`obs-producer-v`), one milestone prefix and one release workflow. ADR-0016 held off cutting releases until this decision.

rcl-core and rcl-producer change at different speeds. A fix to the overlay shouldn't force a new rcl-core version, and the other way round. Each app already declares which rcl-core versions it works with (`rollcall.requiresCore`, ADR-0019).

Options considered:
- **One version for the whole suite.** Rejected: every release would bump every app, and its notes would mix changes for different people.
- **A repository per app.** Rejected: the apps share packages, end-to-end tests and the wiki, and they're built and tested together.
- **A separate release workflow per app.** Rejected: two copies of the same checks would drift apart.

ADR-0010's other decisions stand. They're restated below so this ADR is complete on its own.

## Decision

- **Each rcl app is released on its own.** The apps are `rcl-core` and `rcl-producer`. Each has its own versions, release notes and tags. Shared code (`packages/`), the end-to-end tests and the repository root aren't released, so their package versions don't change.
- **Names**, for app `<app>` and version `<semver>`:
  - release notes: `<app>/CHANGELOG.md`;
  - versions: every `<app>/*/package.json`;
  - tag: `<app>-v<semver>`, e.g. `rcl-core-v0.1.0`;
  - milestone: `<app> v<semver>`, e.g. `rcl-core v0.1.0`;
  - release: "Rollcall Core v`<semver>`" or "Rollcall Producer v`<semver>`".
- **One release workflow, started per app.** `release.yml` holds every check and step and can only be called. `rcl-core-release.yml` and `rcl-producer-release.yml` are the only ways to start it, each with its own app. `scripts/release.mjs` takes `--app` on every command.
- **The checks before approval** are everything CI runs: `yarn check`, the production build, the story tests and the end-to-end tests. They run on the whole repository whichever app is released, because the apps run in one server.
- **rcl-producer keeps OBS Producer's history.** Its changelog continues from OBS Producer 0.1.0, so its next release is 0.2.0. rcl-core's first release is 0.1.0. A release of rcl-core can fall outside another app's `requiresCore` range: whoever prepares it decides whether that app still works, and widens the range before the release (ADR-0019).
- **Milestones are for planned releases only.**
  - Minor and major releases (`x.y.0`) get a milestone, and can only be released once it has no open issues.
  - Patch releases and pre-releases don't need a milestone. If one exists with the exact title anyway, the same check applies.
- **One `patch` label** marks issues that should ship in the next patch release of their app.
- **Where each issue shipped is recorded automatically.** Changelog entries end with their issue number, e.g. `(#12)`. A change to both apps gets an entry in each changelog. When a release is published, the workflow:
  - comments `Released in <release name>: <release URL>` on every issue referenced in that version's notes, and on the milestone's closed issues;
  - removes the `patch` label from those issues.
- **Release notes come from the app's changelog** ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)). Each user-visible change adds a line under `Unreleased` in the same change.
- **Releasing takes two steps, each done by a person:**
  1. **Prepare.** A commit moves the app's `Unreleased` notes under the new version and bumps the app's package versions. Use `node scripts/release.mjs prepare <version> --app <app>` or the user-only `/release` skill.
  2. **Publish.** Start the app's release workflow, such as **rcl-core release**.
     - Its only trigger is `workflow_dispatch`, and it's a dry run by default.
     - It checks the branch, version, tag, changelog, milestone (for `x.y.0`), docs lint and tests.
     - It then waits for approval in the protected `release` environment.
     - After approval it checks the tag and milestone again, creates the app's tag on the checked commit, and publishes the GitHub Release. The notes are the changelog notes plus, for milestone releases, a milestone link and the closed issues.
     - Finally it closes the milestone and marks the issues as released.
- **Release tags are permanent.** A tag ruleset blocks moving or deleting `*-v*` tags, and GitHub immutable releases is on, so a published version's tag can never be reused. Mistakes are fixed forward with a new patch release.
- **SemVer, `0.x` until an app is ready for general use.** A pre-release suffix (`-beta.1`) publishes a GitHub pre-release.

**Hard rule:** **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never approve a release deployment, and never create release tags or GitHub Releases or start the release workflow (even as a dry run) unless the user explicitly asks them to for a specific version.

## Consequences

- Nothing ships by accident. Every release still takes at least three human actions: the prepare commit, turning off dry run and starting the workflow, and approving.
- Each release's notes are written for that app's users. A change to both apps needs a line in both changelogs.
- An issue that both apps' notes reference gets a "Released in" comment from each release.
- Searching `"Released in Rollcall Core v0.1.0" in:comments` finds everything in a release.
- A new rcl app needs an entry in `APPS` in `scripts/release.mjs`, its own `CHANGELOG.md` and its own `<app>-release.yml`. Script tests fail until all three exist.
- The repository goes public before the first release. On Mike's GitHub plan, the `release` environment's required reviewer only works on a public repository.
- The publish job has no build artifacts yet. Build and packaging steps get added to it once the apps are ready for general use.
```

In `docs/decisions/0010-deliberate-releases-patch-tracking.md`:

Replace:

```markdown
status: accepted
date: 2026-09-29
---
# 0010. Deliberate releases, milestones for planned versions only
```
with:

```markdown
status: superseded
date: 2026-09-29
superseded_by: "0021"
---
# 0010. Deliberate releases, milestones for planned versions only

> **Superseded by [ADR-0021](0021-per-app-releases.md):** each rcl app is released on its own, with its own changelog, tags (`rcl-core-v<semver>`), milestones and release workflow. The rest of this process, and hard rule 7, are unchanged.
```


Run `node scripts/check-docs.mjs --fix`. It regenerates the decisions table in `docs/decisions/README.md`: 0010 becomes "superseded by 0021", and 0021 is added.

In `docs/guides/releasing.md`:

Replace:

```markdown
How Rollcall work is tracked on GitHub, and how a release is cut. Releases are **always deliberate**: nothing is released by a push, a merge, or an agent acting on its own ([ADR-0010](../decisions/0010-deliberate-releases-patch-tracking.md)).
```
with:

```markdown
How Rollcall work is tracked on GitHub, and how a release is cut. Each rcl app, rcl-core and rcl-producer, is released on its own, with its own versions, release notes and tags. Releases are **always deliberate**: nothing is released by a push, a merge, or an agent acting on its own ([ADR-0021](../decisions/0021-per-app-releases.md)).
```


Replace:

```markdown
- **Milestones are for planned releases: minor and major versions (`x.y.0`).** Title each one exactly **`obs-producer v<version>`**, e.g. `obs-producer v0.2.0`. The release workflow finds the milestone by this title and requires it for `x.y.0` releases.
```
with:

```markdown
- **Milestones are for planned releases: minor and major versions (`x.y.0`).** Title each one exactly **`<app> v<version>`**, e.g. `rcl-core v0.2.0` or `rcl-producer v0.3.0`. The release workflow finds the milestone by this title and requires it for `x.y.0` releases.
```


Replace:

```markdown
- **Tags:** named `obs-producer-v<version>`. Only the release workflow creates them.
```
with:

```markdown
- **Each app has its own versions.** rcl-producer continues from OBS Producer 0.1.0, so its next release is 0.2.0. rcl-core's first release is 0.1.0.
- **Tags:** named `<app>-v<version>`, e.g. `rcl-core-v0.2.0`. Only the release workflow creates them.
```


Replace:

```markdown
- **On the issue:** the publish job comments `Released in OBS Producer v<version>: <link>`.
- **Everything in one release:** search issues for `"Released in OBS Producer v0.1.1" in:comments`.
```
with:

```markdown
- **On the issue:** the publish job comments `Released in Rollcall Core v<version>: <link>`, or `Rollcall Producer`. An issue in both apps' notes gets a comment from each release.
- **Everything in one release:** search issues for `"Released in Rollcall Core v0.1.1" in:comments`.
```


Replace:

````markdown
Either run `/release <version>` in Claude Code, which walks through this for you, or do it by hand on a branch:

```bash
node scripts/release.mjs prepare 0.2.0   # Unreleased → [0.2.0] - today; bumps package.json versions
node scripts/release.mjs check 0.2.0     # confirms the changelog and versions are ready
git diff                                 # read the notes the way users will
git commit -am "chore(obs-producer): prepare v0.2.0"
```

If the new version is outside an app's `rollcall.requiresCore` range in `rcl-*/server/package.json` (before 1.0, any new minor version such as 0.2.0), decide whether that app works with it and widen the range before you commit ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)). Until you do, `yarn check` fails in `rcl-core/server/src/installed-apps.test.ts`.
````
with:

````markdown
Either run `/release <app> <version>` in Claude Code, which walks through this for you, or do it by hand on a branch. For rcl-core 0.2.0:

```bash
node scripts/release.mjs prepare 0.2.0 --app rcl-core   # Unreleased → [0.2.0] - today; bumps rcl-core/*/package.json
node scripts/release.mjs check 0.2.0 --app rcl-core     # confirms the changelog and versions are ready
git diff                                                # read the notes the way users will
git commit -am "chore(rcl-core): prepare v0.2.0"
```

When you release rcl-core, check each other app's `rollcall.requiresCore` range in `rcl-*/server/package.json`. If the new version is outside it (before 1.0, any new minor version such as 0.2.0), decide whether that app works with it and widen the range before you commit ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)). Until you do, `yarn check` fails in `rcl-core/server/src/installed-apps.test.ts`.
````


Replace:

```markdown
In GitHub, go to **Actions** ▸ **obs-producer release** ▸ **Run workflow**. Choose branch `main`, version `0.2.0`, and leave **Dry run** ticked (the default). The run checks:
```
with:

```markdown
In GitHub, go to **Actions** ▸ **rcl-core release** (or **rcl-producer release**) ▸ **Run workflow**. Choose branch `main`, version `0.2.0`, and leave **Dry run** ticked (the default). Both run the same checks, in `release.yml`:
```


Replace:

```markdown
| Tag `obs-producer-v0.2.0` doesn't exist yet | That version is out already. Use the next one |
| CHANGELOG has a dated `[0.2.0]` section with entries, `Unreleased` is empty, and package versions match | Do step 1 |
| Milestone `obs-producer v0.2.0` exists with no open issues (required for `x.y.0`; enforced for other versions only if it exists) | Create it, or finish or move its open issues |
| `yarn check`, the production build and the Playwright tests pass | Run the same commands locally and fix what they report |
```
with:

```markdown
| Tag `rcl-core-v0.2.0` doesn't exist yet | That version is out already. Use the next one |
| `rcl-core/CHANGELOG.md` has a dated `[0.2.0]` section with entries, `Unreleased` is empty, and every `rcl-core/*/package.json` version matches | Do step 1 |
| Milestone `rcl-core v0.2.0` exists with no open issues (required for `x.y.0`; enforced for other versions only if it exists) | Create it, or finish or move its open issues |
| `yarn check`, the production build, the story tests and the Playwright tests pass, for the whole repository | Run the same commands locally and fix what they report |
```


Replace:

```markdown
2. creates the GitHub release `obs-producer-v0.2.0`, tagged on the exact commit that was checked. The notes are the changelog notes, plus a milestone link and the list of closed issues when the release has a milestone;
3. closes the milestone, if there is one;
4. comments `Released in OBS Producer v0.2.0: <link>` on each issue referenced in the notes, and removes their `patch` label.
```
with:

```markdown
2. creates the GitHub release "Rollcall Core v0.2.0" with tag `rcl-core-v0.2.0`, on the exact commit that was checked. The notes are the changelog notes, plus a milestone link and the list of closed issues when the release has a milestone;
3. closes the milestone, if there is one;
4. comments `Released in Rollcall Core v0.2.0: <link>` on each issue referenced in the notes, and removes their `patch` label.
```


Replace:

```markdown
If something stops working, check that these are still in place:
```
with:

```markdown
If something stops working, check that these are still in place:
- **Workflows:** `rcl-core-release.yml` and `rcl-producer-release.yml` each call `release.yml` with their app. A script test (`scripts/release-workflows.test.mjs`) keeps them in step with `scripts/release.mjs`.
```


Replace `.claude/skills/release/SKILL.md` with:

```markdown
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
```

In `AGENTS.md`, the status line, and hard rule 7's link (its wording doesn't change):

Replace:

```markdown
**Status:** moved from GROBS, where it was OBS Producer, and being split into rcl-core and rcl-producer ([spec](design-docs/specs/2026-10-07-rollcall-split-design.md)). [rcl-core](rcl-core/AGENTS.md)'s server hosts each app as a module, including [rcl-producer](rcl-producer/AGENTS.md)'s ([ADR-0019](docs/decisions/0019-rcl-apps-as-modules.md)). Code shared across apps is in `packages/`. Features start with Phase 1 on the [roadmap](docs/product/roadmap.md). To run it locally, see [local development](docs/guides/local-development.md).
```
with:

```markdown
**Status:** moved from GROBS, where it was OBS Producer, and split into rcl-core and rcl-producer ([spec](design-docs/specs/2026-10-07-rollcall-split-design.md)), each released on its own ([ADR-0021](docs/decisions/0021-per-app-releases.md)). [rcl-core](rcl-core/AGENTS.md)'s server hosts each app as a module, including [rcl-producer](rcl-producer/AGENTS.md)'s ([ADR-0019](docs/decisions/0019-rcl-apps-as-modules.md)). Code shared across apps is in `packages/`. Features start with Phase 1 on the [roadmap](docs/product/roadmap.md). To run it locally, see [local development](docs/guides/local-development.md).
```


Replace:

```markdown
7. **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never approve a release deployment, and never create release tags or GitHub Releases or start the release workflow (even as a dry run) unless the user explicitly asks them to for a specific version. ([ADR-0010](docs/decisions/0010-deliberate-releases-patch-tracking.md))
```
with:

```markdown
7. **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never approve a release deployment, and never create release tags or GitHub Releases or start the release workflow (even as a dry run) unless the user explicitly asks them to for a specific version. ([ADR-0021](docs/decisions/0021-per-app-releases.md))
```


In `CLAUDE.md`:

Replace:

```markdown
- **Releases:** `/release <version>` (`.claude/skills/release/`) prepares a release. Only the user can start it. Never publish (hard rule 7). The process is in `docs/guides/releasing.md`.
```
with:

```markdown
- **Releases:** `/release <app> <version>` (`.claude/skills/release/`) prepares a release of one rcl app. Only the user can start it. Never publish (hard rule 7). The process is in `docs/guides/releasing.md`.
```


- [ ] **Step 6: Run everything and see it pass.**

Run: `node --test "scripts/*.test.mjs" && node scripts/check-docs.mjs`
Expected: PASS, 103 tests, then `check-docs: OK`.

- [ ] **Step 7: Check and commit.**

```bash
yarn format && yarn check
git add .github/workflows scripts/release-workflows.test.mjs docs/decisions docs/guides/releasing.md .claude/skills/release/SKILL.md AGENTS.md CLAUDE.md
git commit -F - <<'EOF'
feat(repo): release workflows per app, and ADR-0021

release.yml becomes a reusable workflow that takes the app, and
rcl-core-release.yml and rcl-producer-release.yml start it, each by hand
and as a dry run by default. Its checks before approval add the story
tests. A script test keeps the workflows in step with release.mjs.

ADR-0021 supersedes ADR-0010: each rcl app is released on its own, and
hard rule 7 is unchanged. The releasing guide and /release take the app.

Refs #6

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Features and issues say which app

**Files:**
- Modify: `scripts/check-docs.mjs`, `docs/features/*.md` (9 pages), `docs/features/README.md` (generated), `docs/templates/feature.md`, `docs/wiki-guide.md`, `.github/ISSUE_TEMPLATE/{bug,feature,chore}.yml`, `docs/guides/releasing.md`
- Test: `scripts/check-docs.test.mjs`, `scripts/issue-forms.test.mjs` (new)

**Interfaces:**
- Consumes from Task 1: `APPS`.
- Produces:
  - every feature page has `app: rcl-core | rcl-producer | both`;
  - the features table has the columns `Feature | App | Status | Summary`;
  - every issue form has a required dropdown with `id: app`.

- [ ] **Step 1: Write the failing tests.**

In `scripts/check-docs.test.mjs`:

Replace:

```js
| Feature | Status | Summary |
| --- | --- | --- |
| [Alpha](alpha.md) | planned | The alpha feature |
```
with:

```js
| Feature | App | Status | Summary |
| --- | --- | --- | --- |
| [Alpha](alpha.md) | rcl-core | planned | The alpha feature |
```


Replace:

```js
title: Alpha
```
with:

```js
title: Alpha
app: rcl-core
```


Replace:

```js
    'docs/features/alpha.md: missing frontmatter field "summary"',
  );
});
```
with:

```js
    'docs/features/alpha.md: missing frontmatter field "summary"',
  );
});

test('reports a feature that does not say which app it belongs to', () => {
  const page = BASELINE['docs/features/alpha.md'].replace('app: rcl-core\n', '');
  assertError(errorsFor({ 'docs/features/alpha.md': page }), 'docs/features/alpha.md: missing frontmatter field "app"');
});

test('reports a feature with an app that is not rcl-core, rcl-producer or both', () => {
  for (const app of ['core', 'obs-producer', 'rcl-core, rcl-producer']) {
    const page = BASELINE['docs/features/alpha.md'].replace('app: rcl-core', `app: ${app}`);
    assertError(
      errorsFor({ 'docs/features/alpha.md': page }),
      `docs/features/alpha.md: invalid app "${app}" (use rcl-core, rcl-producer or both)`,
    );
  }
});

test('accepts each app a feature can belong to, and lists it in the features table', () => {
  for (const app of ['rcl-core', 'rcl-producer', 'both']) {
    const root = makeTree({ 'docs/features/alpha.md': BASELINE['docs/features/alpha.md'].replace('rcl-core', app) });
    assert.deepEqual(checkDocs(root, { fix: true }).errors, []);
    assert.match(
      readFileSync(join(root, 'docs/features/README.md'), 'utf8'),
      new RegExp(`\\| \\[Alpha\\]\\(alpha\\.md\\) \\| ${app} \\| planned \\| The alpha feature \\|`),
      app,
    );
  }
});
```


Create `scripts/issue-forms.test.mjs`:

```js
// Keeps the issue forms in step with the rcl apps (ADR-0021). Run: node --test "scripts/*.test.mjs"
// The forms are read as text: these scripts have no dependencies, so there's no YAML parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS } from './release.mjs';

const FORMS = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'ISSUE_TEMPLATE');

test('every issue form asks which app, offering each rcl app, and requires an answer', () => {
  for (const form of ['bug.yml', 'feature.yml', 'chore.yml']) {
    const text = readFileSync(join(FORMS, form), 'utf8');
    const dropdown = /^ {2}- type: dropdown\n {4}id: app\n((?: {4,}.*\n)*)/m.exec(text)?.[1];
    assert.ok(dropdown, `${form} has no app dropdown`);
    for (const app of Object.keys(APPS)) assert.match(dropdown, new RegExp(`^ {8}- ${app}$`, 'm'), `${form}: ${app}`);
    assert.match(dropdown, /^ {6}required: true$/m, form);
  }
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `node --test scripts/check-docs.test.mjs scripts/issue-forms.test.mjs`
Expected: FAIL, 13 tests.
- The baseline wiki's features table now has an App column the lint doesn't draw, so every test that expects a clean baseline sees a stale table.
- The three new app tests fail.
- The issue forms have no app dropdown.

- [ ] **Step 3: Check the `app` field, and draw the App column.**

In `scripts/check-docs.mjs`:

Replace:

```js
const FEATURE_STATUSES = new Set(['planned', 'in-progress', 'shipped', 'deprecated']);
```
with:

```js
const FEATURE_STATUSES = new Set(['planned', 'in-progress', 'shipped', 'deprecated']);
const FEATURE_APPS = ['rcl-core', 'rcl-producer', 'both']; // the rcl app a feature belongs to (ADR-0021)
```


Replace:

```js
    if (isFeature(p)) {
```
with:

```js
    if (isFeature(p)) {
      const app = need('app');
      if (app && !FEATURE_APPS.includes(app)) {
        errors.push(
          `${p.rel}: invalid app "${app}" (use ${FEATURE_APPS.slice(0, -1).join(', ')} or ${FEATURE_APPS.at(-1)})`,
        );
      }
```


Replace:

```js
    .map((p) => [`[${cell(p.meta.title)}](${basename(p.rel)})`, cell(p.meta.status), cell(p.meta.summary)]);
  return table(['Feature', 'Status', 'Summary'], rows);
```
with:

```js
    .map((p) => [
      `[${cell(p.meta.title)}](${basename(p.rel)})`,
      cell(p.meta.app),
      cell(p.meta.status),
      cell(p.meta.summary),
    ]);
  return table(['Feature', 'App', 'Status', 'Summary'], rows);
```


- [ ] **Step 4: Give every feature page its app.**

In each page below, add one line after `title:` in the frontmatter: `app: <value>`. The values come from the spec's list.

| Page | `app` |
|---|---|
| `docs/features/team-builder.md` | `rcl-core` |
| `docs/features/users-and-access.md` | `rcl-core` |
| `docs/features/theme-builder.md` | `rcl-producer` |
| `docs/features/screen-builder.md` | `rcl-producer` |
| `docs/features/overlay-components.md` | `rcl-producer` |
| `docs/features/live-mode.md` | `rcl-producer` |
| `docs/features/obs-control.md` | `rcl-producer` |
| `docs/features/crg-automation.md` | `rcl-producer` |
| `docs/features/import-export.md` | `both` |

For example, `docs/features/team-builder.md` starts:

```markdown
---
title: Team Builder
app: rcl-core
status: planned
summary: Create teams with skaters and bench staff, including names, numbers, roles and photos.
---
```

In `docs/templates/feature.md`:

Replace:

```markdown
title: Feature name
```
with:

```markdown
title: Feature name
app: rcl-core
```


In `docs/wiki-guide.md`:

Replace:

```markdown
| Feature (`features/*.md`) | `title`, `status` (`planned` · `in-progress` · `shipped` · `deprecated`), `summary` (one sentence; shown in the feature index) |
```
with:

```markdown
| Feature (`features/*.md`) | `title`, `app` (the rcl app it belongs to: `rcl-core` · `rcl-producer` · `both`), `status` (`planned` · `in-progress` · `shipped` · `deprecated`), `summary` (one sentence; shown in the feature index) |
```


Replace:

```markdown
1. **Frontmatter.** Required fields are present and status values are valid.
```
with:

```markdown
1. **Frontmatter.** Required fields are present, and status and app values are valid.
```


Then run `node scripts/check-docs.mjs --fix`, which redraws the features table in `docs/features/README.md` with the App column.

- [ ] **Step 5: Ask for the app on every issue form.**

In `.github/ISSUE_TEMPLATE/feature.yml`:

Replace:

```yaml
        Feature index: https://github.com/wardmanm/rollcall_derby/blob/main/docs/features/README.md
```
with:

```yaml
        Feature index: https://github.com/wardmanm/rollcall_derby/blob/main/docs/features/README.md
  - type: dropdown
    id: app
    attributes:
      label: App
      description: The rcl app this changes; the feature page says which. rcl-core is the server and the admin app at /core/. rcl-producer is the Producer app at /producer/ and the OBS overlay.
      options:
        - rcl-core
        - rcl-producer
        - Both
    validations:
      required: true
```


In `.github/ISSUE_TEMPLATE/chore.yml`:

Replace:

```yaml
        - Other
```
with:

```yaml
        - Other
    validations:
      required: true
  - type: dropdown
    id: app
    attributes:
      label: App
      description: The rcl app this is for. Choose Both for repo-wide work such as CI or tooling. rcl-core is the server and the admin app at /core/. rcl-producer is the Producer app at /producer/ and the OBS overlay.
      options:
        - rcl-core
        - rcl-producer
        - Both
```


In `.github/ISSUE_TEMPLATE/bug.yml`:

Replace:

```yaml
body:
```
with:

```yaml
body:
  - type: dropdown
    id: app
    attributes:
      label: App
      description: Where you saw the problem. rcl-core is the server and the admin app at /core/. rcl-producer is the Producer app at /producer/ and the OBS overlay.
      options:
        - rcl-core
        - rcl-producer
        - Not sure
    validations:
      required: true
```


Replace:

```yaml
      description: The release you're running (e.g. obs-producer-v0.2.0), or "main".
```
with:

```yaml
      description: The releases you're running (e.g. rcl-core-v0.1.0 and rcl-producer-v0.2.0), or "main".
```


In `docs/guides/releasing.md`:

Replace:

```markdown
- File Rollcall work with the **Rollcall: feature** or **Rollcall: bug** issue forms. Add the app label (`rcl-core` or `rcl-producer`) when triaging. The forms ask which wiki page and requirement numbers the issue covers, e.g. [Team Builder](../features/team-builder.md) R3.
```
with:

```markdown
- File Rollcall work with the **Rollcall: feature** or **Rollcall: bug** issue forms. Every form asks which app the issue is for. Forms can't set labels from that answer, so add the app's label (`rcl-core`, `rcl-producer` or both) when triaging; the label puts the issue on the app's board. The forms ask which wiki page and requirement numbers the issue covers, e.g. [Team Builder](../features/team-builder.md) R3.
```


- [ ] **Step 6: Run everything and see it pass.**

Run: `node --test "scripts/*.test.mjs" && node scripts/check-docs.mjs`
Expected: PASS, 107 tests, then `check-docs: OK`.

- [ ] **Step 7: Check, commit, and run what the release workflow runs.**

```bash
yarn format && yarn check
git add scripts docs .github/ISSUE_TEMPLATE
git commit -F - <<'EOF'
feat(repo): features and issues say which app

Feature pages say which rcl app they belong to (rcl-core, rcl-producer
or both), the docs lint checks it, and the features table gains an App
column. Every issue form asks for the app; labels are still added at
triage.

Refs #6

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Then run what the release workflow's checks run after `yarn check`, once, for the whole branch:

```bash
yarn build && yarn test:stories && yarn test:e2e
```

Expected: PASS, 14 story tests and 8 e2e tests. No app code changed, so these prove the release workflow's checks pass on this branch.

---

### Task 5: ⏸ GitHub settings (Mike)

These change the repository on GitHub, so they're Mike's to do. An agent does them only with Mike's explicit OK for each one. Do them after this branch is merged and pushed, and before the first release ([releasing guide](../../docs/guides/releasing.md#repository-settings-the-pipeline-relies-on)).

- [ ] **Step 1: Make the repository public.** On Mike's GitHub plan, the `release` environment's required reviewer only works on a public repository (split spec). **Settings ▸ General ▸ Danger Zone ▸ Change visibility.**
- [ ] **Step 2: Create the `release` environment.** **Settings ▸ Environments ▸ New environment** `release`:
  - required reviewer `wardmanm`;
  - deployment branches: **Selected branches**, `main` only.
- [ ] **Step 3: Add the tag ruleset.** **Settings ▸ Rules ▸ Rulesets ▸ New tag ruleset**:
  - name "Release tags are permanent", enforcement **Active**;
  - target `refs/tags/*-v*`;
  - **Restrict updates** and **Restrict deletions**.
- [ ] **Step 4: Turn on immutable releases.** **Settings ▸ General ▸ Releases ▸ Enable release immutability.**
- [ ] **Step 5: Close #6** once Steps 1–4 are done: `gh issue close 6 --comment "Per-app releases are in place, and the repo is public with the release environment, tag ruleset and immutable releases."`

**What comes next, and isn't part of this plan:**
- the first releases, in this order: rcl-core v0.1.0, then rcl-producer v0.2.0;
- each is started only by Mike: `/release rcl-core 0.1.0`, then the **rcl-core release** workflow;
- before rcl-producer v0.2.0, its milestone `rcl-producer v0.2.0` must exist with no open issues, because 0.2.0 is an `x.y.0` release.
