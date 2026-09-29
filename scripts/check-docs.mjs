#!/usr/bin/env node
// Docs lint for the obs-producer wiki. Zero dependencies — Node built-ins only.
// What it checks and why: docs/wiki-guide.md#the-docs-lint
//
//   node scripts/check-docs.mjs              run all checks (exit 1 on problems)
//   node scripts/check-docs.mjs --fix        regenerate index tables, then check
//   node scripts/check-docs.mjs --questions  print every "## Open questions" section
//   node scripts/check-docs.mjs --next-adr   print the next free ADR number
//   --root <dir>                             project root (default: this script's parent)

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FEATURE_STATUSES = ['planned', 'in-progress', 'shipped', 'deprecated'];
const ADR_STATUSES = ['proposed', 'accepted', 'superseded', 'deprecated'];
const ADR_FILENAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROOT_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'CHANGELOG.md']; // link-checked only
const EXEMPT = /^docs\/templates\//;
const HOME = 'docs/README.md';

// ---------- reading pages ----------

const toPosix = (p) => p.split(sep).join('/');

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []));
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { meta, body: text.slice(match[0].length) };
}

function loadPage(root, abs) {
  const text = readFileSync(abs, 'utf8');
  return { abs, rel: toPosix(relative(root, abs)), text, ...parseFrontmatter(text) };
}

function loadDocs(root) {
  return walk(join(root, 'docs'))
    .map((abs) => loadPage(root, abs))
    .filter((p) => !EXEMPT.test(p.rel));
}

const isFeature = (p) => /^docs\/features\/[^/]+\.md$/.test(p.rel) && !p.rel.endsWith('/README.md');
const isAdr = (p) => /^docs\/decisions\/[^/]+\.md$/.test(p.rel) && !p.rel.endsWith('/README.md');
const adrNumber = (p) => ADR_FILENAME.exec(basename(p.rel))?.[1];

// ---------- markdown helpers ----------

