import { describe, expect, it } from 'vitest';
import type { FastifySchema, HTTPMethods, InjectOptions } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Role } from '@rollcall/core-contract';
import type { AppOptions } from '../app.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { INSTALLED_APPS } from '../installed-apps.ts';
import { addUser, CORE_VERSION, testApp } from '../testing.ts';
import type { Access } from './access.ts';
import { createApiKey } from './api-keys.ts';
import { SESSION_COOKIE } from './guard.ts';
import { createSession } from './sessions.ts';

// Hard rule 5 (ADR-0018): every /api route checks the caller's access. A route with no declaration can't start at all
// (access.test.ts); this test checks that each declaration is enforced. The app reports each route as it's
// registered, and each sweep sends every route a request as one kind of caller. Each sweep also runs once as a caller
// who should get through, which proves the sweep would catch a route that let the wrong caller in.

const ANY_ID = '00000000-0000-4000-8000-000000000000';
const byName = (a: string, b: string) => a.localeCompare(b);

// What a caller sends: a session cookie, an API key in an Authorization header, or nothing.
interface Credentials {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}
const anonymous = async (): Promise<Credentials> => ({});
const wrongKey = async (): Promise<Credentials> => ({ headers: { authorization: 'Bearer rcl_not-a-real-key' } });

interface ApiRoute {
  method: HTTPMethods;
  url: string;
  /** "METHOD /path". HEAD counts as GET: Fastify adds a HEAD route for every GET route, with the same checks. */
  key: string;
  schema: FastifySchema | undefined;
  access: Access | undefined;
}

async function inventory(options: Partial<AppOptions> = {}) {
  const routes: ApiRoute[] = [];
  // Every installed app, hosted at this core's version, so the sweeps cover all of their routes.
  const { app, db } = testApp({
    version: CORE_VERSION,
    apps: INSTALLED_APPS,
    ...options,
    onRoute: (route) => {
      if (!route.url.startsWith('/api')) return;
      for (const method of [route.method].flat()) {
        routes.push({
          method,
          url: route.url,
          key: `${method === 'HEAD' ? 'GET' : method} ${route.url}`,
          schema: route.schema,
          access: route.config?.access,
        });
      }
    },
  });
  await app.ready();
  const send = (route: ApiRoute, { cookies, headers }: Credentials) =>
    app.inject({
      method: route.method as InjectOptions['method'],
      url: route.url.replaceAll(/:\w+/g, ANY_ID),
      cookies,
      headers,
      ...(route.method === 'GET' || route.method === 'HEAD' ? {} : { payload: {} }),
    });
  // A new user and session for each request, since some routes (logout) end the session they're called with.
  let users = 0;
  const as =
    (role: Role, { mustChangePassword = false } = {}) =>
    async (): Promise<Credentials> => {
      const user = await addUser(db, `user${(users += 1)}`, 'correct horse', role, { mustChangePassword });
      return { cookies: { [SESSION_COOKIE]: createSession(db, user.id).token } };
    };
  // An API key holding `permissions`, made once and sent with every request.
  let keys = 0;
  const key = (permissions: readonly string[]) => {
    const created = createApiKey(db, { name: `key${(keys += 1)}`, permissions, expiresIn: 'never', createdBy: 'test' });
    return async (): Promise<Credentials> => ({ headers: { authorization: `Bearer ${created.key}` } });
  };
  return { app, routes, send, as, key };
}

type Inventory = Awaited<ReturnType<typeof inventory>>;

// The routes that don't refuse the caller with `status` and `error`. HEAD replies have no body, so only their status
// counts.
async function notRefused(
  { send }: Inventory,
  routes: readonly ApiRoute[],
  caller: () => Promise<Credentials>,
  { status, error }: { status: number; error: string },
) {
  const found: string[] = [];
  for (const route of routes) {
    const res = await send(route, await caller());
    const refused =
      res.statusCode === status && (route.method === 'HEAD' || res.json<{ error: string }>().error === error);
    if (!refused) found.push(`${route.method} ${route.url} → ${res.statusCode}`);
  }
  return found;
}

