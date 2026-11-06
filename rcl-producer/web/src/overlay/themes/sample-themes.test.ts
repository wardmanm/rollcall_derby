// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_SURFACES, sampleSurface } from './sample-themes.ts';

const css = readFileSync(new URL('./sample-themes.css', import.meta.url), 'utf8');

describe('SAMPLE_SURFACES', () => {
  it("gives each sample theme's surface as sample-themes.css sets it", () => {
    const declared = Object.fromEntries(
      [...css.matchAll(/\.sample-theme-([\w-]+)\s*\{[^}]*--theme-color-surface:\s*([^;]+);/g)].map(
        ([, name, value]) => [name, value],
      ),
    );
    const { default: builtIn, ...samples } = SAMPLE_SURFACES;
    expect(samples).toEqual(declared);
    expect(sampleSurface('default')).toBe(builtIn);
    expect(sampleSurface(undefined)).toBe(builtIn);
  });
});
