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
