import { describe, expect, it } from 'vitest';
import type { HTTPMethods, InjectOptions } from 'fastify';
import type { AppOptions } from '../app.ts';
import { testApp } from '../testing.ts';
import { PUBLIC_API_ROUTES } from './guard.ts';

// Hard rule 5 (ADR-0008): every /api route checks the caller unless it's deliberately public.
// The app reports each route as it's registered, so a new route that forgets its check fails here.

const ANY_ID = '00000000-0000-4000-8000-000000000000';

interface ApiRoute {
  method: HTTPMethods;
  url: string;
  /** "METHOD /path". HEAD counts as GET: Fastify adds a HEAD route for every GET route, with the same checks. */
  key: string;
}

async function inventory(options: Partial<AppOptions> = {}) {
  const routes: ApiRoute[] = [];
  const { app, db } = testApp({
    ...options,
    onRoute: (route) => {
      if (!route.url.startsWith('/api')) return;
      for (const method of [route.method].flat()) {
        routes.push({ method, url: route.url, key: `${method === 'HEAD' ? 'GET' : method} ${route.url}` });
      }
    },
  });
  await app.ready();
  const send = (route: ApiRoute, cookies: Record<string, string> = {}) =>
    app.inject({
      method: route.method as InjectOptions['method'],
      url: route.url.replaceAll(/:\w+/g, ANY_ID),
      cookies,
      ...(route.method === 'GET' || route.method === 'HEAD' ? {} : { payload: {} }),
    });
  return { app, db, routes, send };
}

// Every route outside PUBLIC_API_ROUTES that doesn't answer an anonymous request with 401.
async function routesOpenToAnonymous(options: Partial<AppOptions> = {}) {
  const { app, routes, send } = await inventory(options);
  const open: string[] = [];
  for (const route of routes.filter((r) => !PUBLIC_API_ROUTES.has(r.key))) {
    const res = await send(route);
    if (res.statusCode !== 401) open.push(`${route.method} ${route.url} → ${res.statusCode}`);
  }
  await app.close();
  return open;
}

describe('route inventory', () => {
  it('sees every /api route, and the public list names only real routes', async () => {
    const { app, routes } = await inventory();
    await app.close();
    const keys = new Set(routes.map((r) => r.key));
    expect(keys).toContain('GET /api/auth/me');
    for (const route of PUBLIC_API_ROUTES) expect(keys, route).toContain(route);
  });

  it('refuses an anonymous request on every route that is not public', async () => {
    expect(await routesOpenToAnonymous()).toEqual([]);
  });

  it('catches a route that forgets its check', async () => {
    const open = await routesOpenToAnonymous({
      registerRoutes: (api) => {
        api.post('/api/forgetful', async () => ({ ok: true }));
      },
    });
    expect(open).toEqual(['POST /api/forgetful → 200']);
  });
});
