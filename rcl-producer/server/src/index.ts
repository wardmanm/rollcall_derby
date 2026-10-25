import { fileURLToPath } from 'node:url';
import type { AppModule } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import pkg from '../package.json' with { type: 'json' };
import * as schema from './db/schema.ts';
import { announceDefaultTheme, openOverlay } from './overlay.ts';
import { registerThemeRoutes } from './routes/themes.ts';

// The Producer app's server side, hosted by rcl-core as app module `producer` (ADR-0019): its routes below
// /api/producer, its tables (producer_…), and the /producer/overlay namespace. rcl-core serves its web build at
// /producer/, with the OBS overlay at /producer/overlay.
export const producerApp: AppModule = {
  id: 'producer',
  title: `${APP_NAME} Producer`,
  version: pkg.version,
  requiresCore: pkg.rollcall.requiresCore,
  permissions: [
    { key: 'producer:themes.read', summary: 'View themes', roles: ['producer'] },
    {
      key: 'producer:themes.manage',
      summary: 'Create, edit, duplicate and delete themes, and choose the default',
      roles: [],
    },
  ],
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  web: {
    dir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
    pages: { overlay: 'overlay.html' },
  },
  register(api, ctx) {
    registerThemeRoutes(api, { db: ctx.db(schema), onDefaultChanged: () => announceDefaultTheme(ctx) });
  },
  realtime(rt, ctx) {
    openOverlay(rt, ctx);
  },
};
