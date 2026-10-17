// Tests for release.mjs. Run: node --test "scripts/*.test.mjs"
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
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
  isUnreleased,
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
