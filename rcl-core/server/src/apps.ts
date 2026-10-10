import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyBaseLogger } from 'fastify';
import { satisfies, validRange } from 'semver';
import type { AppContext, AppModule } from '@rollcall/app-sdk';
import { createPermissions, type Permissions } from './auth/access.ts';
import type { AppDatabase } from './db.ts';
import type { WebApp } from './web-apps.ts';

/** The rcl apps this server hosts, after their startup checks (ADR-0019). */
export interface HostedApps {
  /** Core first, then each app that passed its checks, in the order installed. */
  modules: readonly AppModule[];
  /** Every hosted app's permissions. */
  permissions: Permissions;
  /** Each hosted app's web build, below `/<id>/`. Core's comes first, so `/` redirects to it. */
  webApps: WebApp[];
  contextFor(module: AppModule): AppContext;
}

const APP_ID = /^[a-z][a-z0-9-]*$/;

/** The migrations table for an app's own migrations. Core keeps Drizzle's default, so existing databases still open. */
export const migrationsTableFor = (id: string) => `__drizzle_migrations_${id}`;

// Why `app` can't be hosted next to the apps already accepted, or null when it can.
function appProblem(app: AppModule, accepted: readonly AppModule[], coreVersion: string): string | null {
  if (!APP_ID.test(app.id)) return `its id "${app.id}" must be lowercase letters, digits and dashes`;
  if (accepted.some((other) => other.id === app.id)) return `another app already uses the id "${app.id}"`;
  if (!validRange(app.requiresCore)) return `its requiresCore "${app.requiresCore}" isn't a version range`;
  if (!satisfies(coreVersion, app.requiresCore)) {
    return `it needs rcl-core ${app.requiresCore}, and this is rcl-core ${coreVersion}`;
  }
  const foreign = app.permissions.find((def) => !def.key.startsWith(`${app.id}:`));
  if (foreign) return `its permission ${foreign.key} isn't one of its own (${app.id}:…)`;
  try {
    createPermissions(app.permissions);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

/** Runs an app's own migrations, in its own migrations table. */
export function migrateApp(app: AppModule, db: AppDatabase): void {
  if (!app.migrationsFolder) return;
  migrate(drizzle(db.$client), { migrationsFolder: app.migrationsFolder, migrationsTable: migrationsTableFor(app.id) });
}

// Startup for rcl apps (split spec). Core's own tables are already migrated (db.ts), and core is always hosted. Each
// other app needs a valid id no other app uses, a requiresCore range this core satisfies, and permissions under its
// own id; then its migrations run. An app that fails is skipped with an error in the log, and core keeps running.
export function hostApps({
  core,
  apps,
  coreVersion,
  db,
  log,
}: {
  core: AppModule;
  apps: readonly AppModule[];
  coreVersion: string;
  db: AppDatabase;
  log: FastifyBaseLogger;
}): HostedApps {
  const modules: AppModule[] = [core];
  for (const app of apps) {
    const problem = appProblem(app, modules, coreVersion);
    if (problem) {
      log.error({ app: app.id }, `Skipping rcl app "${app.id}": ${problem}`);
      continue;
    }
    try {
      migrateApp(app, db);
    } catch (error) {
      log.error({ app: app.id, err: error }, `Skipping rcl app "${app.id}": its migrations failed`);
      continue;
    }
    modules.push(app);
  }
  return {
    modules,
    permissions: createPermissions(modules.flatMap((module) => module.permissions)),
    webApps: modules.flatMap((module) => (module.web ? [{ base: `/${module.id}/`, ...module.web }] : [])),
    contextFor: (module) => ({
      log: log.child({ app: module.id }),
      coreVersion,
      db: (schema) => drizzle(db.$client, { schema }),
    }),
  };
}
