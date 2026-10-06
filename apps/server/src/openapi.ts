import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { PUBLIC_API_ROUTES, SESSION_COOKIE } from './auth/guard.ts';

// Built from the allow-list, not copied by hand, so the description can't drift from the routes it describes.
const PUBLIC_LIST = [...PUBLIC_API_ROUTES].map((route) => `\`${route}\``).join(', ');

const DESCRIPTION = [
  'The OBS Producer server API. Requests and replies are JSON; `204` replies have no body.',
  '',
  '**Signing in.** Call `POST /api/auth/login` with "Try it out". Your browser keeps the `obs_producer_session` cookie and sends it with every later call, so they run as you, limited by your role. On a fresh data folder, create the first Admin with `POST /api/setup` from the server machine.',
  '',
  `**Public routes:** ${PUBLIC_LIST}. Everything else needs a session.`,
  '',
  '**Checks, in order:** a state-changing request from another site gets `403 cross_origin`; no session gets `401 unauthenticated`; a pending password change gets `403 password_change_required`; the wrong role gets `403 forbidden`. Login, setup and password changes allow 10 attempts a minute, then `429 rate_limited`.',
  '',
  '**Errors** look like `{ "error": "<code>", "message"?: "…" }`. A body that fails its schema gets `400 validation_failed`.',
].join('\n');

// The OpenAPI document is built from the schemas every route declares (ADR-0014). Swagger UI, and the document at
// /docs/json, are served only when asked for: always in `yarn dev`, on a venue server only with OBS_PRODUCER_API_DOCS=1.
export function registerApiDocs(app: FastifyInstance, { version, apiDocs }: { version: string; apiDocs: boolean }) {
  void app.register(fastifySwagger, {
    openapi: {
      info: { title: 'OBS Producer API', version, description: DESCRIPTION },
      tags: [
        { name: 'health', description: 'Is the server up?' },
        { name: 'setup', description: 'Creating the first Admin' },
        { name: 'auth', description: 'Logging in and out, and your own password' },
        { name: 'users', description: 'User management (Admin only)' },
      ],
      components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } } },
    },
    transform: jsonSchemaTransform,
  });
  // validatorUrl stays off: Swagger UI must not contact validator.swagger.io (hard rule 4: works offline).
  // `false` here, not `null`: @fastify/swagger-ui types this option as `string | false`, but its initializer
  // renders it as `opts.validatorUrl || null`, so `false` reaches the page as `validatorUrl: null`, same as `null`.
  if (apiDocs) void app.register(fastifySwaggerUi, { routePrefix: '/docs', validatorUrl: false });
}
