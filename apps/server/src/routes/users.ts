import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateUserRequestSchema,
  CreateUserResponseSchema,
  PasswordResetResponseSchema,
  UpdateUserRequestSchema,
  UserSchema,
} from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { requireRole } from '../auth/guard.ts';
import { generateTemporaryPassword, hashPassword } from '../auth/passwords.ts';
import { revokeUserSessions } from '../auth/sessions.ts';
import {
  countAdmins,
  createUser,
  deleteUser,
  findUserById,
  findUserForLogin,
  listUsers,
  setPassword,
  setRole,
  type UserRecord,
} from '../auth/users.ts';
import { ERROR_RESPONSES } from '../http.ts';

// Guards run as preValidation, so a non-Admin is refused before their body is looked at.
const ADMIN_ONLY = { preValidation: requireRole('admin') };
const UserParamsSchema = z.strictObject({ id: z.string() });
const NO_CONTENT = z.undefined();
const NOT_FOUND = { error: 'not_found' };
const LAST_ADMIN = { error: 'last_admin', message: 'There must always be at least one Admin.' };

// Would changing or removing `user` leave no Admin? Counting the *other* Admins, rather than asking
// "is there exactly one", also holds when two Admins remove each other at the same moment.
const isLastAdmin = (db: AppDatabase, user: UserRecord) =>
  user.role === 'admin' && countAdmins(db, { excluding: user.id }) === 0;

// Admin user management (users-and-access R3, ADR-0008). The caller's role is checked in a preValidation hook. The
// username and last-Admin checks run with no `await` before their write, so concurrent requests can't slip in between.
export function registerUserRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/api/users',
    {
      ...ADMIN_ONLY,
      schema: { tags: ['users'], summary: 'List users', response: { 200: UserSchema.array(), ...ERROR_RESPONSES } },
    },
    async () => listUsers(db),
  );

  api.post(
    '/api/users',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: 'Create a user (the temporary password is shown only in this response)',
        body: CreateUserRequestSchema,
        response: { 201: CreateUserResponseSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      if (findUserForLogin(db, request.body.username)) return reply.code(409).send({ error: 'username_taken' });
      const user = createUser(db, { ...request.body, passwordHash, mustChangePassword: true });
      return reply.code(201).send({ user, temporaryPassword });
    },
  );

  api.patch(
    '/api/users/:id',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: "Change a user's role",
        params: UserParamsSchema,
        body: UpdateUserRequestSchema,
        response: { 200: UserSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const user = findUserById(db, request.params.id);
      if (!user) return reply.code(404).send(NOT_FOUND);
      if (request.body.role !== 'admin' && isLastAdmin(db, user)) return reply.code(409).send(LAST_ADMIN);
      setRole(db, user.id, request.body.role);
      return { ...user, role: request.body.role };
    },
  );

  api.post(
    '/api/users/:id/password-reset',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: "Reset a user's password (the temporary password is shown only in this response)",
        params: UserParamsSchema,
        response: { 200: PasswordResetResponseSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const user = findUserById(db, request.params.id);
      if (!user) return reply.code(404).send(NOT_FOUND);
      setPassword(db, user.id, passwordHash, { mustChangePassword: true });
      revokeUserSessions(db, user.id);
      return { temporaryPassword };
    },
  );

  api.post(
    '/api/users/:id/sign-out',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: 'Sign a user out on every device',
        params: UserParamsSchema,
        response: { 204: NO_CONTENT, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const user = findUserById(db, request.params.id);
      if (!user) return reply.code(404).send(NOT_FOUND);
      revokeUserSessions(db, user.id);
      return reply.code(204).send();
    },
  );

  api.delete(
    '/api/users/:id',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: 'Delete a user',
        params: UserParamsSchema,
        response: { 204: NO_CONTENT, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const user = findUserById(db, request.params.id);
      if (!user) return reply.code(404).send(NOT_FOUND);
      if (isLastAdmin(db, user)) return reply.code(409).send(LAST_ADMIN);
      if (user.id === request.user?.id) {
        return reply
          .code(409)
          .send({ error: 'cannot_delete_self', message: 'Another Admin has to delete your account.' });
      }
      deleteUser(db, user.id);
      return reply.code(204).send();
    },
  );
}
