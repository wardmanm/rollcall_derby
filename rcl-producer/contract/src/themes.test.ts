import { describe, expect, it } from 'vitest';
import { fontFaceRules, type FontFamily } from '@rollcall/core-contract';
import {
  CreateThemeRequestSchema,
  DEFAULT_TOKENS,
  familiesUsedBy,
  OverlayThemeSchema,
  SetDefaultThemeRequestSchema,
  ThemeSchema,
  ThemeTokensSchema,
  themeToCss,
  UpdateThemeRequestSchema,
  type ThemeTokens,
} from './themes.ts';

// DEFAULT_TOKENS with `change` made to a copy of them (parsing makes the copy).
function tokens(change?: (draft: ThemeTokens) => void): ThemeTokens {
  const draft = ThemeTokensSchema.parse(DEFAULT_TOKENS);
  change?.(draft);
  return draft;
}

// The built-in look with gold extra colors of these names.
const extras = (names: string[]) =>
  tokens((draft) => (draft.extras = names.map((name) => ({ name, color: '#ffd700' }))));

// The first message the token schema gives for `draft`, or undefined when it's accepted.
const problem = (draft: unknown) => ThemeTokensSchema.safeParse(draft).error?.issues[0]?.message;

const family = (name: string, faces: [number, number, 'normal' | 'italic'][]): FontFamily => ({
  name,
  bundled: false,
  faces: faces.map(([weightMin, weightMax, style], index) => ({
    id: `${name}-${index}`,
    weightMin,
    weightMax,
    style,
    format: 'font/woff2',
    url: `/media/${name}-${index}`,
  })),
});
const INTER = family('Inter', [[100, 900, 'normal']]);
const OSWALD = family('Oswald', [[200, 700, 'normal']]);
const ROLLERBALL = family('Rollerball', [
  [400, 400, 'normal'],
  [700, 700, 'italic'],
]);
const LIBRARY = [INTER, OSWALD, ROLLERBALL];

