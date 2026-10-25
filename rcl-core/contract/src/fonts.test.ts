import { describe, expect, it } from 'vitest';
import { FontFamilyNameSchema, FontFamilySchema, fontFaceRules, MAX_FONT_BYTES, type FontFamily } from './fonts.ts';

const OSWALD: FontFamily = {
  name: 'Oswald',
  bundled: true,
  faces: [
    {
      id: 'bundled-oswald',
      weightMin: 200,
      weightMax: 700,
      style: 'normal',
      format: 'font/ttf',
      url: '/fonts/oswald/oswald.ttf',
    },
  ],
};
const ROLLERBALL: FontFamily = {
  name: 'Rollerball',
  bundled: false,
  faces: [
    {
      id: 'f1',
      weightMin: 400,
      weightMax: 400,
      style: 'normal',
      format: 'font/woff2',
      url: '/media/0123456789abcdef0123456789abcdef',
    },
    {
      id: 'f2',
      weightMin: 700,
      weightMax: 700,
      style: 'italic',
      format: 'font/otf',
      url: '/media/fedcba9876543210fedcba9876543210',
    },
  ],
};

describe('FontFamilyNameSchema', () => {
  it('accepts names made of letters, digits, spaces, dashes and underscores, trimmed', () => {
    expect(FontFamilyNameSchema.parse('  Barlow Condensed ')).toBe('Barlow Condensed');
    expect(FontFamilyNameSchema.parse('Rollerball_2-Pro')).toBe('Rollerball_2-Pro');
  });

  it('refuses anything that could break out of the CSS a name goes into', () => {
    for (const name of [
      '',
      '   ',
      'x'.repeat(65),
      'Evil"; } body { color: red',
      "O'Brien",
      'a;b',
      'a{b}',
      'two\nlines',
      'url(x)',
    ]) {
      expect(FontFamilyNameSchema.safeParse(name).success, JSON.stringify(name)).toBe(false);
    }
  });
});

describe('FontFamilySchema', () => {
  it('accepts a family as the server lists it', () => {
    expect(FontFamilySchema.parse(ROLLERBALL)).toEqual(ROLLERBALL);
    expect(FontFamilySchema.safeParse({ ...OSWALD, faces: [{ ...OSWALD.faces[0], format: 'font/svg' }] }).success).toBe(
      false,
    );
  });
});

describe('fontFaceRules', () => {
  it('writes one @font-face per face, with its weights, style and the format browsers expect', () => {
    expect(fontFaceRules([OSWALD, ROLLERBALL])).toBe(
      [
        '@font-face {',
        '  font-family: "Oswald";',
        '  src: url("/fonts/oswald/oswald.ttf") format("truetype");',
        '  font-weight: 200 700;',
        '  font-style: normal;',
        '  font-display: swap;',
        '}',
        '@font-face {',
        '  font-family: "Rollerball";',
        '  src: url("/media/0123456789abcdef0123456789abcdef") format("woff2");',
        '  font-weight: 400;',
        '  font-style: normal;',
        '  font-display: swap;',
        '}',
        '@font-face {',
        '  font-family: "Rollerball";',
        '  src: url("/media/fedcba9876543210fedcba9876543210") format("opentype");',
        '  font-weight: 700;',
        '  font-style: italic;',
        '  font-display: swap;',
        '}',
      ].join('\n'),
    );
    expect(fontFaceRules([])).toBe('');
  });
});

describe('MAX_FONT_BYTES', () => {
  it('is 5 MB', () => {
    expect(MAX_FONT_BYTES).toBe(5_242_880);
  });
});
