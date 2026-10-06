import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { SESSION_COOKIE } from './auth/guard.ts';

const DESCRIPTION = [
  'The OBS Producer server API. Every route takes and returns JSON.',
  '',
  '**Signing in.** Call `POST /api/auth/login` with "Try it out". Your browser keeps the `obs_producer_session` cookie and sends it with every later call, so they run as you, limited by your role. On a fresh data folder, create the first Admin with `POST /api/setup` from the server machine.',
  '',
  '**Public routes:** `GET /api/health`, `GET /api/setup`, `POST /api/setup` and `POST /api/auth/login`. Everything else needs a session, checked in this order: no session gets `401 unauthenticated`; a pending password change gets `403 password_change_required`; the wrong role gets `403 forbidden`.',
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
