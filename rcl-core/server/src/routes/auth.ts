import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ChangePasswordRequestSchema,
  CurrentUserSchema,
  LoginRequestSchema,
  SessionUserSchema,
  type CurrentUser,
} from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import type { Access } from '../auth/access.ts';
import { clearSessionCookie, setSessionCookie } from '../auth/guard.ts';
import { dummyHash, hashPassword, verifyPassword } from '../auth/passwords.ts';
import { createSession, revokeSession, revokeUserSessions } from '../auth/sessions.ts';
import { findUserForLogin, setPassword, toSessionUser } from '../auth/users.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { AUTH_RATE_LIMIT } from './setup.ts';

const INVALID_CREDENTIALS = { error: 'invalid_credentials' };
const UNAUTHENTICATED = { error: 'unauthenticated' };
// `me` and `password` must work while a password change is pending, or the user could never make it.
const SIGNED_IN_PENDING_OK: Access = { signedIn: true, allowPendingPasswordChange: true };

export function registerAuthRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.post(
    '/auth/login',
    {
      config: { rateLimit: AUTH_RATE_LIMIT, access: { public: 'Signing in' } },
      // A malformed body must look and take the same as wrong credentials, so the handler deals with it.
      attachValidation: true,
      schema: {
        tags: ['core/auth'],
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
      if (request.principal) revokeSession(db, request.principal.token);

      const session = createSession(db, user.id);
      setSessionCookie(reply, request, session.token, session.expiresAt);
      return toSessionUser(user);
    },
  );

  api.post(
    '/auth/logout',
    {
      config: {
        access: { public: 'Logging out always works and clears the cookie, even when the session has already ended' },
      },
      schema: { tags: ['core/auth'], summary: 'Log out', response: { 204: z.undefined(), ...ERROR_RESPONSES } },
    },
    async (request, reply) => {
      if (request.principal) revokeSession(db, request.principal.token);
      clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );

  api.get(
    '/auth/me',
    {
      config: { access: SIGNED_IN_PENDING_OK },
      schema: { tags: ['core/auth'], summary: 'Who am I?', response: { 200: CurrentUserSchema, ...ERROR_RESPONSES } },
    },
    async (request, reply) => {
      const user = request.principal?.user;
      if (!user) return reply.code(401).send(UNAUTHENTICATED);
      const { permissions } = request.server.hostedApps;
      const held = permissions.all.filter((def) => permissions.granted(user.role, def.key)).map((def) => def.key);
      return { ...user, permissions: held } satisfies CurrentUser;
    },
  );

  api.post(
    '/auth/password',
    {
      config: { rateLimit: AUTH_RATE_LIMIT, access: SIGNED_IN_PENDING_OK },
      schema: {
        tags: ['core/auth'],
        summary: 'Change your own password',
        body: ChangePasswordRequestSchema,
        response: { 200: SessionUserSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const user = request.principal?.user;
      if (!user) return reply.code(401).send(UNAUTHENTICATED);
      const { currentPassword, newPassword } = request.body;
      if (newPassword.toLowerCase() === user.username) {
        return reply.code(400).send({ error: 'validation_failed', message: 'The password must not be the username' });
      }
      const record = findUserForLogin(db, user.username);
      if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
        return reply.code(400).send({ error: 'wrong_password' });
      }
      const passwordHash = await hashPassword(newPassword);
      // Signed out (by an Admin's reset, say) while the password was hashing: don't overwrite the reset.
      const denial = request.recheckAccess();
      if (denial) return reply.code(denial.status).send({ error: denial.error });
      setPassword(db, record.id, passwordHash, { mustChangePassword: false });
      if (request.principal) revokeUserSessions(db, record.id, { exceptToken: request.principal.token });
      return { ...user, mustChangePassword: false };
    },
  );
}
