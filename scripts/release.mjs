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
