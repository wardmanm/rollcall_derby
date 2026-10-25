// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TOKENS, themeToCss } from '@rollcall/producer-contract';

const css = readFileSync(new URL('./theme-defaults.css', import.meta.url), 'utf8');

// theme-defaults.css is the built-in look as plain CSS, for the overlay before a theme arrives and for overlay stories.
describe('theme-defaults.css', () => {
  it('sets every variable DEFAULT_TOKENS gives, to the same value', () => {
    const declared = Object.fromEntries(
      [...css.matchAll(/(--theme-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value?.replaceAll("'", '"')]),
    );
    expect(declared).toEqual(themeToCss(DEFAULT_TOKENS, []).variables);
  });
});
