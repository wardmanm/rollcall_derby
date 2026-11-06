import { DEFAULT_TOKENS } from '@rollcall/producer-contract';

// Each sample theme's surface colour, as sample-themes.css sets it (sample-themes.test.ts keeps the two in step), keyed
// by the overlay Storybook's Theme toolbar value. A story hands it to the pieces that need the theme's surface as data.
export const SAMPLE_SURFACES: Readonly<Record<string, string>> = {
  default: DEFAULT_TOKENS.colors.surface,
  light: '#fffffff0',
  'high-contrast': '#000000',
};

/** The surface of the sample theme the toolbar has picked, or the built-in look's. */
export const sampleSurface = (theme: unknown): string =>
  (typeof theme === 'string' ? SAMPLE_SURFACES[theme] : undefined) ?? DEFAULT_TOKENS.colors.surface;
