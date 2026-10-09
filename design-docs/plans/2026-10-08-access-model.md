# Declared Access with Per-App Permissions (#3, #8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every `/api` route and every Socket.IO namespace declares who may use it: public (with a reason), any signed-in user, or a namespaced permission such as `core:users.manage`. Core enforces each declaration in one place and refuses to start when one is missing or wrong. The auth hardening from #8 is folded in.

**Architecture:**
- **`rcl-core/server/src/auth/access.ts`** (new) holds the model:
  - the types `Permission`, `Access`, `PermissionDef`, `Permissions`, `Principal` and `Denial`;
  - `createPermissions(defs)`, the permission registry, in which Admin holds every permission;
  - `deny(access, principal, permissions)`, the one place that decides 401/403;
  - `accessProblem(access, { appId, permissions })`, which says what's wrong with a declaration;
  - `enforceRouteAccess(app, …)`, a root-level `onRoute` hook. It throws at startup for a bad declaration, and otherwise puts the route's guard first in its `preValidation` hooks.
- **`src/auth/permissions.ts`** (new): `CORE_APP_ID = 'core'` and `CORE_PERMISSIONS`. Today that's one permission, `core:users.manage`.
- **`src/auth/guard.ts`:**
  - `resolvePrincipal(db, cookies)` resolves the caller. Today the only kind is a session.
  - `installAuth` runs the CSRF check, then sets `request.principal`, and decorates `request.recheckAccess()`.
  - `PUBLIC_API_ROUTES`, `requireSession`, `requireUser` and `requireRole` are removed.
- **`src/realtime.ts`:**
  - `realtime.namespace(name, { access })` is the only way to create a namespace. A namespace made with `io.of()` directly stops the server.
  - The bare `/` namespace refuses everyone.
- **`src/openapi.ts`:** each operation's description says who may call it, and public operations carry `security: []`.
- **`src/server.ts`:**
  - One permission registry is shared by HTTP and sockets.
  - The stand-in password hash is computed before listening.
  - A failed start closes everything it opened.

**Tech Stack:** Fastify 5.12 with `@fastify/swagger` 9.9 and `fastify-type-provider-zod` 7; Socket.IO 4.8; Zod 4; Drizzle 0.45 with better-sqlite3; Node ≥ 24.7; TypeScript 7; Vitest 5; Oxlint (type-aware).

**Spec:** [`design-docs/specs/2026-10-07-rollcall-split-design.md`](../specs/2026-10-07-rollcall-split-design.md), the "Access model" section and Phase 3. Issues: **#3** (declarative access with per-app permissions) and **#8** (auth hardening deferred from the access-control review).

**How this plan was checked:** every code block below was built on a throwaway branch and run there. On that branch, `yarn typecheck`, `yarn lint`, `yarn format:check` and all 193 unit tests passed. Each "fails" step below was confirmed to fail before its fix.

## Global Constraints

- **Access declarations**, copied from the spec:
  ```ts
  type Permission = `${string}:${string}`;     // 'core:users.manage'
  type Access =
    | { public: string }                                      // reason, shown in /docs
    | { signedIn: true; allowPendingPasswordChange?: true }   // only me / password / logout
    | { permission: Permission };
  // route: { config: { access: { permission: 'core:users.manage' } }, schema: {...} }
  ```
- **Permissions:**
  - `PermissionDef` is `{ key, summary, roles }`. `roles` lists the roles other than Admin that hold the permission.
  - **Admin holds every permission.**
  - Keys match `/^[a-z][a-z0-9-]*:[a-z][a-z0-9.-]*$/`.
  - A route may only use permissions prefixed with its own app's id, which is `core` for every route in this phase.
- **Denied by default:** an `/api` route with no `access`, a public route with an empty reason, an undeclared permission, or another app's permission stops the server at startup.
- **Public routes**, exactly these:
  - `GET /api/health`
  - `GET /api/setup`
  - `POST /api/setup`
  - `POST /api/auth/login`
- **Allowed while a password change is pending**, exactly these:
  - `GET /api/auth/me`
  - `POST /api/auth/password`
  - `POST /api/auth/logout`
- **Order of checks:**
  1. A state-changing request whose `Origin` doesn't match `Host`: `403 {"error":"cross_origin"}`.
  2. No caller: `401 {"error":"unauthenticated"}`.
  3. Password change pending: `403 {"error":"password_change_required"}`.
  4. Missing permission: `403 {"error":"forbidden"}`.
- **Socket.IO:**
  - Refusals are `Error('cross_origin')`, `Error('unauthenticated')`, `Error('password_change_required')`, `Error('forbidden')` and `Error('internal_error')`.
  - **The bare `/` namespace refuses every connection** with `Error('not_found')`.
  - `/overlay` stays public.
  - Signed-in namespaces keep the Origin check.
- **Hard rule 5 becomes:** "**Authorization happens on the server.** Every API route and socket event checks the caller's access. Hiding UI is not access control." It is recorded in **ADR-0018**, which supersedes ADR-0008.
- **Runtime and TypeScript (ADR-0013):** Node ≥ 24.7, `.ts` extensions on relative imports, erasable syntax only, `import type` for types.
- **No `as` casts in `src/`**: Oxlint's `no-unsafe-type-assertion` is on there. Test files may use them.
- **No new inline `oxlint-disable` comments.**
- **Every commit passes `yarn format && yarn check`.**
  - Commit messages follow Conventional Commits with scope `rcl-core`, and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  - Task 6's commit says `Closes #8`, and Task 7's commit says `Closes #3`.
- **Before merge:** `yarn check`, `yarn test:stories` and `yarn test:e2e` pass (spec, "Phases").
- **Nothing is pushed** without Mike's explicit OK (Task 8).

## Review Focus

1. **An `/api` route registered outside the `/api` plugin**, directly on the app or later in a module's own plugin. Without a declaration it must stop startup. With one, it refuses everyone, because only the `/api` plugin knows who's calling. Test in Task 2.
2. **A caller who loses access mid-request.** An Admin is demoted, deleted or signed out while a password hashes, or a user is signed out while changing their password. Nothing may be written; the reply is 403 or 401. Tests in Task 5.
3. **The HEAD twin of a GET route** gets the same refusal as the GET. Test in Task 2, and every inventory sweep includes HEAD routes.
4. **A namespace created by a later feature with `io.of()`**, or a client connecting to `/`. The first stops startup; the second gets `not_found`. Tests in Task 4.
5. **OBS overlays across the change.** `/overlay` must stay public, still say hello, and still reconnect after a restart. Covered by the `server.test.ts` tests this plan leaves unchanged, plus `yarn test:e2e` in Task 8.

## Decisions this plan makes

The spec leaves these open. Each is decided here so implementers and reviewers don't have to guess.

