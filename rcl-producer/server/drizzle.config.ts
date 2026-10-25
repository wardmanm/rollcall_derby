import { defineConfig } from 'drizzle-kit';

// `yarn workspace @rollcall/producer-server db:generate --name <change>` writes a new migration to ./drizzle. rcl-core
// runs them at startup, in the Producer app's own migrations table (ADR-0019).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