describe('ThemeTokensSchema', () => {
  it('accepts the built-in look, whose fonts are Inter', () => {
    expect(ThemeTokensSchema.parse(DEFAULT_TOKENS)).toEqual(DEFAULT_TOKENS);
    expect([DEFAULT_TOKENS.fonts.heading.family, DEFAULT_TOKENS.fonts.body.family]).toEqual(['Inter', 'Inter']);
  });

  it('accepts #rrggbb and #rrggbbaa colors, and stores them lowercase', () => {
    const parsed = ThemeTokensSchema.parse(
      tokens((draft) => {
        draft.colors.text = ' #AABBCC ';
        draft.colors.surface = '#11223344';
      }),
    );
    expect([parsed.colors.text, parsed.colors.surface]).toEqual(['#aabbcc', '#11223344']);
  });

  it('refuses any other color, in plain words', () => {
    for (const color of ['red', '#abc', '#1234567', 'rgb(0 0 0)', '']) {
      expect(problem(tokens((draft) => void (draft.colors.accent = color))), color).toBe('Use a color like #1a2b3c');
    }
  });

  it('needs every token, and nothing else', () => {
    const { border: _border, ...colors } = DEFAULT_TOKENS.colors;
    expect(problem({ ...DEFAULT_TOKENS, colors })).toBeDefined();
    expect(problem({ ...DEFAULT_TOKENS, motion: 'fade' })).toBeDefined();
  });

  it('takes weights from 100 to 900 in steps of 100', () => {
    for (const weight of [100, 500, 900]) {
      expect(problem(tokens((draft) => void (draft.fonts.body.weight = weight))), `${weight}`).toBeUndefined();
    }
    for (const weight of [0, 450, 1000]) {
      expect(problem(tokens((draft) => void (draft.fonts.heading.weight = weight))), `${weight}`).toBe(
        'Use a weight from 100 to 900, in steps of 100',
      );
    }
  });

  it('keeps sizes, corners and borders within their limits, in whole pixels', () => {
    const cases: [(draft: ThemeTokens, value: number) => void, number[], number[], string][] = [
      [(draft, value) => void (draft.fonts.size = value), [12, 96], [11, 97, 16.5], 'Use 12 to 96 pixels'],
      [(draft, value) => void (draft.shape.radius = value), [0, 64], [-1, 65, 1.5], 'Use 0 to 64 pixels'],
      [(draft, value) => void (draft.shape.borderWidth = value), [0, 16], [-1, 17], 'Use 0 to 16 pixels'],
    ];
    for (const [set, good, bad, message] of cases) {
      for (const value of good) expect(problem(tokens((draft) => set(draft, value))), `${value}`).toBeUndefined();
      for (const value of bad) expect(problem(tokens((draft) => set(draft, value))), `${value}`).toBe(message);
    }
  });

  it('cases headings as they are or in capitals, and nothing else', () => {
    expect(problem(tokens((draft) => void (draft.fonts.headingCase = 'uppercase')))).toBeUndefined();
    expect(problem({ ...DEFAULT_TOKENS, fonts: { ...DEFAULT_TOKENS.fonts, headingCase: 'lowercase' } })).toBeDefined();
  });

  it('refuses a family name that could break out of the CSS', () => {
    for (const name of ['Inter"; } body { color: red', "Inter'", 'Inter;']) {
      expect(problem(tokens((draft) => void (draft.fonts.heading.family = name))), name).toBe(
        'Use 1–64 letters, digits, spaces, dashes or underscores',
      );
    }
  });

  it('takes up to 10 extra colors, each with its own lowercase name', () => {
    expect(problem(extras(['gold', 'team-2', `a${'b'.repeat(23)}`]))).toBeUndefined();
    expect(problem(extras(Array.from({ length: 11 }, (_, index) => `extra-${index}`)))).toBe(
      'Use at most 10 extra colors',
    );
    for (const name of ['Gold', '2nd', '-gold', 'gold!', `a${'b'.repeat(24)}`, '']) {
      expect(problem(extras([name])), name).toBe('Use lowercase letters, digits and dashes, starting with a letter');
    }
    expect(problem(extras(['gold', 'gold']))).toBe('Give each extra color its own name');
  });
});

