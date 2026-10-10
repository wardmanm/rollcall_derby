import type { FastifyInstance, preValidationAsyncHookHandler } from 'fastify';
import type { Access, Permission, PermissionDef } from '@rollcall/app-sdk';
import type { Role, SessionUser } from '@rollcall/core-contract';

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

/** The caller behind a request or socket. API keys and output tokens join this union when they're built. */
export interface SessionPrincipal {
  kind: 'session';
  user: SessionUser;
  token: string;
}
export type Principal = SessionPrincipal;

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
  if ('public' in access) return undefined;
  if (!principal) return { status: 401, error: 'unauthenticated' };
  const { user } = principal;
  if (user.mustChangePassword && !('signedIn' in access && access.allowPendingPasswordChange)) {
    return { status: 403, error: 'password_change_required' };
  }
  if ('permission' in access && !permissions.granted(user.role, access.permission)) {
    return { status: 403, error: 'forbidden' };
  }
  return undefined;
}

/** What's wrong with a declaration owned by app `appId`, or null when nothing is. */
export function accessProblem(access: Access, { appId, permissions }: { appId: string; permissions: Permissions }) {
  if ('public' in access && access.public.trim() === '') return 'is public but gives no reason';
  if ('permission' in access) {
    const key = access.permission;
    if (!key.startsWith(`${appId}:`)) return `needs ${key}, but ${appId} may only use its own ${appId}:… permissions`;
    if (!permissions.find(key)) return `needs ${key}, which ${appId} doesn't declare`;
  }
  return null;
}

const API_ROUTE = /^\/api(\/|$)/;
const APP_OF_ROUTE = /^\/api\/([^/]+)\//;

// Checks each /api route's declaration as it's registered, then puts the route's guard first in its preValidation
// hooks, so a refused caller never learns what a valid body looks like (ADR-0014). It's installed on the root
// instance, so it sees /api routes wherever they're registered. A route belongs to the app named in its path,
// /api/<id>/…, and may only use that app's permissions (ADR-0019). HEAD routes that Fastify adds for GET routes pass
// through here too, with the same config.
export function enforceRouteAccess(
  app: FastifyInstance,
  options: { appIds: readonly string[]; permissions: Permissions },
): void {
  app.addHook('onRoute', (route) => {
    if (!API_ROUTE.test(route.url)) return;
    const name = `${[route.method].flat().join(',')} ${route.url}`;
    const appId = APP_OF_ROUTE.exec(route.url)?.[1];
    if (!appId || !options.appIds.includes(appId)) {
      throw new Error(`${name} isn't below /api/<id>/ for a hosted app (${options.appIds.join(', ')})`);
    }
    const access = route.config?.access;
    if (!access) throw new Error(`${name} declares no access. Give it config.access: public, signedIn or a permission`);
    const problem = accessProblem(access, { appId, permissions: options.permissions });
    if (problem) throw new Error(`${name} ${problem}`);
    if ('public' in access) return;
    const guard: preValidationAsyncHookHandler = async (request, reply) => {
      const denial = deny(access, request.principal, options.permissions);
      if (denial) return reply.code(denial.status).send({ error: denial.error });
      return undefined;
    };
    route.preValidation = [guard, ...[route.preValidation ?? []].flat()];
  });
}
