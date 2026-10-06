import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ChangePasswordRequestSchema, LoginRequestSchema, SessionUserSchema } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { clearSessionCookie, requireSession, setSessionCookie } from '../auth/guard.ts';
import { dummyHash, hashPassword, verifyPassword } from '../auth/passwords.ts';
import { createSession, revokeSession, revokeUserSessions } from '../auth/sessions.ts';
import { findUserForLogin, setPassword, toSessionUser } from '../auth/users.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { AUTH_RATE_LIMIT } from './setup.ts';

const INVALID_CREDENTIALS = { error: 'invalid_credentials' };
const UNAUTHENTICATED = { error: 'unauthenticated' };

export function registerAuthRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.post(
    '/api/auth/login',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      // A malformed body must look and take the same as wrong credentials, so the handler deals with it.
      attachValidation: true,
      schema: {
        tags: ['auth'],
        summary: 'Log in',
        body: LoginRequestSchema,
        response: { 200: SessionUserSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const body = request.validationError ? null : request.body;
      const user = body ? findUserForLogin(db, body.username) : null;
      const ok = await verifyPassword(body?.password ?? '', user?.passwordHash ?? (await dummyHash()));
      if (!user || !ok) return reply.code(401).send(INVALID_CREDENTIALS);

      // Whoever was signed in on this browser is signed out, so a shared tablet doesn't keep their session alive.
      if (request.sessionToken) revokeSession(db, request.sessionToken);

      const session = createSession(db, user.id);
      setSessionCookie(reply, request, session.token, session.expiresAt);
      return toSessionUser(user);
    },
  );

  // `logout`, `me` and `password` use requireSession: they must work while a password change is pending,
  // or the user could never make it (ADR-0008). Guards run as preValidation, before the body is looked at.
  api.post(
    '/api/auth/logout',
    {
      preValidation: requireSession,
      schema: { tags: ['auth'], summary: 'Log out', response: { 204: z.undefined(), ...ERROR_RESPONSES } },
    },
    async (request, reply) => {
      if (request.sessionToken) revokeSession(db, request.sessionToken);
      clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );

  api.get(
    '/api/auth/me',
    {
      preValidation: requireSession,
      schema: { tags: ['auth'], summary: 'Who am I?', response: { 200: SessionUserSchema, ...ERROR_RESPONSES } },
    },
    async (request, reply) => request.user ?? reply.code(401).send(UNAUTHENTICATED),
  );

  api.post(
    '/api/auth/password',
    {
      preValidation: requireSession,
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Change your own password',
        body: ChangePasswordRequestSchema,
        response: { 200: SessionUserSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) return reply.code(401).send(UNAUTHENTICATED);
      const { currentPassword, newPassword } = request.body;
      if (newPassword.toLowerCase() === user.username) {
        return reply.code(400).send({ error: 'validation_failed', message: 'The password must not be the username' });
      }
      const record = findUserForLogin(db, user.username);
      if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
        return reply.code(400).send({ error: 'wrong_password' });
      }
      setPassword(db, record.id, await hashPassword(newPassword), { mustChangePassword: false });
      if (request.sessionToken) revokeUserSessions(db, record.id, { exceptToken: request.sessionToken });
      return { ...user, mustChangePassword: false };
    },
  );
}
