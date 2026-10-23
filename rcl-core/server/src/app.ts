import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppModule } from '@rollcall/app-sdk';
import { hostApps, type HostedApps } from './apps.ts';
import { coreApp } from './core-app.ts';
import type { AppDatabase } from './db.ts';
import { sendApiError } from './http.ts';
import { enforceRouteAccess } from './auth/access.ts';
import { installAuth } from './auth/guard.ts';
import { serveMedia } from './media.ts';
import { registerApiDocs } from './openapi.ts';
import { serveWebApps } from './web-apps.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** The rcl apps this server hosts, core first (ADR-0019). */
    hostedApps: HostedApps;
  }
}

export interface AppOptions {
  version: string;
  logger?: boolean;
  db: AppDatabase;
  /** Where uploaded images live: media/ in the data folder (ADR-0022). Created when the first one is saved. */
  mediaDir: string;
  /** rcl-core's own web build, served at /core/. */
  coreWebDir?: string;
  /** The rcl apps to host besides core: INSTALLED_APPS in production, the tests' own apps in tests. */
  apps?: readonly AppModule[];
  /** Registers routes inside the authenticated /api plugin, after cookie, rate-limit and auth are wired up (for tests). */
  registerRoutes?: (api: FastifyInstance) => void;
  /** Called for each route as it's registered; the route inventory test uses it. */
  onRoute?: (route: RouteOptions) => void;
  /** Serve the API explorer (Swagger UI) at /docs (ADR-0014). Off unless asked for. */
  apiDocs?: boolean;
}

const API_PATH = /^\/api(\/|$)/;

// The HTTP API and web builds of every hosted rcl app. Kept free of listening and sockets so routes can be tested
// with app.inject().
export function buildApp({
  version,
  logger = false,
  db,
  mediaDir,
  coreWebDir,
  apps = [],
  registerRoutes,
  onRoute,
  apiDocs = false,
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  const hosted = hostApps({
    core: coreApp({ version, db, webDir: coreWebDir }),
    apps,
    coreVersion: version,
    db,
    log: app.log,
  });
  app.decorate('hostedApps', hosted);
  // Added first, so they see every route, including those inside the /api plugin.
  if (onRoute) app.addHook('onRoute', onRoute);
  enforceRouteAccess(app, { appIds: hosted.modules.map((module) => module.id), permissions: hosted.permissions });
  // Routes validate requests and serialize replies with the Zod schemas they declare (ADR-0014, ADR-0019).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerApiDocs(app, { version, apiDocs, permissions: hosted.permissions });

  // JSON bodies only: removing the text/plain parser turns form-style cross-site posts into 415s.
  app.removeContentTypeParser('text/plain');
  void app.register(fastifyCookie);
  // ipv6Subnet: 128 counts each IPv6 device on its own; by default the plugin lumps a whole /64 network together.
  void app.register(fastifyRateLimit, { global: false, ipv6Subnet: 128 });

  // Every /api route lives in this one plugin, registered after cookie and rate-limit, so each one shares the same
  // error handler, CSRF check and caller lookup. Each hosted app's routes are a child plugin below /api/<id>.
  void app.register(async (api) => {
    api.setErrorHandler(sendApiError);
    installAuth(api, { db, permissions: hosted.permissions });
    for (const module of hosted.modules) {
      const ctx = hosted.contextFor(module);
      void api.register(async (scope) => module.register?.(scope, ctx), { prefix: `/api/${module.id}` });
    }
    registerRoutes?.(api);
  });

  serveMedia(app, { db, dir: mediaDir });
  const webPage = serveWebApps(app, hosted.webApps);
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (API_PATH.test(path)) return reply.code(404).send({ error: 'not_found' });
    const page = request.method === 'GET' || request.method === 'HEAD' ? webPage(path) : undefined;
    if (page) return reply.type('text/html').sendFile(page.file, page.dir);
    return reply
      .code(404)
      .send({ message: `Route ${request.method}:${request.url} not found`, error: 'Not Found', statusCode: 404 });
  });

  return app;
}
