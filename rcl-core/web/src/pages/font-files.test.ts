import { describe, expect, it } from 'vitest';
import { MAX_FONT_BYTES } from '@rollcall/core-contract';
import { fontProblem, fontTypeOf, suggestFace } from './font-files.ts';

const file = (name: string, size = 4) => new File([new Uint8Array(size)], name);

describe('fontTypeOf', () => {
  it('knows a font by its extension, since browsers often leave its type blank', () => {
    expect(['a.woff2', 'a.WOFF', 'a.ttf', 'a.Otf', 'a.svg', 'woff2'].map(fontTypeOf)).toEqual([
      'font/woff2',
      'font/woff',
      'font/ttf',
      'font/otf',
      undefined,
      undefined,
    ]);
  });
});

describe('fontProblem', () => {
  it('refuses anything but a WOFF2, WOFF, TTF or OTF file of at most 5 MB', () => {
    expect(fontProblem(file('Rollerball.woff2'))).toBeNull();
    expect(fontProblem(file('Rollerball.woff2', MAX_FONT_BYTES))).toBeNull();
    expect(fontProblem(file('Rollerball.svg'))).toBe('Use a WOFF2, WOFF, TTF or OTF font');
    expect(fontProblem(file('Rollerball.woff2', MAX_FONT_BYTES + 1))).toBe('That font is over 5 MB');
  });
});

describe('suggestFace', () => {
  it('suggests the family, weight and style from the file name, minus any weight or style words', () => {
    expect(suggestFace('Rollerball-Bold.woff2')).toEqual({ family: 'Rollerball', weight: '700', style: 'normal' });
    expect(suggestFace('Rollerball-BoldItalic.ttf')).toEqual({ family: 'Rollerball', weight: '700', style: 'italic' });
    expect(suggestFace('Open_Sans-SemiBold.otf')).toEqual({ family: 'Open Sans', weight: '600', style: 'normal' });
    expect(suggestFace('Jammer Sans Light Italic.woff')).toEqual({
      family: 'Jammer Sans',
      weight: '300',
      style: 'italic',
    });
  });

  it('suggests 400 when the name has no weight, and drops what a family name cannot hold', () => {
    expect(suggestFace('Inter[wght].ttf')).toEqual({ family: 'Inter', weight: '400', style: 'normal' });
    expect(suggestFace('Derby™ Display.woff2')).toEqual({ family: 'Derby Display', weight: '400', style: 'normal' });
  });
});
