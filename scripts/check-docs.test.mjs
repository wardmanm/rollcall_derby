// Tests for check-docs.mjs. Run: node --test scripts/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDocs, collectOpenQuestions, nextAdrNumber } from './check-docs.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-docs.mjs');

// A minimal wiki that passes every check. Tests override single files to break one rule.
const BASELINE = {
  'AGENTS.md': '# Agents\n\nSee the [wiki](docs/README.md).\n',
  'docs/README.md': `---
title: Home
---
# Home

- [Wiki guide](wiki-guide.md)
- [Features](features/README.md)
- [Decisions](decisions/README.md)
`,
  'docs/wiki-guide.md': `---
title: Wiki guide
---
# Wiki guide

## Page types

Start from the [feature template](templates/feature.md). See [page types](#page-types).
`,
  'docs/features/README.md': `---
title: Features
---
# Features

<!-- generated:features -->
| Feature | Status | Summary |
| --- | --- | --- |
| [Alpha](alpha.md) | planned | The alpha feature |
<!-- /generated:features -->
`,
  'docs/features/alpha.md': `---
title: Alpha
status: planned
summary: The alpha feature
---
# Alpha

## Open questions

- Do we need alpha?

## Notes

Not a question.
`,
  'docs/decisions/README.md': `---
title: Decisions
---
# Decisions

<!-- generated:decisions -->
| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-use-adrs.md) | Use ADRs | accepted | 2026-09-28 |
<!-- /generated:decisions -->
`,
  'docs/decisions/0001-use-adrs.md': `---
title: Use ADRs
status: accepted
date: 2026-09-28
---
# Use ADRs
`,
  // Templates are exempt: no frontmatter, placeholder links, unreachable is fine.
  'docs/templates/feature.md': '# {{Title}}\n\n[placeholder](nope.md)\n',
};

