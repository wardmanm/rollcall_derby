// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// ADR-0006: the overlay entry must stay lean. This builds the web app for real and inspects what
// the overlay page actually loads.
interface ManifestChunk {
  file: string;
  imports?: string[];
  css?: string[];
}

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), 'op-web-build-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

function filesFor(manifest: Record<string, ManifestChunk>, key: string, seen = new Set<string>()): string[] {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return [];
  seen.add(key);
  return [chunk.file, ...(chunk.css ?? []), ...(chunk.imports ?? []).flatMap((k) => filesFor(manifest, k, seen))];
}

const containsText = (files: string[], text: string) =>
  files.some((f) => readFileSync(join(outDir, f), 'utf8').toLowerCase().includes(text.toLowerCase()));

describe('overlay bundle', () => {
  it('contains no Mantine and no admin-app code', async () => {
    await build({
      root: webRoot,
      configFile: join(webRoot, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, manifest: true },
    });
    const manifest = JSON.parse(readFileSync(join(outDir, '.vite/manifest.json'), 'utf8')) as Record<string, ManifestChunk>;
    const admin = filesFor(manifest, 'index.html');
    const overlay = filesFor(manifest, 'overlay.html');

    expect(overlay.length).toBeGreaterThan(0);
    expect(containsText(admin, 'mantine')).toBe(true); // proves the check can see Mantine
    expect(containsText(overlay, 'mantine')).toBe(false);
    expect(containsText(overlay, 'Server unreachable')).toBe(false); // admin-only UI text
  }, 60_000);
});
