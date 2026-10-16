import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppModule } from '@rollcall/app-sdk';
import {
  APP_NAME,
  HealthResponseSchema,
  HostedAppSchema,
  type HealthResponse,
  type HostedApp,
} from '@rollcall/core-contract';
import type { AppDatabase } from './db.ts';
import { ERROR_RESPONSES } from './http.ts';
import { CORE_APP_ID, CORE_PERMISSIONS } from './auth/permissions.ts';
import { registerApiKeyRoutes } from './routes/api-keys.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerSetupRoutes } from './routes/setup.ts';
import { registerUserRoutes } from './routes/users.ts';

// rcl-core as an app module, hosted like any other (ADR-0019): its routes below /api/core and its web build at
// /core/. It owns the database connection, so its routes use it directly rather than through AppContext.
export function coreApp({ version, db, webDir }: { version: string; db: AppDatabase; webDir?: string }): AppModule {
  const startedAt = performance.now();
  return {
    id: CORE_APP_ID,
    title: APP_NAME,
    version,
    requiresCore: version,
    permissions: CORE_PERMISSIONS,
    ...(webDir ? { web: { dir: webDir } } : {}),
    register(fastify) {
      fastify.withTypeProvider<ZodTypeProvider>().get(
        '/health',
        {
          config: { access: { public: 'Shows whether the server is up, before anyone signs in' } },
          schema: {
            tags: ['core/health'],
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
      fastify.withTypeProvider<ZodTypeProvider>().get(
        '/apps',
        {
          config: { access: { signedIn: true } },
          schema: {
            tags: ['core/apps'],
            summary: 'The rcl apps this server hosts, for the app launcher',
            response: { 200: HostedAppSchema.array(), ...ERROR_RESPONSES },
          },
        },
        async (request) =>
          request.server.hostedApps.modules.map((module): HostedApp => ({
            id: module.id,
            title: module.title,
            version: module.version,
            url: module.web ? `/${module.id}/` : null,
          })),
      );
      registerSetupRoutes(fastify, db);
      registerAuthRoutes(fastify, db);
      registerUserRoutes(fastify, db);
      registerApiKeyRoutes(fastify, db);
    },
  };
}
