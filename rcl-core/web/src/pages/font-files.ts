import { MAX_FONT_BYTES, type FontStyle, type FontType } from '@rollcall/core-contract';

// Checking and naming a font file before it's uploaded (docs/features/theme-builder.md). The server checks it again,
// by its bytes (ADR-0022).

// Browsers often leave a font file's type blank, so its extension says what it is.
const FONT_EXTENSIONS: Partial<Record<string, FontType>> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

/** The font type a file's name says it is, or undefined when it isn't a font. */
export const fontTypeOf = (fileName: string): FontType | undefined =>
  FONT_EXTENSIONS[/\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? ''];

/** Why a chosen file can't be uploaded, or null. */
export function fontProblem(file: File): string | null {
  if (!fontTypeOf(file.name)) return 'Use a WOFF2, WOFF, TTF or OTF font';
  if (file.size > MAX_FONT_BYTES) return 'That font is over 5 MB';
  return null;
}

// The words font files use for their weight.
const WEIGHTS: Partial<Record<string, number>> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};
// A word that is only a weight, a style or both, such as "Bold", "Italic" or "SemiBoldItalic".
const STYLE_WORD = /^([a-z]*?)(italic|oblique)?$/i;

/**
 * A guess at a font file's family, weight and style from its name: "Rollerball-BoldItalic.woff2" is Rollerball, 700,
 * italic. The family keeps only what a family name may hold. The person corrects it before uploading.
 */
export function suggestFace(fileName: string): { family: string; weight: string; style: FontStyle } {
  let weight = 400;
  let style: FontStyle = 'normal';
  const words: string[] = [];
  const name = fileName.replace(/\.[^.]*$/, '').replaceAll(/\[[^\]]*\]/g, ' ');
  for (const word of name.split(/[-_\s]+/).filter(Boolean)) {
    const match = STYLE_WORD.exec(word);
    const weightWord = match?.[1] ?? '';
    const italic = match?.[2];
    const weightValue = WEIGHTS[weightWord.toLowerCase()];
    const isStyle = match !== null && (weightWord === '' ? italic !== undefined : weightValue !== undefined);
    if (!isStyle) {
      words.push(word);
      continue;
    }
    if (weightValue !== undefined) weight = weightValue;
    if (italic !== undefined) style = 'italic';
  }
  const family = words
    .join(' ')
    .replaceAll(/[^A-Za-z0-9 _-]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
  return { family, weight: String(weight), style };
}
