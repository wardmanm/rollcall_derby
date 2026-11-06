import { describe, expect, it } from 'vitest';
import { isSame } from './is-same.ts';

describe('isSame', () => {
  it('matches objects whatever order their keys are in, at any depth', () => {
    expect(
      isSame(
        { atOnce: 1, advance: { mode: 'timer', seconds: 5 } },
        { advance: { seconds: 5, mode: 'timer' }, atOnce: 1 },
      ),
    ).toBe(true);
    expect(isSame([1, { a: 'x', b: null }], [1, { b: null, a: 'x' }])).toBe(true);
    expect(isSame(Number.NaN, Number.NaN)).toBe(true);
  });

  it('tells apart different values, missing keys, and arrays from objects', () => {
    expect(isSame({ spot: 'top-left', edge: 48 }, { spot: 'top-left', edge: 20 })).toBe(false);
    expect(isSame({ mode: 'next' }, { mode: 'next', seconds: 5 })).toBe(false);
    expect(isSame({ a: undefined }, { b: undefined })).toBe(false);
    expect(isSame([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(isSame([1, 2], [2, 1])).toBe(false);
    expect(isSame(null, {})).toBe(false);
    expect(isSame('1', 1)).toBe(false);
  });
});