const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function makeTree(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-docs-'));
  roots.push(root);
  for (const [rel, content] of Object.entries({ ...BASELINE, ...overrides })) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

function errorsFor(overrides) {
  return checkDocs(makeTree(overrides)).errors;
}

function assertError(errors, fragment) {
  assert.ok(
    errors.some((e) => e.includes(fragment)),
    `expected an error containing ${JSON.stringify(fragment)}, got:\n${errors.join('\n') || '(none)'}`,
  );
}

const ADR_0002 = `---
title: Pick a stack
status: accepted
date: 2026-09-28
---
# Pick a stack
`;

const DECISIONS_INDEX_2 = `---
title: Decisions
---
# Decisions

<!-- generated:decisions -->
| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-use-adrs.md) | Use ADRs | accepted | 2026-09-28 |
| [0002](0002-pick-a-stack.md) | Pick a stack | accepted | 2026-09-28 |
<!-- /generated:decisions -->
`;

// --- baseline ---

test('a valid wiki produces no errors', () => {
  assert.deepEqual(errorsFor({}), []);
});

// --- frontmatter ---

test('reports a page without a title', () => {
  assertError(
    errorsFor({ 'docs/wiki-guide.md': '# Wiki guide\n\n## Page types\n\n[t](templates/feature.md)\n' }),
    'docs/wiki-guide.md: missing frontmatter field "title"',
  );
});

test('reports a feature with an invalid status', () => {
  const page = BASELINE['docs/features/alpha.md'].replace('status: planned', 'status: someday');
  assertError(errorsFor({ 'docs/features/alpha.md': page }), 'docs/features/alpha.md: invalid status "someday"');
});

test('reports a feature without a summary', () => {
  const page = BASELINE['docs/features/alpha.md'].replace('summary: The alpha feature\n', '');
  assertError(
    errorsFor({ 'docs/features/alpha.md': page }),
    'docs/features/alpha.md: missing frontmatter field "summary"',
  );
});

test('reports an ADR without a valid date', () => {
  const page = BASELINE['docs/decisions/0001-use-adrs.md'].replace('date: 2026-09-28', 'date: last week');
  assertError(
    errorsFor({ 'docs/decisions/0001-use-adrs.md': page }),
    'docs/decisions/0001-use-adrs.md: invalid date "last week"',
  );
});

test('reports a superseded ADR without superseded_by', () => {
  const page = BASELINE['docs/decisions/0001-use-adrs.md'].replace('status: accepted', 'status: superseded');
  assertError(errorsFor({ 'docs/decisions/0001-use-adrs.md': page }), 'superseded ADR requires "superseded_by"');
});

test('reports superseded_by that does not match an existing ADR', () => {
  const page = BASELINE['docs/decisions/0001-use-adrs.md'].replace(
    'status: accepted',
    'status: superseded\nsuperseded_by: "0009"',
  );
  assertError(errorsFor({ 'docs/decisions/0001-use-adrs.md': page }), 'superseded_by "0009" does not match an ADR');
});

// --- links ---

test('reports a broken relative link', () => {
  assertError(
    errorsFor({ 'docs/wiki-guide.md': BASELINE['docs/wiki-guide.md'] + '\n[gone](missing.md)\n' }),
    'docs/wiki-guide.md: broken link "missing.md"',
  );
});

test('reports a link to a heading that does not exist', () => {
  assertError(
    errorsFor({ 'docs/wiki-guide.md': BASELINE['docs/wiki-guide.md'] + '\n[q](features/alpha.md#no-such-heading)\n' }),
    'docs/wiki-guide.md: broken anchor "features/alpha.md#no-such-heading"',
  );
});

test('accepts anchors that follow GitHub heading slugs', () => {
  const page = BASELINE['docs/features/alpha.md'] + '\n## Risks & `edge` cases\n\n## Notes\n';
  const guide =
    BASELINE['docs/wiki-guide.md'] +
    '\n[a](features/alpha.md#risks--edge-cases) [b](features/alpha.md#notes-1) [c](features/alpha.md#open-questions)\n';
  assert.deepEqual(errorsFor({ 'docs/features/alpha.md': page, 'docs/wiki-guide.md': guide }), []);
});

test('accepts links to explicit HTML anchors', () => {
  const page =
    BASELINE['docs/features/alpha.md'] + '\n| <a id="jammer"></a>**Jammer** | scores |\n<a name="legacy"></a>\n';
  const guide = BASELINE['docs/wiki-guide.md'] + '\n[j](features/alpha.md#jammer) [l](features/alpha.md#legacy)\n';
  assert.deepEqual(errorsFor({ 'docs/features/alpha.md': page, 'docs/wiki-guide.md': guide }), []);
});

test('ignores links inside code fences and inline code', () => {
  const guide = BASELINE['docs/wiki-guide.md'] + '\n```md\n[x](fenced.md)\n```\n\nUse `[y](inline.md)` syntax.\n';
  assert.deepEqual(errorsFor({ 'docs/wiki-guide.md': guide }), []);
});

test('ignores external links', () => {
  const guide = BASELINE['docs/wiki-guide.md'] + '\n[a](https://example.com/x.md) [b](mailto:a@b.c)\n';
  assert.deepEqual(errorsFor({ 'docs/wiki-guide.md': guide }), []);
});

test('checks links in the root agent instruction files', () => {
  assertError(
    errorsFor({ 'AGENTS.md': '# Agents\n\n[wiki](docs/nope.md)\n' }),
    'AGENTS.md: broken link "docs/nope.md"',
  );
});

test('checks links in CHANGELOG.md but not its link reference definitions', () => {
  const changelog =
    '# Changelog\n\nSee the [guide](docs/nope.md).\n\n## [Unreleased]\n\n[Unreleased]: https://example.com\n';
  const errors = errorsFor({ 'CHANGELOG.md': changelog });
  assert.deepEqual(errors, ['CHANGELOG.md: broken link "docs/nope.md"']);
});

// --- reachability ---

test('reports a page that is not reachable from docs/README.md', () => {
  const orphan = '---\ntitle: Orphan\n---\n# Orphan\n';
  assertError(errorsFor({ 'docs/orphan.md': orphan }), 'docs/orphan.md: not reachable from docs/README.md');
});

test('exempts templates from every check', () => {
  const errors = errorsFor({ 'docs/templates/adr.md': '# {{Title}}\n[x](missing.md)\n' });
  assert.deepEqual(errors, []);
});

// --- ADR numbering ---

test('reports an ADR filename that does not match NNNN-kebab.md', () => {
  const errors = errorsFor({ 'docs/decisions/2-Bad_Name.md': ADR_0002 });
  assertError(errors, 'docs/decisions/2-Bad_Name.md: ADR filename must match NNNN-kebab-case.md');
});

test('reports duplicate ADR numbers', () => {
  assertError(errorsFor({ 'docs/decisions/0001-another.md': ADR_0002 }), 'duplicate ADR number 0001');
});

test('reports gaps in ADR numbering', () => {
  assertError(
    errorsFor({ 'docs/decisions/0003-pick-a-stack.md': ADR_0002 }),
    'ADR numbers are not sequential: missing 0002',
  );
});

// --- generated tables ---

test('reports a stale features table', () => {
  const page = BASELINE['docs/features/alpha.md'].replace('status: planned', 'status: shipped');
  assertError(
    errorsFor({ 'docs/features/alpha.md': page }),
    'docs/features/README.md: generated table "features" is out of date',
  );
});

test('reports a stale decisions table', () => {
  assertError(
    errorsFor({ 'docs/decisions/0002-pick-a-stack.md': ADR_0002 }),
    'docs/decisions/README.md: generated table "decisions" is out of date',
  );
});

test('reports an index page missing its generated block', () => {
  assertError(
    errorsFor({ 'docs/features/README.md': '---\ntitle: Features\n---\n# Features\n\n[Alpha](alpha.md)\n' }),
    'docs/features/README.md: missing <!-- generated:features --> block',
  );
});

test('renders superseded ADRs with a link to their replacement', () => {
  const root = makeTree({
    'docs/decisions/0001-use-adrs.md': BASELINE['docs/decisions/0001-use-adrs.md'].replace(
      'status: accepted',
      'status: superseded\nsuperseded_by: "0002"',
    ),
    'docs/decisions/0002-pick-a-stack.md': ADR_0002,
  });
  checkDocs(root, { fix: true });
  const index = readFileSync(join(root, 'docs/decisions/README.md'), 'utf8');
  assert.match(
    index,
    /\| \[0001\]\(0001-use-adrs\.md\) \| Use ADRs \| superseded by \[0002\]\(0002-pick-a-stack\.md\) \| 2026-09-28 \|/,
  );
});

test('--fix regenerates stale tables and a second run changes nothing', () => {
  const root = makeTree({ 'docs/decisions/0002-pick-a-stack.md': ADR_0002 });
  const first = checkDocs(root, { fix: true });
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first.fixed, ['docs/decisions/README.md']);
  assert.equal(readFileSync(join(root, 'docs/decisions/README.md'), 'utf8'), DECISIONS_INDEX_2);
  const second = checkDocs(root, { fix: true });
  assert.deepEqual(second.fixed, []);
});

