import { z } from 'zod';

// The font library (docs/features/theme-builder.md): families that ship with Rollcall, plus faces Admins upload.
// Themes and the OBS overlay use them by family name, never from the internet (hard rule 4, ADR-0023).

/** The font types an upload may be. The server checks a file's bytes, not just its stated type. */
export const FONT_TYPES = ['font/woff2', 'font/woff', 'font/ttf', 'font/otf'] as const;
export const FontTypeSchema = z.enum(FONT_TYPES);
export type FontType = z.infer<typeof FontTypeSchema>;

/** The largest font file the server accepts: 5 MB. */
export const MAX_FONT_BYTES = 5 * 1024 * 1024;

export const FONT_STYLES = ['normal', 'italic'] as const;
export const FontStyleSchema = z.enum(FONT_STYLES);
export type FontStyle = z.infer<typeof FontStyleSchema>;

/** A family's name: letters, digits, spaces, dashes and underscores only, so it can never break out of the CSS. */
export const FontFamilyNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9 _-]{1,64}$/, 'Use 1–64 letters, digits, spaces, dashes or underscores');

const WEIGHTS = /^(\d{3})(?:-(\d{3}))?$/;

/** An upload's family, weight (`400`, or `100-900` for a variable font) and style, sent in its query string. */
export const UploadFontFaceQuerySchema = z
  .strictObject({
    family: FontFamilyNameSchema,
    weight: z.string().regex(WEIGHTS, 'Use a weight such as 400, or a range such as 100-900'),
    style: FontStyleSchema.default('normal'),
  })
  .transform(({ family, weight, style }, context) => {
    const [, min = '', max = min] = WEIGHTS.exec(weight) ?? [];
    const weightMin = Number(min);
    const weightMax = Number(max);
    if (weightMin < 100 || weightMax > 900 || weightMin > weightMax) {
      context.addIssue({ code: 'custom', path: ['weight'], message: 'Use weights from 100 to 900, lowest first' });
      return z.NEVER;
    }
    return { family, weightMin, weightMax, style };
  });
export type UploadFontFaceQuery = z.input<typeof UploadFontFaceQuerySchema>;

export const FontFaceSchema = z.strictObject({
  id: z.string(),
  weightMin: z.number().int().min(100).max(900),
  weightMax: z.number().int().min(100).max(900),
  style: FontStyleSchema,
  format: FontTypeSchema,
  /** Where the file is: /fonts/<file> for a bundled face, /media/<id> for an uploaded one. */
  url: z.string(),
});
export type FontFace = z.infer<typeof FontFaceSchema>;

export const FontFamilySchema = z.strictObject({
  name: z.string(),
  bundled: z.boolean(),
  faces: z.array(FontFaceSchema),
});
export type FontFamily = z.infer<typeof FontFamilySchema>;

// How a browser names each font type in `src: url(…) format(…)`.
const CSS_FORMATS: Record<FontType, string> = {
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'truetype',
  'font/otf': 'opentype',
};

/**
 * The `@font-face` rules for every face of `families`. Names and addresses come from the font library, whose names
 * can't contain quotes or semicolons, so the rules can't be broken out of.
 */
export function fontFaceRules(families: readonly FontFamily[]): string {
  return families
    .flatMap((family) =>
      family.faces.map((face) => {
        const weight = face.weightMin === face.weightMax ? `${face.weightMin}` : `${face.weightMin} ${face.weightMax}`;
        return [
          '@font-face {',
          `  font-family: "${family.name}";`,
          `  src: url("${face.url}") format("${CSS_FORMATS[face.format]}");`,
          `  font-weight: ${weight};`,
          `  font-style: ${face.style};`,
          '  font-display: swap;',
          '}',
        ].join('\n');
      }),
    )
    .join('\n');
}
