// rcl-core's contract (ADR-0019): Zod schemas for /api/core, shared by its server, its web app and the web SDK.
// Types come from z.infer. Naming: `FooSchema` for the schema, `Foo` for its type.
export const APP_NAME = 'Rollcall';

export * from './api-keys.ts';
export * from './apps.ts';
export * from './health.ts';
export * from './auth.ts';
