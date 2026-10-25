import { z } from 'zod';
import { FontFamilyNameSchema, FontFamilySchema, fontFaceRules, type FontFamily } from '@rollcall/core-contract';

// Themes (docs/features/theme-builder.md): named sets of tokens that compile to the CSS custom properties every overlay
// component styles itself with (ADR-0006). The editor's preview and the OBS overlay both use themeToCss, so they match.

/** `#rrggbb`, or `#rrggbbaa` with transparency, stored lowercase. */
const ColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/, 'Use a color like #1a2b3c');

// A whole number of pixels. Anything else, even a cleared field's NaN, gets the same plain message.
function pixels(min: number, max: number) {
  const rule = `Use ${min} to ${max} pixels`;
  return z.number({ error: rule }).int(rule).min(min, rule).max(max, rule);
}

const WEIGHT_RULE = 'Use a weight from 100 to 900, in steps of 100';
const FontTokenSchema = z.strictObject({
  family: FontFamilyNameSchema,
  weight: z.number().min(100, WEIGHT_RULE).max(900, WEIGHT_RULE).multipleOf(100, WEIGHT_RULE),
});

export const HEADING_CASES = ['none', 'uppercase'] as const;
export const MAX_EXTRA_COLORS = 10;

const ExtraColorSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,23}$/, 'Use lowercase letters, digits and dashes, starting with a letter'),
  color: ColorSchema,
});

/** Every token a theme sets. All are required, so a stored theme always styles every overlay component. */
export const ThemeTokensSchema = z.strictObject({
  colors: z.strictObject({
    text: ColorSchema,
    textMuted: ColorSchema,
    surface: ColorSchema,
    surfaceAlt: ColorSchema,
    accent: ColorSchema,
    onAccent: ColorSchema,
    border: ColorSchema,
  }),
  fonts: z.strictObject({
    heading: FontTokenSchema,
    body: FontTokenSchema,
    size: pixels(12, 96),
    headingCase: z.enum(HEADING_CASES),
  }),
  shape: z.strictObject({
    radius: pixels(0, 64),
    borderWidth: pixels(0, 16),
  }),
  /** Named extra colors, as `--theme-extra-<name>`. Overlay components rely only on the fixed tokens above. */
  extras: z
    .array(ExtraColorSchema)
    .max(MAX_EXTRA_COLORS, `Use at most ${MAX_EXTRA_COLORS} extra colors`)
    .refine(
      (extras) => new Set(extras.map((extra) => extra.name)).size === extras.length,
      'Give each extra color its own name',
    ),
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

/** The built-in look: what a new theme starts from, and what the overlay uses with no default theme. */
export const DEFAULT_TOKENS: ThemeTokens = {
  colors: {
    text: '#ffffff',
    textMuted: '#ffffffcc',
    surface: '#141821d9',
    surfaceAlt: '#252b38d9',
    accent: '#228be6',
    onAccent: '#ffffff',
    border: '#228be6',
  },
  fonts: {
    heading: { family: 'Inter', weight: 700 },
    body: { family: 'Inter', weight: 400 },
    size: 16,
    headingCase: 'none',
  },
  shape: { radius: 8, borderWidth: 2 },
  extras: [],
};

const ThemeNameSchema = z.string().trim().min(1, 'Give the theme a name').max(64, 'Use at most 64 characters');

export const ThemeSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  tokens: ThemeTokensSchema,
  /** Whether the OBS overlay uses it. At most one theme is the default. */
  isDefault: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Theme = z.infer<typeof ThemeSchema>;

/** A new theme. Without tokens, it starts from the built-in look. */
export const CreateThemeRequestSchema = z.strictObject({
  name: ThemeNameSchema,
  tokens: ThemeTokensSchema.optional(),
});
export type CreateThemeRequest = z.input<typeof CreateThemeRequestSchema>;

/** A missing field stays as it is. Tokens are replaced whole. */
export const UpdateThemeRequestSchema = z.strictObject({
  name: ThemeNameSchema.optional(),
  tokens: ThemeTokensSchema.optional(),
});
export type UpdateThemeRequest = z.input<typeof UpdateThemeRequestSchema>;

/** Makes a theme the default, or with null leaves no default. The reply is the same shape. */
export const SetDefaultThemeRequestSchema = z.strictObject({ themeId: z.string().nullable() });
export type SetDefaultThemeRequest = z.infer<typeof SetDefaultThemeRequestSchema>;

/** What the OBS overlay gets: the default theme's tokens, and only the font families they use. */
export const OverlayThemeSchema = z.strictObject({
  tokens: ThemeTokensSchema,
  families: z.array(FontFamilySchema),
});
export type OverlayTheme = z.infer<typeof OverlayThemeSchema>;

export interface ThemeCss {
  /** Each CSS custom property, such as `--theme-color-accent`, with its value. */
  variables: Record<string, string>;
  /** The `@font-face` rules for the heading and body families. Empty when neither is in the library. */
  fontFaces: string;
}

// A font stack that falls back to the system font, so a family missing from the library still shows text.
const fontStack = (family: string) => `"${family}", system-ui, sans-serif`;
// Browsers match family names regardless of case, so this does too. Names are ASCII letters, digits, spaces and dashes.
const sameFamily = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The families of `library` that the theme's heading and body use, in the library's order. */
export function familiesUsedBy(tokens: ThemeTokens, library: readonly FontFamily[]): FontFamily[] {
  const names = [tokens.fonts.heading.family, tokens.fonts.body.family];
  return library.filter((family) => names.some((name) => sameFamily(name, family.name)));
}

/** The CSS for a theme: its variables, and `@font-face` rules for the families it uses that are in `families`. */
export function themeToCss(tokens: ThemeTokens, families: readonly FontFamily[]): ThemeCss {
  const { colors, fonts, shape } = tokens;
  const variables: Record<string, string> = {
    '--theme-color-text': colors.text,
    '--theme-color-text-muted': colors.textMuted,
    '--theme-color-surface': colors.surface,
    '--theme-color-surface-alt': colors.surfaceAlt,
    '--theme-color-accent': colors.accent,
    '--theme-color-on-accent': colors.onAccent,
    '--theme-color-border': colors.border,
    '--theme-font-heading': fontStack(fonts.heading.family),
    '--theme-font-heading-weight': `${fonts.heading.weight}`,
    '--theme-font-body': fontStack(fonts.body.family),
    '--theme-font-body-weight': `${fonts.body.weight}`,
    '--theme-font-size': `${fonts.size}px`,
    '--theme-heading-transform': fonts.headingCase,
    '--theme-radius': `${shape.radius}px`,
    '--theme-border-width': `${shape.borderWidth}px`,
  };
  for (const extra of tokens.extras) variables[`--theme-extra-${extra.name}`] = extra.color;
  return { variables, fontFaces: fontFaceRules(familiesUsedBy(tokens, families)) };
}
