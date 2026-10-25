import { vi } from 'vitest';
import type { CurrentUser, SessionUser, SetupStatus } from '@rollcall/core-contract';

// Test helpers for rcl apps' web tests (`@rollcall/web-sdk/testing`).

type Answer = (request: Request) => Response | Promise<Response>;

/** A request the fake server received. A body that isn't JSON, such as an image, is its text, with its type. */
export interface ReceivedRequest {
  method: string;
  path: string;
  body: unknown;
  contentType?: string | null;
}

const parse = (text: string, contentType: string | null) =>
  contentType?.includes('json') ? { body: JSON.parse(text) as unknown } : { body: text, contentType };

/**
 * Stands in for the Rollcall server: answers each request from `routes`, keyed `'METHOD /path'`, and records it.
 * Anything not listed gets `404 not_found`, as the real server answers an unknown API path.
 */
export function fakeServer(routes: Record<string, Answer>) {
  const requests: ReceivedRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const path = new URL(input.url).pathname;
      const text = await input.clone().text();
      const received = text ? parse(text, input.headers.get('content-type')) : { body: undefined };
      requests.push({ method: input.method, path, ...received });
      const answer = routes[`${input.method} ${path}`];
      return answer ? answer(input) : Response.json({ error: 'not_found' }, { status: 404 });
    }),
  );
  return { requests };
}

export const json =
  (body: unknown, status = 200): Answer =>
  () =>
    Response.json(body, { status });

export const noContent: Answer = () => new Response(null, { status: 204 });

export const HEALTH = { status: 'ok', name: 'Rollcall', version: '0.1.0', uptimeSeconds: 5 };
export const SET_UP: SetupStatus = { needsSetup: false, canSetupHere: true };

export const ADMIN: CurrentUser = {
  id: 'u-admin',
  username: 'admin',
  role: 'admin',
  mustChangePassword: false,
  permissions: [
    'core:users.manage',
    'core:api-keys.manage',
    'core:teams.read',
    'core:teams.manage',
    'core:fonts.read',
    'core:fonts.manage',
    'producer:themes.read',
    'producer:themes.manage',
  ],
};
export const PRODUCER: CurrentUser = {
  id: 'u-producer',
  username: 'producer1',
  role: 'producer',
  mustChangePassword: false,
  permissions: ['core:teams.read', 'core:teams.manage', 'core:fonts.read', 'producer:themes.read'],
};
export const ANNOUNCER: CurrentUser = {
  id: 'u-announcer',
  username: 'announcer1',
  role: 'announcer',
  mustChangePassword: false,
  permissions: ['core:teams.read', 'core:fonts.read'],
};

/** The user as login, setup and password changes reply: without the permissions `me` adds. */
export const asSessionUser = ({ permissions: _permissions, ...user }: CurrentUser): SessionUser => user;

/** A server with one user signed in (or nobody, with `null`), plus `more` routes. */
export function signedIn(user: CurrentUser | null, more: Record<string, Answer> = {}) {
  return fakeServer({
    'GET /api/core/health': json(HEALTH),
    'GET /api/core/setup': json(SET_UP),
    'GET /api/core/auth/me': user ? json(user) : json({ error: 'unauthenticated' }, 401),
    'POST /api/core/auth/logout': noContent,
    ...more,
  });
}
