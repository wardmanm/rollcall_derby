import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

// Validates a request body against a shared Zod schema (ADR-0007). On failure it sends a 400 and
// returns undefined, so handlers can do: `const body = parseBody(...); if (!body) return reply;`
export function parseBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | undefined {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  void reply.code(400).send({ error: 'validation_failed', message: z.prettifyError(result.error) });
  return undefined;
}

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
  const status = error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500;
  if (status >= 500) {
    request.log.error({ err: error }, 'Request failed');
    return reply.code(500).send({ error: 'internal_error' });
  }
  return reply.code(status).send({ error: ERROR_CODES[status] ?? 'bad_request', message: error.message });
}