test('--fix escapes pipes in summaries', () => {
  const page = BASELINE['docs/features/alpha.md'].replace('summary: The alpha feature', 'summary: Teams | rosters');
  const root = makeTree({ 'docs/features/alpha.md': page });
  checkDocs(root, { fix: true });
  assert.match(readFileSync(join(root, 'docs/features/README.md'), 'utf8'), /\| Teams \\\| rosters \|/);
});

// --- helpers ---

test("collectOpenQuestions returns each page's open questions section", () => {
  const questions = collectOpenQuestions(makeTree());
  assert.deepEqual(questions, [{ file: 'docs/features/alpha.md', title: 'Alpha', body: '- Do we need alpha?' }]);
});

test('nextAdrNumber returns the highest ADR number plus one, zero-padded', () => {
  assert.equal(nextAdrNumber(makeTree({ 'docs/decisions/0002-pick-a-stack.md': ADR_0002 })), '0003');
  assert.equal(nextAdrNumber(makeTree({ 'docs/decisions/0001-use-adrs.md': null })), '0001');
});

// --- CLI ---

test('CLI exits 0 on a clean wiki and 1 with errors listed', () => {
  const clean = spawnSync(process.execPath, [SCRIPT, '--root', makeTree()], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  const broken = spawnSync(
    process.execPath,
    [SCRIPT, '--root', makeTree({ 'docs/orphan.md': '---\ntitle: O\n---\n' })],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /docs\/orphan\.md: not reachable/);
});

test('CLI --next-adr prints the next number', () => {
  const out = spawnSync(process.execPath, [SCRIPT, '--root', makeTree(), '--next-adr'], { encoding: 'utf8' });
  assert.equal(out.stdout.trim(), '0002');
});
