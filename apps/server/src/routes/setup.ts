import type { FastifyInstance } from 'fastify';
import { SessionUserSchema, SetupRequestSchema, SetupStatusSchema } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { LOCAL_ADDRESSES, setSessionCookie } from '../auth/guard.ts';
import { hashPassword } from '../auth/passwords.ts';
import { createSession } from '../auth/sessions.ts';
import { countUsers, createUser, toSessionUser, type UserRecord } from '../auth/users.ts';
import { parseBody } from '../http.ts';

// Login and setup share this brute-force limit (10 per minute per address).
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

// First-run setup (ADR-0008): only while no users exist, and only from the server machine itself,
// so nobody else on the venue Wi-Fi can claim the Admin account first.
export function registerSetupRoutes(api: FastifyInstance, db: AppDatabase): void {
  api.get('/api/setup', async (request) =>
    SetupStatusSchema.parse({ needsSetup: countUsers(db) === 0, canSetupHere: LOCAL_ADDRESSES.has(request.ip) }),
  );

  api.post('/api/setup', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    if (!LOCAL_ADDRESSES.has(request.ip)) {
      return reply.code(403).send({
        error: 'setup_not_allowed',
        message: 'Open this page on the server machine to create the first Admin.',
      });
    }
    if (countUsers(db) > 0) return reply.code(409).send({ error: 'already_set_up' });
    const body = parseBody(SetupRequestSchema, request.body, reply);
    if (!body) return reply;

    const passwordHash = await hashPassword(body.password);
    // Check again inside a transaction: two setups racing must not both create an Admin.
    const user = db.transaction((tx): UserRecord | null =>
      countUsers(tx) > 0 ? null : createUser(tx, { username: body.username, passwordHash, role: 'admin' }),
    );
    if (!user) return reply.code(409).send({ error: 'already_set_up' });

    const session = createSession(db, user.id);
    setSessionCookie(reply, request, session.token, session.expiresAt);
    return reply.code(201).send(SessionUserSchema.parse(toSessionUser(user)));
  });
}
