import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppContext } from '@rollcall/app-sdk';
import type { FontFamily } from '@rollcall/core-contract';
import { producerApp } from './index.ts';

// The Producer app hosted the way rcl-core hosts it, for its own tests: an in-memory database with its migrations
// run, a context with the fonts given, and its routes below /api/producer. Core's access checks aren't here: core's
// route inventory sweeps the Producer app's routes with every kind of caller.
export function testProducer({ fonts = [] }: { fonts?: FontFamily[] } = {}) {
  const client = new Database(':memory:');
  migrate(drizzle(client), {
    migrationsFolder: producerApp.migrationsFolder ?? '',
    migrationsTable: '__drizzle_migrations_producer',
  });
  const api = Fastify();
  api.setValidatorCompiler(validatorCompiler);
  api.setSerializerCompiler(serializerCompiler);
  const ctx: AppContext = {
    log: api.log,
    coreVersion: '0.1.0',
    db: (schema) => drizzle(client, { schema }),
    fonts: { list: () => fonts },
  };
  void api.register(async (scope) => producerApp.register?.(scope, ctx), { prefix: '/api/producer' });
  return { api, ctx, client };
}

/** The tables in `client`, apart from SQLite's own. */
export const tablesIn = (client: Database.Database) =>
  client
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
