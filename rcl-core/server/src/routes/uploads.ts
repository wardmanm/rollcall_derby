import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiError } from '@rollcall/core-contract';
import { sendApiError } from '../http.ts';

/** What one kind of upload accepts, and what it says when a body is too big or of the wrong type. */
export interface UploadKind {
  types: readonly string[];
  maxBytes: number;
  tooLarge: ApiError;
  unsupported: ApiError;
}

// Upload routes take the raw file as their body, with its type as the Content-Type (ADR-0022). They live in a plugin
// of their own, so only they accept those bodies, up to the kind's limit, and say too_large or unsupported_… when a
// body is too big or of the wrong type. The access check runs before any body is read, so a refused caller never
// sends one. JSON bodies still parse here, and a route refuses one the way it refuses any non-file body.
export function registerUploads(
  fastify: FastifyInstance,
  kind: UploadKind,
  routes: (uploads: FastifyInstance) => void,
): void {
  void fastify.register(async (uploads) => {
    uploads.addContentTypeParser(
      [...kind.types],
      { parseAs: 'buffer', bodyLimit: kind.maxBytes },
      (_request, body, done) => done(null, body),
    );
    uploads.setErrorHandler<FastifyError>((error, request, reply) => {
      if (error.statusCode === 413) return reply.code(413).send(kind.tooLarge);
      if (error.statusCode === 415) return reply.code(415).send(kind.unsupported);
      return sendApiError(error, request, reply);
    });
    routes(uploads);
  });
}
