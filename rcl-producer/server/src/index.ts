import { fileURLToPath } from 'node:url';
import type { AppModule } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import pkg from '../package.json' with { type: 'json' };
import * as schema from './db/schema.ts';
import { announceDefaultTheme, openOverlay } from './overlay.ts';
import { registerIntroRoutes } from './routes/intros.ts';
import { registerThemeRoutes } from './routes/themes.ts';
import { themeKind } from './themes/transfer.ts';

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
    {
      key: 'producer:intros.run',
      summary: 'See intros, open their control page, and start, step through and clear them',
      roles: ['producer'],
    },
    { key: 'producer:intros.manage', summary: 'Create, set up and delete intros', roles: ['producer'] },
  ],
  tags: {
    'producer/themes': 'Themes: how overlays look, and the default theme the OBS overlay uses',
    'producer/intros': 'Skater intros: saved setups, and running them live',
  },
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  web: {
    dir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
    pages: { overlay: 'overlay.html' },
  },
  register(api, ctx) {
    const db = ctx.db(schema);
    registerThemeRoutes(api, { db, onDefaultChanged: () => announceDefaultTheme(ctx) });
    // The live run (a later change) follows saves and deletes through these.
    registerIntroRoutes(api, { db, teams: ctx.teams, onSaved: () => {}, onDeleted: () => {} });
  },
  realtime(rt, ctx) {
    openOverlay(rt, ctx);
  },
  // Themes travel in export files (ADR-0024).
  transfer: (ctx) => [themeKind({ db: ctx.db(schema), announce: () => announceDefaultTheme(ctx) })],
};
