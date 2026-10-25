import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { FONT_TYPES, FontFamilySchema, MAX_FONT_BYTES, UploadFontFaceQuerySchema } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import type { Access } from '../auth/access.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { fontTypeOf, removeMedia, saveMedia } from '../media.ts';
import {
  addFontFace,
  bundledFamilyNamed,
  deleteFontFace,
  familyName,
  fontFaceTaken,
  listFonts,
} from '../fonts/fonts.ts';
import { registerUploads } from './uploads.ts';

const READ: { config: { access: Access } } = { config: { access: { permission: 'core:fonts.read' } } };
const MANAGE: { config: { access: Access } } = { config: { access: { permission: 'core:fonts.manage' } } };
const FaceParamsSchema = z.strictObject({ id: z.string() });
const UNSUPPORTED = { error: 'unsupported_font', message: 'Use a WOFF2, WOFF, TTF or OTF font' };
const TOO_LARGE = { error: 'too_large', message: 'That font is over 5 MB' };
const TAGS = ['core/fonts'];

const weightLabel = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

// The font library (docs/features/theme-builder.md): every family, bundled and uploaded, with its faces' addresses.
// Admins upload a face as the raw font file, with its family, weight and style in the query string, and remove it.
// The checks run with no `await` before their write, so two uploads can't both take a face.
export function registerFontRoutes(fastify: FastifyInstance, { db, mediaDir }: { db: AppDatabase; mediaDir: string }) {
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

  api.delete(
    '/fonts/faces/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Remove an uploaded font face, with its file',
        params: FaceParamsSchema,
        response: { 204: z.undefined(), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const mediaId = deleteFontFace(db, request.params.id);
      if (mediaId === undefined) return reply.code(404).send({ error: 'not_found' });
      removeMedia(db, mediaDir, [mediaId]);
      return reply.code(204).send();
    },
  );

  registerUploads(
    fastify,
    { types: FONT_TYPES, maxBytes: MAX_FONT_BYTES, tooLarge: TOO_LARGE, unsupported: UNSUPPORTED },
    (uploads) => {
      uploads.withTypeProvider<ZodTypeProvider>().post(
        '/fonts/faces',
        {
          ...MANAGE,
          bodyLimit: MAX_FONT_BYTES,
          schema: {
            tags: TAGS,
            summary: 'Upload a font face: the body is the file (WOFF2, WOFF, TTF or OTF, up to 5 MB)',
            consumes: [...FONT_TYPES],
            querystring: UploadFontFaceQuerySchema,
            response: { 201: FontFamilySchema, ...ERROR_RESPONSES },
          },
        },
        async (request, reply) => {
          const { weightMin, weightMax, style } = request.query;
          const bundled = bundledFamilyNamed(request.query.family);
          if (bundled) {
            return reply.code(409).send({
              error: 'family_bundled',
              message: `${bundled.name} comes with Rollcall. Upload yours under another family name.`,
            });
          }
          const family = familyName(db, request.query.family);
          const face = { family, weightMin, weightMax, style };
          if (fontFaceTaken(db, face)) {
            return reply.code(409).send({
              error: 'face_taken',
              message: `${family} already has a ${weightLabel(weightMin, weightMax)} ${style} face`,
            });
          }
          const mediaId = Buffer.isBuffer(request.body) ? saveMedia(db, mediaDir, request.body, fontTypeOf) : null;
          if (!mediaId) return reply.code(415).send(UNSUPPORTED);
          return reply.code(201).send(addFontFace(db, { ...face, mediaId }));
        },
      );
    },
  );
}
