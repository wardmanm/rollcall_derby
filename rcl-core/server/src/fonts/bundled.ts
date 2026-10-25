import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { FontFamily, FontStyle } from '@rollcall/core-contract';

// The font families that ship with Rollcall (docs/features/theme-builder.md): open-licence (SIL OFL) fonts from Google
// Fonts, each in its own folder with its licence. They're served at /fonts/<folder>/<file> to anyone, so OBS overlays
// can use them, and never come from the internet (hard rule 4).

/** Where the bundled font files are: rcl-core/server/fonts/. */
export const BUNDLED_FONTS_DIR = fileURLToPath(new URL('../../fonts', import.meta.url));

interface BundledFace {
  id: string;
  /** Its path below BUNDLED_FONTS_DIR, and below /fonts/. */
  file: string;
  weightMin: number;
  weightMax: number;
  style: FontStyle;
}

const face = (id: string, file: string, weightMin: number, weightMax = weightMin, style: FontStyle = 'normal') => ({
  id,
  file,
  weightMin,
  weightMax,
  style,
});

// Browsers and OBS keep a bundled file for a year (`immutable`), so a font file that changes needs a new file name.
const BUNDLED: readonly { name: string; faces: readonly BundledFace[] }[] = [
  { name: 'Anton', faces: [face('bundled-anton', 'anton/anton.ttf', 400)] },
  {
    name: 'Barlow Condensed',
    faces: [
      face('bundled-barlow-condensed-400', 'barlow-condensed/barlow-condensed-400.ttf', 400),
      face('bundled-barlow-condensed-600', 'barlow-condensed/barlow-condensed-600.ttf', 600),
      face('bundled-barlow-condensed-700', 'barlow-condensed/barlow-condensed-700.ttf', 700),
    ],
  },
  { name: 'Bebas Neue', faces: [face('bundled-bebas-neue', 'bebas-neue/bebas-neue.ttf', 400)] },
  { name: 'Inter', faces: [face('bundled-inter', 'inter/inter.ttf', 100, 900)] },
  { name: 'Oswald', faces: [face('bundled-oswald', 'oswald/oswald.ttf', 200, 700)] },
  {
    name: 'Roboto Condensed',
    faces: [face('bundled-roboto-condensed', 'roboto-condensed/roboto-condensed.ttf', 100, 900)],
  },
];

/** The bundled families, as the font library lists them. */
export const BUNDLED_FAMILIES: readonly FontFamily[] = BUNDLED.map((family) => ({
  name: family.name,
  bundled: true,
  faces: family.faces.map(({ id, file, weightMin, weightMax, style }) => ({
    id,
    weightMin,
    weightMax,
    style,
    format: 'font/ttf' as const,
    url: `/fonts/${file}`,
  })),
}));

const FILES = new Set(BUNDLED.flatMap((family) => family.faces.map((f) => f.file)));

// Serves each bundled font file at /fonts/<folder>/<file>, to anyone. Only the files listed above are served: any other
// path never reaches the file system.
export function serveBundledFonts(app: FastifyInstance, dir = BUNDLED_FONTS_DIR): void {
  app.get<{ Params: { folder: string; file: string } }>('/fonts/:folder/:file', async (request, reply) => {
    const file = `${request.params.folder}/${request.params.file}`;
    if (!FILES.has(file)) return reply.code(404).send({ error: 'not_found' });
    const path = join(dir, file);
    return reply
      .type('font/ttf')
      .header('content-length', statSync(path).size)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(path));
  });
}
