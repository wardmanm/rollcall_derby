import { describe, expect, it } from 'vitest';
import { CORE_PAGES, safeNext, withNext } from './core-pages.ts';

describe('withNext', () => {
  it('puts the page to come back to in the query', () => {
    expect(withNext(CORE_PAGES.signIn, '/producer/?a=1&b=2')).toBe('/core/login?next=%2Fproducer%2F%3Fa%3D1%26b%3D2');
  });
});

describe('safeNext', () => {
  it('keeps a path on this server, with its query', () => {
    expect(safeNext('/producer/screens/3?tab=2')).toBe('/producer/screens/3?tab=2');
  });

  it("sends anything that could lead to another site to rcl-core's home instead", () => {
    for (const next of [null, '', 'producer', 'https://evil.example/', '//evil.example', '/\\evil.example']) {
      expect(safeNext(next), String(next)).toBe(CORE_PAGES.home);
    }
  });
});