const keysOf = (routes: readonly ApiRoute[]) => [...new Set(routes.map((r) => r.key))].toSorted(byName);
const where = (routes: readonly ApiRoute[], test: (access: Access) => boolean) =>
  routes.filter((r) => r.access !== undefined && test(r.access));
const isPublic = (access: Access) => 'public' in access;
const allowsPendingChange = (access: Access) => 'signedIn' in access && access.allowPendingPasswordChange === true;

describe('route inventory', () => {
  it('pins the public routes and those that work while a password change is pending', async () => {
    const { app, routes } = await inventory();
    await app.close();
    expect(keysOf(where(routes, isPublic))).toEqual([
      'GET /api/core/health',
      'GET /api/core/setup',
      'POST /api/core/auth/login',
      'POST /api/core/auth/logout',
      'POST /api/core/setup',
    ]);
    expect(keysOf(where(routes, allowsPendingChange))).toEqual([
      'GET /api/core/auth/me',
      'POST /api/core/auth/password',
    ]);
  });

  it('refuses an anonymous caller on every route that is not public', async () => {
    const inv = await inventory();
    const gated = where(inv.routes, (access) => !isPublic(access));
    const unauthenticated = { status: 401, error: 'unauthenticated' };
    expect(await notRefused(inv, gated, anonymous, unauthenticated)).toEqual([]);
    expect(await notRefused(inv, gated, inv.as('admin'), unauthenticated)).toHaveLength(gated.length);
    await inv.app.close();
  });

  it('refuses every route but me, password and logout while a password change is pending', async () => {
    const inv = await inventory();
    const gated = where(inv.routes, (access) => !isPublic(access) && !allowsPendingChange(access));
    const pending = { status: 403, error: 'password_change_required' };
    expect(keysOf(gated)).toContain('GET /api/core/users');
    expect(await notRefused(inv, gated, inv.as('producer', { mustChangePassword: true }), pending)).toEqual([]);
    expect(await notRefused(inv, gated, inv.as('admin'), pending)).toHaveLength(gated.length);
    await inv.app.close();
  });

  it('refuses each role every route whose permission it lacks', async () => {
    const inv = await inventory();
    const forbidden = { status: 403, error: 'forbidden' };
    for (const role of ['producer', 'announcer'] as const) {
      const { permissions } = inv.app.hostedApps;
      const lacking = where(inv.routes, (a) => 'permission' in a && !permissions.granted(role, a.permission));
      expect(keysOf(lacking), role).toContain('GET /api/core/users');
      expect(await notRefused(inv, lacking, inv.as(role), forbidden), role).toEqual([]);
      expect(await notRefused(inv, lacking, inv.as('admin'), forbidden), role).toHaveLength(lacking.length);
    }
    await inv.app.close();
  });

  it('lets an API key call only routes needing a permission it holds, and never a people-only one', async () => {
    const inv = await inventory();
    const grantable = inv.app.hostedApps.permissions.all.filter((def) => !def.peopleOnly).map((def) => def.key);
    const keyMayCall = (access: Access) => 'permission' in access && grantable.includes(access.permission);
    const refusedToKeys = where(inv.routes, (access) => !isPublic(access) && !keyMayCall(access));
    const forbidden = { status: 403, error: 'forbidden' };
    const key = inv.key(grantable);
    expect(keysOf(refusedToKeys)).toEqual(
      expect.arrayContaining(['GET /api/core/auth/me', 'GET /api/core/users', 'GET /api/core/api-keys']),
    );
    expect(await notRefused(inv, refusedToKeys, key, forbidden)).toEqual([]);
    expect(await notRefused(inv, refusedToKeys, inv.as('admin'), forbidden)).toHaveLength(refusedToKeys.length);
    const callable = where(inv.routes, keyMayCall);
    expect(keysOf(callable)).toEqual([
      'DELETE /api/core/teams/:id',
      'DELETE /api/core/teams/:id/logo',
      'DELETE /api/core/teams/:id/members/:memberId',
      'DELETE /api/core/teams/:id/members/:memberId/photo',
      'GET /api/core/teams',
      'GET /api/core/teams/:id',
      'PATCH /api/core/teams/:id',
      'PATCH /api/core/teams/:id/members/:memberId',
      'POST /api/core/teams',
      'POST /api/core/teams/:id/members',
      'PUT /api/core/teams/:id/logo',
      'PUT /api/core/teams/:id/members/:memberId/photo',
    ]);
    // A key gets through to each: no team exists, so most answer 404 or 400, but none refuses the key.
    const refusals = [];
    for (const route of callable) {
      const { statusCode } = await inv.send(route, await key());
      if (statusCode === 401 || statusCode === 403) refusals.push(`${route.key} → ${statusCode}`);
    }
    expect(refusals).toEqual([]);
    const list = callable.find((route) => route.key === 'GET /api/core/teams' && route.method === 'GET')!;
    expect((await inv.send(list, await key())).statusCode).toBe(200);
    await inv.app.close();
  });

  it('refuses a wrong API key on every route that is not public', async () => {
    const inv = await inventory();
    const gated = where(inv.routes, (access) => !isPublic(access));
    const unauthenticated = { status: 401, error: 'unauthenticated' };
    expect(await notRefused(inv, gated, wrongKey, unauthenticated)).toEqual([]);
    expect(await notRefused(inv, gated, inv.as('admin'), unauthenticated)).toHaveLength(gated.length);
    await inv.app.close();
  });

  it('gives every /api route a response schema, and a params schema when its path has parameters', async () => {
    expect(await routesMissingSchemas()).toEqual([]);
  });

  it('catches a route without schemas', async () => {
    const signedIn = { access: { signedIn: true } } as const;
    const missing = await routesMissingSchemas({
      registerRoutes: (api) => {
        api.get('/api/core/schemaless/:id', { config: signedIn }, async () => ({ ok: true }));
        api.withTypeProvider<ZodTypeProvider>().get(
          '/api/core/errors-only',
          { config: signedIn, schema: { response: { ...ERROR_RESPONSES } } },
          // No success status is declared, so nothing but void type-checks here; the handler is never invoked.
          async () => undefined,
        );
      },
    });
    expect(missing).toEqual([
      'GET /api/core/schemaless/:id has no success (2xx) response schema',
      'GET /api/core/schemaless/:id has no params schema',
      'GET /api/core/errors-only has no success (2xx) response schema',
    ]);
  });

  it('matches the OpenAPI document, route for route', async () => {
    const { app, routes } = await inventory();
    const { paths } = app.swagger() as { paths: Record<string, Record<string, unknown>> };
    await app.close();
    const documented = Object.entries(paths)
      .filter(([path]) => path.startsWith('/api'))
      .flatMap(([path, operations]) =>
        Object.keys(operations)
          .filter((method) => method !== 'head')
          .map((method) => `${method.toUpperCase()} ${path.replaceAll(/\{(\w+)\}/g, ':$1')}`),
      );
    const registered = [...new Set(routes.filter((r) => r.method !== 'HEAD').map((r) => r.key))];
    expect(documented.toSorted(byName)).toEqual(registered.toSorted(byName));
  });
});

const SUCCESS_STATUS = /^2(\d\d|xx)$/i;

// Every /api route must declare a response schema for a success status, and a params schema when its path has a
// parameter (ADR-0014). A route that declares only error responses (ERROR_RESPONSES) would otherwise pass: Fastify
// then sends its 2xx reply through plain JSON.stringify, unchecked.
async function routesMissingSchemas(options: Partial<AppOptions> = {}) {
  const { app, routes } = await inventory(options);
  await app.close();
  return routes.flatMap((r) => {
    if (r.method === 'HEAD') return [];
    const missing: string[] = [];
    const responseKeys = Object.keys((r.schema?.response as Record<string, unknown> | undefined) ?? {});
    if (!responseKeys.some((key) => SUCCESS_STATUS.test(key))) {
      missing.push(`${r.key} has no success (2xx) response schema`);
    }
    if (r.url.includes(':') && !r.schema?.params) missing.push(`${r.key} has no params schema`);
    return missing;
  });
}
