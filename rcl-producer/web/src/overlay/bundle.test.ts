// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// ADR-0006: the overlay entry must stay lean. This builds the Producer app for real and inspects which modules
// each page actually loads.
interface ManifestChunk {
  file: string;
  imports?: string[];
}

interface OutputChunk {
  type: 'chunk' | 'asset';
  fileName: string;
  moduleIds?: string[];
}

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), 'rollcall-producer-build-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

// Every JavaScript file a page loads: its entry chunk and everything it imports, transitively.
function filesFor(manifest: Record<string, ManifestChunk>, key: string, seen = new Set<string>()): string[] {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return [];
  seen.add(key);
  return [chunk.file, ...(chunk.imports ?? []).flatMap((k) => filesFor(manifest, k, seen))];
}

const mantine = (id: string) => id.includes('/@mantine/');
const webSdk = (id: string) => id.includes('/packages/web-sdk/');

describe('overlay bundle', () => {
  it('contains no Mantine and no web SDK code', async () => {
    const result = (await build({
      root: webRoot,
      configFile: join(webRoot, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, manifest: true },
    })) as { output: OutputChunk[] };
    const manifest = JSON.parse(readFileSync(join(outDir, '.vite/manifest.json'), 'utf8')) as Record<
      string,
      ManifestChunk
    >;
    const modulesOf = (page: string) => {
      const files = new Set(filesFor(manifest, page));
      return result.output.filter((c) => files.has(c.fileName)).flatMap((c) => c.moduleIds ?? []);
    };
    const app = modulesOf('index.html');
    const overlay = modulesOf('overlay.html');

    expect(overlay.length).toBeGreaterThan(0);
    // The Producer app loads both, which proves the checks can see them.
    expect(app.some(mantine)).toBe(true);
    expect(app.some(webSdk)).toBe(true);
    expect(overlay.filter(mantine)).toEqual([]);
    expect(overlay.filter(webSdk)).toEqual([]);
  }, 60_000);
});
