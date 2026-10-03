import type { FastifyInstance } from 'fastify';
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
import { parseBody } from '../http.ts';

const ADMIN_ONLY = { preHandler: requireRole('admin') };
const NOT_FOUND = { error: 'not_found' };
const LAST_ADMIN = { error: 'last_admin', message: 'There must always be at least one Admin.' };

interface UserParams {
  id: string;
}

// Would changing or removing `user` leave no Admin? Counting the *other* Admins, rather than asking
// "is there exactly one", also holds when two Admins remove each other at the same moment.
const isLastAdmin = (db: AppDatabase, user: UserRecord) =>
  user.role === 'admin' && countAdmins(db, { excluding: user.id }) === 0;

// Admin user management (users-and-access R3, ADR-0008). The caller's role is checked in a preHandler. The
// username and last-Admin checks run with no `await` before their write, so concurrent requests can't slip in between.
export function registerUserRoutes(api: FastifyInstance, db: AppDatabase): void {
  api.get('/api/users', ADMIN_ONLY, async () => UserSchema.array().parse(listUsers(db)));

  api.post('/api/users', ADMIN_ONLY, async (request, reply) => {
    const body = parseBody(CreateUserRequestSchema, request.body, reply);
    if (!body) return reply;
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    if (findUserForLogin(db, body.username)) return reply.code(409).send({ error: 'username_taken' });
    const user = createUser(db, { ...body, passwordHash, mustChangePassword: true });
    return reply.code(201).send(CreateUserResponseSchema.parse({ user, temporaryPassword }));
  });

  api.patch<{ Params: UserParams }>('/api/users/:id', ADMIN_ONLY, async (request, reply) => {
    const body = parseBody(UpdateUserRequestSchema, request.body, reply);
    if (!body) return reply;
    const user = findUserById(db, request.params.id);
    if (!user) return reply.code(404).send(NOT_FOUND);
    if (body.role !== 'admin' && isLastAdmin(db, user)) return reply.code(409).send(LAST_ADMIN);
    setRole(db, user.id, body.role);
    return UserSchema.parse({ ...user, role: body.role });
  });

  api.post<{ Params: UserParams }>('/api/users/:id/password-reset', ADMIN_ONLY, async (request, reply) => {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const user = findUserById(db, request.params.id);
    if (!user) return reply.code(404).send(NOT_FOUND);
    setPassword(db, user.id, passwordHash, { mustChangePassword: true });
    revokeUserSessions(db, user.id);
    return PasswordResetResponseSchema.parse({ temporaryPassword });
  });

  api.post<{ Params: UserParams }>('/api/users/:id/sign-out', ADMIN_ONLY, async (request, reply) => {
    const user = findUserById(db, request.params.id);
    if (!user) return reply.code(404).send(NOT_FOUND);
    revokeUserSessions(db, user.id);
    return reply.code(204).send();
  });

  api.delete<{ Params: UserParams }>('/api/users/:id', ADMIN_ONLY, async (request, reply) => {
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
  });
}
