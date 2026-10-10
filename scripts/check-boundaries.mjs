#!/usr/bin/env node
// Boundary check for Rollcall's workspaces (ADR-0019). Zero dependencies — Node built-ins only.
//
//   node scripts/check-boundaries.mjs   lists every crossing and exits 1, or exits 0
//
// Among @rollcall packages, each kind of workspace may depend on, and import, only these:
// - an app's server (rcl-<app>/server): @rollcall/app-sdk and contracts, never rcl-core's server or another app's;
// - rcl-core's server: the same, plus the installed apps' servers, imported only in src/installed-apps.ts;
// - a contract (rcl-<app>/contract): other contracts;
// - a web app (rcl-<app>/web): @rollcall/web-sdk and contracts;
// - a shared package (packages/*): contracts.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'rcl-core/server';
const INSTALLED_APPS = `${HOST}/src/installed-apps.ts`;
const isContract = (name) => /^@rollcall\/[a-z0-9-]+-contract$/.test(name);
const isAppServer = (name) => /^@rollcall\/[a-z0-9-]+-server$/.test(name) && name !== '@rollcall/core-server';

export function kindOf(dir) {
  if (dir === HOST) return 'host';
  if (/^rcl-[a-z0-9-]+\/server$/.test(dir)) return 'app server';
  if (/^rcl-[a-z0-9-]+\/contract$/.test(dir)) return 'contract';
  if (/^rcl-[a-z0-9-]+\/web$/.test(dir)) return 'web app';
  if (/^packages\/[^/]+$/.test(dir)) return 'shared package';
  return 'other';
}

export function allowed(kind, name) {
  switch (kind) {
    case 'host':
      return name === '@rollcall/app-sdk' || isContract(name) || isAppServer(name);
    case 'app server':
      return name === '@rollcall/app-sdk' || isContract(name);
    case 'contract':
    case 'shared package':
      return isContract(name);
    case 'web app':
      return name === '@rollcall/web-sdk' || isContract(name);
    default:
      return true;
  }
}

// The workspace folders the root package.json lists, as `dir/*` or plain folder names.
function workspaces(root) {
  const { workspaces: patterns = [] } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return patterns.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) return [pattern.replace(/\/$/, '')];
    const parent = pattern.slice(0, -2);
    if (!existsSync(join(root, parent))) return [];
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, parent, entry.name, 'package.json')))
      .map((entry) => `${parent}/${entry.name}`)
      .toSorted();
  });
}

const SKIP = new Set(['node_modules', 'dist', 'storybook-static', 'test-results', 'playwright-report']);

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sourceFiles(path);
    return /\.(m?[jt]sx?)$/.test(entry.name) ? [path] : [];
  });
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](@rollcall\/[a-z0-9-]+)/g;

// Every dependency and import that crosses a boundary, as one line each.
export function boundaryViolations(root) {
  const problems = [];
  for (const dir of workspaces(root)) {
    const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
    const kind = kindOf(dir);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    const declared = new Set(Object.keys(deps).filter((name) => name.startsWith('@rollcall/')));
    for (const name of [...declared].toSorted()) {
      if (!allowed(kind, name)) problems.push(`${dir} (${kind}) depends on ${name}`);
    }
    for (const file of sourceFiles(join(root, dir)).toSorted()) {
      const rel = relative(root, file).split(sep).join('/');
      for (const [, name] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
        if (name === pkg.name) continue;
        if (!declared.has(name)) problems.push(`${rel} imports ${name}, which ${dir}/package.json doesn't list`);
        if (kind === 'host' && isAppServer(name) && rel !== INSTALLED_APPS) {
          problems.push(`${rel} imports ${name}; only ${INSTALLED_APPS} may import an app's server`);
        }
      }
    }
  }
  return problems;
}

if (import.meta.main) {
  const problems = boundaryViolations(fileURLToPath(new URL('..', import.meta.url)));
  for (const problem of problems) console.error(`  - ${problem}`);
  console.log(problems.length ? `check-boundaries: ${problems.length} problem(s)` : 'check-boundaries: OK');
  process.exitCode = problems.length ? 1 : 0;
}
