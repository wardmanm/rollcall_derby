import type { AppModule } from '@rollcall/app-sdk';
import { producerApp } from '@rollcall/producer-server';

// The rcl apps this server hosts besides core itself (ADR-0019). This is the only place rcl-core's server depends on
// an app: scripts/check-boundaries.test.mjs keeps it that way.
export const INSTALLED_APPS: readonly AppModule[] = [producerApp];
