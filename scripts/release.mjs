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
