import type { FastifyReply } from 'fastify';
import { z } from 'zod';

// Validates a request body against a shared Zod schema (ADR-0007). On failure it sends a 400 and
// returns undefined, so handlers can do: `const body = parseBody(...); if (!body) return reply;`
export function parseBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | undefined {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  void reply.code(400).send({ error: 'validation_failed', message: z.prettifyError(result.error) });
  return undefined;
}
