import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { FontFamilySchema } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import type { Access } from '../auth/access.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { listFonts } from '../fonts/fonts.ts';

const READ: { config: { access: Access } } = { config: { access: { permission: 'core:fonts.read' } } };
const TAGS = ['core/fonts'];

// The font library (docs/features/theme-builder.md): every family, bundled and uploaded, with its faces' addresses.
export function registerFontRoutes(fastify: FastifyInstance, { db }: { db: AppDatabase }) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/fonts',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'List font families, bundled first, each with its faces',
        response: { 200: FontFamilySchema.array(), ...ERROR_RESPONSES },
      },
    },
    async () => listFonts(db),
  );
}
