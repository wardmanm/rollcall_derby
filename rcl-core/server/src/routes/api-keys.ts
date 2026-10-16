import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ApiKeySchema,
  CreateApiKeyRequestSchema,
  CreateApiKeyResponseSchema,
  GrantablePermissionSchema,
} from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import { userOf, type Access } from '../auth/access.ts';
import { apiKeyNameTaken, createApiKey, listApiKeys, revokeApiKey } from '../auth/api-keys.ts';
import { ERROR_RESPONSES } from '../http.ts';

const MANAGE_KEYS: { config: { access: Access } } = { config: { access: { permission: 'core:api-keys.manage' } } };
const ApiKeyParamsSchema = z.strictObject({ id: z.string() });

// API keys for devices and scripts (ADR-0020). Only people may manage them: core:api-keys.manage is people-only. The
// checks run with no `await` before their write, so two requests can't both take a name.
export function registerApiKeyRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/api-keys',
    {
      ...MANAGE_KEYS,
      schema: {
        tags: ['core/api-keys'],
        summary: 'List API keys, newest first',
        response: { 200: ApiKeySchema.array(), ...ERROR_RESPONSES },
      },
    },
    async () => listApiKeys(db),
  );

  api.get(
    '/api-keys/grantable',
    {
      ...MANAGE_KEYS,
      schema: {
        tags: ['core/api-keys'],
        summary: 'The permissions an API key may hold',
        response: { 200: GrantablePermissionSchema.array(), ...ERROR_RESPONSES },
      },
    },
    async (request) =>
      request.server.hostedApps.permissions.all
        .filter((def) => !def.peopleOnly)
        .map(({ key, summary }) => ({ key, summary })),
  );

  api.post(
    '/api-keys',
    {
      ...MANAGE_KEYS,
      schema: {
        tags: ['core/api-keys'],
        summary: 'Create an API key; the key appears in this reply only',
        body: CreateApiKeyRequestSchema,
        response: { 201: CreateApiKeyResponseSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const user = userOf(request.principal);
      if (!user) return reply.code(401).send({ error: 'unauthenticated' });
      const { name, permissions, expiresIn } = request.body;
      const hosted = request.server.hostedApps.permissions;
      const grantable = (key: string) => {
        const def = hosted.find(key);
        return def !== undefined && !def.peopleOnly;
      };
      const refused = permissions.filter((key) => !grantable(key));
      if (refused.length > 0) {
        return reply
          .code(400)
          .send({ error: 'not_grantable', message: `An API key can't hold ${refused.join(', ')}.` });
      }
      if (apiKeyNameTaken(db, name)) return reply.code(409).send({ error: 'name_taken' });
      const created = createApiKey(db, {
        name,
        permissions: [...new Set(permissions)],
        expiresIn,
        createdBy: user.username,
      });
      return reply.code(201).send(created);
    },
  );

  api.delete(
    '/api-keys/:id',
    {
      ...MANAGE_KEYS,
      schema: {
        tags: ['core/api-keys'],
        summary: 'Revoke an API key: devices and scripts using it stop working at once',
        params: ApiKeyParamsSchema,
        response: { 204: z.undefined(), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) =>
      revokeApiKey(db, request.params.id) ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' }),
  );
}
