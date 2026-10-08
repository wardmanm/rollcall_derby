import { defineConfig } from 'drizzle-kit';

// `yarn workspace @rollcall/core-server db:generate --name <change>` writes a new migration to ./drizzle.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
