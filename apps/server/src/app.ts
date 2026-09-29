import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { APP_NAME, HealthResponseSchema } from '@obs-producer/shared';

export interface AppOptions {
  version: string;
  logger?: boolean;
  /** Directory holding the web app's production build. Skipped if it doesn't exist (e.g. in development). */
  webDir?: string;
}

// The HTTP API. Kept free of listening and sockets so routes can be tested with app.inject().
export function buildApp({ version, logger = false, webDir }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  const startedAt = performance.now();

  app.get('/api/health', async () =>
    HealthResponseSchema.parse({
      status: 'ok',
      name: APP_NAME,
      version,
      uptimeSeconds: (performance.now() - startedAt) / 1000,
    }),
  );

  if (webDir && existsSync(join(webDir, 'index.html'))) serveWebBuild(app, webDir);

  return app;
}

// Serves the SPA: real files as-is, and index.html for any other GET outside /api and /socket.io
// so client-side routes such as /teams/42 load the app.
function serveWebBuild(app: FastifyInstance, webDir: string) {
  void app.register(fastifyStatic, { root: webDir, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    const isAppRoute = request.method === 'GET' && !/^\/(api|socket\.io)(\/|$)/.test(request.url);
    if (isAppRoute) return reply.type('text/html').sendFile('index.html');
    return reply.code(404).send({ message: `Route ${request.method}:${request.url} not found`, error: 'Not Found', statusCode: 404 });
  });
}
