// Shared contract for server and web (ADR-0007): Zod schemas are the source of truth,
// and types come from z.infer. Naming: `FooSchema` for the schema, `Foo` for its type.
export const APP_NAME = 'OBS Producer';

export * from './health.ts';
export * from './realtime.ts';
