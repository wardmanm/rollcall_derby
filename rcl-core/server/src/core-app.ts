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
import { fontFaceKind } from './fonts/transfer.ts';
import { registerApiKeyRoutes } from './routes/api-keys.ts';
import { registerFontRoutes } from './routes/fonts.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerSetupRoutes } from './routes/setup.ts';
import { registerTeamImageRoutes } from './routes/team-images.ts';
import { registerTeamRoutes } from './routes/teams.ts';
import { registerTransferRoutes } from './routes/transfer.ts';
import { registerUserRoutes } from './routes/users.ts';
import { teamKind } from './teams/transfer.ts';

// rcl-core as an app module, hosted like any other (ADR-0019): its routes below /api/core and its web build at
// /core/. It owns the database connection, so its routes use it directly rather than through AppContext.
export function coreApp({
  version,
  db,
  mediaDir,
  webDir,
}: {
  version: string;
  db: AppDatabase;
  mediaDir: string;
  webDir?: string;
}): AppModule {
  const startedAt = performance.now();
  return {
    id: CORE_APP_ID,
    title: APP_NAME,
    version,
    requiresCore: version,
    permissions: CORE_PERMISSIONS,
    tags: {
      'core/health': 'Is the server up?',
      'core/apps': 'The rcl apps this server hosts',
      'core/setup': 'Creating the first Admin',
      'core/auth': 'Logging in and out, and your own password',
      'core/users': 'User management (Admin only)',
      'core/api-keys': 'API keys for devices and scripts (Admin only)',
      'core/teams': 'Teams, their skaters and bench staff, logos and photos',
      'core/fonts': 'The font library: bundled and uploaded fonts',
      'core/transfer': 'Import and export: Rollcall export files of teams, themes and their media',
    },
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
      registerTeamRoutes(fastify, { db, mediaDir });
      registerTeamImageRoutes(fastify, { db, mediaDir });
      registerFontRoutes(fastify, { db, mediaDir });
      registerTransferRoutes(fastify, { db, mediaDir });
    },
    // Teams and their fonts' faces travel in export files (ADR-0024).
    transfer: () => [teamKind({ db }), fontFaceKind({ db })],
  };
}
