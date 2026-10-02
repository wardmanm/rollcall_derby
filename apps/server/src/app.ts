import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { APP_NAME, HealthResponseSchema } from '@obs-producer/shared';
import type { AppDatabase } from './db.ts';
import { sendApiError } from './http.ts';
import { installAuth } from './auth/guard.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerSetupRoutes } from './routes/setup.ts';
import { registerUserRoutes } from './routes/users.ts';

export interface AppOptions {
  version: string;
  logger?: boolean;
  /** Directory holding the web app's production build. Skipped if it doesn't exist (e.g. in development). */
  webDir?: string;
  db: AppDatabase;
  /** Registers routes inside the authenticated /api plugin, after cookie, rate-limit and auth are wired up (for tests). */
  registerRoutes?: (api: FastifyInstance) => void;
  /** Called for each route as it's registered; the route inventory test uses it. */
  onRoute?: (route: RouteOptions) => void;
}

// The HTTP API. Kept free of listening and sockets so routes can be tested with app.inject().
export function buildApp({
  version,
  logger = false,
  webDir,
  db,
  registerRoutes,
  onRoute,
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  // Added first, so it sees every route, including those inside the /api plugin.
  if (onRoute) app.addHook('onRoute', onRoute);
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
    installAuth(api, db);
    api.get('/api/health', async () =>
      HealthResponseSchema.parse({
        status: 'ok',
        name: APP_NAME,
        version,
        uptimeSeconds: (performance.now() - startedAt) / 1000,
      }),
    );
    registerSetupRoutes(api, db);
    registerAuthRoutes(api, db);
    registerUserRoutes(api, db);
    registerRoutes?.(api);
  });

  if (webDir && existsSync(join(webDir, 'index.html'))) serveWebBuild(app, webDir);

  return app;
}

// Serves the web build: real files as-is; /overlay and below get the OBS overlay page (ADR-0006);
// any other GET outside /api and /socket.io gets the admin app so client-side routes like /teams/42 load.
function serveWebBuild(app: FastifyInstance, webDir: string) {
  void app.register(fastifyStatic, { root: webDir, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    const isAppRoute = request.method === 'GET' && !/^\/(api|socket\.io)(\/|$)/.test(request.url);
    if (isAppRoute && /^\/overlay(\/|$|\?)/.test(request.url)) return reply.type('text/html').sendFile('overlay.html');
    if (isAppRoute) return reply.type('text/html').sendFile('index.html');
    return reply
      .code(404)
      .send({ message: `Route ${request.method}:${request.url} not found`, error: 'Not Found', statusCode: 404 });
  });
}
