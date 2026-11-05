import { fileURLToPath } from 'node:url';
import type { AppContext, AppModule } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import pkg from '../package.json' with { type: 'json' };
import * as schema from './db/schema.ts';
import {
  announceIntro,
  announceIntroGone,
  announceIntroTheme,
  announceIntroThemes,
  openIntroControl,
} from './intros/live.ts';
import { introRuns, type IntroRuns } from './intros/runs.ts';
import { announceDefaultTheme, openOverlay } from './overlay.ts';
import { registerIntroRunRoutes } from './routes/intro-runs.ts';
import { registerIntroRoutes } from './routes/intros.ts';
import { registerThemeRoutes } from './routes/themes.ts';
import { themeKind } from './themes/transfer.ts';

// One set of intro runs per context, shared by register() (the run routes) and realtime() (the rooms), like the
// overlay's namespace. Each change to a run is sent to the intro's rooms.
const runsByContext = new WeakMap<AppContext, IntroRuns>();
function runsFor(ctx: AppContext): IntroRuns {
  const existing = runsByContext.get(ctx);
  if (existing) return existing;
  const runs: IntroRuns = introRuns({
    db: ctx.db(schema),
    teams: ctx.teams,
    onChange: (introId) => announceIntro(ctx, runs, introId),
    log: ctx.log,
  });
  runsByContext.set(ctx, runs);
  return runs;
}

// The default theme, to plain overlays and to the overlays of intros on the default.
function announceDefaultThemes(ctx: AppContext): void {
  announceDefaultTheme(ctx);
  announceIntroThemes(ctx, null);
}

// The Producer app's server side, hosted by rcl-core as app module `producer` (ADR-0019): its routes below
// /api/producer, its tables (producer_…), and the /producer/overlay and /producer/intros namespaces. rcl-core serves
// its web build at /producer/, with the OBS overlay at /producer/overlay.
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
    const runs = runsFor(ctx);
    // Runs' timers stop with the server.
    api.addHook('onClose', async () => runs.close());
    registerThemeRoutes(api, {
      db,
      onDefaultChanged: () => announceDefaultThemes(ctx),
      onThemeChanged: (themeId) => announceIntroThemes(ctx, themeId),
    });
    registerIntroRoutes(api, {
      db,
      teams: ctx.teams,
      onSaved: (before, after) => {
        if (before && before.themeId !== after.themeId) announceIntroTheme(ctx, after);
        announceIntro(ctx, runs, after.id);
      },
      onDeleted: (id) => announceIntroGone(ctx, id, runs.forget(id)),
    });
    registerIntroRunRoutes(api, { db, runs });
  },
  realtime(rt, ctx) {
    const runs = runsFor(ctx);
    openOverlay(rt, ctx, runs);
    openIntroControl(rt, ctx, runs);
  },
  // Themes travel in export files (ADR-0024).
  transfer: (ctx) => [
    themeKind({
      db: ctx.db(schema),
      announce: () => announceDefaultThemes(ctx),
      announceThemes: (ids) => {
        for (const id of ids) announceIntroThemes(ctx, id);
      },
    }),
  ],
};
