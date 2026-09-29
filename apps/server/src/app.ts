import Fastify, { type FastifyInstance } from 'fastify';
import { APP_NAME, HealthResponseSchema } from '@obs-producer/shared';

export interface AppOptions {
  version: string;
  logger?: boolean;
}

// The HTTP API. Kept free of listening and sockets so routes can be tested with app.inject().
export function buildApp({ version, logger = false }: AppOptions): FastifyInstance {
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

  return app;
}
