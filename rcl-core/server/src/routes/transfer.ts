import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TransferKind } from '@rollcall/app-sdk';
import {
  ExportQuerySchema,
  ImportPreviewSchema,
  TransferKindInfoSchema,
  ImportQuerySchema,
  ImportResultSchema,
  MAX_EXPORT_BYTES,
} from '@rollcall/core-contract';
import type { Access } from '../auth/access.ts';
import { deny } from '../auth/access.ts';
import type { AppDatabase } from '../db.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { buildExport } from '../transfer/export.ts';
import { applyImport, planImport, previewOf } from '../transfer/import.ts';
import { TransferError } from '../transfer/zip.ts';
import { registerUploads } from './uploads.ts';

const SIGNED_IN: { config: { access: Access } } = { config: { access: { signedIn: true } } };
const TAGS = ['core/transfer'];
/** Browsers label a .zip either way. */
const ZIP_TYPES = ['application/zip', 'application/x-zip-compressed'] as const;
const TOO_LARGE = { error: 'too_large', message: 'That file is too big to import: the limit is 200 MB' };
const UNSUPPORTED = { error: 'unsupported_file', message: 'Send a Rollcall export file (.zip)' };

// Whether the caller holds a kind's permission for exporting or importing, by the same check routes use (hard rule 5).
const holds = (request: FastifyRequest, permission: TransferKind['exportPermission']) =>
  deny({ permission }, request.principal, request.server.hostedApps.permissions) === undefined;

// A TransferError as its reply; anything else goes on to the error handler.
function refuse(error: unknown, reply: FastifyReply) {
  if (error instanceof TransferError)
    return reply.code(error.status).send({ error: error.code, message: error.message });
  throw error;
}

// The request's file, planned for import, or a refusal: a body that isn't a file is refused as unsupported.
function plan(request: FastifyRequest) {
  if (!Buffer.isBuffer(request.body)) throw new TransferError(415, UNSUPPORTED.error, UNSUPPORTED.message);
  const { kinds } = request.server.hostedApps;
  return planImport({ zip: request.body, kinds, mayImport: (kind) => holds(request, kind.importPermission) });
}

// Import and export (docs/features/import-export.md, ADR-0024), for signed-in people: each item's kind is checked
// against the permission that kind names, since one file can hold several kinds.
export function registerTransferRoutes(
  fastify: FastifyInstance,
  { db, mediaDir }: { db: AppDatabase; mediaDir: string },
) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/transfer/kinds',
    {
      ...SIGNED_IN,
      schema: {
        tags: TAGS,
        summary: 'The kinds of item you may export or import, with how many of each there are',
        response: { 200: TransferKindInfoSchema.array(), ...ERROR_RESPONSES },
      },
    },
    async (request) =>
      [...request.server.hostedApps.kinds.values()]
        .filter((kind) => !kind.onlyAsNeed)
        .map((kind) => ({
          kind: kind.name,
          one: kind.label.one,
          many: kind.label.many,
          count: kind.list().length,
          mayExport: holds(request, kind.exportPermission),
          mayImport: holds(request, kind.importPermission),
        }))
        .filter((info) => info.mayExport || info.mayImport),
  );

  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/transfer/export',
    {
      ...SIGNED_IN,
      schema: {
        tags: TAGS,
        summary: 'Export chosen items, or everything of some kinds, as a Rollcall export file (.zip)',
        querystring: ExportQuerySchema,
        produces: ['application/zip'],
        response: { 200: z.unknown().describe('The export file, a .zip'), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      try {
        const { modules, kinds } = request.server.hostedApps;
        const file = buildExport({
          db,
          mediaDir,
          modules,
          kinds,
          selection: request.query,
          mayExport: (kind) => holds(request, kind.exportPermission),
        });
        return await reply
          .type('application/zip')
          .header('content-disposition', `attachment; filename="${file.fileName}"`)
          .send(Buffer.from(file.bytes));
      } catch (error) {
        return refuse(error, reply);
      }
    },
  );

  registerUploads(
    fastify,
    { types: ZIP_TYPES, maxBytes: MAX_EXPORT_BYTES, tooLarge: TOO_LARGE, unsupported: UNSUPPORTED },
    (uploads) => {
      const api = uploads.withTypeProvider<ZodTypeProvider>();
      api.post(
        '/transfer/import/preview',
        {
          ...SIGNED_IN,
          bodyLimit: MAX_EXPORT_BYTES,
          schema: {
            tags: TAGS,
            summary: "Check a Rollcall export file and say what's in it, saving nothing: the body is the .zip",
            consumes: [...ZIP_TYPES],
            response: { 200: ImportPreviewSchema, ...ERROR_RESPONSES },
          },
        },
        async (request, reply) => {
          try {
            return previewOf(plan(request));
          } catch (error) {
            return refuse(error, reply);
          }
        },
      );

      api.post(
        '/transfer/import',
        {
          ...SIGNED_IN,
          bodyLimit: MAX_EXPORT_BYTES,
          schema: {
            tags: TAGS,
            summary: 'Import a Rollcall export file as its preview’s choices say, all or nothing: the body is the .zip',
            consumes: [...ZIP_TYPES],
            querystring: ImportQuerySchema,
            response: { 200: ImportResultSchema, ...ERROR_RESPONSES },
          },
        },
        async (request, reply) => {
          try {
            return applyImport({ db, mediaDir, plan: plan(request), choices: request.query.choices });
          } catch (error) {
            return refuse(error, reply);
          }
        },
      );
    },
  );
}
