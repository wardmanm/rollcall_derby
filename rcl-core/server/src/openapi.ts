import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import type { AppModule } from '@rollcall/app-sdk';
import type { Access, Permissions } from './auth/access.ts';
import { SESSION_COOKIE } from './auth/guard.ts';

const DESCRIPTION = [
  'The Rollcall server API. Requests and replies are JSON; `204` replies have no body. Every rcl app has its routes below `/api/<app>/` and its tags named `<app>/…`.',
  '',
  '**Signing in.** Call `POST /api/core/auth/login` with "Try it out". Your browser keeps the `rollcall_session` cookie and sends it with every later call, so they run as you, with the permissions your role holds. On a fresh data folder, create the first Admin with `POST /api/core/setup` from the server machine.',
  '',
  '**Who may call what.** Each operation says so: public, any signed-in user, or a permission such as `core:users.manage`. Admins hold every permission; the users-and-access feature page lists which other roles hold each one.',
  '',
  '**API keys.** Devices and scripts send `Authorization: Bearer rcl_…` instead of signing in; choose "Authorize" to try one here. A key holds only its own permissions, never a people-only one, and is refused by operations for any signed-in user. With a key, the session cookie is ignored.',
  '',
  '**Checks, in order:** a state-changing request from another site gets `403 cross_origin`; no session gets `401 unauthenticated`; a pending password change gets `403 password_change_required`; a missing permission gets `403 forbidden`. Login, setup and password changes allow 10 attempts a minute, then `429 rate_limited`.',
  '',
  '**Errors** look like `{ "error": "<code>", "message"?: "…" }`. A body that fails its schema gets `400 validation_failed`.',
].join('\n');

const ROLE_NAMES = { admin: 'Admin', producer: 'Producer', announcer: 'Announcer' } as const;

// One line saying who may call an operation, from its access declaration (ADR-0018).
function describeAccess(access: Access, permissions: Permissions): string {
  if (access.public !== undefined) return `**Public:** ${access.public}.`;
  if (access.signedIn) {
    return access.allowPendingPasswordChange
      ? '**Any signed-in user**, even with a password change pending. Not API keys.'
      : '**Any signed-in user.** Not API keys.';
  }
  const def = permissions.find(access.permission);
  const roles = ['admin' as const, ...(def?.roles ?? [])].map((r) => ROLE_NAMES[r]);
  const keys = def?.peopleOnly ? 'Not API keys: people only.' : 'Also API keys that hold it.';
  return `**Needs \`${access.permission}\`:** ${roles.join(', ')}. ${keys}`;
}

// What an operation takes, matching its line above (ADR-0020): nothing when it's public; only a session when it's for
// any signed-in user or needs a people-only permission; otherwise the document's own, a session or an API key.
function securityOf(access: Access, permissions: Permissions) {
  if (access.public !== undefined) return { security: [] };
  if (access.signedIn || permissions.find(access.permission)?.peopleOnly) return { security: [{ session: [] }] };
  return {};
}

// The OpenAPI document is built from the schemas every route declares (ADR-0014), plus who may call each operation
// and what each hosted app says its tags are about, core's first. Swagger UI, and the document at /docs/json, are
// served only when asked for: always in `yarn dev`, on a venue server only with ROLLCALL_API_DOCS=1.
export function registerApiDocs(
  app: FastifyInstance,
  {
    version,
    apiDocs,
    permissions,
    modules,
  }: { version: string; apiDocs: boolean; permissions: Permissions; modules: readonly AppModule[] },
) {
  void app.register(fastifySwagger, {
    openapi: {
      info: { title: 'Rollcall API', version, description: DESCRIPTION },
      tags: modules.flatMap((module) =>
        Object.entries(module.tags ?? {}).map(([name, description]) => ({ name, description })),
      ),
      components: {
        securitySchemes: {
          session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
          bearer: { type: 'http', scheme: 'bearer', description: 'An API key, `rcl_…`' },
        },
      },
      security: [{ session: [] }, { bearer: [] }],
    },
    transform: (input) => {
      const { schema: converted, url } = jsonSchemaTransform(input);
      // An upload's body is a file of one of the types it `consumes`, such as a team logo: documented as binary, so
      // "Try it out" offers a file picker. Its route has no body schema, since it's a raw buffer, not JSON.
      const uploads = converted?.consumes !== undefined && converted.body === undefined;
      const schema = uploads ? { ...converted, body: { type: 'string', format: 'binary' } } : converted;
      const access = input.route.config?.access;
      if (!access) return { schema, url };
      // Who may call it comes first, then the route's own description, if it gives one.
      const description = [describeAccess(access, permissions), schema?.description].filter(Boolean).join('\n\n');
      return { schema: { ...schema, description, ...securityOf(access, permissions) }, url };
    },
  });
  // validatorUrl stays off: Swagger UI must not contact validator.swagger.io (hard rule 4: works offline).
  // `false` here, not `null`: @fastify/swagger-ui types this option as `string | false`, but its initializer
  // renders it as `opts.validatorUrl || null`, so `false` reaches the page as `validatorUrl: null`, same as `null`.
  if (apiDocs) void app.register(fastifySwaggerUi, { routePrefix: '/docs', validatorUrl: false });
}
