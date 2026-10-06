import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ApiErrorSchema } from '@obs-producer/shared';

// Every /api route lists this in its response schemas. It documents the error shape, and lets the route send 4xx
// replies: Fastify's types only let a typed route send the status codes its response schema declares (at runtime,
// a status without a schema goes out unchecked).
export const ERROR_RESPONSES = { '4xx': ApiErrorSchema };

const ERROR_CODES: Partial<Record<number, string>> = {
  400: 'bad_request',
  404: 'not_found',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};

// Errors that Fastify and its plugins raise (malformed JSON, the wrong content type, rate limits, crashes), in the
// same { error, message? } shape as our own replies. Server errors are logged, never echoed: their text can hold
// SQL or file paths.
export function sendApiError(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  // A body, path or query that fails its route schema (ADR-0014). Same code and shape as before route schemas
  // existed; the message is Fastify's (e.g. "body/username Use 3–32 letters…").
  if (error.validation) return reply.code(400).send({ error: 'validation_failed', message: error.message });
  const status = error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500;
  if (status >= 500) {
    request.log.error({ err: error }, 'Request failed');
    return reply.code(500).send({ error: 'internal_error' });
  }
  return reply.code(status).send({ error: ERROR_CODES[status] ?? 'bad_request', message: error.message });
}
