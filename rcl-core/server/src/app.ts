import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { APP_NAME, HealthResponseSchema, type HealthResponse } from '@rollcall/core-contract';
import type { AppDatabase } from './db.ts';
import { ERROR_RESPONSES, sendApiError } from './http.ts';
import { createPermissions, enforceRouteAccess, type Permissions } from './auth/access.ts';
import { installAuth } from './auth/guard.ts';
import { CORE_APP_ID, CORE_PERMISSIONS } from './auth/permissions.ts';
import { registerApiDocs } from './openapi.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerSetupRoutes } from './routes/setup.ts';
import { registerUserRoutes } from './routes/users.ts';
import { serveWebApps, type WebApp } from './web-apps.ts';

export interface AppOptions {
  version: string;
  logger?: boolean;
  /** The rcl apps' web builds to serve, each below its own base. `/` redirects to the first one. */
  webApps?: readonly WebApp[];
  db: AppDatabase;
  /** Every permission routes may need (ADR-0018). Defaults to core's own; tests add others. */
  permissions?: Permissions;
  /** Registers routes inside the authenticated /api plugin, after cookie, rate-limit and auth are wired up (for tests). */
  registerRoutes?: (api: FastifyInstance) => void;
  /** Called for each route as it's registered; the route inventory test uses it. */
  onRoute?: (route: RouteOptions) => void;
  /** Serve the API explorer (Swagger UI) at /docs (ADR-0014). Off unless asked for. */
  apiDocs?: boolean;
}

// The HTTP API. Kept free of listening and sockets so routes can be tested with app.inject().
export function buildApp({
  version,
  logger = false,
  webApps = [],
  db,
  registerRoutes,
  onRoute,
  apiDocs = false,
  permissions = createPermissions(CORE_PERMISSIONS),
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  // Added first, so they see every route, including those inside the /api plugin.
  if (onRoute) app.addHook('onRoute', onRoute);
  enforceRouteAccess(app, { appId: CORE_APP_ID, permissions });
  // Routes validate requests and serialize replies with the shared Zod schemas they declare (ADR-0007, ADR-0014).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerApiDocs(app, { version, apiDocs, permissions });
  const startedAt = performance.now();

  // JSON bodies only: removing the text/plain parser turns form-style cross-site posts into 415s.
  app.removeContentTypeParser('text/plain');
  void app.register(fastifyCookie);
  // ipv6Subnet: 128 counts each IPv6 device on its own; by default the plugin lumps a whole /64 network together.
  void app.register(fastifyRateLimit, { global: false, ipv6Subnet: 128 });

  // Every /api route lives in this one plugin, registered after cookie and rate-limit, so each one shares
  // the same error handler and auth checks.
  void app.register(async (api) => {
    api.setErrorHandler(sendApiError);
    installAuth(api, { db, permissions });
    api.withTypeProvider<ZodTypeProvider>().get(
      '/api/health',
      {
        config: { access: { public: 'Shows whether the server is up, before anyone signs in' } },
        schema: {
          tags: ['health'],
          summary: 'Check that the server is up',
          response: { 200: HealthResponseSchema, ...ERROR_RESPONSES },
        },
      },
      async () =>
        ({
          status: 'ok',
          name: APP_NAME,
          version,
          uptimeSeconds: (performance.now() - startedAt) / 1000,
        }) satisfies HealthResponse,
    );
    registerSetupRoutes(api, db);
    registerAuthRoutes(api, db);
    registerUserRoutes(api, db);
    registerRoutes?.(api);
  });

  serveWebApps(app, webApps);

  return app;
}