const stripFences = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
const stripInlineCode = (text) => text.replace(/`[^`\n]*`/g, '');
const HEADING = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;

// GitHub-style heading slug (github-slugger rules).
function slugify(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

// Heading slugs plus explicit HTML anchors (<a id="x"> / <a name="x">), e.g. glossary terms.
function headingAnchors(text) {
  const counts = new Map();
  const anchors = new Set();
  const body = stripFences(text);
  for (const [, id] of body.matchAll(/<a\s[^>]*\b(?:id|name)="([^"]+)"/g)) anchors.add(id);
  for (const line of body.split(/\r?\n/)) {
    const m = HEADING.exec(line);
    if (!m) continue;
    const base = slugify(m[2]);
    const n = counts.get(base) ?? 0;
    anchors.add(n ? `${base}-${n}` : base);
    counts.set(base, n + 1);
  }
  return anchors;
}

const LINK = /!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\s*\)/g;

// Relative link targets in a page, resolved to absolute paths. External links are skipped.
function links(page) {
  const out = [];
  for (const [, raw] of stripInlineCode(stripFences(page.body)).matchAll(LINK)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) continue;
    const [pathPart, anchor] = raw.split('#');
    const abs = pathPart ? resolve(dirname(page.abs), decodeURI(pathPart)) : page.abs;
    out.push({ raw, abs, anchor });
  }
  return out;
}

// ---------- checks ----------

function checkFrontmatter(pages, adrNumbers, errors) {
  for (const p of pages) {
    const need = (field) => {
      if (!p.meta[field]) errors.push(`${p.rel}: missing frontmatter field "${field}"`);
      return p.meta[field];
    };
    need('title');
    if (isFeature(p)) {
      const status = need('status');
      if (status && !FEATURE_STATUSES.includes(status)) errors.push(`${p.rel}: invalid status "${status}"`);
      need('summary');
    }
    if (isAdr(p)) {
      const status = need('status');
      if (status && !ADR_STATUSES.includes(status)) errors.push(`${p.rel}: invalid status "${status}"`);
      const date = need('date');
      if (date && !DATE.test(date)) errors.push(`${p.rel}: invalid date "${date}" (use YYYY-MM-DD)`);
      if (status === 'superseded') {
        const by = p.meta.superseded_by;
        if (!by) errors.push(`${p.rel}: superseded ADR requires "superseded_by"`);
        else if (!adrNumbers.has(by)) errors.push(`${p.rel}: superseded_by "${by}" does not match an ADR`);
      }
    }
  }
}

function checkLinks(pages, errors) {
  const anchorCache = new Map();
  const anchorsOf = (abs) => {
    if (!anchorCache.has(abs)) anchorCache.set(abs, headingAnchors(readFileSync(abs, 'utf8')));
    return anchorCache.get(abs);
  };
  for (const p of pages) {
    for (const { raw, abs, anchor } of links(p)) {
      if (!existsSync(abs)) errors.push(`${p.rel}: broken link "${raw}"`);
      else if (anchor && abs.endsWith('.md') && !anchorsOf(abs).has(anchor)) errors.push(`${p.rel}: broken anchor "${raw}"`);
    }
  }
}

function checkReachability(root, pages, errors) {
  const byAbs = new Map(pages.map((p) => [p.abs, p]));
  const home = byAbs.get(join(root, HOME));
  if (!home) return errors.push(`${HOME}: missing (it is the wiki home page)`);
  const seen = new Set([home.abs]);
  const queue = [home];
  while (queue.length) {
    for (const { abs } of links(queue.shift())) {
      const target = existsSync(abs) && statSync(abs).isDirectory() ? join(abs, 'README.md') : abs;
      const page = byAbs.get(target);
      if (page && !seen.has(target)) {
        seen.add(target);
        queue.push(page);
      }
    }
  }
  for (const p of pages) if (!seen.has(p.abs)) errors.push(`${p.rel}: not reachable from ${HOME}`);
}

function checkAdrNumbering(adrs, errors) {
  const seen = new Set();
  for (const p of adrs) {
    const n = adrNumber(p);
    if (!n) errors.push(`${p.rel}: ADR filename must match NNNN-kebab-case.md`);
    else if (seen.has(n)) errors.push(`${p.rel}: duplicate ADR number ${n}`);
    else seen.add(n);
  }
  const max = Math.max(0, ...[...seen].map(Number));
  for (let i = 1; i <= max; i++) {
    const n = String(i).padStart(4, '0');
    if (!seen.has(n)) errors.push(`docs/decisions: ADR numbers are not sequential: missing ${n}`);
  }
}

// ---------- generated index tables ----------

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|');
const table = (head, rows) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

function renderFeatures(pages) {
  const rows = pages
    .filter(isFeature)
    .map((p) => [`[${cell(p.meta.title)}](${basename(p.rel)})`, cell(p.meta.status), cell(p.meta.summary)]);
  return table(['Feature', 'Status', 'Summary'], rows);
}

function renderDecisions(pages) {
  const adrs = pages.filter((p) => isAdr(p) && adrNumber(p));
  const fileOf = new Map(adrs.map((p) => [adrNumber(p), basename(p.rel)]));
  const rows = adrs.map((p) => {
    const n = adrNumber(p);
    const by = p.meta.superseded_by;
    const status = p.meta.status === 'superseded' && fileOf.has(by) ? `superseded by [${by}](${fileOf.get(by)})` : cell(p.meta.status);
    return [`[${n}](${basename(p.rel)})`, cell(p.meta.title), status, cell(p.meta.date)];
  });
  return table(['ADR', 'Title', 'Status', 'Date'], rows);
}

const GENERATED = [
  { name: 'features', index: 'docs/features/README.md', render: renderFeatures },
  { name: 'decisions', index: 'docs/decisions/README.md', render: renderDecisions },
];

function syncGenerated(root, pages, fix, errors, fixed) {
  for (const { name, index, render } of GENERATED) {
    const abs = join(root, index);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    const block = new RegExp(`(<!-- generated:${name} -->\\n)[\\s\\S]*?(<!-- /generated:${name} -->)`);
    if (!block.test(text)) {
      errors.push(`${index}: missing <!-- generated:${name} --> block`);
      continue;
    }
    const updated = text.replace(block, (_, open, close) => `${open}${render(pages)}\n${close}`);
    if (updated === text) continue;
    if (fix) {
      writeFileSync(abs, updated);
      fixed.push(index);
    } else {
      errors.push(`${index}: generated table "${name}" is out of date (run: node scripts/check-docs.mjs --fix)`);
    }
  }
}

// ---------- public API ----------

export function checkDocs(root, { fix = false } = {}) {
  const errors = [];
  const fixed = [];
  syncGenerated(root, loadDocs(root), fix, errors, fixed);
  const pages = loadDocs(root); // reload: --fix may have rewritten index pages
  const adrs = pages.filter(isAdr);
  const rootFiles = ROOT_FILES.map((f) => join(root, f)).filter(existsSync).map((abs) => loadPage(root, abs));

  checkFrontmatter(pages, new Set(adrs.map(adrNumber).filter(Boolean)), errors);
  checkLinks([...rootFiles, ...pages], errors);
  checkReachability(root, pages, errors);
  checkAdrNumbering(adrs, errors);
  return { errors, fixed };
}

export function collectOpenQuestions(root) {
  const found = [];
  for (const p of loadDocs(root)) {
    const lines = stripFences(p.body).split(/\r?\n/);
    const start = lines.findIndex((l) => /^##\s+Open questions\s*$/i.test(l));
    if (start < 0) continue;
    const end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
    const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
    if (body) found.push({ file: p.rel, title: p.meta.title, body });
  }
  return found;
}

export function nextAdrNumber(root) {
  const numbers = walk(join(root, 'docs/decisions'))
    .map((abs) => ADR_FILENAME.exec(basename(abs))?.[1])
    .filter(Boolean)
    .map(Number);
  return String(Math.max(0, ...numbers) + 1).padStart(4, '0');
}

// ---------- CLI ----------

function main(args) {
  const rootArg = args.indexOf('--root');
  const root = rootArg >= 0 ? resolve(args[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');

  if (args.includes('--next-adr')) {
    console.log(nextAdrNumber(root));
    return 0;
  }
  if (args.includes('--questions')) {
    for (const q of collectOpenQuestions(root)) console.log(`## ${q.title} (${q.file})\n\n${q.body}\n`);
    return 0;
  }
  const { errors, fixed } = checkDocs(root, { fix: args.includes('--fix') });
  for (const f of fixed) console.log(`regenerated table in ${f}`);
  if (errors.length) {
    console.error(`check-docs: ${errors.length} problem(s)\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    return 1;
  }
  console.log('check-docs: OK');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
