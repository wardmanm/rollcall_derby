// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { EXIT_KEYFRAMES } from './components/roster/animations.ts';

// ADR-0006: the overlay entry must stay lean. This builds the Producer app for real and inspects which modules
// each page actually loads, and the overlay's real CSS module names, which Vitest stands in for.
interface ManifestChunk {
  file: string;
  imports?: string[];
  css?: string[];
}

interface OutputChunk {
  type: 'chunk' | 'asset';
  fileName: string;
  moduleIds?: string[];
}

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), 'rollcall-producer-build-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

// Every chunk a page loads: its entry chunk and everything it imports, transitively.
function chunksFor(manifest: Record<string, ManifestChunk>, key: string, seen = new Set<string>()): ManifestChunk[] {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return [];
  seen.add(key);
  return [chunk, ...(chunk.imports ?? []).flatMap((k) => chunksFor(manifest, k, seen))];
}

const mantine = (id: string) => id.includes('/@mantine/');
const webSdk = (id: string) => id.includes('/packages/web-sdk/');

let output: OutputChunk[] = [];
let manifest: Record<string, ManifestChunk> = {};
beforeAll(async () => {
  const result = (await build({
    root: webRoot,
    configFile: join(webRoot, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, manifest: true },
  })) as { output: OutputChunk[] };
  output = result.output;
  manifest = JSON.parse(readFileSync(join(outDir, '.vite/manifest.json'), 'utf8')) as Record<string, ManifestChunk>;
}, 60_000);

const modulesOf = (page: string) => {
  const files = new Set(chunksFor(manifest, page).map((chunk) => chunk.file));
  return output.filter((c) => files.has(c.fileName)).flatMap((c) => c.moduleIds ?? []);
};
const read = (files: string[]) => files.map((file) => readFileSync(join(outDir, file), 'utf8')).join('\n');

describe('overlay bundle', () => {
  it('contains no Mantine and no web SDK code', () => {
    const app = modulesOf('index.html');
    const overlay = modulesOf('overlay.html');

    expect(overlay.length).toBeGreaterThan(0);
    // The Producer app loads both, which proves the checks can see them.
    expect(app.some(mantine)).toBe(true);
    expect(app.some(webSdk)).toBe(true);
    expect(overlay.filter(mantine)).toEqual([]);
    expect(overlay.filter(webSdk)).toEqual([]);
  });

  it("names each exit's keyframes in TeamRoster's CSS module, so EXIT_ANIMATIONS can tell an exit ended", () => {
    const chunks = chunksFor(manifest, 'overlay.html');
    const js = read(chunks.map((chunk) => chunk.file));
    const css = read(chunks.flatMap((chunk) => chunk.css ?? []));
    for (const name of EXIT_KEYFRAMES) {
      // The module's exports, as the build writes them: "pop-out":`_pop-out_n9hdk_1`.
      const exported = new RegExp(`["'\`]${name}["'\`]:\\s*["'\`]([^"'\`]+)["'\`]`).exec(js)?.[1];
      expect(exported, name).toBeDefined();
      expect(css, name).toMatch(new RegExp(`@keyframes\\s+${exported}\\s*\\{`));
    }
  });
});
