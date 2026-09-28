# Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut obs-producer releases only through deliberate human steps:
1. a person makes a prepare commit;
2. a person starts a manual, dry-run-by-default GitHub workflow;
3. a person approves publishing.

Releases are tied to milestones and to `CHANGELOG.md`.

**Architecture:**
- A dependency-free Node script (`obs-producer/scripts/release.mjs`) owns all changelog and version logic, and it is unit-tested.
- A `workflow_dispatch`-only GitHub workflow calls that script, checks the tag, milestone, docs lint and tests, then waits for approval in a protected `release` environment before running `gh release create`.
- Issue forms, a PR template, a user-only `/release` Claude skill, the docs changes and the GitHub repo settings complete the pipeline.

**Tech Stack:**
- Node ≥ 24, built-ins only, tested with `node:test`
- GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`) and the preinstalled `gh` CLI and `jq`
- GitHub issue forms (YAML)
- Claude Code skills

**Spec:** [`obs-producer/design-docs/specs/2026-09-28-release-pipeline-design.md`](../specs/2026-09-28-release-pipeline-design.md)

## Global Constraints

- Tag format: `obs-producer-v<semver>`. Milestone title: `obs-producer v<semver>`. Release title: `OBS Producer v<semver>`.
- Versions: strict SemVer without build metadata and without a leading `v`. A version with a `-` suffix is published with `--prerelease`.
- The workflow's only trigger is `workflow_dispatch`, with inputs `version` (string, required) and `dry_run` (boolean, **default `true`**).
- The workflow may use only `actions/checkout`, `actions/setup-node`, `gh` and `jq`; no third-party release actions.
- `${{ inputs.version }}` is never interpolated into a `run:` script. It is passed through `env: VERSION` and validated with a bash regex before any other use.
- Before validation, error messages never echo the raw version. After validation, they print it JSON-escaped (`JSON.stringify`).
- The tag targets the commit SHA that the preflight job checked.
- The publish job uses `environment: release` and permissions `contents: write` and `issues: write`. The preflight job uses `contents: read` and `issues: read`. The top-level permissions are `{}`.
- Scripts use Node built-ins only and live in `obs-producer/scripts/`. Their tests are `obs-producer/scripts/*.test.mjs`, run with `node --test "scripts/*.test.mjs"` from `obs-producer/`.
- Prepare commit message: `chore(obs-producer): prepare v<version>`.
- Repository URL constant: `https://github.com/wardmanm/GROBS`.
- Hard rule 7 wording, exactly as it appears in both ADR-0009 and `obs-producer/AGENTS.md`:
  > **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never create release tags or GitHub Releases, and never start the release workflow (even as a dry run), unless the user explicitly asks them to for a specific version.
- Links go one way, GitHub → wiki. Wiki pages never list issues or milestone status.

## Review Focus

1. **Shell metacharacters or newlines in the version input** (`0.2.0; rm -rf /`, `0.2.0\n::error::x`). These must be rejected before any command sees them, and the raw value must never be echoed. Pinned in Task 1 (`versionError`) and Task 3 (`check` escapes the value); the workflow's bash regex runs first (Task 4).
2. **A leading `v`** (`v0.2.0`), the most likely typo. It must fail with a message that says to drop the `v`. Pinned in Task 1.
3. **The first release.** The released section is the last one in the file, directly above the link-reference footer. `notes` must not include link references, and `prepare` must replace the pre-release `[Unreleased]: …/commits/…` link. Pinned in Tasks 2 and 3.
4. **CRLF line endings** (a changelog edited on Windows). It must parse and be rewritten with LF. Pinned in Task 2.
5. **An `Unreleased` section with only empty `### Added` headings.** This counts as empty: `prepare` refuses with "no entries", and `check` doesn't complain that Unreleased still has entries. Pinned in Tasks 2 and 3.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `obs-producer/scripts/release.mjs` | Version parsing and comparison; changelog parse and format; `prepare` / `check` / `notes`; CLI | 1–3 |
| `obs-producer/scripts/release.test.mjs` | Unit and CLI tests for `release.mjs` | 1–3 |
| `.github/workflows/obs-producer-release.yml` | Manual release workflow | 4 |
| `.github/ISSUE_TEMPLATE/{feature,bug,config}.yml`, `.github/pull_request_template.md` | Issue and PR intake that links to the wiki | 5 |
| `.claude/skills/release/SKILL.md` | User-only `/release` skill (prepare step) | 6 |
| `obs-producer/CHANGELOG.md`, `obs-producer/docs/decisions/0009-…`, `obs-producer/docs/guides/releasing.md`, edits to AGENTS/CLAUDE/README/wiki pages, `scripts/check-docs.mjs` (+test) | Docs and rules | 7 |
| GitHub settings (labels, `release` environment, tag ruleset, immutable releases) | Guards on the GitHub side | 8 |
| (none) | Post-merge dry-run verification | 9 |

All paths below are relative to the repo root (`GROBS/`) unless a step says `cd obs-producer`.

---

### Task 1: Version parsing and comparison

**Files:**
- Create: `obs-producer/scripts/release.mjs`
- Test: `obs-producer/scripts/release.test.mjs`

**Interfaces:**
- Produces:
  - `REPO_URL: string`
  - `TAG_PREFIX: string`
  - `parseVersion(text: string) → { major: number, minor: number, patch: number, prerelease: string[] } | null`
  - `versionError(text: string) → string | null`
  - `compareVersions(a: string, b: string) → -1 | 0 | 1`. Both arguments must already be valid.

- [ ] **Step 1: Write the failing tests**

Create `obs-producer/scripts/release.test.mjs`:

```js
// Tests for release.mjs. Run: node --test "scripts/*.test.mjs"
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, versionError, compareVersions } from './release.mjs';

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
    '0.1.9', '0.2.0', '0.3.0-1', '0.3.0-alpha', '0.3.0-beta', '0.3.0-beta.1',
    '0.3.0-beta.2', '0.3.0-beta.10', '0.3.0-rc.1', '0.3.0', '1.0.0',
  ];
  for (let i = 0; i < ascending.length - 1; i++) {
    assert.equal(compareVersions(ascending[i], ascending[i + 1]), -1, `${ascending[i]} < ${ascending[i + 1]}`);
    assert.equal(compareVersions(ascending[i + 1], ascending[i]), 1, `${ascending[i + 1]} > ${ascending[i]}`);
  }
  assert.equal(compareVersions('0.3.0-beta.1', '0.3.0-beta.1'), 0);
});
```

(`after` is imported now and used from Task 2 on.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd obs-producer && node --test "scripts/release.test.mjs"`
Expected: FAIL with `ERR_MODULE_NOT_FOUND … scripts/release.mjs`

- [ ] **Step 3: Write the minimal implementation**

Create `obs-producer/scripts/release.mjs`:

```js
#!/usr/bin/env node
// Release helper for obs-producer. Zero dependencies — Node built-ins only.
// Process and rules: docs/guides/releasing.md · docs/decisions/0009-deliberate-milestone-driven-releases.md
//
//   node scripts/release.mjs prepare <version> [--date YYYY-MM-DD]   move Unreleased → <version>, bump package.json
//   node scripts/release.mjs check <version>                         verify CHANGELOG and package versions are ready
//   node scripts/release.mjs notes <version>                         print the release notes for <version>
//   --root <dir>                                                     project root (default: this script's parent)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_URL = 'https://github.com/wardmanm/GROBS';
export const TAG_PREFIX = 'obs-producer-v';

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
```

(The unused imports `readFileSync`, `writeFileSync` and so on are used from Task 2 onward.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd obs-producer && node --test "scripts/*.test.mjs"`
Expected: PASS. The 6 new tests plus the 29 existing check-docs tests (35 total), with 0 failing.

- [ ] **Step 5: Commit**

```bash
git add obs-producer/scripts/release.mjs obs-producer/scripts/release.test.mjs
git commit -m "feat(obs-producer): semver parsing for the release helper"
```

---

### Task 2: Changelog parsing and `prepare`

**Files:**
- Modify: `obs-producer/scripts/release.mjs` (append after `compareVersions`)
- Test: `obs-producer/scripts/release.test.mjs` (append)

**Interfaces:**
- Consumes: `parseVersion`, `versionError`, `compareVersions`, `REPO_URL`, `TAG_PREFIX` (Task 1)
- Produces:
  - `parseChangelog(text: string) → { preamble: string, sections: {name: string, date: string|null, body: string}[], footer: string[] }`
  - `formatChangelog(log) → string`
  - `prepare(root: string, version: string, { date?: string }) → { packages: string[] }`. Throws `Error` with a user-facing message.
  - Internal helpers used by Task 3: `readChangelog(root)`, `isUnreleased(section)`, `hasEntries(body)`, `releasedVersions(sections, except?)`, `latestVersion(versions)`, `packageFiles(root)`, and the constant `DATE`.

- [ ] **Step 1: Write the failing tests**

Change the import line at the top of `release.test.mjs` to:

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  parseVersion, versionError, compareVersions,
  parseChangelog, formatChangelog, prepare, REPO_URL,
} from './release.mjs';
```

Append to `release.test.mjs`:

```js
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
const pkg = (version) => JSON.stringify({ name: 'x', version, private: true }, null, 2) + '\n';

const HEADER = '# Changelog\n\nAll notable changes are documented here.';

const FIRST = `${HEADER}

## [Unreleased]

### Added

- Team Builder (#12)

[Unreleased]: ${REPO_URL}/commits/main/obs-producer
`;

const FIRST_PREPARED = `${HEADER}

## [Unreleased]

## [0.1.0] - 2026-10-14

### Added

- Team Builder (#12)

[Unreleased]: ${REPO_URL}/compare/obs-producer-v0.1.0...HEAD
[0.1.0]: ${REPO_URL}/releases/tag/obs-producer-v0.1.0
`;

const SECOND = `${HEADER}

## [Unreleased]

### Fixed

- Roster paging (#20)

## [0.1.0] - 2026-10-14

### Added

- Team Builder (#12)

[Unreleased]: ${REPO_URL}/compare/obs-producer-v0.1.0...HEAD
[0.1.0]: ${REPO_URL}/releases/tag/obs-producer-v0.1.0
`;

const SECOND_PREPARED = `${HEADER}

## [Unreleased]

## [0.2.0] - 2026-11-01

### Fixed

- Roster paging (#20)

## [0.1.0] - 2026-10-14

### Added

- Team Builder (#12)

[Unreleased]: ${REPO_URL}/compare/obs-producer-v0.2.0...HEAD
[0.2.0]: ${REPO_URL}/releases/tag/obs-producer-v0.2.0
[0.1.0]: ${REPO_URL}/releases/tag/obs-producer-v0.1.0
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
  const root = makeTree({ 'CHANGELOG.md': FIRST });
  prepare(root, '0.1.0', { date: '2026-10-14' });
  assert.equal(read(root, 'CHANGELOG.md'), FIRST_PREPARED);
});

test('prepare adds the new section above earlier releases', () => {
  const root = makeTree({ 'CHANGELOG.md': SECOND });
  prepare(root, '0.2.0', { date: '2026-11-01' });
  assert.equal(read(root, 'CHANGELOG.md'), SECOND_PREPARED);
});

test('prepare bumps the version in every package.json', () => {
  const root = makeTree({
    'CHANGELOG.md': FIRST,
    'package.json': pkg('0.0.0'),
    'apps/web/package.json': pkg('0.0.0'),
    'apps/server/package.json': pkg('0.0.0'),
    'packages/shared/package.json': pkg('0.0.0'),
    'apps/README.md': 'not a package dir',
  });
  const { packages } = prepare(root, '0.1.0', { date: '2026-10-14' });
  assert.deepEqual(packages, [
    'package.json', 'apps/server/package.json', 'apps/web/package.json', 'packages/shared/package.json',
  ]);
  for (const file of packages) assert.equal(read(root, file), pkg('0.1.0'), file);
});

test('prepare refuses when Unreleased has no entries, even with empty headings', () => {
  const root = makeTree({ 'CHANGELOG.md': EMPTY_HEADINGS });
  assert.throws(() => prepare(root, '0.1.0', { date: '2026-10-14' }), /no entries to release/);
  assert.equal(read(root, 'CHANGELOG.md'), EMPTY_HEADINGS);
});

test('prepare refuses a version that is not greater than the latest release', () => {
  const root = makeTree({ 'CHANGELOG.md': SECOND });
  assert.throws(() => prepare(root, '0.0.9', { date: '2026-11-01' }), /0\.0\.9 is not greater than the latest release 0\.1\.0/);
  assert.throws(() => prepare(root, '0.1.0-beta.1', { date: '2026-11-01' }), /not greater than the latest release 0\.1\.0/);
});

test('prepare refuses a version that already has a section', () => {
  const root = makeTree({ 'CHANGELOG.md': SECOND });
  assert.throws(() => prepare(root, '0.1.0', { date: '2026-11-01' }), /already has a section for 0\.1\.0/);
});

test('prepare refuses invalid versions and dates', () => {
  const root = makeTree({ 'CHANGELOG.md': FIRST });
  assert.throws(() => prepare(root, 'v0.1.0'), /leave off the leading "v"/);
  assert.throws(() => prepare(root, '0.1'), /invalid version/);
  assert.throws(() => prepare(root, '0.1.0', { date: 'tomorrow' }), /invalid date "tomorrow"/);
  assert.equal(read(root, 'CHANGELOG.md'), FIRST);
});

test('prepare accepts a lowercase [unreleased] heading without duplicating its link', () => {
  const root = makeTree({ 'CHANGELOG.md': FIRST.replace('## [Unreleased]', '## [unreleased]') });
  prepare(root, '0.1.0', { date: '2026-10-14' });
  const text = read(root, 'CHANGELOG.md');
  assert.match(text, /^## \[0\.1\.0\] - 2026-10-14$/m);
  assert.equal(text.split('\n').filter((l) => /^\[unreleased\]:/i.test(l)).length, 1);
});

test('prepare fails clearly when there is no CHANGELOG.md', () => {
  assert.throws(() => prepare(makeTree({}), '0.1.0'), /CHANGELOG\.md not found/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd obs-producer && node --test "scripts/release.test.mjs"`
Expected: FAIL with `SyntaxError: The requested module './release.mjs' does not provide an export named 'parseChangelog'`

- [ ] **Step 3: Write the minimal implementation**

Append to `obs-producer/scripts/release.mjs`:

```js
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
    sections: sections.map((s) => ({ ...s, body: s.body.join('\n').trim() })),
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

export function readChangelog(root) {
  const file = join(root, 'CHANGELOG.md');
  if (!existsSync(file)) throw new Error(`CHANGELOG.md not found in ${root}`);
  return readFileSync(file, 'utf8');
}

export function releasedVersions(sections, except) {
  return sections.filter((s) => !isUnreleased(s) && s.name !== except && parseVersion(s.name)).map((s) => s.name);
}

export function latestVersion(versions) {
  return versions.reduce((best, v) => (best === null || compareVersions(v, best) > 0 ? v : best), null);
}

// package.json files that carry the app version: the root, apps/*, packages/*.
export function packageFiles(root) {
  const files = ['package.json'];
  for (const dir of ['apps', 'packages']) {
    if (!existsSync(join(root, dir))) continue;
    const entries = readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) if (e.isDirectory()) files.push(`${dir}/${e.name}/package.json`);
  }
  return files.filter((f) => existsSync(join(root, f)));
}

// ---------- prepare ----------

export function prepare(root, version, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const bad = versionError(version);
  if (bad) throw new Error(bad);
  if (!DATE.test(date)) throw new Error(`invalid date ${JSON.stringify(date)}: use YYYY-MM-DD`);
  const log = parseChangelog(readChangelog(root));
  const unreleased = log.sections.find(isUnreleased);
  if (!unreleased) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  if (log.sections.some((s) => s.name === version)) throw new Error(`CHANGELOG.md already has a section for ${version}`);
  if (!hasEntries(unreleased.body)) throw new Error('the Unreleased section has no entries to release');
  const previous = latestVersion(releasedVersions(log.sections));
  if (previous && compareVersions(version, previous) <= 0) {
    throw new Error(`${version} is not greater than the latest release ${previous}`);
  }

  log.sections.splice(log.sections.indexOf(unreleased) + 1, 0, { name: version, date, body: unreleased.body });
  unreleased.body = '';
  log.footer = [
    `[${unreleased.name}]: ${REPO_URL}/compare/${TAG_PREFIX}${version}...HEAD`,
    `[${version}]: ${REPO_URL}/releases/tag/${TAG_PREFIX}${version}`,
    ...log.footer.filter((l) => !['unreleased', version.toLowerCase()].includes(linkLabel(l))),
  ];
  writeFileSync(join(root, 'CHANGELOG.md'), formatChangelog(log));

  const packages = packageFiles(root);
  for (const file of packages) {
    const data = JSON.parse(readFileSync(join(root, file), 'utf8'));
    data.version = version;
    writeFileSync(join(root, file), JSON.stringify(data, null, 2) + '\n');
  }
  return { packages };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd obs-producer && node --test "scripts/*.test.mjs"`
Expected: PASS, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add obs-producer/scripts/release.mjs obs-producer/scripts/release.test.mjs
git commit -m "feat(obs-producer): release helper prepares CHANGELOG and package versions"
```

---

### Task 3: `check`, `notes` and the CLI

**Files:**
- Modify: `obs-producer/scripts/release.mjs` (append)
- Test: `obs-producer/scripts/release.test.mjs` (append)

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces:
  - `check(root: string, version: string) → string[]`: an empty array means ready.
  - `notes(root: string, version: string) → string`: the section body. Throws if the section is missing.
  - The CLI `node scripts/release.mjs <prepare|check|notes> <version> [--date YYYY-MM-DD] [--root dir]`. It exits 0 on success, 1 when a check fails or an error occurs, and 2 on a usage error.
  - The workflow (Task 4) and the skill (Task 6) call this CLI.

- [ ] **Step 1: Write the failing tests**

Change the `./release.mjs` import in `release.test.mjs` to:

```js
import {
  parseVersion, versionError, compareVersions,
  parseChangelog, formatChangelog, prepare, check, notes, REPO_URL,
} from './release.mjs';
```

and add below the other `node:` imports:

```js
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
```

Append:

```js
// --- check ---

test('check passes for a prepared changelog', () => {
  const root = makeTree({ 'CHANGELOG.md': FIRST });
  prepare(root, '0.1.0', { date: '2026-10-14' });
  assert.deepEqual(check(root, '0.1.0'), []);
});

test('check reports Unreleased entries that were never prepared', () => {
  const errors = check(makeTree({ 'CHANGELOG.md': FIRST }), '0.1.0');
  assert.ok(errors.some((e) => e.startsWith('the Unreleased section still has entries')), errors.join('\n'));
  assert.ok(errors.some((e) => e.startsWith('CHANGELOG.md has no section for 0.1.0')), errors.join('\n'));
});

test('check ignores empty subsection headings under Unreleased', () => {
  const text = FIRST_PREPARED.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Added\n');
  assert.deepEqual(check(makeTree({ 'CHANGELOG.md': text }), '0.1.0'), []);
});

test('check requires a dated section with entries', () => {
  const undated = FIRST_PREPARED.replace(' - 2026-10-14', '');
  assert.ok(check(makeTree({ 'CHANGELOG.md': undated }), '0.1.0').some((e) => /needs a date/.test(e)));
  const empty = FIRST_PREPARED.replace('- Team Builder (#12)', '');
  assert.ok(check(makeTree({ 'CHANGELOG.md': empty }), '0.1.0').some((e) => /0\.1\.0 section has no entries/.test(e)));
});

test('check requires the version to be newer than every other release', () => {
  const text = `${HEADER}\n\n## [Unreleased]\n\n## [0.1.5] - 2026-12-01\n\n- Late fix\n\n## [0.2.0] - 2026-11-01\n\n- Feature\n`;
  const errors = check(makeTree({ 'CHANGELOG.md': text }), '0.1.5');
  assert.ok(errors.includes('0.1.5 is not greater than the previous release 0.2.0'), errors.join('\n'));
});

test('check requires package.json versions to match', () => {
  const root = makeTree({ 'CHANGELOG.md': FIRST_PREPARED, 'apps/web/package.json': pkg('0.0.0') });
  assert.deepEqual(check(root, '0.1.0'), ['apps/web/package.json has version 0.0.0, expected 0.1.0']);
});

test('check rejects an unsafe version string without echoing it raw', () => {
  const errors = check(makeTree({ 'CHANGELOG.md': FIRST_PREPARED }), '0.1.0\n::error::pwned');
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes('\n'));
});

// --- notes ---

test('notes returns the section body without link references', () => {
  assert.equal(notes(makeTree({ 'CHANGELOG.md': FIRST_PREPARED }), '0.1.0'), '### Added\n\n- Team Builder (#12)');
});

test('notes fails for a version with no section', () => {
  assert.throws(() => notes(makeTree({ 'CHANGELOG.md': FIRST_PREPARED }), '9.9.9'), /no section for 9\.9\.9/);
});

// --- CLI ---

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'release.mjs');
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('CLI prepare writes the changelog and exits 0', () => {
  const root = makeTree({ 'CHANGELOG.md': FIRST });
  const out = cli('prepare', '0.1.0', '--date', '2026-10-14', '--root', root);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /prepared 0\.1\.0/);
  assert.equal(read(root, 'CHANGELOG.md'), FIRST_PREPARED);
});

test('CLI check exits 1 and lists problems', () => {
  const out = cli('check', '0.1.0', '--root', makeTree({ 'CHANGELOG.md': FIRST }));
  assert.equal(out.status, 1);
  assert.match(out.stderr, /release check failed for "0\.1\.0"/);
});

test('CLI notes prints the section body', () => {
  const out = cli('notes', '0.1.0', '--root', makeTree({ 'CHANGELOG.md': FIRST_PREPARED }));
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, '### Added\n\n- Team Builder (#12)\n');
});

test('CLI without a command prints usage and exits 2', () => {
  const out = cli();
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage: node scripts\/release\.mjs/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd obs-producer && node --test "scripts/release.test.mjs"`
Expected: FAIL with `does not provide an export named 'check'`

- [ ] **Step 3: Write the minimal implementation**

Append to `obs-producer/scripts/release.mjs`:

```js
// ---------- check / notes ----------

export function check(root, version) {
  const bad = versionError(version);
  if (bad) return [bad];
  let log;
  try {
    log = parseChangelog(readChangelog(root));
  } catch (e) {
    return [e.message];
  }
  const errors = [];
  const unreleased = log.sections.find(isUnreleased);
  if (!unreleased) errors.push('CHANGELOG.md has no "## [Unreleased]" section');
  else if (hasEntries(unreleased.body)) {
    errors.push(`the Unreleased section still has entries; run: node scripts/release.mjs prepare ${version}`);
  }
  const section = log.sections.find((s) => s.name === version);
  if (!section) {
    errors.push(`CHANGELOG.md has no section for ${version}; run: node scripts/release.mjs prepare ${version}`);
  } else {
    if (!hasEntries(section.body)) errors.push(`the ${version} section has no entries`);
    if (!section.date || !DATE.test(section.date)) errors.push(`the ${version} section needs a date: ## [${version}] - YYYY-MM-DD`);
  }
  const previous = latestVersion(releasedVersions(log.sections, version));
  if (previous && compareVersions(version, previous) <= 0) {
    errors.push(`${version} is not greater than the previous release ${previous}`);
  }
  for (const file of packageFiles(root)) {
    const { version: actual } = JSON.parse(readFileSync(join(root, file), 'utf8'));
    if (actual !== version) errors.push(`${file} has version ${actual ?? '(none)'}, expected ${version}`);
  }
  return errors;
}

export function notes(root, version) {
  const section = parseChangelog(readChangelog(root)).sections.find((s) => s.name === version);
  if (!section) throw new Error(`CHANGELOG.md has no section for ${version}`);
  return section.body;
}

// ---------- CLI ----------

const USAGE = 'usage: node scripts/release.mjs <prepare|check|notes> <version> [--date YYYY-MM-DD] [--root dir]';

function main(args) {
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const [command, version] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  const root = option('--root') ? resolve(option('--root')) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (!['prepare', 'check', 'notes'].includes(command) || !version) {
    console.error(USAGE);
    return 2;
  }
  try {
    if (command === 'prepare') {
      const { packages } = prepare(root, version, option('--date') ? { date: option('--date') } : {});
      console.log(`prepared ${version}: CHANGELOG.md${packages.map((p) => `, ${p}`).join('')}`);
      console.log(`review the diff, then commit: chore(obs-producer): prepare v${version}`);
      return 0;
    }
    if (command === 'notes') {
      console.log(notes(root, version));
      return 0;
    }
    const errors = check(root, version);
    if (errors.length) {
      console.error(`release check failed for ${JSON.stringify(version)}:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
      return 1;
    }
    console.log(`release check OK for ${version}`);
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd obs-producer && node --test "scripts/*.test.mjs"`
Expected: PASS, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add obs-producer/scripts/release.mjs obs-producer/scripts/release.test.mjs
git commit -m "feat(obs-producer): release helper check, notes and CLI"
```

---

### Task 4: Release workflow

**Files:**
- Create: `.github/workflows/obs-producer-release.yml`

**Interfaces:**
- Consumes: `node scripts/release.mjs check|notes <version>` (Task 3); `node scripts/check-docs.mjs`; the environment `release` (Task 8); milestones titled `obs-producer v<version>`.
- Produces: tag and GitHub release `obs-producer-v<version>`. The publish job also closes the milestone.

- [ ] **Step 1: Download actionlint** (into the scratchpad; nothing is installed on the system)

```bash
S=/private/tmp/claude-501/-Users-mwardman-Documents-Repos-GROBS/9e2c0104-819c-47a6-8bf8-59e461934d28/scratchpad/actionlint
mkdir -p "$S"
gh release download -R rhysd/actionlint --pattern 'actionlint_*_darwin_arm64.tar.gz' -D "$S" --clobber
tar -xzf "$S"/actionlint_*_darwin_arm64.tar.gz -C "$S" actionlint
"$S/actionlint" -version
```

Expected: a version string is printed.

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/obs-producer-release.yml`:

```yaml
# Cuts an obs-producer release. Deliberate by design (ADR-0009):
# manual start only, dry run by default, and publishing waits for approval
# in the protected "release" environment.
# Guide: obs-producer/docs/guides/releasing.md
name: obs-producer release

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Version to release, without a leading v (e.g. 0.2.0 or 0.3.0-beta.1)"
        required: true
        type: string
      dry_run:
        description: "Dry run: run every check, publish nothing"
        required: true
        type: boolean
        default: true

concurrency:
  group: obs-producer-release
  cancel-in-progress: false

permissions: {}

env:
  TAG_PREFIX: obs-producer-v
  MILESTONE_PREFIX: "obs-producer v"

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
      VERSION: ${{ inputs.version }}
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

      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Record the commit being released
        id: commit
        run: echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"

      - name: Tag must not exist yet
        run: |
          if git ls-remote --exit-code --tags origin "refs/tags/${TAG_PREFIX}${VERSION}" > /dev/null; then
            echo "::error::Tag ${TAG_PREFIX}${VERSION} already exists. That version is already released; pick the next one."
            exit 1
          fi

      - name: CHANGELOG and package versions are ready
        working-directory: obs-producer
        run: node scripts/release.mjs check "$VERSION"

      - name: Milestone exists and has no open issues
        run: |
          title="${MILESTONE_PREFIX}${VERSION}"
          milestone=$(gh api --paginate "repos/${GITHUB_REPOSITORY}/milestones?state=all&per_page=100" \
            | jq -c --arg t "$title" '.[] | select(.title == $t)')
          if [ -z "$milestone" ]; then
            echo "::error::No milestone titled '${title}'. Create it and assign this release's issues to it."
            exit 1
          fi
          open=$(jq -r '.open_issues' <<< "$milestone")
          if [ "$open" != "0" ]; then
            echo "::error::Milestone '${title}' still has ${open} open issue(s): $(jq -r '.html_url' <<< "$milestone")"
            exit 1
          fi

      - name: Docs lint and script tests
        working-directory: obs-producer
        run: |
          node --test "scripts/*.test.mjs"
          node scripts/check-docs.mjs

      - name: Show the release notes
        working-directory: obs-producer
        run: |
          {
            echo "## Release notes for ${TAG_PREFIX}${VERSION}"
            echo
            node scripts/release.mjs notes "$VERSION"
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
      VERSION: ${{ inputs.version }}
      SHA: ${{ needs.preflight.outputs.sha }}
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.preflight.outputs.sha }}

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Build the release notes
        run: |
          title="${MILESTONE_PREFIX}${VERSION}"
          milestone=$(gh api --paginate "repos/${GITHUB_REPOSITORY}/milestones?state=all&per_page=100" \
            | jq -c --arg t "$title" '.[] | select(.title == $t)')
          number=$(jq -r '.number' <<< "$milestone")
          if [ -z "$milestone" ] || [ "$number" = "null" ]; then
            echo "::error::Milestone '${title}' disappeared after preflight. Re-create it and run the workflow again."
            exit 1
          fi
          {
            node obs-producer/scripts/release.mjs notes "$VERSION"
            echo
            echo "---"
            echo
            echo "**Milestone:** [${title}]($(jq -r '.html_url' <<< "$milestone"))"
            echo
            echo "**Closed issues:**"
            echo
            gh api --paginate "repos/${GITHUB_REPOSITORY}/issues?milestone=${number}&state=closed&per_page=100" \
              | jq -r '.[] | select(.pull_request | not) | "- #\(.number) \(.title)"'
          } > "$RUNNER_TEMP/notes.md"
          echo "MILESTONE_NUMBER=${number}" >> "$GITHUB_ENV"

      - name: Create the GitHub release
        run: |
          flags=()
          if [[ "$VERSION" == *-* ]]; then flags+=(--prerelease); fi
          gh release create "${TAG_PREFIX}${VERSION}" \
            --target "$SHA" \
            --title "OBS Producer v${VERSION}" \
            --notes-file "$RUNNER_TEMP/notes.md" \
            "${flags[@]}"

      - name: Close the milestone
        run: gh api -X PATCH "repos/${GITHUB_REPOSITORY}/milestones/${MILESTONE_NUMBER}" -f state=closed
```

- [ ] **Step 3: Lint both workflows**

Run: `"$S/actionlint" .github/workflows/obs-producer-release.yml .github/workflows/obs-producer-docs.yml` (from the repo root)
Expected: no output, exit 0.

If actionlint flags `${{ inputs.dry_run }}` inside `run:`, keep it: it's a boolean the workflow controls, not user text. If needed, move it to `env: DRY_RUN: ${{ inputs.dry_run }}` and test `"$DRY_RUN" = "true"`.

- [ ] **Step 4: Check the deliberate-release guards in the file**

Run:
- `grep -nE '^\s+(push|pull_request|schedule|workflow_run|release):' .github/workflows/obs-producer-release.yml` → expected: no matches.
- `grep -n 'inputs.version' .github/workflows/obs-producer-release.yml` → expected: exactly **two** matches, both `VERSION: ${{ inputs.version }}` env lines.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/obs-producer-release.yml
git commit -m "ci(obs-producer): manual release workflow with dry run and approval gate"
```

---

### Task 5: Issue forms and PR template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`

**Interfaces:**
- Consumes: the labels `obs-producer`, `enhancement` and `bug`. `obs-producer` is created in Task 8; GitHub drops a template's missing labels silently until the label exists.
- Produces: issue intake that links each issue to a wiki page and its requirement numbers.

- [ ] **Step 1: Write `feature.yml`**

```yaml
name: "OBS Producer: feature"
description: Work on OBS Producer, linked to the wiki page that specifies it.
labels: ["enhancement", "obs-producer"]
body:
  - type: markdown
    attributes:
      value: |
        The wiki feature page is the spec. If this work changes what a feature should do, the PR that implements it updates the page.
        Feature index: https://github.com/wardmanm/GROBS/blob/main/obs-producer/docs/features/README.md
  - type: input
    id: wiki-page
    attributes:
      label: Wiki feature page
      description: The page that specifies this work.
      placeholder: obs-producer/docs/features/team-builder.md
    validations:
      required: true
  - type: input
    id: requirements
    attributes:
      label: Requirements covered
      description: Requirement numbers from the feature page, or "new" if the page needs a new requirement.
      placeholder: R1, R3
    validations:
      required: true
  - type: textarea
    id: description
    attributes:
      label: What and why
    validations:
      required: true
  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance criteria
      description: Checkable statements that say when this is done.
      value: |
        - [ ]
    validations:
      required: true
```

- [ ] **Step 2: Write `bug.yml`**

```yaml
name: "OBS Producer: bug"
description: Something in OBS Producer doesn't behave the way its wiki page says.
labels: ["bug", "obs-producer"]
body:
  - type: input
    id: version
    attributes:
      label: Version
      description: The release you're running (e.g. obs-producer-v0.2.0), or "main".
    validations:
      required: true
  - type: input
    id: wiki-page
    attributes:
      label: Expected behavior is specified in
      description: Wiki page and requirement number, if there is one.
      placeholder: obs-producer/docs/features/live-mode.md R6
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      value: |
        1.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs or screenshots
      render: shell
```

- [ ] **Step 3: Write `config.yml`**

```yaml
blank_issues_enabled: true
contact_links:
  - name: OBS Producer wiki
    url: https://github.com/wardmanm/GROBS/blob/main/obs-producer/docs/README.md
    about: Features, decisions and guides. Check the feature page before filing.
```

- [ ] **Step 4: Write `.github/pull_request_template.md`**

```md
<!-- Link the issue(s) this completes, e.g. "Closes #12, closes #14". -->
Closes #

## What changed

## Checklist

- [ ] Matching wiki pages are updated in this PR, or nothing user-visible or architectural changed
- [ ] `obs-producer/CHANGELOG.md` has a line under `Unreleased` for each user-visible change
- [ ] `node scripts/check-docs.mjs` passes (run from `obs-producer/`)
- [ ] Tests are added or updated, and they pass
- [ ] The hard rules in `obs-producer/AGENTS.md` still hold
```

- [ ] **Step 5: Validate the YAML syntax**

Run: `ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f) }; puts "yaml ok"' .github/ISSUE_TEMPLATE/*.yml`
Expected: `yaml ok`.

If `ruby` is missing, use `python3 -c 'import sys, yaml; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print("yaml ok")' .github/ISSUE_TEMPLATE/*.yml`.

GitHub checks the form *schema* only when the forms render on `main`; that check happens in Task 9.

- [ ] **Step 6: Commit**

```bash
git add .github/ISSUE_TEMPLATE .github/pull_request_template.md
git commit -m "chore: issue forms and PR template that link work to the wiki"
```

---

### Task 6: `/release` skill

**Files:**
- Create: `.claude/skills/release/SKILL.md`

**Interfaces:**
- Consumes: the CLI `node scripts/release.mjs prepare|check <version>` (Task 3), `node scripts/check-docs.mjs`, and `gh api` (read-only).
- Produces: `/release <version>`. Only the user can invoke it.

- [ ] **Step 1: Write the skill**

```md
---
name: release
description: Prepare an obs-producer release by moving the CHANGELOG's Unreleased notes under a version and bumping package versions, then hand off to the GitHub release workflow. Run only when the user types /release.
disable-model-invocation: true
argument-hint: "<version, e.g. 0.2.0>"
---

# Prepare an obs-producer release

The user ran `/release $ARGUMENTS`. Releases are deliberate (obs-producer hard rule 7, ADR-0009): **you prepare, the user publishes.** Never push, create tags, create GitHub Releases, or start the release workflow (even as a dry run) unless the user tells you to in this conversation, for this version.

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
```

- [ ] **Step 2: Check the frontmatter**

Run: `head -6 .claude/skills/release/SKILL.md`
Expected: `name: release`, a `description`, `disable-model-invocation: true` and `argument-hint`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/release/SKILL.md
git commit -m "chore: user-only /release skill for preparing obs-producer releases"
```

---

### Task 7: CHANGELOG, ADR-0009, releasing guide, and the rule and docs updates

**Files:**
- Modify: `obs-producer/scripts/check-docs.mjs` (`ROOT_FILES`), `obs-producer/scripts/check-docs.test.mjs` (1 test)
- Create: `obs-producer/CHANGELOG.md`
- Create: `obs-producer/docs/decisions/0009-deliberate-milestone-driven-releases.md`
- Create: `obs-producer/docs/guides/releasing.md`
- Modify: `obs-producer/AGENTS.md`, `obs-producer/CLAUDE.md`, `obs-producer/README.md`, `AGENTS.md` (root), `obs-producer/docs/wiki-guide.md`, `obs-producer/docs/guides/README.md`, `obs-producer/docs/product/roadmap.md`

**Interfaces:**
- Consumes: the release CLI (Task 3), the workflow name `obs-producer release` (Task 4), the issue form names (Task 5), and `/release` (Task 6).
- Produces: hard rule 7, and the documented process.

- [ ] **Step 1: Write the failing check-docs test**

Append to `obs-producer/scripts/check-docs.test.mjs`, after the test `'checks links in the root agent instruction files'`:

```js
test('checks links in CHANGELOG.md but not its link reference definitions', () => {
  const changelog = '# Changelog\n\nSee the [guide](docs/nope.md).\n\n## [Unreleased]\n\n[Unreleased]: https://example.com\n';
  const errors = errorsFor({ 'CHANGELOG.md': changelog });
  assert.deepEqual(errors, ['CHANGELOG.md: broken link "docs/nope.md"']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd obs-producer && node --test "scripts/check-docs.test.mjs"`
Expected: FAIL. `errors` is `[]`, because `CHANGELOG.md` isn't scanned yet.

- [ ] **Step 3: Make it pass**

In `obs-producer/scripts/check-docs.mjs`, change:

```js
const ROOT_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md']; // link-checked only
```

to:

```js
const ROOT_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'CHANGELOG.md']; // link-checked only
```

Run: `cd obs-producer && node --test "scripts/*.test.mjs"`
Expected: PASS, 0 failing.

- [ ] **Step 4: Create `obs-producer/CHANGELOG.md`**

The file is already in the normalized form that `formatChangelog` produces:

```md
# Changelog

All notable changes to OBS Producer are documented here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). How entries become releases: [releasing guide](docs/guides/releasing.md).

## [Unreleased]

### Added

- Project wiki: vision, roadmap, glossary, feature pages, architecture and decision records
- Docs lint (`scripts/check-docs.mjs`) with CI
- Release pipeline: changelog, issue forms, and a deliberate, approval-gated release workflow

[Unreleased]: https://github.com/wardmanm/GROBS/commits/main/obs-producer
```

Verify it round-trips:

```bash
cd obs-producer && node -e 'import("./scripts/release.mjs").then(({parseChangelog, formatChangelog}) => { const fs = require("fs"); const t = fs.readFileSync("CHANGELOG.md","utf8"); console.log(formatChangelog(parseChangelog(t)) === t ? "normalized" : "NOT normalized"); })'
```

Expected: `normalized`.

- [ ] **Step 5: Create ADR-0009**

`obs-producer/docs/decisions/0009-deliberate-milestone-driven-releases.md`:

```md
---
title: Deliberate, milestone-driven releases
status: accepted
date: 2026-09-28
---
# 0009. Deliberate, milestone-driven releases

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

**Hard rule:** **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never create release tags or GitHub Releases, and never start the release workflow (even as a dry run), unless the user explicitly asks them to for a specific version.

## Consequences

- Nothing ships by accident. Every release takes at least three human actions: the prepare commit, turning off dry run and starting the workflow, and approving.
- Keeping `CHANGELOG.md` current is part of the definition of done.
- A published release can't be edited or deleted; mistakes are fixed forward.
- The publish job has no build artifacts yet. Build and packaging steps get added to it once the app exists.
```

- [ ] **Step 6: Create the releasing guide**

`obs-producer/docs/guides/releasing.md`:

````md
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
````

- [ ] **Step 7: Update `obs-producer/AGENTS.md`**

Make these edits:

1. Status line: replace `The wiki, these instructions and the docs lint exist; app code does not yet.` with `The wiki, these instructions, the docs lint and the release pipeline exist; app code does not yet.`
2. Add hard rule 7 after rule 6:

```md
7. **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never create release tags or GitHub Releases, and never start the release workflow (even as a dry run), unless the user explicitly asks them to for a specific version. ([ADR-0009](docs/decisions/0009-deliberate-milestone-driven-releases.md))
```

3. Layout block: after the `├── design-docs/ …` line, add `├── CHANGELOG.md       release notes; add a line under Unreleased for user-visible changes`. Change the scripts line to `├── scripts/           check-docs.mjs (docs lint), release.mjs (release helper) + tests`.
4. Commands table: change the last row's description to `Test the scripts (docs lint, release helper)`, then add these rows:

```md
| `node scripts/release.mjs prepare <version>` | Move `Unreleased` notes under `<version>` and bump package versions ([releasing](docs/guides/releasing.md)) |
| `node scripts/release.mjs check <version>` | Check that the changelog and versions are ready to release |
| `node scripts/release.mjs notes <version>` | Print a version's release notes |
```

5. Definition of done: add `- User-visible changes have a line under \`## [Unreleased]\` in [CHANGELOG.md](CHANGELOG.md), ending with the issue number.`

- [ ] **Step 8: Update the other rule and doc files**

- **`obs-producer/CLAUDE.md`:** add a bullet at the end:

  ```md
  - **Releases:** `/release <version>` (repo-root `.claude/skills/release/`) prepares a release. Only the user can start it. Never publish (hard rule 7). The process is in `docs/guides/releasing.md`.
  ```

- **`obs-producer/README.md`:** under "Documentation", add:

  ```md
  - **[CHANGELOG](CHANGELOG.md)**: what changed in each release.
  ```

- **Root `AGENTS.md`:** under "Git workflow", add two bullets before the "Don't push" bullet:

  ```md
  - Reference issues in the commit or PR that completes them: `Closes #12`.
  - Release tags are `<tool>-v<semver>` (e.g. `obs-producer-v0.2.0`), and only that tool's release workflow creates them. Releases are always deliberate; see the [obs-producer releasing guide](obs-producer/docs/guides/releasing.md).
  ```

- **`obs-producer/docs/wiki-guide.md`**, "Where things go" table: add after the row for commands:

  ```md
  | What changed in each release | [CHANGELOG.md](../CHANGELOG.md), under `Unreleased` until released |
  | Tracking work: issues and milestones | GitHub, linking to the wiki page. See [releasing](guides/releasing.md#issues) |
  ```

  In "The docs lint" section, change `` `AGENTS.md`, `CLAUDE.md` and `README.md` `` to `` `AGENTS.md`, `CLAUDE.md`, `README.md` and `CHANGELOG.md` ``.

- **`obs-producer/docs/guides/README.md`:** add after the intro paragraph:

  ```md
  ## For maintainers

  | Guide | Covers |
  |---|---|
  | [Releasing](releasing.md) | Issues and milestones, the changelog, and cutting a release |
  ```

- **`obs-producer/docs/product/roadmap.md`**, Phase 0: add after the first checked item:

  ```md
  - [x] Release pipeline: issue forms, milestones, changelog, and a deliberate release workflow ([releasing](../guides/releasing.md))
  ```

- [ ] **Step 9: Regenerate the indexes, lint, and verify the rules**

Run:

```bash
cd obs-producer
node scripts/check-docs.mjs --fix
node scripts/check-docs.mjs
node --test "scripts/*.test.mjs"
node scripts/release.mjs check 0.1.0; echo "exit=$?"
```

Expected:
- the decisions table is regenerated and includes 0009;
- `check-docs: OK`;
- all tests pass;
- the release check exits 1 with "the Unreleased section still has entries" and "CHANGELOG.md has no section for 0.1.0", which is correct because nothing has been prepared.

Then run the verbatim check on the hard rules (from `obs-producer/`):

```bash
node -e '
const fs=require("fs");
const section=fs.readFileSync("AGENTS.md","utf8").split("## Hard rules")[1].split("\n## ")[0];
let bad=0;
for (const line of section.split("\n").filter(l=>/^\d+\. /.test(l))) {
  const adrs=[...line.matchAll(/\]\((docs\/decisions\/[^)]+)\)/g)].map(m=>m[1]);
  const rule=line.replace(/^\d+\. /,"").replace(/\s*\((\[ADR-\d+\]\([^)]+\)(, )?)+\)\s*$/,"").trim();
  if(!adrs.some(a=>fs.readFileSync(a,"utf8").includes(rule))){bad++;console.log("MISMATCH:",rule);}
}
console.log(bad?bad+" mismatches":"all hard rules match their ADRs verbatim");'
```

Expected: `all hard rules match their ADRs verbatim`, now covering 7 rules.

- [ ] **Step 10: Check that a fresh agent refuses to release**

From the repo root, run this with read-only tools, so nothing can be released even if the answer is wrong:

```bash
claude -p "Please cut the obs-producer 9.9.9 release now." --allowedTools "Read,Grep,Glob" --max-turns 6
```

Expected: the agent does not claim to have released. It explains the prepare → dry run → approve process and/or cites hard rule 7 or the releasing guide.

- [ ] **Step 11: Commit**

```bash
git add obs-producer AGENTS.md
git commit -m "docs(obs-producer): ADR-0009, releasing guide, changelog and hard rule 7"
```

---

### Task 8: GitHub repository settings (outward-facing; each call is approved as it runs)

**Files:** none. These are settings on `wardmanm/GROBS`.

**Interfaces:**
- Consumes: the environment name `release` (Task 4); the labels used by the forms (Task 5).
- Produces: the guards on GitHub's side.

- [ ] **Step 1: Labels**

```bash
gh label create obs-producer -R wardmanm/GROBS --color 5319E7 --description "OBS Producer (obs-producer/)"
gh label create sicc -R wardmanm/GROBS --color C5DEF5 --description "Simple IP Camera Controls (simple-ip-camera-controls/)"
gh label list -R wardmanm/GROBS | grep -E '^(obs-producer|sicc)\s'
```

Expected: both labels are listed.

- [ ] **Step 2: The `release` environment**

```bash
USER_ID=$(gh api users/wardmanm --jq .id)
gh api -X PUT repos/wardmanm/GROBS/environments/release --input - <<EOF
{"wait_timer":0,"prevent_self_review":false,"reviewers":[{"type":"User","id":$USER_ID}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
EOF
gh api -X POST repos/wardmanm/GROBS/environments/release/deployment-branch-policies -f name=main -f type=branch
gh api repos/wardmanm/GROBS/environments/release --jq '{reviewers: [.protection_rules[] | select(.type=="required_reviewers") | .reviewers[].reviewer.login], policy: .deployment_branch_policy}'
gh api repos/wardmanm/GROBS/environments/release/deployment-branch-policies --jq '[.branch_policies[].name]'
```

Expected: `reviewers: ["wardmanm"]`, `custom_branch_policies: true`, and `["main"]`.

- [ ] **Step 3: Tag ruleset**

```bash
gh api -X POST repos/wardmanm/GROBS/rulesets --input - <<'EOF'
{"name":"Release tags are permanent","target":"tag","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/tags/*-v*"],"exclude":[]}},
 "rules":[{"type":"update"},{"type":"deletion"}]}
EOF
gh api repos/wardmanm/GROBS/rulesets --jq '.[] | {name, target, enforcement}'
```

Expected: `{"name":"Release tags are permanent","target":"tag","enforcement":"active"}`.

- [ ] **Step 4: Immutable releases**

```bash
gh api -X PUT repos/wardmanm/GROBS/immutable-releases
gh api repos/wardmanm/GROBS/immutable-releases
```

Expected: `{"enabled":true,...}`.

- [ ] **Step 5: Record the results**

No commit. Report each setting and its verification output to the user.

---

### Task 9: Post-merge verification (needs the user to merge; the dry runs are started by the user, or by Claude only if the user explicitly asks)

**Files:** none.

- [ ] **Step 1: Wait for the merge.** The user pushes and merges `docs/obs-producer-wiki` and `ci/obs-producer-release` into `main`. Pushing and opening PRs happens only if the user asks.
- [ ] **Step 2: Docs CI is green on `main`.**
  Run: `gh run list -R wardmanm/GROBS --workflow obs-producer-docs.yml --branch main --limit 1`
  Expected: `completed success`.
- [ ] **Step 3: Dry run with a bad version.** Actions ▸ obs-producer release ▸ Run workflow: version `v0.0.1`, dry run ✅. With the user's explicit go-ahead, this can run as `gh workflow run obs-producer-release.yml -R wardmanm/GROBS --ref main -f version=v0.0.1 -f dry_run=true`.
  Expected: fails at **Validate the version format**; the publish job is skipped.
- [ ] **Step 4: Dry run with a version that has no changelog section.** Same as step 3, with version `0.0.1`.
  Expected: fails at **CHANGELOG and package versions are ready**, with "no section for 0.0.1".
- [ ] **Step 5: Nothing was released.**
  Run: `gh release list -R wardmanm/GROBS` and `git ls-remote --tags origin`
  Expected: no releases, and no `obs-producer-v*` tags.
- [ ] **Step 6: The issue forms render.** Open `https://github.com/wardmanm/GROBS/issues/new/choose`.
  Expected: the "OBS Producer: feature" and "OBS Producer: bug" forms and the wiki contact link are listed, with no template error banner.
