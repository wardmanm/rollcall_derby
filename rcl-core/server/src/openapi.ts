import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import type { Access, Permissions } from './auth/access.ts';
import { SESSION_COOKIE } from './auth/guard.ts';

const DESCRIPTION = [
  'The Rollcall server API. Requests and replies are JSON; `204` replies have no body.',
  '',
  '**Signing in.** Call `POST /api/auth/login` with "Try it out". Your browser keeps the `rollcall_session` cookie and sends it with every later call, so they run as you, with the permissions your role holds. On a fresh data folder, create the first Admin with `POST /api/setup` from the server machine.',
  '',
  '**Who may call what.** Each operation says so: public, any signed-in user, or a permission such as `core:users.manage`. Admins hold every permission; the users-and-access feature page lists which other roles hold each one.',
  '',
  '**Checks, in order:** a state-changing request from another site gets `403 cross_origin`; no session gets `401 unauthenticated`; a pending password change gets `403 password_change_required`; a missing permission gets `403 forbidden`. Login, setup and password changes allow 10 attempts a minute, then `429 rate_limited`.',
  '',
  '**Errors** look like `{ "error": "<code>", "message"?: "…" }`. A body that fails its schema gets `400 validation_failed`.',
].join('\n');

const ROLE_NAMES = { admin: 'Admin', producer: 'Producer', announcer: 'Announcer' } as const;

// One line saying who may call an operation, from its access declaration (ADR-0018).
function describeAccess(access: Access, permissions: Permissions): string {
  if ('public' in access) return `**Public:** ${access.public}.`;
  if ('signedIn' in access) {
    return access.allowPendingPasswordChange
      ? '**Any signed-in user**, even with a password change pending.'
      : '**Any signed-in user.**';
  }
  const roles = ['admin' as const, ...(permissions.find(access.permission)?.roles ?? [])].map((r) => ROLE_NAMES[r]);
  return `**Needs \`${access.permission}\`:** ${roles.join(', ')}.`;
}

// The OpenAPI document is built from the schemas every route declares (ADR-0014), plus who may call each operation.
// Swagger UI, and the document at /docs/json, are served only when asked for: always in `yarn dev`, on a venue
// server only with ROLLCALL_API_DOCS=1.
export function registerApiDocs(
  app: FastifyInstance,
  { version, apiDocs, permissions }: { version: string; apiDocs: boolean; permissions: Permissions },
) {
  void app.register(fastifySwagger, {
    openapi: {
      info: { title: 'Rollcall API', version, description: DESCRIPTION },
      tags: [
        { name: 'health', description: 'Is the server up?' },
        { name: 'setup', description: 'Creating the first Admin' },
        { name: 'auth', description: 'Logging in and out, and your own password' },
        { name: 'users', description: 'User management (Admin only)' },
      ],
      components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } } },
      security: [{ session: [] }],
    },
    transform: (input) => {
      const { schema, url } = jsonSchemaTransform(input);
      const access = input.route.config?.access;
      if (!access) return { schema, url };
      const security = 'public' in access ? { security: [] } : {};
      return { schema: { ...schema, description: describeAccess(access, permissions), ...security }, url };
    },
  });
  // validatorUrl stays off: Swagger UI must not contact validator.swagger.io (hard rule 4: works offline).
  // `false` here, not `null`: @fastify/swagger-ui types this option as `string | false`, but its initializer
  // renders it as `opts.validatorUrl || null`, so `false` reaches the page as `validatorUrl: null`, same as `null`.
  if (apiDocs) void app.register(fastifySwaggerUi, { routePrefix: '/docs', validatorUrl: false });
}
