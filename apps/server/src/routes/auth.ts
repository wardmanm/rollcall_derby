import type { FastifyInstance } from 'fastify';
import { ChangePasswordRequestSchema, LoginRequestSchema, SessionUserSchema } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { clearSessionCookie, requireUser, setSessionCookie } from '../auth/guard.ts';
import { dummyHash, hashPassword, verifyPassword } from '../auth/passwords.ts';
import { createSession, revokeSession, revokeUserSessions } from '../auth/sessions.ts';
import { findUserForLogin, setPassword, toSessionUser } from '../auth/users.ts';
import { parseBody } from '../http.ts';
import { AUTH_RATE_LIMIT } from './setup.ts';

const INVALID_CREDENTIALS = { error: 'invalid_credentials' };

export function registerAuthRoutes(api: FastifyInstance, db: AppDatabase): void {
  api.post('/api/auth/login', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = LoginRequestSchema.safeParse(request.body);
    // A malformed body, an unknown user and a wrong password all look and take the same.
    const user = body.success ? findUserForLogin(db, body.data.username) : null;
    const password = body.success ? body.data.password : '';
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
    if (!user || !ok) return reply.code(401).send(INVALID_CREDENTIALS);

    const session = createSession(db, user.id);
    setSessionCookie(reply, request, session.token, session.expiresAt);
    return SessionUserSchema.parse(toSessionUser(user));
  });

  api.post('/api/auth/logout', { preHandler: requireUser }, async (request, reply) => {
    if (request.sessionToken) revokeSession(db, request.sessionToken);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  api.get('/api/auth/me', { preHandler: requireUser }, async (request) => SessionUserSchema.parse(request.user));

  api.post('/api/auth/password', { preHandler: requireUser }, async (request, reply) => {
    const body = parseBody(ChangePasswordRequestSchema, request.body, reply);
    if (!body || !request.user) return reply;
    if (body.newPassword.toLowerCase() === request.user.username) {
      return reply.code(400).send({ error: 'validation_failed', message: 'The password must not be the username' });
    }
    const record = findUserForLogin(db, request.user.username);
    if (!record || !(await verifyPassword(body.currentPassword, record.passwordHash))) {
      return reply.code(400).send({ error: 'wrong_password' });
    }
    setPassword(db, record.id, await hashPassword(body.newPassword), { mustChangePassword: false });
    if (request.sessionToken) revokeUserSessions(db, record.id, { exceptToken: request.sessionToken });
    return SessionUserSchema.parse({ ...request.user, mustChangePassword: false });
  });
}
