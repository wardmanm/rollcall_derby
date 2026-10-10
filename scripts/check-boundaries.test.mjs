// Tests for check-boundaries.mjs. Run: node --test "scripts/*.test.mjs"
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundaryViolations, kindOf } from './check-boundaries.mjs';

const dirs = [];
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

// A throwaway repo: `files` maps paths to contents; objects are written as JSON.
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'rollcall-boundaries-'));
  dirs.push(root);
  const all = { 'package.json': { workspaces: ['rcl-core/*', 'rcl-demo/*', 'packages/*'] }, ...files };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

const workspace = (name, dependencies = {}) => ({ name, dependencies });

test('the repo keeps every boundary', () => {
  assert.deepEqual(boundaryViolations(fileURLToPath(new URL('..', import.meta.url))), []);
});

test('kinds of workspace come from their folder', () => {
  assert.equal(kindOf('rcl-core/server'), 'host');
  assert.equal(kindOf('rcl-producer/server'), 'app server');
  assert.equal(kindOf('rcl-producer/contract'), 'contract');
  assert.equal(kindOf('rcl-producer/web'), 'web app');
  assert.equal(kindOf('packages/web-sdk'), 'shared package');
  assert.equal(kindOf('e2e'), 'other');
});

test("an app's server may use only the app SDK and contracts, never rcl-core's server or another app's", () => {
  const root = repo({
    'rcl-demo/server/package.json': workspace('@rollcall/demo-server', {
      '@rollcall/app-sdk': 'workspace:^',
      '@rollcall/demo-contract': 'workspace:^',
      '@rollcall/core-server': 'workspace:^',
      '@rollcall/producer-server': 'workspace:^',
    }),
  });
  assert.deepEqual(boundaryViolations(root), [
    'rcl-demo/server (app server) depends on @rollcall/core-server',
    'rcl-demo/server (app server) depends on @rollcall/producer-server',
  ]);
});

test("rcl-core's server imports an app's server only in src/installed-apps.ts", () => {
  const root = repo({
    'rcl-core/server/package.json': workspace('@rollcall/core-server', { '@rollcall/demo-server': 'workspace:^' }),
    'rcl-core/server/src/installed-apps.ts': "import { demoApp } from '@rollcall/demo-server';",
    'rcl-core/server/src/app.ts': "import { demoApp } from '@rollcall/demo-server';",
  });
  assert.deepEqual(boundaryViolations(root), [
    "rcl-core/server/src/app.ts imports @rollcall/demo-server; only rcl-core/server/src/installed-apps.ts may import an app's server",
  ]);
});

test("a web app, a contract or a shared package can't reach a server, and imports must be listed", () => {
  const root = repo({
    'rcl-demo/web/package.json': workspace('@rollcall/demo-web', { '@rollcall/demo-server': 'workspace:^' }),
    'rcl-demo/contract/package.json': workspace('@rollcall/demo-contract', { '@rollcall/web-sdk': 'workspace:^' }),
    'packages/thing/package.json': workspace('@rollcall/thing', { '@rollcall/app-sdk': 'workspace:^' }),
    'packages/thing/src/index.ts': "export type { X } from '@rollcall/core-contract';",
  });
  assert.deepEqual(boundaryViolations(root), [
    'rcl-demo/contract (contract) depends on @rollcall/web-sdk',
    'rcl-demo/web (web app) depends on @rollcall/demo-server',
    'packages/thing (shared package) depends on @rollcall/app-sdk',
    "packages/thing/src/index.ts imports @rollcall/core-contract, which packages/thing/package.json doesn't list",
  ]);
});
