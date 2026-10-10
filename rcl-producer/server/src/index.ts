import { fileURLToPath } from 'node:url';
import type { AppModule } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import pkg from '../package.json' with { type: 'json' };

// The Producer app's server side, hosted by rcl-core as app module `producer` (ADR-0019). It has no routes or tables
// yet: rcl-core serves its web build at /producer/, with the OBS overlay at /producer/overlay.
export const producerApp: AppModule = {
  id: 'producer',
  title: `${APP_NAME} Producer`,
  version: pkg.version,
  requiresCore: pkg.rollcall.requiresCore,
  permissions: [],
  web: {
    dir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
    pages: { overlay: 'overlay.html' },
  },
};
