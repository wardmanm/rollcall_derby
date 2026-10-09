import type { Role, SessionUser } from '@rollcall/core-contract';

// Who may call a route or join a Socket.IO namespace (ADR-0018). Every /api route declares it in `config.access`, and
// the server refuses to start when a declaration is missing or wrong, so access is denied by default.

/** `<app id>:<action>`, such as `core:users.manage`. Each rcl app declares its own, prefixed with its id. */
export type Permission = `${string}:${string}`;

export type Access =
  /** Anyone, signed in or not. The reason is shown in the API explorer. */
  | { public: string }
  /** Any signed-in user. Only `me`, `password` and `logout` let a pending password change through. */
  | { signedIn: true; allowPendingPasswordChange?: true }
  /** A signed-in user whose role holds this permission. Admins hold every permission. */
  | { permission: Permission };

export interface PermissionDef {
  key: Permission;
  /** What it allows. Shown in the API explorer and on the users-and-access feature page. */
  summary: string;
  /** The roles it's granted to besides Admin, which holds every permission. */
  roles: readonly Role[];
}

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
