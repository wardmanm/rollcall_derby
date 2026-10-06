import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SessionUserSchema, SetupRequestSchema, SetupStatusSchema } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { isServerMachine, setSessionCookie } from '../auth/guard.ts';
import { hashPassword } from '../auth/passwords.ts';
import { createSession } from '../auth/sessions.ts';
import { countUsers, createUser, toSessionUser, type UserRecord } from '../auth/users.ts';
import { ERROR_RESPONSES } from '../http.ts';

// Login, setup and password changes each allow 10 attempts per minute per address (each route keeps its own count).
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

// First-run setup (ADR-0008): only while no users exist, and only from the server machine itself,
// so nobody else on the venue Wi-Fi can claim the Admin account first.
export function registerSetupRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/api/setup',
    {
      schema: {
        tags: ['setup'],
        summary: 'Is first-run setup needed, and can this machine do it?',
        response: { 200: SetupStatusSchema, ...ERROR_RESPONSES },
      },
    },
    async (request) => ({ needsSetup: countUsers(db) === 0, canSetupHere: isServerMachine(request) }),
  );

  api.post(
    '/api/setup',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['setup'],
        summary: 'Create the first Admin and sign in (server machine only, while no users exist)',
        body: SetupRequestSchema,
        response: { 201: SessionUserSchema, ...ERROR_RESPONSES },
      },
      // Before the body is validated: from another machine, or once set up, the answer doesn't depend on the body.
      preValidation: async (request, reply) => {
        if (!isServerMachine(request)) {
          return reply.code(403).send({
            error: 'setup_not_allowed',
            message: 'Open this page on the server machine, at a localhost address, to create the first Admin.',
          });
        }
        if (countUsers(db) > 0) return reply.code(409).send({ error: 'already_set_up' });
        return undefined;
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const passwordHash = await hashPassword(password);
      // Check again inside a transaction: two setups racing must not both create an Admin.
      const user = db.transaction((tx): UserRecord | null =>
        countUsers(tx) > 0 ? null : createUser(tx, { username, passwordHash, role: 'admin' }),
      );
      if (!user) return reply.code(409).send({ error: 'already_set_up' });

      const session = createSession(db, user.id);
      setSessionCookie(reply, request, session.token, session.expiresAt);
      return reply.code(201).send(toSessionUser(user));
    },
  );
}