- **The enforcement hook sits on the root instance, not inside the `/api` plugin** (the spec says "in the `/api` plugin"). It then sees every `/api` route wherever it's registered. Resolving the caller stays inside the plugin, so a route outside it fails closed (Review Focus 1).
- **The owning app is `core` for every route** until Phase 4b gives each app its own `/api/<id>` prefix.
- **One permission, `core:users.manage`, covers all six users routes**, and no role but Admin holds it. Splitting it into view and manage waits until there's a reason.
- **`request.principal` replaces `request.user` and `request.sessionToken`.**
  - It's `{ kind: 'session', user, token }`.
  - API keys (#7) and output tokens (#10) join the union when they're built.
- **`{ signedIn: true }` without `allowPendingPasswordChange` is part of the type**, but no route uses it yet. The spec's `GET /api/core/apps` will.
- **Re-checking after an `await` (#8) covers every handler that awaits before it writes:** `POST /api/users`, `POST /api/users/:id/password-reset`, and also `POST /api/auth/password`. That last one has the same bug: an Admin's reset during the hash would be overwritten.
- **Public routes need a non-empty reason.** It's shown in `/docs`.
- **Socket.IO:**
  - `/` refuses with `not_found`.
  - Creating a namespace through `io.of()` throws, caught on Socket.IO's `new_namespace` event.
  - Dynamic (regex or function) namespaces aren't supported.
  - After this phase only `/overlay` exists, and it's public. Core's signed-in `/core` namespace arrives in Phase 4b, so the tests use probe namespaces.
- **The API explorer:**
  - Each operation's `description` is one access line.
  - Public operations get `security: []`, and the document as a whole gets `security: [{ session: [] }]`.
- **The feature page's permission table is checked against `CORE_PERMISSIONS`** by a test, so the doc can't drift from the code.
- **A failed start runs `app.close()`**, reusing the existing `preClose` hook (Socket.IO) and `onClose` hook (timer, database). Both paths were checked: the port is taken, and a declaration is bad.
- **Not done here:** API keys (#7), the CORS allowlist (#9), output tokens (#10), routes under `/api/core` and the `/core` namespace (Phase 4b).

---

## File map

All paths are relative to the repo root.

| File | Responsibility | Task |
|---|---|---|
| `rcl-core/server/src/auth/access.ts` (+ test), `src/auth/permissions.ts` | The access model and core's permissions | 1, 2 |
| `src/auth/guard.ts` (+ test), `src/app.ts`, `src/routes/{setup,auth,users}.ts`, `src/openapi.ts`, `src/http.test.ts`, `src/auth/route-inventory.test.ts` | Enforcing route access; routes migrated; inventory sweeps | 2 |
| `src/openapi.ts` (+ test), `src/app.ts` | Who may call each operation, shown in `/docs` | 3 |
| `src/realtime.ts` (+ test), `src/server.ts`, `src/server.test.ts` | Namespaces declare access; `/` refuses everyone | 4 |
| `src/auth/guard.ts`, `src/app.ts`, `src/routes/{users,auth}.ts` (+ tests) | Re-checking the caller after an `await` | 5 |
| `src/server.ts` (+ test) | Warming the stand-in hash; cleaning up a failed start | 6 |
| `docs/…`, `AGENTS.md`, `CHANGELOG.md`, `.claude/rules/rcl-core-server.md`, `src/auth/permissions.test.ts`, ADR-0008 references in code comments | ADR-0018, the permission table, guides | 7 |

`src/` means `rcl-core/server/src/` throughout.

---

### Task 1: Access declarations and core's permissions

**Files:**
- Create: `rcl-core/server/src/auth/access.ts`, `rcl-core/server/src/auth/permissions.ts`
- Test: `rcl-core/server/src/auth/access.test.ts`

**Interfaces:**
- Consumes: `Role` and `SessionUser` from `@rollcall/core-contract`.
- Produces, from `access.ts`:
  - `type Permission`, `type Access`, `interface PermissionDef { key; summary; roles }`.
  - `interface Permissions { all; find(key: string): PermissionDef | undefined; granted(role: Role, key: Permission): boolean }`.
  - `createPermissions(defs: readonly PermissionDef[]): Permissions`.
  - `interface SessionPrincipal { kind: 'session'; user: SessionUser; token: string }` and `type Principal = SessionPrincipal`.
  - `interface Denial { status: 401 | 403; error: 'unauthenticated' | 'password_change_required' | 'forbidden' }`.
  - `deny(access: Access, principal: Principal | null | undefined, permissions: Permissions): Denial | undefined`.
  - `accessProblem(access: Access, { appId, permissions }): string | null`.
- Produces, from `permissions.ts`: `CORE_APP_ID = 'core'` and `CORE_PERMISSIONS: readonly PermissionDef[]`.

- [ ] **Step 0: Branch, and commit this plan.** Run:

```bash
git switch -c feat/access-model
git add design-docs/plans/2026-10-08-access-model.md
git commit -F - <<'EOF'
docs(rcl-core): plan for declared access and per-app permissions

Phase 3 of the Rollcall split spec (#3), with the auth hardening from #8.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Remind Mike, in one line, to move #3 and #8 to "In progress" on board #6.

- [ ] **Step 1: Write the failing tests.** Create `rcl-core/server/src/auth/access.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Role } from '@rollcall/core-contract';
import { createPermissions, deny, type Access, type PermissionDef, type Principal } from './access.ts';
import { CORE_PERMISSIONS } from './permissions.ts';

describe('createPermissions', () => {
  it('grants Admin every declared permission, and other roles only those that list them', () => {
    const permissions = createPermissions([
      { key: 'core:users.manage', summary: 'Manage users', roles: [] },
      { key: 'core:teams.edit', summary: 'Edit teams', roles: ['producer'] },
    ]);
    expect(permissions.granted('admin', 'core:users.manage')).toBe(true);
    expect(permissions.granted('producer', 'core:teams.edit')).toBe(true);
    expect(permissions.granted('producer', 'core:users.manage')).toBe(false);
    expect(permissions.granted('announcer', 'core:teams.edit')).toBe(false);
    expect(permissions.granted('admin', 'core:undeclared')).toBe(false);
  });

  it('refuses a permission declared twice, or one that is not app:action in lowercase', () => {
    const def: PermissionDef = { key: 'core:users.manage', summary: 'x', roles: [] };
    expect(() => createPermissions([def, def])).toThrow('Permission core:users.manage is declared twice');
    for (const key of ['users.manage', 'Core:users', 'core:', ':users'] as const) {
      // @ts-expect-error -- deliberately malformed keys; only some of them fail the type check
      expect(() => createPermissions([{ key, summary: 'x', roles: [] }]), key).toThrow('must look like app:action');
    }
  });
});

const session = (role: Role, mustChangePassword = false): Principal => ({
  kind: 'session',
  token: 't',
  user: { id: 'u', username: 'u', role, mustChangePassword },
});

describe('deny', () => {
  const permissions = createPermissions(CORE_PERMISSIONS);
  const manageUsers: Access = { permission: 'core:users.manage' };

  it('lets anyone use a public declaration', () => {
    expect(deny({ public: 'why' }, null, permissions)).toBeUndefined();
  });

  it('checks in order: signed in, then no pending password change, then the permission', () => {
    expect(deny(manageUsers, null, permissions)).toEqual({ status: 401, error: 'unauthenticated' });
    expect(deny(manageUsers, session('producer', true), permissions)).toEqual({
      status: 403,
      error: 'password_change_required',
    });
    expect(deny(manageUsers, session('producer'), permissions)).toEqual({ status: 403, error: 'forbidden' });
    expect(deny(manageUsers, session('admin'), permissions)).toBeUndefined();
  });

  it('lets a pending password change through only where the declaration allows it', () => {
    const pending = session('announcer', true);
    expect(deny({ signedIn: true }, pending, permissions)).toMatchObject({ error: 'password_change_required' });
    expect(deny({ signedIn: true, allowPendingPasswordChange: true }, pending, permissions)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `yarn vitest run rcl-core/server/src/auth/access.test.ts`
Expected: FAIL. The file can't load, because `./access.ts` doesn't exist.

- [ ] **Step 3: Write the model.** Create `rcl-core/server/src/auth/access.ts`:

```ts
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
```

Create `rcl-core/server/src/auth/permissions.ts`:

```ts
import type { PermissionDef } from './access.ts';

// rcl-core's own permissions (ADR-0018). The users-and-access feature page lists the same table, and a test keeps
// the two in step.
export const CORE_APP_ID = 'core';

export const CORE_PERMISSIONS: readonly PermissionDef[] = [
  {
    key: 'core:users.manage',
    summary: 'Create users, change their roles, reset their passwords, sign them out and delete them',
    roles: [],
  },
];
```

- [ ] **Step 4: Run it and see it pass.**

Run: `yarn vitest run rcl-core/server/src/auth/access.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server/src/auth/access.ts rcl-core/server/src/auth/access.test.ts rcl-core/server/src/auth/permissions.ts
git commit -F - <<'EOF'
feat(rcl-core): access declarations and core's permissions

Routes and namespaces will declare their access: public with a reason, any
signed-in user, or a permission named <app>:<action>. Admin holds every
permission. Nothing enforces the declarations yet.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Every `/api` route declares its access

**Files:**
- Modify: `rcl-core/server/src/auth/access.ts`, `src/auth/guard.ts`, `src/app.ts`, `src/routes/setup.ts`, `src/routes/auth.ts`, `src/routes/users.ts`, `src/openapi.ts`
- Test: `src/auth/access.test.ts`, `src/auth/guard.test.ts`, `src/auth/route-inventory.test.ts` (rewritten), `src/http.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces:
  - `enforceRouteAccess(app: FastifyInstance, options: { appId: string; permissions: Permissions }): void`, in `access.ts`.
  - The Fastify augmentation `FastifyContextConfig.access?: Access`, in `access.ts`.
  - `request.principal: Principal | null` (augmentation) and `resolvePrincipal(db: AppDatabase, cookies: Record<string, string | undefined>): Principal | null`, in `guard.ts`.
  - `installAuth(app, db)` keeps its signature (Task 5 changes it).
  - `AppOptions.permissions?: Permissions`, in `app.ts`. It defaults to `createPermissions(CORE_PERMISSIONS)`.
- Removed from `guard.ts`: `PUBLIC_API_ROUTES`, `requireSession`, `requireUser`, `requireRole`, and the `user` and `sessionToken` request decorations.

- [ ] **Step 1: Write the failing tests.** In `rcl-core/server/src/auth/access.test.ts`, replace the import block with:

```ts
import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import { addUser, testApp } from '../testing.ts';
import { createPermissions, deny, type Access, type PermissionDef, type Principal } from './access.ts';
import { SESSION_COOKIE } from './guard.ts';
import { CORE_PERMISSIONS } from './permissions.ts';
import { createSession } from './sessions.ts';

const PRODUCER_THEMES: PermissionDef = { key: 'producer:themes.edit', summary: 'Edit themes', roles: ['producer'] };
```

Then append:

```ts
// Builds an app with one extra route and waits for it to start, which is when declarations are checked.
async function startWith(register: (api: FastifyInstance) => void, defs = [...CORE_PERMISSIONS, PRODUCER_THEMES]) {
  const { app } = testApp({ permissions: createPermissions(defs), registerRoutes: register });
  try {
    await app.ready();
  } finally {
    await app.close();
  }
}

// A route at `url` declaring `access`, or nothing at all.
const routeAt = (url: string, access?: Access) => (api: FastifyInstance) => {
  api.get(url, access ? { config: { access } } : {}, async () => ({}));
};

describe('route access declarations', () => {
  it('stop the server at startup when a route has none', async () => {
    await expect(startWith(routeAt('/api/forgetful'))).rejects.toThrow('GET /api/forgetful declares no access');
  });

  it('stop the server at startup when a public route gives no reason', async () => {
    await expect(startWith(routeAt('/api/open', { public: ' ' }))).rejects.toThrow(
      'GET /api/open is public but gives no reason',
    );
  });

  it('stop the server at startup when a permission is undeclared', async () => {
    await expect(startWith(routeAt('/api/typo', { permission: 'core:users.mange' }))).rejects.toThrow(
      "GET /api/typo needs core:users.mange, which core doesn't declare",
    );
  });

  it("stop the server at startup when a core route uses another app's permission", async () => {
    await expect(startWith(routeAt('/api/borrowed', { permission: 'producer:themes.edit' }))).rejects.toThrow(
      'GET /api/borrowed needs producer:themes.edit, but core may only use its own core:… permissions',
    );
  });

  it('leave routes outside /api alone', async () => {
    await expect(startWith(routeAt('/not-api'))).resolves.toBeUndefined();
  });
});

async function cookieFor(db: AppDatabase, username: string, role: Role, mustChangePassword = false) {
  const user = await addUser(db, username, 'correct horse', role, { mustChangePassword });
  return { [SESSION_COOKIE]: createSession(db, user.id).token };
}

// Two probe routes; `seen` records when the users probe's own preValidation hook runs.
function appWithProbes() {
  const seen: string[] = [];
  const { app, db } = testApp({
    registerRoutes: (api) => {
      api.post(
        '/api/probe/users',
        {
          config: { access: { permission: 'core:users.manage' } },
          // A route's own preValidation runs after the guard.
          preValidation: async () => void seen.push('route preValidation'),
        },
        async () => ({ ok: true }),
      );
      api.get('/api/probe/signed-in', { config: { access: { signedIn: true } } }, async () => ({ ok: true }));
    },
  });
  return { app, db, seen };
}

describe('the route guard', () => {
  it('refuses before the route sees the request, and lets a permitted caller through', async () => {
    const { app, db, seen } = appWithProbes();
    const probe = (cookies: Record<string, string>) =>
      app.inject({ method: 'POST', url: '/api/probe/users', payload: {}, cookies });
    expect((await probe({})).json()).toEqual({ error: 'unauthenticated' });
    expect((await probe(await cookieFor(db, 'p1', 'producer'))).json()).toEqual({ error: 'forbidden' });
    expect(seen).toEqual([]);
    expect((await probe(await cookieFor(db, 'admin', 'admin'))).statusCode).toBe(200);
    expect(seen).toEqual(['route preValidation']);
  });

  it('also guards the HEAD route Fastify adds for each GET route', async () => {
    const { app } = appWithProbes();
    expect((await app.inject({ method: 'HEAD', url: '/api/probe/signed-in' })).statusCode).toBe(401);
  });
});

describe('an /api route registered outside the /api plugin', () => {
  it('still needs a declaration', async () => {
    const { app } = testApp();
    // Registered straight on the app, the route is checked the moment it's added.
    expect(() => app.get('/api/outside', async () => ({}))).toThrow('GET /api/outside declares no access');
    await app.close();
  });

  it('refuses everyone, since only the /api plugin knows who is calling', async () => {
    const { app, db } = testApp();
    app.get('/api/outside', { config: { access: { signedIn: true } } }, async () => ({ ok: true }));
    const cookies = await cookieFor(db, 'admin', 'admin');
    expect((await app.inject({ method: 'GET', url: '/api/outside' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/outside', cookies })).statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `yarn vitest run rcl-core/server/src/auth/access.test.ts`
Expected: FAIL. The startup tests report `promise resolved "undefined" instead of rejecting`. The guard tests get 200 where they expect 401/403, because nothing enforces `access` yet.

- [ ] **Step 3: Enforce declarations.** In `rcl-core/server/src/auth/access.ts`:
  - Add `import type { FastifyInstance, preValidationAsyncHookHandler } from 'fastify';` as the first import.
  - Directly after the `Access` type, add:

```ts
declare module 'fastify' {
  interface FastifyContextConfig {
    access?: Access;
  }
}
```

  - At the end of the file, append:

```ts
const API_ROUTE = /^\/api(\/|$)/;

// Checks each /api route's declaration as it's registered, then puts the route's guard first in its preValidation
// hooks, so a refused caller never learns what a valid body looks like (ADR-0014). It's installed on the root
// instance, so it sees /api routes wherever they're registered. HEAD routes that Fastify adds for GET routes pass
// through here too, with the same config.
export function enforceRouteAccess(app: FastifyInstance, options: { appId: string; permissions: Permissions }): void {
  app.addHook('onRoute', (route) => {
    if (!API_ROUTE.test(route.url)) return;
    const name = `${[route.method].flat().join(',')} ${route.url}`;
    const access = route.config?.access;
    if (!access) throw new Error(`${name} declares no access. Give it config.access: public, signedIn or a permission`);
    const problem = accessProblem(access, options);
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
```

- [ ] **Step 4: Resolve the caller onto `request.principal`.** In `rcl-core/server/src/auth/guard.ts`, replace everything from the first line down to (not including) `export function setSessionCookie` with:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDatabase } from '../db.ts';
import type { Principal } from './access.ts';
import { findSession } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Who's calling, from the session cookie; null when nobody is signed in. */
    principal: Principal | null;
  }
}

export const SESSION_COOKIE = 'rollcall_session';

const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// The server machine itself (ADR-0018): a loopback address, reached through a loopback name. Checking the name
// too stops a web page whose domain is rebound to 127.0.0.1 from acting through the server machine's browser.
export function isServerMachine(request: FastifyRequest): boolean {
  if (!LOCAL_ADDRESSES.has(request.ip)) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(`http://${request.headers.host ?? ''}`).hostname);
  } catch {
    return false;
  }
}

/** The caller these cookies identify. API keys and output tokens are resolved here too once they exist. */
export function resolvePrincipal(db: AppDatabase, cookies: Record<string, string | undefined>): Principal | null {
  const token = cookies[SESSION_COOKIE];
  const session = token ? findSession(db, token) : null;
  return token && session ? { kind: 'session', user: session.user, token } : null;
}

// Runs inside the /api plugin: the CSRF check, then the caller onto the request. Each route's access is enforced
// separately, by enforceRouteAccess in access.ts.
export function installAuth(app: FastifyInstance, db: AppDatabase): void {
  app.decorateRequest('principal', null);

  app.addHook('onRequest', async (request, reply) => {
    if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request.headers.origin, request.headers.host)) {
      return reply.code(403).send({ error: 'cross_origin' });
    }
    request.principal = resolvePrincipal(db, request.cookies);
    return undefined;
  });
}

// Browsers send Origin on cross-site and same-site writes; no Origin (curl, older clients) is allowed.
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // includes "null"
  }
}

```

`setSessionCookie` and `clearSessionCookie` stay as they are.

- [ ] **Step 5: Wire it into `buildApp`.** In `rcl-core/server/src/app.ts`:
  - Under `import { ERROR_RESPONSES, sendApiError } from './http.ts';`, the imports become:

```ts
import { createPermissions, enforceRouteAccess, type Permissions } from './auth/access.ts';
import { installAuth } from './auth/guard.ts';
import { CORE_APP_ID, CORE_PERMISSIONS } from './auth/permissions.ts';
```

  - In `AppOptions`, after `db: AppDatabase;`, add:

```ts
  /** Every permission routes may need (ADR-0018). Defaults to core's own; tests add others. */
  permissions?: Permissions;
```

  - In `buildApp`'s parameter list, after `apiDocs = false,`, add `permissions = createPermissions(CORE_PERMISSIONS),`.
  - Replace the comment and `onRoute` line at the top of the function body with:

```ts
  // Added first, so they see every route, including those inside the /api plugin.
  if (onRoute) app.addHook('onRoute', onRoute);
  enforceRouteAccess(app, { appId: CORE_APP_ID, permissions });
```

  - Give `GET /api/health` its declaration, as the first line of its options object:

```ts
        config: { access: { public: 'Shows whether the server is up, before anyone signs in' } },
```

- [ ] **Step 6: Declare each route's access.**

  **In `src/routes/setup.ts`:**
  - Change the comment `// First-run setup (ADR-0008)` to `// First-run setup (ADR-0018)`.
  - `GET /api/setup` gets, as the first line of its options:

```ts
      config: { access: { public: 'The web app asks whether to show first-run setup before anyone can sign in' } },
```

  - `POST /api/setup`'s config becomes:

```ts
      config: {
        rateLimit: AUTH_RATE_LIMIT,
        access: { public: 'Creates the first Admin: only on the server machine, and only while there are no users' },
      },
```

  **In `src/routes/auth.ts`:**
  - Replace the guard import with:

```ts
import type { Access } from '../auth/access.ts';
import { clearSessionCookie, setSessionCookie } from '../auth/guard.ts';
```

  - Under `const UNAUTHENTICATED = …;`, add:

```ts
// `logout`, `me` and `password` must work while a password change is pending, or the user could never make it.
const SIGNED_IN_PENDING_OK: Access = { signedIn: true, allowPendingPasswordChange: true };
```

  - Login's config becomes `config: { rateLimit: AUTH_RATE_LIMIT, access: { public: 'Signing in' } },`, and its revoke line becomes `if (request.principal) revokeSession(db, request.principal.token);`.
  - Delete the two-line comment above `/api/auth/logout` that starts with `` // `logout`, `me` and `password` use requireSession ``.
  - In `logout` and `me`, replace `preValidation: requireSession,` with `config: { access: SIGNED_IN_PENDING_OK },`.
  - `logout`'s revoke line becomes `if (request.principal) revokeSession(db, request.principal.token);`.
  - `me`'s handler becomes `async (request, reply) => request.principal?.user ?? reply.code(401).send(UNAUTHENTICATED),`.
  - In `password`, replace the two lines `preValidation: requireSession,` and `config: { rateLimit: AUTH_RATE_LIMIT },` with `config: { rateLimit: AUTH_RATE_LIMIT, access: SIGNED_IN_PENDING_OK },`.
  - In `password`'s handler, `const { user } = request;` becomes `const user = request.principal?.user;`, and the revoke line becomes:

```ts
      if (request.principal) revokeUserSessions(db, record.id, { exceptToken: request.principal.token });
```

  **In `src/routes/users.ts`:**
  - Replace `import { requireRole } from '../auth/guard.ts';` with `import type { Access } from '../auth/access.ts';`.
  - Replace the two lines `// Guards run as preValidation, …` and `const ADMIN_ONLY = …` with:

```ts
const MANAGE_USERS: { config: { access: Access } } = { config: { access: { permission: 'core:users.manage' } } };
```

  - Replace all six `...ADMIN_ONLY,` with `...MANAGE_USERS,`.
  - Replace the two-line comment above `registerUserRoutes` with:

```ts
// User management (users-and-access R3, ADR-0018), for callers holding core:users.manage. The username and last-Admin
// checks run with no `await` before their write, so concurrent requests can't slip in between.
```

  - In `DELETE`, `user.id === request.user?.id` becomes `user.id === request.principal?.user.id`.

- [ ] **Step 7: Stop `openapi.ts` using the removed allow-list.** In `rcl-core/server/src/openapi.ts`:
  - Replace `import { PUBLIC_API_ROUTES, SESSION_COOKIE } from './auth/guard.ts';` with `import { SESSION_COOKIE } from './auth/guard.ts';`.
  - Delete the `PUBLIC_LIST` comment and constant.
  - In `DESCRIPTION`, replace the `**Public routes:**` line with:

```ts
  '**Who may call what.** Every route declares it: public, any signed-in user, or a permission such as `core:users.manage`. Admins hold every permission.',
```

  - In the `**Checks, in order:**` line, change `the wrong role gets \`403 forbidden\`` to `a missing permission gets \`403 forbidden\``.

  Task 3 makes the explorer show each route's declaration.

- [ ] **Step 8: Update the tests that registered probe routes.**

  **In `src/auth/guard.test.ts`:**
  - Replace everything above `it('rejects a request without a session'` with:

```ts
import { describe, expect, it } from 'vitest';
import { createSession } from './sessions.ts';
import { SESSION_COOKIE } from './guard.ts';
import { addUser, testApp } from '../testing.ts';

// A tiny route for signed-in users, registered the same way real routes are.
function appWithProbe() {
  return testApp({
    registerRoutes: (api) => {
      api.post('/api/probe', { config: { access: { signedIn: true } } }, async (request) => ({
        user: request.principal?.user.username,
      }));
    },
  });
}

describe('the session cookie', () => {
```

  - Delete everything from `// One probe per guard, registered the same way real routes are.` to the end of the file. `deny` and the inventory sweeps now cover the pending-password and role checks.

  **In `src/http.test.ts`, both probe routes get a public declaration:**

```ts
        api.get('/api/boom', { config: { access: { public: 'test probe' } } }, async () => {
```

  and

```ts
          .get(
            '/api/leaky',
            { config: { access: { public: 'test probe' } }, schema: { response: { 200: SessionUserSchema } } },
            async () => {
```

  `/api/leaky`'s handler body is unchanged. Its closing `});` becomes `},` followed by `);`, and `yarn format` lays it out.

- [ ] **Step 9: Rewrite the route inventory test.** Replace `rcl-core/server/src/auth/route-inventory.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import type { FastifySchema, HTTPMethods, InjectOptions } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Role } from '@rollcall/core-contract';
import type { AppOptions } from '../app.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { addUser, testApp } from '../testing.ts';
import { createPermissions, type Access } from './access.ts';
import { SESSION_COOKIE } from './guard.ts';
import { CORE_PERMISSIONS } from './permissions.ts';
import { createSession } from './sessions.ts';

// Hard rule 5 (ADR-0018): every /api route checks the caller's access. A route with no declaration can't start at all
// (access.test.ts); this test checks that each declaration is enforced. The app reports each route as it's
// registered, and each sweep sends every route a request as one kind of caller. Each sweep also runs once as a caller
// who should get through, which proves the sweep would catch a route that let the wrong caller in.

const ANY_ID = '00000000-0000-4000-8000-000000000000';
const byName = (a: string, b: string) => a.localeCompare(b);
const permissions = createPermissions(CORE_PERMISSIONS);

type Cookies = Record<string, string>;
const anonymous = async (): Promise<Cookies> => ({});

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
  const { app, db } = testApp({
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
  const send = (route: ApiRoute, cookies: Cookies) =>
    app.inject({
      method: route.method as InjectOptions['method'],
      url: route.url.replaceAll(/:\w+/g, ANY_ID),
      cookies,
      ...(route.method === 'GET' || route.method === 'HEAD' ? {} : { payload: {} }),
    });
  // A new user and session for each request, since some routes (logout) end the session they're called with.
  let users = 0;
  const as =
    (role: Role, { mustChangePassword = false } = {}) =>
    async (): Promise<Cookies> => {
      const user = await addUser(db, `user${(users += 1)}`, 'correct horse', role, { mustChangePassword });
      return { [SESSION_COOKIE]: createSession(db, user.id).token };
    };
  return { app, routes, send, as };
}

type Inventory = Awaited<ReturnType<typeof inventory>>;

// The routes that don't refuse the caller with `status` and `error`. HEAD replies have no body, so only their status
// counts.
async function notRefused(
  { send }: Inventory,
  routes: readonly ApiRoute[],
  caller: () => Promise<Cookies>,
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
      'GET /api/health',
      'GET /api/setup',
      'POST /api/auth/login',
      'POST /api/setup',
    ]);
    expect(keysOf(where(routes, allowsPendingChange))).toEqual([
      'GET /api/auth/me',
      'POST /api/auth/logout',
      'POST /api/auth/password',
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
    expect(keysOf(gated)).toContain('GET /api/users');
    expect(await notRefused(inv, gated, inv.as('producer', { mustChangePassword: true }), pending)).toEqual([]);
    expect(await notRefused(inv, gated, inv.as('admin'), pending)).toHaveLength(gated.length);
    await inv.app.close();
  });

  it('refuses each role every route whose permission it lacks', async () => {
    const inv = await inventory();
    const forbidden = { status: 403, error: 'forbidden' };
    for (const role of ['producer', 'announcer'] as const) {
      const lacking = where(inv.routes, (a) => 'permission' in a && !permissions.granted(role, a.permission));
      expect(keysOf(lacking), role).toContain('GET /api/users');
      expect(await notRefused(inv, lacking, inv.as(role), forbidden), role).toEqual([]);
      expect(await notRefused(inv, lacking, inv.as('admin'), forbidden), role).toHaveLength(lacking.length);
    }
    await inv.app.close();
  });

  it('gives every /api route a response schema, and a params schema when its path has parameters', async () => {
    expect(await routesMissingSchemas()).toEqual([]);
  });

  it('catches a route without schemas', async () => {
    const signedIn = { access: { signedIn: true } } as const;
    const missing = await routesMissingSchemas({
      registerRoutes: (api) => {
        api.get('/api/schemaless/:id', { config: signedIn }, async () => ({ ok: true }));
        api.withTypeProvider<ZodTypeProvider>().get(
          '/api/errors-only',
          { config: signedIn, schema: { response: { ...ERROR_RESPONSES } } },
          // No success status is declared, so nothing but void type-checks here; the handler is never invoked.
          async () => undefined,
        );
      },
    });
    expect(missing).toEqual([
      'GET /api/schemaless/:id has no success (2xx) response schema',
      'GET /api/schemaless/:id has no params schema',
      'GET /api/errors-only has no success (2xx) response schema',
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
```

- [ ] **Step 10: Run the server tests and see them pass.**

Run: `yarn vitest run rcl-core/server`
Expected: PASS for every file, including `access.test.ts` (14 tests) and `route-inventory.test.ts` (7 tests).

- [ ] **Step 11: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server/src
git commit -F - <<'EOF'
feat(rcl-core): every /api route declares its access

Routes say who may call them in config.access, and one root-level onRoute
hook enforces it: the server won't start with a missing or wrong
declaration, and each guard runs first in preValidation. request.principal
replaces request.user. PUBLIC_API_ROUTES, requireSession, requireUser and
requireRole are gone. The route inventory sweeps anonymous callers, pending
password changes and missing permissions, each with a control.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: The API explorer shows who may call each operation

**Files:**
- Modify: `rcl-core/server/src/openapi.ts`, `src/app.ts`
- Test: `src/openapi.test.ts`

**Interfaces:**
- Consumes: `Access` and `Permissions` (Task 1), `FastifyContextConfig.access` (Task 2).
- Produces: `registerApiDocs(app, { version, apiDocs, permissions })`. The new `permissions` parameter is required.

- [ ] **Step 1: Write the failing test.** In `rcl-core/server/src/openapi.test.ts`, add inside `describe('API explorer', …)`, after the last test:

```ts
  it('says who may call each operation, and that public ones need no session', async () => {
    const { app } = testApp({ apiDocs: true });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    expect(at(doc, 'security')).toEqual([{ session: [] }]);
    expect(at(doc, 'paths', '/api/health', 'get', 'security')).toEqual([]);
    expect(at(doc, 'paths', '/api/health', 'get', 'description')).toBe(
      '**Public:** Shows whether the server is up, before anyone signs in.',
    );
    expect(at(doc, 'paths', '/api/auth/me', 'get', 'description')).toBe(
      '**Any signed-in user**, even with a password change pending.',
    );
    expect(at(doc, 'paths', '/api/users', 'get', 'description')).toBe('**Needs `core:users.manage`:** Admin.');
    expect(at(doc, 'paths', '/api/users', 'get', 'security')).toBeUndefined();
  });
```

- [ ] **Step 2: Run it and see it fail.**

Run: `yarn vitest run rcl-core/server/src/openapi.test.ts`
Expected: FAIL with `expected undefined to deeply equal [ { session: [] } ]`.

- [ ] **Step 3: Describe each operation's access.** In `rcl-core/server/src/openapi.ts`:
  - Add `import type { Access, Permissions } from './auth/access.ts';` above the `SESSION_COOKIE` import.
  - In `DESCRIPTION`, change `so they run as you, limited by your role.` to `so they run as you, with your role's permissions.`
  - Replace the `**Who may call what.**` line with:

```ts
  '**Who may call what.** Each operation says so: public, any signed-in user, or a permission such as `core:users.manage`. Admins hold every permission; the users-and-access feature page lists which other roles hold each one.',
```

  - Replace the comment and signature of `registerApiDocs` with:

```ts
const ROLE_NAMES = { admin: 'Admin', producer: 'Producer', announcer: 'Announcer' } as const;

// One line saying who may call an operation, from its access declaration (ADR-0018).
function describeAccess(access: Access, permissions: Permissions): string {
  if ('public' in access) return `**Public:** ${access.public}.`;
  if ('signedIn' in access) {
    return access.allowPendingPasswordChange
      ? '**Any signed-in user**, even with a password change pending.'
      : '**Any signed-in user.**';
  }
  const roles = ['admin' as const, ...(permissions.find(access.permission)?.roles ?? [])].map((r) => ROLE_NAMES[r]);
  return `**Needs \`${access.permission}\`:** ${roles.join(', ')}.`;
}

// The OpenAPI document is built from the schemas every route declares (ADR-0014), plus who may call each operation.
// Swagger UI, and the document at /docs/json, are served only when asked for: always in `yarn dev`, on a venue
// server only with ROLLCALL_API_DOCS=1.
export function registerApiDocs(
  app: FastifyInstance,
  { version, apiDocs, permissions }: { version: string; apiDocs: boolean; permissions: Permissions },
) {
```

  - In the `fastifySwagger` options, add `security: [{ session: [] }],` after `components: …,`, and replace `transform: jsonSchemaTransform,` with:

```ts
    transform: (input) => {
      const { schema, url } = jsonSchemaTransform(input);
      const access = input.route.config?.access;
      if (!access) return { schema, url };
      const security = 'public' in access ? { security: [] } : {};
      return { schema: { ...schema, description: describeAccess(access, permissions), ...security }, url };
    },
```

  - In `rcl-core/server/src/app.ts`, the call becomes `registerApiDocs(app, { version, apiDocs, permissions });`.

- [ ] **Step 4: Run it and see it pass.**

Run: `yarn vitest run rcl-core/server/src/openapi.test.ts rcl-core/server/src/auth/route-inventory.test.ts`
Expected: PASS. The OpenAPI parity test still matches route for route.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server/src
git commit -F - <<'EOF'
feat(rcl-core): the API explorer shows who may call each operation

Each operation's description comes from its access declaration: public with
its reason, any signed-in user, or the permission it needs and the roles that
hold it. Public operations carry security: [].

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Socket.IO namespaces declare their access

**Files:**
- Modify: `rcl-core/server/src/realtime.ts` (rewritten), `src/server.ts`
- Test: `src/realtime.test.ts` (rewritten), `src/server.test.ts`

**Interfaces:**
- Consumes: `accessProblem`, `deny`, `Access`, `Permissions` (Task 1); `resolvePrincipal` and `isSameOrigin` (Task 2); `CORE_APP_ID`.
- Produces, from `realtime.ts`:
  - `interface Realtime { namespace(name: \`/${string}\`, options: { access: Access }): Namespace }`.
  - `interface RealtimeOptions { version; db; log; permissions; registerNamespaces?; onNamespace? }`.
  - `attachRealtime(httpServer, options: RealtimeOptions): Server`.
- In `server.ts`: one `permissions` registry, passed to both `buildApp` and `attachRealtime`.

- [ ] **Step 1: Write the failing tests.** Replace `rcl-core/server/src/realtime.test.ts` with:

```ts
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { FastifyBaseLogger } from 'fastify';
import type { Server as SocketIoServer } from 'socket.io';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema, type Role } from '@rollcall/core-contract';
import { attachRealtime, type RealtimeOptions } from './realtime.ts';
import { openMemoryDatabase } from './db.ts';
import { createPermissions, type Access } from './auth/access.ts';
import { createSession } from './auth/sessions.ts';
import { SESSION_COOKIE } from './auth/guard.ts';
import { CORE_PERMISSIONS } from './auth/permissions.ts';
import { addUser } from './testing.ts';

let httpServer: HttpServer | undefined;
let io: SocketIoServer | undefined;
let clients: Socket[] = [];

afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await io?.close();
  if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
  io = httpServer = undefined;
});

const permissions = createPermissions(CORE_PERMISSIONS);
const testLog = () =>
  ({ error: vi.fn<(obj: { err: unknown }, msg: string) => void>() }) as unknown as FastifyBaseLogger;

// Starts Socket.IO on a real port, with any extra namespaces, and records every namespace as it's created.
async function startRealtime(options: Partial<RealtimeOptions> = {}) {
  const database = openMemoryDatabase();
  const namespaces: { name: string; access: Access }[] = [];
  const log = testLog();
  httpServer = createServer();
  io = attachRealtime(httpServer, {
    version: '1.0.0',
    db: database.db,
    log,
    permissions,
    onNamespace: (name, access) => namespaces.push({ name, access }),
    ...options,
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  let users = 0;
  const cookieFor = async (role: Role, { mustChangePassword = false } = {}) => {
    const user = await addUser(database.db, `user${(users += 1)}`, 'correct horse', role, { mustChangePassword });
    return `${SESSION_COOKIE}=${createSession(database.db, user.id).token}`;
  };
  const open = (name: string, headers: Record<string, string> = {}) => {
    const client = connect(`${url}${name}`, { transports: ['websocket'], reconnection: false, extraHeaders: headers });
    clients.push(client);
    return outcome(client);
  };
  return { ...database, log, url, namespaces, cookieFor, open };
}

// 'connected', or the reason the server refused the connection.
function outcome(socket: Socket): Promise<string> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once('connect_error', (error) => resolve(error.message));
  });
}

// Two namespaces that only tests create, so every kind of declaration has one to sweep.
const probes: RealtimeOptions['registerNamespaces'] = (realtime) => {
  realtime.namespace('/probe/signed-in', { access: { signedIn: true } });
  realtime.namespace('/probe/users', { access: { permission: 'core:users.manage' } });
};

// The namespaces that don't refuse the client with `error`. Each connection gets fresh headers.
async function notRefused(
  rt: Awaited<ReturnType<typeof startRealtime>>,
  names: readonly string[],
  headers: () => Promise<Record<string, string>>,
  error: string,
) {
  const found: string[] = [];
  for (const name of names) {
    const result = await rt.open(name, await headers());
    if (result !== error) found.push(`${name} → ${result}`);
  }
  return found;
}

describe('namespace inventory', () => {
  it('pins the public namespaces', async () => {
    const rt = await startRealtime();
    expect(rt.namespaces.filter((n) => 'public' in n.access).map((n) => n.name)).toEqual(['/overlay']);
  });

  it('refuses an anonymous client on every namespace that is not public', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const gated = rt.namespaces.filter((n) => !('public' in n.access)).map((n) => n.name);
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    expect(await notRefused(rt, gated, async () => ({}), 'unauthenticated')).toEqual([]);
    expect(await notRefused(rt, gated, asAdmin, 'unauthenticated')).toHaveLength(gated.length);
  });

  it('refuses every namespace that is not public while a password change is pending', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const gated = rt.namespaces.filter((n) => !('public' in n.access)).map((n) => n.name);
    const pending = async () => ({ cookie: await rt.cookieFor('producer', { mustChangePassword: true }) });
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    expect(await notRefused(rt, gated, pending, 'password_change_required')).toEqual([]);
    expect(await notRefused(rt, gated, asAdmin, 'password_change_required')).toHaveLength(gated.length);
  });

  it('refuses each role every namespace whose permission it lacks', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const asAdmin = async () => ({ cookie: await rt.cookieFor('admin') });
    for (const role of ['producer', 'announcer'] as const) {
      const lacking = rt.namespaces
        .filter((n) => 'permission' in n.access && !permissions.granted(role, n.access.permission))
        .map((n) => n.name);
      expect(lacking, role).toContain('/probe/users');
      const asRole = async () => ({ cookie: await rt.cookieFor(role) });
      expect(await notRefused(rt, lacking, asRole, 'forbidden'), role).toEqual([]);
      expect(await notRefused(rt, lacking, asAdmin, 'forbidden'), role).toHaveLength(lacking.length);
    }
  });
});

describe('attachRealtime', () => {
  it('lets anyone into /overlay and says hello', async () => {
    const rt = await startRealtime();
    const client = connect(`${rt.url}/overlay`, { transports: ['websocket'], reconnection: false });
    clients.push(client);
    const hello = await new Promise((resolve) => client.once(SERVER_HELLO_EVENT, resolve));
    expect(ServerHelloSchema.parse(hello)).toEqual({ name: APP_NAME, version: '1.0.0' });
  });

  it('refuses everyone on the bare / namespace, even an Admin', async () => {
    const rt = await startRealtime();
    expect(await rt.open('/', { cookie: await rt.cookieFor('admin') })).toBe('not_found');
  });

  it('refuses a signed-in connection opened by another site', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const cookie = await rt.cookieFor('admin');
    expect(await rt.open('/probe/signed-in', { cookie, origin: 'http://evil.example' })).toBe('cross_origin');
  });

  it('refuses a namespace created without access', async () => {
    await startRealtime();
    expect(() => io!.of('/sneaky')).toThrow('Socket.IO namespace /sneaky has no access; use namespace()');
  });

  it('refuses a namespace with a bad declaration, or one that already exists', () => {
    const { db } = openMemoryDatabase();
    for (const [name, access, message] of [
      ['/typo', { permission: 'core:users.mange' }, "needs core:users.mange, which core doesn't declare"],
      ['/overlay', { signedIn: true }, 'Socket.IO namespace /overlay already exists'],
    ] as const) {
      const options = { version: '1.0.0', db, log: testLog(), permissions };
      const attach = () =>
        attachRealtime(createServer(), { ...options, registerNamespaces: (rt) => rt.namespace(name, { access }) });
      expect(attach, name).toThrow(message);
    }
  });

  it('refuses the connection instead of crashing when the session check throws', async () => {
    const rt = await startRealtime({ registerNamespaces: probes });
    const cookie = await rt.cookieFor('admin');
    rt.sqlite.close(); // every query against the database now throws
    expect(await rt.open('/probe/signed-in', { cookie })).toBe('internal_error');
    expect(rt.log.error).toHaveBeenCalledOnce();

    // The process and the server are still up: /overlay still works on the same server.
    const overlayClient = connect(`${rt.url}/overlay`, { transports: ['websocket'], reconnection: false });
    clients.push(overlayClient);
    const hello = await new Promise((resolve) => overlayClient.once(SERVER_HELLO_EVENT, resolve));
    expect(ServerHelloSchema.parse(hello)).toEqual({ name: APP_NAME, version: '1.0.0' });
  });
});
```

In `rcl-core/server/src/server.test.ts`:
- Delete everything from `// Starts a server whose database holds one signed-in user, and returns their session cookie.` to the end of the file. That's `serverWithSession`, `outcome` and `describe('Socket.IO namespaces', …)`; the namespace checks now live in `realtime.test.ts`.
- Delete `import { SESSION_COOKIE } from './auth/guard.ts';`.
- The `/overlay` hello and reconnect tests in `describe('startServer', …)` stay.

- [ ] **Step 2: Run it and see it fail.**

Run: `yarn vitest run rcl-core/server/src/realtime.test.ts`
Expected: FAIL. For example, `pins the public namespaces` gets `[]` (nothing calls `onNamespace` yet), and `/` with an Admin cookie connects instead of `not_found`.

- [ ] **Step 3: Rewrite `realtime.ts`.** Replace `rcl-core/server/src/realtime.ts` with:

```ts
import type { Server as HttpServer } from 'node:http';
import { parseCookie } from 'cookie';
import type { FastifyBaseLogger } from 'fastify';
import { Server, type Namespace } from 'socket.io';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/core-contract';
import type { AppDatabase } from './db.ts';
import { accessProblem, deny, type Access, type Permissions } from './auth/access.ts';
import { isSameOrigin, resolvePrincipal } from './auth/guard.ts';
import { CORE_APP_ID } from './auth/permissions.ts';

export interface Realtime {
  /** Creates a namespace that checks each connecting client against `access` (ADR-0018). */
  namespace(name: `/${string}`, options: { access: Access }): Namespace;
}

export interface RealtimeOptions {
  version: string;
  db: AppDatabase;
  log: FastifyBaseLogger;
  permissions: Permissions;
  /** Adds namespaces after the built-in ones (for tests). */
  registerNamespaces?: (realtime: Realtime) => void;
  /** Called for each namespace as it's created; the namespace inventory test uses it. */
  onNamespace?: (name: string, access: Access) => void;
}

// Socket.IO shares the HTTP server's port (ADR-0004). Every namespace declares who may join, like every /api route
// (ADR-0018). The bare `/` namespace serves nothing and refuses everyone.
export function attachRealtime(
  httpServer: HttpServer,
  { version, db, log, permissions, registerNamespaces, onNamespace }: RealtimeOptions,
): Server {
  const io = new Server(httpServer, { serveClient: false });
  io.use((_socket, next) => next(new Error('not_found')));

  // A namespace made with io.of() directly would let anyone in, so it stops the server instead.
  const names = new Set<string>(['/']);
  let creating: string | undefined;
  io.on('new_namespace', (nsp) => {
    if (nsp.name !== creating) throw new Error(`Socket.IO namespace ${nsp.name} has no access; use namespace()`);
  });

  const realtime: Realtime = {
    namespace(name, { access }) {
      if (names.has(name)) throw new Error(`Socket.IO namespace ${name} already exists`);
      const problem = accessProblem(access, { appId: CORE_APP_ID, permissions });
      if (problem) throw new Error(`Socket.IO namespace ${name} ${problem}`);
      names.add(name);
      creating = name;
      const nsp = io.of(name);
      creating = undefined;
      if (!('public' in access)) {
        nsp.use((socket, next) => {
          // Socket.IO awaits this middleware without ever handling a rejection, so a throw here (a closed database
          // handle, a full disk during findSession's last-seen write, any I/O error) would otherwise be an unhandled
          // rejection that crashes the whole process, taking every overlay down mid-game.
          try {
            const { headers } = socket.handshake;
            if (!isSameOrigin(headers.origin, headers.host)) return next(new Error('cross_origin'));
            const principal = resolvePrincipal(db, headers.cookie ? parseCookie(headers.cookie) : {});
            const denial = deny(access, principal, permissions);
            return next(denial ? new Error(denial.error) : undefined);
          } catch (error) {
            log.error({ err: error }, 'Socket access check failed');
            return next(new Error('internal_error'));
          }
        });
      }
      onNamespace?.(name, access);
      return nsp;
    },
  };

  const hello = ServerHelloSchema.parse({ name: APP_NAME, version });
  realtime
    .namespace('/overlay', {
      access: { public: "OBS browser sources can't sign in; output token URLs replace this in Live Mode" },
    })
    .on('connection', (socket) => {
      socket.emit(SERVER_HELLO_EVENT, hello);
    });
  registerNamespaces?.(realtime);
  return io;
}
```

- [ ] **Step 4: Share one permission registry in `startServer`.** In `rcl-core/server/src/server.ts`:
  - Add these imports below `import { buildApp } from './app.ts';`:

```ts
import { createPermissions } from './auth/access.ts';
import { CORE_PERMISSIONS } from './auth/permissions.ts';
```

  - Replace the `buildApp` and `attachRealtime` lines with:

```ts
  const permissions = createPermissions(CORE_PERMISSIONS);
  const app = buildApp({ version, logger, webDir: config.webDir, db, apiDocs: config.apiDocs, permissions });
  const io = attachRealtime(app.server, { version, db, log: app.log, permissions });
```

- [ ] **Step 5: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server/src/realtime.test.ts rcl-core/server/src/server.test.ts`
Expected: PASS. `realtime.test.ts` has 10 tests, and `server.test.ts` keeps its 5 `startServer` tests.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server/src
git commit -F - <<'EOF'
feat(rcl-core): Socket.IO namespaces declare their access

Namespaces are created only through realtime.namespace(name, { access }),
checked like routes; one made with io.of() stops the server. The bare /
namespace refuses everyone. /overlay stays public. A namespace inventory
sweeps anonymous clients, pending password changes and missing permissions.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Check the caller again after an `await` (#8)

**Files:**
- Modify: `rcl-core/server/src/auth/guard.ts`, `src/app.ts`, `src/routes/users.ts`, `src/routes/auth.ts`
- Test: `src/routes/users.test.ts`, `src/routes/auth.test.ts`

**Interfaces:**
- Consumes: `deny`, `Denial` and `Permissions` (Task 1); `resolvePrincipal` (Task 2).
- Produces: `request.recheckAccess(): Denial | undefined`. It re-resolves `request.principal` from the database and re-applies the route's own declaration. `installAuth(app, { db, permissions })` replaces `installAuth(app, db)`.

- [ ] **Step 1: Write the failing tests.** In `rcl-core/server/src/routes/users.test.ts`:
  - Add `import type { FastifyInstance } from 'fastify';` under the `vitest` import.
  - Change the users import to `import { countAdmins, deleteUser, findUserForLogin, setRole } from '../auth/users.ts';`.
  - Append:

```ts
// Runs `change` after the route has checked the caller and before its handler starts: the same window as the
// handler's own await while it hashes a password.
function afterAccessCheck(app: FastifyInstance, route: string, change: () => void) {
  app.addHook('preHandler', async (request) => {
    if (request.routeOptions.url === route) change();
  });
}

const createProducer = (app: FastifyInstance, cookies: Record<string, string>) =>
  app.inject({ method: 'POST', url: '/api/users', cookies, payload: { username: 'producer1', role: 'producer' } });

describe('an Admin who loses access while a password is hashing', () => {
  it('creates no user once demoted', async () => {
    const { app, db, admin } = await withAdmin();
    afterAccessCheck(app, '/api/users', () => setRole(db, admin.user.id, 'producer'));
    const res = await createProducer(app, admin.cookies);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    expect(findUserForLogin(db, 'producer1')).toBeNull();
  });

  it('creates no user once deleted', async () => {
    const { app, db, admin } = await withAdmin();
    afterAccessCheck(app, '/api/users', () => deleteUser(db, admin.user.id));
    const res = await createProducer(app, admin.cookies);
    expect(res.statusCode).toBe(401);
    expect(findUserForLogin(db, 'producer1')).toBeNull();
  });

  it('resets no password once demoted', async () => {
    const { app, db, admin } = await withAdmin();
    const producer = await signIn(db, 'producer1', 'producer');
    afterAccessCheck(app, '/api/users/:id/password-reset', () => setRole(db, admin.user.id, 'producer'));
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${producer.user.id}/password-reset`,
      cookies: admin.cookies,
    });
    expect(res.statusCode).toBe(403);
    expect(await verifyPassword(PASSWORD, findUserForLogin(db, 'producer1')?.passwordHash ?? '')).toBe(true);
    expect(findSession(db, producer.token)).not.toBeNull();
  });
});
```

In `rcl-core/server/src/routes/auth.test.ts`:
- Replace `import { SESSION_LIFETIME_MS } from '../auth/sessions.ts';` with:

```ts
import { verifyPassword } from '../auth/passwords.ts';
import { createSession, revokeUserSessions, SESSION_LIFETIME_MS } from '../auth/sessions.ts';
import { findUserForLogin } from '../auth/users.ts';
```

- Append:

```ts
describe('a password change racing an Admin', () => {
  it('changes nothing when the user is signed out while the new password is hashing', async () => {
    const { app, db } = testApp();
    const user = await addUser(db, 'p1', PASSWORD, 'producer');
    const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
    // After the access check and before the handler: an Admin resets the password, which signs the user out.
    app.addHook('preHandler', async (request) => {
      if (request.routeOptions.url === '/api/auth/password') revokeUserSessions(db, user.id);
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      cookies,
      payload: { currentPassword: PASSWORD, newPassword: 'a brand new password' },
    });
    expect(res.statusCode).toBe(401);
    expect(await verifyPassword(PASSWORD, findUserForLogin(db, 'p1')?.passwordHash ?? '')).toBe(true);
  });
});
```

The `preHandler` hooks are added to the root instance before `ready()`, so the `/api` plugin inherits them. They run after the guard (`preValidation`) and validation, and just before the handler.

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server/src/routes`
Expected: FAIL, 4 tests: `expected 201 to be 403`, `expected 201 to be 401`, `expected 200 to be 403` and `expected 200 to be 401`.

- [ ] **Step 3: Add `request.recheckAccess()`.** In `rcl-core/server/src/auth/guard.ts`:
  - The access import becomes `import { deny, type Denial, type Permissions, type Principal } from './access.ts';`.
  - In the `FastifyRequest` augmentation, after `principal`, add:

```ts
    /**
     * Checks the caller again against the database as it is now. A handler that awaits (password hashing) before it
     * writes calls this after the await: the caller may have been demoted, deleted or signed out in the meantime.
     */
    recheckAccess(): Denial | undefined;
```

  - Replace the signature line and the `decorateRequest('principal', null);` line of `installAuth` with:

```ts
export function installAuth(app: FastifyInstance, { db, permissions }: { db: AppDatabase; permissions: Permissions }) {
  app.decorateRequest('principal', null);
  app.decorateRequest('recheckAccess', function (this: FastifyRequest) {
    this.principal = resolvePrincipal(db, this.cookies);
    const { access } = this.routeOptions.config;
    return access ? deny(access, this.principal, permissions) : { status: 403, error: 'forbidden' };
  });
```

  In `rcl-core/server/src/app.ts`, the call becomes `installAuth(api, { db, permissions });`.

- [ ] **Step 4: Re-check in the handlers that hash.**

  **In `src/routes/users.ts`:**
  - In both `POST /api/users` and `POST /api/users/:id/password-reset`, directly after `const passwordHash = await hashPassword(temporaryPassword);`, add:

```ts
      const denial = request.recheckAccess();
      if (denial) return reply.code(denial.status).send({ error: denial.error });
```

  - Extend the comment above `registerUserRoutes` to:

```ts
// User management (users-and-access R3, ADR-0018), for callers holding core:users.manage. The username and last-Admin
// checks run with no `await` before their write, so concurrent requests can't slip in between. Handlers that hash a
// password check the caller again after the await, since the caller may have lost access meanwhile.
```

  **In `src/routes/auth.ts`,** in `password`'s handler, replace the `setPassword(…, await hashPassword(newPassword), …)` line with:

```ts
      const passwordHash = await hashPassword(newPassword);
      // Signed out (by an Admin's reset, say) while the password was hashing: don't overwrite the reset.
      const denial = request.recheckAccess();
      if (denial) return reply.code(denial.status).send({ error: denial.error });
      setPassword(db, record.id, passwordHash, { mustChangePassword: false });
```

  The `if (request.principal) revokeUserSessions(…)` line after it stays.

- [ ] **Step 5: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server`
Expected: PASS.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server/src
git commit -F - <<'EOF'
fix(rcl-core): check the caller again after hashing a password

Creating a user, resetting a password and changing your own password await
a password hash before they write. If the caller is demoted, deleted or
signed out in the meantime, request.recheckAccess() now refuses the request
and nothing is written.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Warm the stand-in hash, and clean up a failed start (#8)

**Files:**
- Modify: `rcl-core/server/src/server.ts`
- Test: `src/server.test.ts`

**Interfaces:**
- Consumes: `dummyHash()` from `src/auth/passwords.ts`, unchanged.
- Produces: no new names. `startServer` hashes the stand-in password before listening. If listening fails, it closes the app (Socket.IO, timer and database) before it rethrows.

- [ ] **Step 1: Write the failing tests.** In `rcl-core/server/src/server.test.ts`:
  - The imports become:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { io as connect, type Socket } from 'socket.io-client';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/core-contract';
import { startServer, type RunningServer } from './server.ts';
import { openDatabase } from './db.ts';
import { sessions } from './db/schema.ts';
import { dummyHash } from './auth/passwords.ts';
import type * as Passwords from './auth/passwords.ts';
import { createSession } from './auth/sessions.ts';
import { createUser } from './auth/users.ts';

// Wraps dummyHash in a spy that still hashes, so a test can see when startServer first asks for it.
vi.mock('./auth/passwords.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof Passwords>();
  return { ...actual, dummyHash: vi.fn<typeof actual.dummyHash>(actual.dummyHash) };
});
```

  - Append:

```ts
describe('startServer at startup', () => {
  it('hashes the stand-in password before it listens, so the first failed login is as slow as the rest', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    vi.mocked(dummyHash).mockClear();
    running = await startServer(
      { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') },
      { version: '1.0.0', logger: false },
    );
    expect(dummyHash).toHaveBeenCalledOnce();
    await expect(vi.mocked(dummyHash).mock.results[0]?.value).resolves.toMatch(/^\$argon2id\$/);
  });

  it('closes the database and stops its timer when it cannot listen', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const { port } = blocker.address() as { port: number };
    const close = vi.spyOn(Database.prototype, 'close');
    const clearTimer = vi.spyOn(globalThis, 'clearInterval');
    try {
      await expect(
        startServer(
          { host: '127.0.0.1', port, dataDir, webDir: join(dataDir, 'no-web-build') },
          { version: '1.0.0', logger: false },
        ),
      ).rejects.toThrow('EADDRINUSE');
      expect(close).toHaveBeenCalledOnce();
      expect(clearTimer).toHaveBeenCalled();
    } finally {
      close.mockRestore();
      clearTimer.mockRestore();
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server/src/server.test.ts`
Expected: FAIL, 2 tests: `expected "vi.fn()" to be called once, but got 0 times` and `expected "close" to be called once, but got 0 times`.

- [ ] **Step 3: Warm the hash and clean up on failure.** In `rcl-core/server/src/server.ts`:
  - Add `import { dummyHash } from './auth/passwords.ts';` with the other `./auth/` imports.
  - Replace `await app.listen({ host: config.host, port: config.port });` with:

```ts
  try {
    // Hash the stand-in password now, so the first failed login takes as long as later ones.
    await dummyHash();
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    // The port is taken, or a route's access declaration is wrong: release the database, timer and sockets.
    await app.close();
    throw error;
  }
```

- [ ] **Step 4: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server/src/server.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server/src
git commit -F - <<'EOF'
fix(rcl-core): warm the stand-in hash and clean up a failed start

startServer hashes the stand-in password before it listens, so the first
failed login for an unknown user takes as long as later ones. If listening
fails, it closes Socket.IO, the purge timer and the database before it
rethrows.

Closes #8

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: ADR-0018, the permission table and the docs

**Files:**
- Create: `docs/decisions/0018-declared-access-and-permissions.md`, `rcl-core/server/src/auth/permissions.test.ts`
- Modify:
  - `docs/decisions/0008-auth-rbac-and-overlay-access.md`, `docs/decisions/README.md` (generated)
  - `AGENTS.md`, `CHANGELOG.md`, `.claude/rules/rcl-core-server.md`
  - `docs/features/users-and-access.md`, `docs/product/glossary.md`, `docs/architecture/README.md`, `docs/guides/testing.md`
  - code comments that cite ADR-0008

**Interfaces:**
- Consumes: `CORE_APP_ID` and `CORE_PERMISSIONS` (Task 1); `createPermissions` (Task 1); `ROLES` from `@rollcall/core-contract`.
- Produces: the heading `## Permissions` on the feature page, whose table rows the test reads; the glossary anchor `#permission`.

- [ ] **Step 1: Write the failing test.** Create `rcl-core/server/src/auth/permissions.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROLES } from '@rollcall/core-contract';
import { createPermissions } from './access.ts';
import { CORE_APP_ID, CORE_PERMISSIONS } from './permissions.ts';

const FEATURE_PAGE = new URL('../../../../docs/features/users-and-access.md', import.meta.url);

// The rows of the feature page's Permissions table: permission, what it allows, then ✅ or — for each role.
function documentedPermissions(): string[][] {
  const page = readFileSync(FEATURE_PAGE, 'utf8');
  const section = page.split(/^## /m).find((s) => s.startsWith('Permissions\n')) ?? '';
  return section
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

describe('core permissions', () => {
  it('are well formed and all belong to core', () => {
    const permissions = createPermissions(CORE_PERMISSIONS);
    for (const { key } of permissions.all) expect(key.startsWith(`${CORE_APP_ID}:`), key).toBe(true);
  });

  it('match the table on the users-and-access feature page', () => {
    const permissions = createPermissions(CORE_PERMISSIONS);
    const expected = CORE_PERMISSIONS.map(({ key, summary }) =>
      [`\`${key}\``, summary].concat(ROLES.map((role) => (permissions.granted(role, key) ? '✅' : '—'))),
    );
    expect(documentedPermissions()).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `yarn vitest run rcl-core/server/src/auth/permissions.test.ts`
Expected: FAIL. The second test gets `[]`, because the page has no Permissions table yet.

- [ ] **Step 3: Write ADR-0018.** Run `node scripts/check-docs.mjs --next-adr` and confirm it prints `0018`. Then create `docs/decisions/0018-declared-access-and-permissions.md`, setting `date:` to today's date:

```markdown
---
title: Declared access and per-app permissions
status: accepted
date: YYYY-MM-DD
---
# 0018. Declared access and per-app permissions

Supersedes [ADR-0008](0008-auth-rbac-and-overlay-access.md).

## Context

ADR-0008 enforced access with role checks: each route picked `requireUser` or `requireRole(...)`, or was listed in `PUBLIC_API_ROUTES`. Rollcall is becoming a suite of rcl apps hosted by rcl-core ([ADR-0016](0016-obs-producer-becomes-rollcall.md)). Each app adds its own routes and live connections, and not every caller will be a person signed in with a browser: devices and scripts (API keys) and OBS browser sources (output tokens) are next. Role checks spread across routes don't scale to that, and a route that forgot its check was caught only by a test.

Options considered:
- **Keep a role check on each route.** Rejected: every app would hard-code core's roles, and an API key holds no role.
- **A policy library, such as CASL.** Rejected: more code than the problem needs, and routes would still need checking at registration.
- **Each route and namespace declares its access, and core enforces it in one place.** Chosen.

Everything else in ADR-0008 stands. It's restated below so this ADR is complete on its own.

## Decision

- **Every `/api` route declares its access** in `config.access`, in one of three forms:
  - `{ public: '<reason>' }`: anyone. The reason is shown in the API explorer.
  - `{ signedIn: true }`: any signed-in user. With `allowPendingPasswordChange: true`, a pending password change is let through too. Only `me`, `password` and `logout` do that.
  - `{ permission: '<app>:<action>' }`: a signed-in user whose role holds that permission.
- **Denied by default.**
  - One `onRoute` hook checks each `/api` route as it's registered.
  - The server refuses to start when a route has no declaration, a public route gives no reason, or a permission is undeclared or belongs to another app.
  - The same hook puts the route's check first in its `preValidation` hooks, so a refused caller never learns what a valid body looks like ([ADR-0014](0014-route-schemas-and-api-explorer.md)).
- **Checks, in order:**
  1. A state-changing request whose `Origin` doesn't match `Host` gets `403 cross_origin`.
  2. No caller gets `401 unauthenticated`.
  3. A pending password change gets `403 password_change_required`.
  4. A missing permission gets `403 forbidden`.
- **Permissions.**
  - They're named `<app>:<action>`, such as `core:users.manage`.
  - Each rcl app declares its own, with a summary and the roles that hold it, and may only use its own.
  - **Admin holds every permission.**
  - The [users and access](../features/users-and-access.md#permissions) feature page lists them, and a test keeps that table in step with the code.
- **The caller.** Each request's caller is resolved once, when the request arrives. Today the only kind is a signed-in session. API keys (a bearer token, hashed at rest and scoped to permissions) and output tokens (one output each) join later.
- **Losing access mid-request.** A handler that awaits (password hashing) before it writes checks its caller again after the await. An Admin demoted, deleted or signed out in the meantime changes nothing.
- **Socket.IO namespaces declare access too**, through one helper, and are checked the same way when a client connects.
  - The bare `/` namespace refuses every connection.
  - A namespace created any other way stops the server.
  - Signed-in namespaces keep the Origin check.
- **Restated from ADR-0008:**
  - **Local accounts.**
    - Usernames are 3–32 characters from `a–z`, `0–9`, `.`, `_` and `-`, stored lowercase.
    - Passwords are 10–256 characters and may not equal the username.
    - Passwords are hashed with **argon2id** (19456 KiB of memory, 2 passes, parallelism 1) using Node's built-in `crypto.argon2`, which needs Node 24.7 or later. Hashes are stored as PHC strings, so the settings can be raised later.
  - **Server-side sessions.**
    - The `rollcall_session` cookie (`HttpOnly`, `SameSite=Lax`) holds a random token. The database stores only its SHA-256.
    - A session lasts until logout, up to a fixed 30 days. Using it doesn't extend it.
    - Changing your password signs out your other sessions. An Admin can sign a user out everywhere.
  - **The first Admin** is created by a setup page that works only while no accounts exist, and only on the server machine itself: a loopback address, reached through a loopback name such as `localhost`.
  - **Other accounts.** Admins create accounts and reset passwords. Each time, the server generates a temporary password and shows it once, and the user must replace it at their next login.
  - **There is always an Admin.** Deleting or demoting the last Admin is refused, and so is deleting your own account.
  - **A locked-out Admin** runs `yarn workspace @rollcall/core-server reset-password <username>` on the server machine.
  - **Protection without HTTPS.**
    - Only JSON bodies are accepted.
    - A state-changing request, or a connection to a signed-in namespace, whose `Origin` doesn't match `Host` is refused.
    - Login, setup and password changes allow 10 attempts a minute per address.
  - **HTTP for now.** HTTPS with your own certificate is a later decision.
  - **Outputs.** Until Live Mode, the `/overlay` page and Socket.IO namespace are public. Live Mode replaces them with output token URLs.
  - **The client hides controls a caller can't use**, but only for convenience.

**Hard rule:** **Authorization happens on the server.** Every API route and socket event checks the caller's access. Hiding UI is not access control.

### Names used in earlier ADRs

| Earlier name | Now |
|---|---|
| `PUBLIC_API_ROUTES` | `config.access: { public: '<reason>' }` on each route |
| `requireSession` | `{ signedIn: true, allowPendingPasswordChange: true }` |
| `requireUser` | `{ signedIn: true }` |
| `requireRole('admin')` | `{ permission: '<the permission the route needs>' }`, e.g. `core:users.manage` |
| `request.user`, `request.sessionToken` | `request.principal` |
| the signed-in default namespace `/` | a namespace created with `namespace(name, { access })`; `/` refuses everyone |

## Consequences

- A route or namespace can't forget its check, because the server won't start. The route and namespace inventory tests check that each declaration is enforced.
- In Phase 4, each rcl app declares its permissions in its own module, and the ownership check reads the app from the route's `/api/<id>` prefix.
- Roles remain, as sets of permissions. Granting a role a permission is a one-line change plus the feature page's table.
- Sockets are checked when they connect. Live Mode's socket events must check the caller's access on each event, and decide what happens to an open socket after logout or a role change.
- Without HTTPS, anyone capturing traffic on the venue network could copy a session cookie. HTTPS is the fix.
- Until output tokens exist, anyone on the network can open `/overlay`. It shows nothing private yet.
- Whether output tokens can be rotated without re-adding every OBS source is still an open question on the [feature page](../features/users-and-access.md#open-questions).
```

- [ ] **Step 4: Mark ADR-0008 superseded.** In `docs/decisions/0008-auth-rbac-and-overlay-access.md`, change only these:
  - In the frontmatter, `status: accepted` becomes `status: superseded`, with `superseded_by: "0018"` on the next line.
  - Under the `# 0008. …` title, add a blank line and then:

```markdown
> **Superseded by [ADR-0018](0018-declared-access-and-permissions.md):** routes and Socket.IO namespaces declare their access (public, signed in, or a permission), and core enforces it in one place. Accounts, sessions and setup are unchanged.
```

- [ ] **Step 5: Reword hard rule 5.** In `AGENTS.md`, rule 5 becomes:

```markdown
5. **Authorization happens on the server.** Every API route and socket event checks the caller's access. Hiding UI is not access control. ([ADR-0018](docs/decisions/0018-declared-access-and-permissions.md))
```

- [ ] **Step 6: The feature page.** In `docs/features/users-and-access.md`:
  - The intro's last sentence becomes: `This page is the **canonical home of the role matrix and the permission table**; other pages link here instead of restating them.`
  - **R4** becomes:

```markdown
- **R4.** Every API route and socket event checks the caller's access on the server: each one is public, open to any signed-in user, or needs a [permission](../product/glossary.md#permission). Hiding UI is not access control ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)).
```

  - In **R5**, and in the Behavior intro (`How accounts work is decided in …`), the ADR-0008 link becomes `[ADR-0018](../decisions/0018-declared-access-and-permissions.md)`.
  - Between `## Role matrix`'s table and `## Behavior`, add:

```markdown
## Permissions

Routes and live connections check [permissions](../product/glossary.md#permission), not roles ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)). Each permission belongs to one rcl app and is named `<app>:<action>`. Admins hold every permission. This table says which other roles hold each one, and the API explorer at `/docs` shows the permission each route needs. A test keeps the table in step with the code.

| Permission | Allows | Admin | Producer | Announcer |
|---|---|---|---|---|
| `core:users.manage` | Create users, change their roles, reset their passwords, sign them out and delete them | ✅ | — | — |

The capabilities in the role matrix become permissions here as each feature is built.

```

  - In Behavior, after the **Signing someone out** bullet, add:

```markdown
- **Losing access mid-request.** If an Admin is demoted, deleted or signed out while the server is creating a user or resetting a password, nothing changes and the request is refused. Changing your own password is refused the same way if an Admin reset it in the meantime.
```

- [ ] **Step 7: Run the test and see it pass.**

Run: `yarn vitest run rcl-core/server/src/auth/permissions.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 8: The glossary.** In `docs/product/glossary.md`'s "This app" table, add a row after **rcl-producer**:

```markdown
| <a id="permission"></a>**Permission** | A named right in one rcl app, such as `core:users.manage`. Routes and live connections check permissions; a role is a set of them, and Admins hold them all. See [users and access](../features/users-and-access.md#permissions). |
```

- [ ] **Step 9: Architecture, the testing guide and the path rules.**

  **In `docs/architecture/README.md`:**
  - In "How data flows", step 2.2 becomes `   2. The server checks the caller's access ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)).`
  - The **Socket.IO namespaces** paragraph becomes:

```markdown
**Socket.IO namespaces.** Each namespace declares who may join, as each API route does ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)). `/overlay` is public, so OBS outputs need no login until output token URLs arrive. Signed-in namespaces, such as Live Mode's dashboards, check the session cookie when a client connects. The bare `/` namespace refuses everyone.
```

  - In "Key decisions", the ADR-0008 bullet becomes:

```markdown
- [ADR-0018](../decisions/0018-declared-access-and-permissions.md): Server-side sessions; every route and namespace declares its access, checked by permission; a public overlay until output token URLs arrive.
```

  **In `docs/guides/testing.md`:**
  - In the **Server routes** bullet, `Pass \`registerRoutes\` to add a throwaway route (see \`rcl-core/server/src/auth/guard.test.ts\`).` becomes `Pass \`registerRoutes\` to add a throwaway route, with \`config: { access: … }\` like any route (see \`rcl-core/server/src/auth/access.test.ts\`).`
  - Replace the whole **Route inventory** bullet, from `- **Route inventory (` through the line that starts `It also checks that every`, with:

```markdown
- **Access inventories (`rcl-core/server/src/auth/route-inventory.test.ts`, `rcl-core/server/src/realtime.test.ts`).** They record every `/api` route and every Socket.IO namespace as it's created, then send each one a request or connection. A route or namespace with no access declaration can't start at all (`src/auth/access.test.ts`). The inventories check that each declaration is enforced ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)):
  - **Pinned:** the public routes and namespaces, and the routes that work while a password change is pending, are listed in the tests, so changing them means changing a test.
  - **Anonymous:** everything that isn't public refuses with `unauthenticated` (401 for routes).
  - **With a password change pending:** everything except `me`, `password` and `logout` refuses with `password_change_required`.
  - **Missing permission:** each role is refused with `forbidden` wherever it lacks the permission.
  - **Proof it works:** each sweep runs again as an Admin, who gets through everywhere, so the sweep must report every route.

  The route inventory also checks that every `/api` route declares a response schema (and a params schema when its path has parameters), and that the OpenAPI document behind `/docs` lists exactly the registered routes ([ADR-0014](../decisions/0014-route-schemas-and-api-explorer.md)).
```

  **In `.claude/rules/rcl-core-server.md`:**
  - `  - Authorization happens on the server (ADR-0008).` becomes `  - Authorization happens on the server (ADR-0018).`
  - Replace the **Every `/api` route checks the caller** bullet (with its four sub-bullets) and the **Socket.IO** bullet with:

```markdown
- **Every `/api` route declares who may call it** (hard rule 5, ADR-0018).
  - Put it in `config.access`: `{ public: '<reason>' }`, `{ signedIn: true }` or `{ permission: 'core:<action>' }`. Only `me`, `password` and `logout` add `allowPendingPasswordChange: true`.
  - A new permission goes in `CORE_PERMISSIONS` (`src/auth/permissions.ts`) and in the table on `docs/features/users-and-access.md`. A test keeps the two in step.
  - The server won't start with a missing or wrong declaration. Don't write your own role checks; read the caller from `request.principal`.
  - A handler that awaits before it writes calls `request.recheckAccess()` after the await.
- **Socket.IO:** create namespaces only with `realtime.namespace(name, { access })` in `src/realtime.ts`. `/` refuses everyone. `/overlay` is public until output token URLs arrive.
```

- [ ] **Step 10: Point code comments at ADR-0018.** Run:

```bash
perl -pi -e 's/ADR-0008/ADR-0018/g' \
  rcl-core/contract/src/auth.ts \
  rcl-core/server/src/auth/sessions.ts \
  rcl-core/server/src/cli/reset-password.ts \
  rcl-core/server/src/db/schema.ts \
  rcl-core/web/src/dev-proxy.test.ts \
  rcl-core/web/src/overlay/live.ts
grep -rn --exclude-dir=node_modules --exclude-dir=design-docs --exclude-dir=.git -e 'ADR-0008' -e '0008-auth' . | grep -v '^./docs/decisions/'
```

Expected: the `grep` prints nothing. The only remaining mentions are in `docs/decisions/`: ADR-0004 and ADR-0008, which are never reworded, and the generated index.

- [ ] **Step 11: CHANGELOG.** Under `## [Unreleased]` in `CHANGELOG.md`:
  - Append to **Added**:

```markdown
- The API explorer shows who may call each route: anyone, any signed-in user, or the permission it needs, such as `core:users.manage` (#3)
```

  - Append to **Changed**:

```markdown
- Access is checked by permission instead of by role. Admins hold every permission, so who can do what is unchanged (#3)
```

  - Append to **Fixed**:

```markdown
- An Admin who is demoted, deleted or signed out while creating a user or resetting a password no longer completes the change, and a password change made after an Admin's reset no longer overwrites it (#8)
- The first failed sign-in after the server starts takes as long as later ones, so it doesn't reveal whether the username exists (#8)
```

- [ ] **Step 12: Regenerate the indexes, then check and commit.**

```bash
node scripts/check-docs.mjs --fix
yarn format && yarn check
git add -A docs AGENTS.md CHANGELOG.md .claude/rules/rcl-core-server.md rcl-core
git commit -F - <<'EOF'
docs(rcl-core): ADR-0018 declared access and per-app permissions

ADR-0018 supersedes ADR-0008: routes and namespaces declare their access and
core enforces it in one place. Hard rule 5 now says "checks the caller's
access". The users-and-access page gains the permission table, which a test
keeps in step with CORE_PERMISSIONS. Glossary, architecture, testing guide,
path rules, CHANGELOG and code comments follow.

Closes #3

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Expected: `git status` is clean afterwards, and `docs/decisions/README.md` lists 0008 as superseded and 0018 as accepted.

---

### Task 8: Phase 3 hand-off ⏸

- [ ] **Step 1: The full checks the spec requires before merge.**

```bash
yarn check && yarn build && yarn test:stories && yarn test:e2e
```

Expected: all pass. The e2e tests touch only `/overlay` and `/api/health`, both still public.

- [ ] **Step 2: Review the whole branch.** Run `git log --oneline main..` (8 commits, including the plan) and `git diff --stat main..`. Then use superpowers:requesting-code-review on the branch, and fix what it confirms.

- [ ] **Step 3: Check `yarn dev` by hand.** Run `yarn dev` and check:
  - `http://localhost:5173` still shows **Rollcall** with its server badge, and `/overlay` shows its placeholder card.
  - `http://localhost:5173/docs`:
    - `GET /api/health` reads "**Public:** Shows whether the server is up, before anyone signs in." and has no lock.
    - `GET /api/users` reads "**Needs `core:users.manage`:** Admin." and has a lock.
  - `curl -i http://localhost:5580/api/users` answers `401 {"error":"unauthenticated"}`.

  Then stop the server.

- [ ] **Step 4: ⏸ Ask Mike, then merge and push.**

```bash
git switch main && git merge --ff-only feat/access-model
git push origin main && git branch -d feat/access-model
```

Then:
- Check that #3 and #8 closed, and that their cards are in "Done" on board #6 (`gh project item-list 6 --owner wardmanm`). If they aren't, remind Mike.
- Update `rollcall-pivot.md` in memory: Phase 3 is done, and Phase 4a (#4) is next, with its own plan.
- Tell Mike that Phase 4a (the Producer web app and shared web SDK, issue #4) is next.
