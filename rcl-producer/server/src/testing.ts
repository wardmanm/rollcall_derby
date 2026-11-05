import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppContext, Realtime } from '@rollcall/app-sdk';
import type { FontFamily, Team } from '@rollcall/core-contract';
import { producerApp } from './index.ts';

// The Producer app hosted the way rcl-core hosts it, for its own tests: an in-memory database with its migrations
// run, a context with the fonts and teams given, and its routes below /api/producer. Core's access checks aren't here: core's
// route inventory sweeps the Producer app's routes with every kind of caller.
export function testProducer({ fonts = [], teams = [] }: { fonts?: FontFamily[]; teams?: Team[] } = {}) {
  const client = new Database(':memory:');
  // As in rcl-core's database, so ON DELETE SET NULL works.
  client.pragma('foreign_keys = ON');
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
    // `teams` is read each time, so a test can change it while the app runs.
    teams: {
      list: () =>
        teams.map(({ members, createdAt: _createdAt, ...team }) => ({
          ...team,
          skaterCount: members.filter((member) => member.kind === 'skater').length,
          benchCount: members.filter((member) => member.kind === 'bench').length,
        })),
      get: (id) => teams.find((team) => team.id === id),
    },
  };
  void api.register(async (scope) => producerApp.register?.(scope, ctx), { prefix: '/api/producer' });
  return { api, ctx, client, teams };
}

export type Sent = [event: string, payload: unknown];

// One namespace on the stand-in: its clients, each with the rooms it joined and what it's been sent, and what was sent
// to each room. It has no namespace-wide emit, so everything the app sends goes to a room.
function standInNamespace() {
  const clients: { rooms: Set<string>; received: Sent[] }[] = [];
  const rooms = new Map<string, Sent[]>();
  const sentTo = (room: string) => {
    const sent = rooms.get(room) ?? [];
    rooms.set(room, sent);
    return sent;
  };
  let onConnection: ((socket: object) => void) | undefined;
  return {
    on: (_event: 'connection', listener: (socket: object) => void) => {
      onConnection = listener;
    },
    to: (room: string) => ({
      emit: (...sent: Sent) => {
        sentTo(room).push(sent);
        for (const client of clients) if (client.rooms.has(room)) client.received.push(sent);
      },
    }),
    connect(auth: Record<string, unknown>) {
      const client = { rooms: new Set<string>(), received: [] as Sent[] };
      clients.push(client);
      onConnection?.({
        handshake: { auth },
        join: (room: string) => {
          client.rooms.add(room);
        },
        emit: (...sent: Sent) => {
          client.received.push(sent);
        },
      });
      return client.received;
    },
    sentTo,
  };
}

/**
 * The Producer app's namespaces opened on a stand-in for Socket.IO, for its own tests: what each was opened with, a way
 * to connect a client with a handshake's `auth` and see everything it's sent, and everything sent to a room.
 */
export function testRealtime(ctx: AppContext) {
  const opens: Parameters<Realtime['namespace']>[] = [];
  const namespaces = new Map<string, ReturnType<typeof standInNamespace>>();
  const rt: Realtime = {
    namespace: (...open) => {
      opens.push(open);
      const namespace = standInNamespace();
      namespaces.set(open[0], namespace);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stand-in has only what the app uses
      return namespace as never;
    },
  };
  producerApp.realtime?.(rt, ctx);
  const of = (name: string) => {
    const namespace = namespaces.get(name);
    if (!namespace) throw new Error(`The app opened no ${name} namespace`);
    return namespace;
  };
  return {
    opens,
    connect: (name: string, auth: Record<string, unknown> = {}) => of(name).connect(auth),
    /** What was sent to `room` so far: the list grows as more is sent, and emptying it starts afresh. */
    sentTo: (name: string, room: string) => of(name).sentTo(room),
  };
}

/** The tables in `client`, apart from SQLite's own. */
export const tablesIn = (client: Database.Database) =>
  client
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
