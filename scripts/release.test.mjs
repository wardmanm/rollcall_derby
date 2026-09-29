// Tests for release.mjs. Run: node --test "scripts/*.test.mjs"
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  parseVersion, versionError, compareVersions,
  parseChangelog, formatChangelog, prepare, REPO_URL,
} from './release.mjs';

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
