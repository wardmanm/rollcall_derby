import type { FastifyInstance, onRequestAsyncHookHandler } from 'fastify';
import type { Access, Permission, PermissionDef } from '@rollcall/app-sdk';
import type { Role, SessionUser } from '@rollcall/core-contract';
import type { ApiKeyHolder } from './api-keys.ts';

// Who may call a route or join a Socket.IO namespace (ADR-0018). Every /api route declares it in `config.access`, and
// the server refuses to start when a declaration is missing or wrong, so access is denied by default.

export type { Access, Permission, PermissionDef } from '@rollcall/app-sdk';

export interface Permissions {
  readonly all: readonly PermissionDef[];
  find(key: string): PermissionDef | undefined;
  granted(role: Role, key: Permission): boolean;
}

const PERMISSION_KEY = /^[a-z][a-z0-9-]*:[a-z][a-z0-9.-]*$/;

export function createPermissions(defs: readonly PermissionDef[]): Permissions {
  const byKey = new Map<string, PermissionDef>();
  for (const def of defs) {
    if (!PERMISSION_KEY.test(def.key)) throw new Error(`Permission ${def.key} must look like app:action, in lowercase`);
    if (byKey.has(def.key)) throw new Error(`Permission ${def.key} is declared twice`);
    byKey.set(def.key, def);
  }
  return {
    all: defs,
    find: (key) => byKey.get(key),
    granted(role, key) {
      const def = byKey.get(key);
      return def !== undefined && (role === 'admin' || def.roles.includes(role));
    },
  };
}

/** The caller behind a request or socket. Output tokens join this union when they're built. */
export interface SessionPrincipal {
  kind: 'session';
  user: SessionUser;
  token: string;
}

/** A device or script calling with an API key (ADR-0020): no user and no role, only the key's own permissions. */
export interface ApiKeyPrincipal {
  kind: 'apiKey';
  key: ApiKeyHolder;
}

export type Principal = SessionPrincipal | ApiKeyPrincipal;

/** The signed-in person behind a caller; undefined for an API key, or for nobody. */
export const userOf = (principal: Principal | null | undefined): SessionUser | undefined =>
  principal?.kind === 'session' ? principal.user : undefined;

export interface Denial {
  status: 401 | 403;
  error: 'unauthenticated' | 'password_change_required' | 'forbidden';
}

/** Why `principal` may not use something declared with `access`, or undefined when it may. Checks run in this order. */
export function deny(
  access: Access,
  principal: Principal | null | undefined,
  permissions: Permissions,
): Denial | undefined {
  if (access.public !== undefined) return undefined;
  if (!principal) return { status: 401, error: 'unauthenticated' };
  if (principal.kind === 'apiKey') {
    // A key isn't a person, so routes for any signed-in user refuse it. It holds exactly its own permissions, never
    // a people-only one, even if it was given one before the permission became people-only.
    if (access.signedIn) return { status: 403, error: 'forbidden' };
    const def = permissions.find(access.permission);
    const held = def !== undefined && !def.peopleOnly && principal.key.permissions.includes(access.permission);
    return held ? undefined : { status: 403, error: 'forbidden' };
  }
  const { user } = principal;
  if (user.mustChangePassword && !(access.signedIn && access.allowPendingPasswordChange)) {
    return { status: 403, error: 'password_change_required' };
  }
  if (access.permission !== undefined && !permissions.granted(user.role, access.permission)) {
    return { status: 403, error: 'forbidden' };
  }
  return undefined;
}

/** What's wrong with a declaration owned by app `appId`, or null when nothing is. */
export function accessProblem(access: Access, { appId, permissions }: { appId: string; permissions: Permissions }) {
  // The type allows only one, but a cast or a JavaScript app could mix them, and a mix would be treated as public.
  const kinds = [access.public !== undefined, access.signedIn === true, access.permission !== undefined];
  if (kinds.filter(Boolean).length !== 1) return 'must declare exactly one of public, signedIn or a permission';
  if (access.public !== undefined && access.public.trim() === '') return 'is public but gives no reason';
  if (access.permission !== undefined) {
    const key = access.permission;
    if (!key.startsWith(`${appId}:`)) return `needs ${key}, but ${appId} may only use its own ${appId}:… permissions`;
    if (!permissions.find(key)) return `needs ${key}, which ${appId} doesn't declare`;
  }
  return null;
}

const API_ROUTE = /^\/api(\/|$)/;
const APP_OF_ROUTE = /^\/api\/([^/]+)(\/|$)/;

// Checks each /api route's declaration as it's registered, then puts the route's guard first in its onRequest hooks,
// so a refused caller is turned away before its body is read: it never learns what a valid body looks like (ADR-0014),
// and can't make the server read an upload (ADR-0022). A route's own hooks run after the /api plugin's, which have
// already set the caller and done the cross-site check. It's installed on the root
// instance, so it sees /api routes wherever they're registered. A route belongs to the app named in its path,
// /api/<id> or below it, and may only use that app's permissions (ADR-0019). HEAD routes that Fastify adds for GET
// routes pass through here too, with the same config. A route outside the /api plugin gets neither the cross-site
// check nor a caller: a guarded one refuses everyone, and a public one stops the server.
export function enforceRouteAccess(
  app: FastifyInstance,
  options: { appIds: readonly string[]; permissions: Permissions },
): void {
  // `this` is the instance the route is registered on. Only the /api plugin and its children have `request.principal`,
  // decorated by installAuth (guard.ts) along with the cross-site check.
  app.addHook('onRoute', function (route) {
    if (!API_ROUTE.test(route.url)) return;
    const name = `${[route.method].flat().join(',')} ${route.url}`;
    const appId = APP_OF_ROUTE.exec(route.url)?.[1];
    if (!appId || !options.appIds.includes(appId)) {
      throw new Error(`${name} isn't at or below /api/<id> for a hosted app (${options.appIds.join(', ')})`);
    }
    const access = route.config?.access;
    if (!access) throw new Error(`${name} declares no access. Give it config.access: public, signedIn or a permission`);
    const problem = accessProblem(access, { appId, permissions: options.permissions });
    if (problem) throw new Error(`${name} ${problem}`);
    if (access.public !== undefined) {
      if (!this.hasRequestDecorator('principal')) {
        throw new Error(`${name} is public but outside the /api plugin, so it would skip the cross-site check`);
      }
      return;
    }
    const guard: onRequestAsyncHookHandler = async (request, reply) => {
      const denial = deny(access, request.principal, options.permissions);
      if (denial) return reply.code(denial.status).send({ error: denial.error });
      return undefined;
    };
    route.onRequest = [guard, ...[route.onRequest ?? []].flat()];
  });
}
