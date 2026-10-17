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