describe('theme requests and replies', () => {
  it('trims a new theme’s name and leaves its tokens to the server when none are sent', () => {
    expect(CreateThemeRequestSchema.parse({ name: '  Derby Night ' })).toEqual({ name: 'Derby Night' });
    expect(CreateThemeRequestSchema.parse({ name: 'Derby Night', tokens: DEFAULT_TOKENS }).tokens).toEqual(
      DEFAULT_TOKENS,
    );
  });

  it('refuses a blank or overlong name', () => {
    expect(CreateThemeRequestSchema.safeParse({ name: '   ' }).error?.issues[0]?.message).toBe('Give the theme a name');
    expect(UpdateThemeRequestSchema.safeParse({ name: 'x'.repeat(65) }).error?.issues[0]?.message).toBe(
      'Use at most 64 characters',
    );
  });

  it('changes only what an update sends', () => {
    expect(UpdateThemeRequestSchema.parse({})).toEqual({});
    expect(UpdateThemeRequestSchema.parse({ tokens: DEFAULT_TOKENS })).toEqual({ tokens: DEFAULT_TOKENS });
  });

  it('sets or clears the default theme', () => {
    expect(SetDefaultThemeRequestSchema.parse({ themeId: 't1' })).toEqual({ themeId: 't1' });
    expect(SetDefaultThemeRequestSchema.parse({ themeId: null })).toEqual({ themeId: null });
    expect(SetDefaultThemeRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a theme as the server sends it, and the overlay’s theme', () => {
    const theme = {
      id: 't1',
      name: 'Derby Night',
      tokens: DEFAULT_TOKENS,
      isDefault: true,
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T11:00:00.000Z',
    };
    expect(ThemeSchema.parse(theme)).toEqual(theme);
    expect(OverlayThemeSchema.parse({ tokens: DEFAULT_TOKENS, families: [INTER] })).toEqual({
      tokens: DEFAULT_TOKENS,
      families: [INTER],
    });
  });
});

describe('familiesUsedBy', () => {
  it('picks the heading and body families from the library, in its order, ignoring case', () => {
    const used = tokens((draft) => {
      draft.fonts.heading.family = 'rollerball';
      draft.fonts.body.family = 'Oswald';
    });
    expect(familiesUsedBy(used, LIBRARY)).toEqual([OSWALD, ROLLERBALL]);
    expect(familiesUsedBy(DEFAULT_TOKENS, LIBRARY)).toEqual([INTER]);
    expect(familiesUsedBy(DEFAULT_TOKENS, [])).toEqual([]);
  });
});

describe('themeToCss', () => {
  it('sets every variable from the tokens, with font stacks that fall back to the system font', () => {
    const { variables } = themeToCss(
      tokens((draft) => {
        draft.fonts.heading = { family: 'Oswald', weight: 700 };
        draft.fonts.headingCase = 'uppercase';
        draft.extras = [{ name: 'gold', color: '#ffd700' }];
      }),
      LIBRARY,
    );
    expect(variables).toEqual({
      '--theme-color-text': DEFAULT_TOKENS.colors.text,
      '--theme-color-text-muted': DEFAULT_TOKENS.colors.textMuted,
      '--theme-color-surface': DEFAULT_TOKENS.colors.surface,
      '--theme-color-surface-alt': DEFAULT_TOKENS.colors.surfaceAlt,
      '--theme-color-accent': DEFAULT_TOKENS.colors.accent,
      '--theme-color-on-accent': DEFAULT_TOKENS.colors.onAccent,
      '--theme-color-border': DEFAULT_TOKENS.colors.border,
      '--theme-font-heading': '"Oswald", system-ui, sans-serif',
      '--theme-font-heading-weight': '700',
      '--theme-font-body': '"Inter", system-ui, sans-serif',
      '--theme-font-body-weight': `${DEFAULT_TOKENS.fonts.body.weight}`,
      '--theme-font-size': `${DEFAULT_TOKENS.fonts.size}px`,
      '--theme-heading-transform': 'uppercase',
      '--theme-radius': `${DEFAULT_TOKENS.shape.radius}px`,
      '--theme-border-width': `${DEFAULT_TOKENS.shape.borderWidth}px`,
      '--theme-extra-gold': '#ffd700',
    });
  });

  it('declares only the heading and body families, each once, with every face’s weights and style', () => {
    const { fontFaces } = themeToCss(
      tokens((draft) => {
        draft.fonts.heading.family = 'Rollerball';
        draft.fonts.body.family = 'Oswald';
      }),
      LIBRARY,
    );
    expect(fontFaces).toBe(fontFaceRules([OSWALD, ROLLERBALL]));
    expect(fontFaces).toContain('font-weight: 200 700;');
    expect(fontFaces).toContain('font-style: italic;');
    expect(themeToCss(DEFAULT_TOKENS, LIBRARY).fontFaces).toBe(fontFaceRules([INTER]));
  });

  it('matches family names regardless of case, as browsers do', () => {
    const { fontFaces } = themeToCss(
      tokens((draft) => void (draft.fonts.body.family = 'oswald')),
      LIBRARY,
    );
    expect(fontFaces).toBe(fontFaceRules([INTER, OSWALD]));
  });

  it('declares nothing for a family missing from the library', () => {
    const missing = tokens((draft) => {
      draft.fonts.heading.family = 'Gone';
      draft.fonts.body.family = 'Gone';
    });
    expect(themeToCss(missing, LIBRARY).fontFaces).toBe('');
    expect(themeToCss(missing, LIBRARY).variables['--theme-font-body']).toBe('"Gone", system-ui, sans-serif');
  });
});
