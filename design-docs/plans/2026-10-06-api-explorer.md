# API Explorer (#16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every `/api` route declares its request and response schemas from the shared Zod contract, and Swagger UI at `/docs` turns those declarations into an interactive explorer.

**Architecture:**
- **Validation and serialization.** `fastify-type-provider-zod` becomes Fastify's validator and serializer. Each route module calls `fastify.withTypeProvider<ZodTypeProvider>()` and declares `schema: { tags, summary, body?, params?, response }` using schemas from `@obs-producer/shared`.
  - Fastify validates requests and serializes replies with those schemas, so the hand-rolled `parseBody` helper goes away.
  - Validation errors keep our `400 validation_failed` shape through the existing `/api` error handler.
- **Auth runs first.** Auth guards move from `preHandler` to `preValidation`, so callers are still checked before their bodies.
- **The explorer.** `@fastify/swagger` builds the OpenAPI document from the same declarations. `@fastify/swagger-ui` serves it at `/docs`, but only when `OBS_PRODUCER_API_DOCS` is on, which the dev script always sets.

**Tech stack:**
- Fastify 5
- `fastify-type-provider-zod` 7.0 (Zod ≥ 4.2)
- `@fastify/swagger` 9.9, `@fastify/swagger-ui` 6.1, `openapi-types` 12.1
- Zod 4, through `@obs-producer/shared`
- Vitest
- Node ≥ 24.7, TypeScript 7

**Spec:** [`obs-producer/design-docs/specs/2026-10-03-api-explorer-design.md`](../specs/2026-10-03-api-explorer-design.md). Issue #16, milestone `obs-producer v0.2.0`.

## Global Constraints

- **New server dependencies:**
  - `fastify-type-provider-zod@^7.0.0`;
  - `@fastify/swagger@^9.9.1`;
  - `@fastify/swagger-ui@^6.1.1`;
  - `openapi-types@^12.1.3`, a required peer of the type provider.

  Check `npm view <pkg> version` first, and use the newest version outside Yarn's 24-hour quarantine.
- **Every `/api` route** is declared on `fastify.withTypeProvider<ZodTypeProvider>()`, with `schema` containing:
  - `tags`: exactly one of `health`, `setup`, `auth`, `users`;
  - a one-line `summary`;
  - `body`, when the route reads one;
  - `params`, when the path has a `:param`;
  - `response`, with a schema for each success status (`200`, `201`, or `204` as `z.undefined()`), plus `...ERROR_RESPONSES` (`{ '4xx': ApiErrorSchema }`).
- **Schemas come from `@obs-producer/shared`.** Exceptions: the users route's path params (`z.strictObject({ id: z.string() })`) and `z.undefined()` for 204 replies.
- **Handlers return plain objects.** Fastify serializes them through the response schema, so handlers no longer call `XSchema.parse(...)` on replies.
- **Guards are `preValidation` hooks:** `requireSession`, `requireUser` and `requireRole(...)`. Anonymous, wrong-role or password-change-pending callers are refused before their body is validated.
- **Unchanged behavior:**
  - error bodies `{ "error": "<code>", "message"?: "…" }`;
  - a schema failure is `400 {"error":"validation_failed","message":…}`;
  - a malformed login body is `401 invalid_credentials`, after the dummy hash;
  - the auth check order: 401, then `password_change_required`, then `forbidden`;
  - rate limits;
  - the route inventory and every existing test.
- **The explorer:**
  - Swagger UI at `/docs` and the OpenAPI document at `/docs/json`, registered only when `apiDocs` is on;
  - `validatorUrl` is `null`, and the page and its initializer reference no outside hosts (hard rule 4).
- **`OBS_PRODUCER_API_DOCS`:**
  - `1` or `true` (any case) turns it on;
  - `0`, `false`, empty or unset leaves it off;
  - anything else makes `loadConfig` throw a message naming the variable.
- **Code rules:**
  - TypeScript per ADR-0013: `.ts` extensions on relative imports, erasable syntax only, `import type` for types.
  - No `as` casts in `src/` (tests may use them).
  - No new inline `oxlint-disable` comments.
- **Commits:** every commit passes `yarn check`. Use Conventional Commits, each ending with the committer's `Co-Authored-By` line. The last commit says `Closes #16`.

## Review Focus

1. **A caller who isn't allowed in, sending a malformed body:** anonymous, wrong-role, or with a password change pending. They must get their 401 or 403, never a 400 that answers before auth. Covered by the route inventory sweeps (Tasks 2 and 3) and a Producer test in Task 3.
2. **A malformed login body.** It still gets `401 invalid_credentials`, through the same dummy-hash path, so it looks and takes the same as wrong credentials. Covered by existing tests, kept green in Task 2.
3. **A reply carrying a field its schema doesn't allow,** such as a password hash. It becomes `500 internal_error`, and the field never reaches the client. Covered in Task 1.
4. **Setup from another machine, or after setup, with a malformed body.** It still gets `403 setup_not_allowed` or `409 already_set_up`, not a 400. Covered in Task 1.
5. **A venue server started normally.** It serves no `/docs`. When docs are on, nothing on the page reaches the internet. Covered in Task 4.

## Decisions this plan makes

The spec is silent on these. Each is decided here so implementers and reviewers don't have to guess.

- **Every route lists `'4xx': ApiErrorSchema`.** Fastify 5 only lets a typed route send the status codes its response schema declares, so routes couldn't send 401, 403, 404 or 409 otherwise. It also documents the error shape on each route.
- **Guards move to `preValidation`.** Fastify validates bodies before `preHandler`, so leaving the guards there would answer 400 before 401.
- **Setup's checks run before validation.** The "server machine only" and "already set up" checks become the setup route's own `preValidation` hook, keeping today's 403 and 409 ahead of any 400.
- **The route-only schemas are defined locally:** the users route's path params and `z.undefined()` for 204 replies. They aren't part of the shared contract.
- **`@fastify/swagger` is always registered.** Building the document is cheap, and the route inventory can compare against it. Only Swagger UI, and with it `/docs/json`, depends on `apiDocs`.
- **The dev script turns docs on** with Yarn's cross-platform `VAR=value` syntax: `OBS_PRODUCER_API_DOCS=1 node --watch src/main.ts`.

---

## File map

All paths are relative to `obs-producer/`.

| File | Responsibility | Task |
|---|---|---|
| `apps/server/src/app.ts`, `src/http.ts` (+ test), `src/routes/setup.ts` (+ test) | Zod compilers, `ERROR_RESPONSES`, validation-error mapping; health and setup routes | 1 |
| `apps/server/src/routes/auth.ts`, `src/auth/guard.ts` | Auth routes with schemas; guards as `preValidation` | 2 |
| `apps/server/src/routes/users.ts` (+ test), `src/http.ts`, `src/auth/route-inventory.test.ts` | User routes with schemas, `parseBody` removed, the schema guard | 3 |
| `apps/server/src/openapi.ts` (+ test), `src/app.ts`, `src/config.ts` (+ test), `src/server.ts`, `apps/server/package.json`, `apps/web/vite.config.ts`, `src/auth/route-inventory.test.ts` | OpenAPI document, Swagger UI at `/docs`, the setting, dev wiring | 4 |
| `docs/…`, `AGENTS.md`, `CHANGELOG.md`, `../.claude/rules/obs-producer-server.md`, the spec | ADR-0014, guides, rule | 5 |

---

### Task 1: Zod route schemas: the foundation, health and setup

**Files:**
- Modify: `apps/server/package.json` (dependencies), `apps/server/src/app.ts`, `apps/server/src/http.ts`, `apps/server/src/routes/setup.ts`
- Test: `apps/server/src/http.test.ts`, `apps/server/src/routes/setup.test.ts`

**Interfaces:**
- Consumes: `ApiErrorSchema`, `HealthResponseSchema`, `SetupStatusSchema`, `SetupRequestSchema` and `SessionUserSchema` from `@obs-producer/shared`.
- Produces:
  - In `http.ts`: `ERROR_RESPONSES` (`{ '4xx': ApiErrorSchema }`), and `sendApiError`, which maps Fastify validation errors (`error.validation`) to `400 validation_failed`.
  - In `buildApp`: the validator and serializer compilers from `fastify-type-provider-zod`, set on the root instance. Every later route relies on them.
  - The pattern each route module follows: `const api = fastify.withTypeProvider<ZodTypeProvider>();`.

- [ ] **Step 1: Add the dependencies**

Run from `obs-producer/`: `yarn workspace @obs-producer/server add fastify-type-provider-zod@^7.0.0 @fastify/swagger@^9.9.1 openapi-types@^12.1.3`
Expected: done, with no quarantine error and no missing-peer warning. Check `npm view <pkg> version` first, and use the newest version outside the quarantine.

- [ ] **Step 2: Write the failing tests.**

In `apps/server/src/http.test.ts`:
- add `import type { ZodTypeProvider } from 'fastify-type-provider-zod';` and `import { SessionUserSchema } from '@obs-producer/shared';`;
- append:

```ts
describe('route schemas', () => {
  it('turn a reply with a field outside its schema into internal_error, so the field never leaks', async () => {
    const { app } = testApp({
      registerRoutes: (fastify) => {
        fastify
          .withTypeProvider<ZodTypeProvider>()
          .get('/api/leaky', { schema: { response: { 200: SessionUserSchema } } }, async () => {
            const user = {
              id: 'u1',
              username: 'admin',
              role: 'admin' as const,
              mustChangePassword: false,
              passwordHash: 'secret-hash',
            };
            return user;
          });
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/leaky' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal_error' });
    expect(res.body).not.toContain('secret-hash');
  });
});
```

Append inside `describe('POST /api/setup', …)` in `apps/server/src/routes/setup.test.ts`:

```ts
  it('refuses another machine before looking at the body', async () => {
    const { app } = testApp();
    const res = await app.inject({ method: 'POST', url: '/api/setup', payload: {}, remoteAddress: LAN });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'setup_not_allowed' });
  });

  it('refuses once set up before looking at the body', async () => {
    const { app } = testApp();
    await app.inject({ method: 'POST', url: '/api/setup', payload: admin });
    const res = await app.inject({ method: 'POST', url: '/api/setup', payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'already_set_up' });
  });
```

- [ ] **Step 3: Run them**

Run: `yarn vitest run apps/server/src/http.test.ts apps/server/src/routes/setup.test.ts`
Expected:
- **FAIL** for "turn a reply with a field outside its schema…": without the Zod compilers, Fastify can't compile a Zod object as a response schema.
- **Pass** for the two new setup tests. Today's handler checks the machine and the setup state before `parseBody`, so these tests pin behavior that the conversion must keep.

- [ ] **Step 4: Set the compilers and add the shared error responses.**

In `apps/server/src/app.ts`:
- add `import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';`;
- add `ERROR_RESPONSES` to the `./http.ts` import;
- right after `if (onRoute) app.addHook('onRoute', onRoute);`, add:

```ts
  // Routes validate requests and serialize replies with the shared Zod schemas they declare (ADR-0007, ADR-0014).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
```

In `apps/server/src/http.ts`, add `import { ApiErrorSchema } from '@obs-producer/shared';` and this export:

```ts
// Every /api route lists this in its response schemas. It documents the error shape, and lets the route send 4xx
// replies: Fastify only lets a typed route send the status codes its response schema declares.
export const ERROR_RESPONSES = { '4xx': ApiErrorSchema };
```

- [ ] **Step 5: Give the health route its schema.** In `app.ts`, replace the `api.get('/api/health', …)` call inside the `/api` plugin with:

```ts
    api.withTypeProvider<ZodTypeProvider>().get(
      '/api/health',
      {
        schema: {
          tags: ['health'],
          summary: 'Check that the server is up',
          response: { 200: HealthResponseSchema, ...ERROR_RESPONSES },
        },
      },
      async () => ({ status: 'ok', name: APP_NAME, version, uptimeSeconds: (performance.now() - startedAt) / 1000 }),
    );
```

If TypeScript widens `status: 'ok'` to `string`, write the object as `{ … } satisfies HealthResponse`, with `type HealthResponse` imported from `@obs-producer/shared`. Don't use an `as` cast.

- [ ] **Step 6: Give the setup routes their schemas.** Replace `apps/server/src/routes/setup.ts` with:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SessionUserSchema, SetupRequestSchema, SetupStatusSchema } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { isServerMachine, setSessionCookie } from '../auth/guard.ts';
import { hashPassword } from '../auth/passwords.ts';
import { createSession } from '../auth/sessions.ts';
import { countUsers, createUser, toSessionUser, type UserRecord } from '../auth/users.ts';
import { ERROR_RESPONSES } from '../http.ts';

// Login, setup and password changes each allow 10 attempts per minute per address (each route keeps its own count).
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

// First-run setup (ADR-0008): only while no users exist, and only from the server machine itself,
// so nobody else on the venue Wi-Fi can claim the Admin account first.
export function registerSetupRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/api/setup',
    {
      schema: {
        tags: ['setup'],
        summary: 'Is first-run setup needed, and can this machine do it?',
        response: { 200: SetupStatusSchema, ...ERROR_RESPONSES },
      },
    },
    async (request) => ({ needsSetup: countUsers(db) === 0, canSetupHere: isServerMachine(request) }),
  );

  api.post(
    '/api/setup',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['setup'],
        summary: 'Create the first Admin and sign in (server machine only, while no users exist)',
        body: SetupRequestSchema,
        response: { 201: SessionUserSchema, ...ERROR_RESPONSES },
      },
      // Before the body is validated: from another machine, or once set up, the answer doesn't depend on the body.
      preValidation: async (request, reply) => {
        if (!isServerMachine(request)) {
          return reply.code(403).send({
            error: 'setup_not_allowed',
            message: 'Open this page on the server machine, at a localhost address, to create the first Admin.',
          });
        }
        if (countUsers(db) > 0) return reply.code(409).send({ error: 'already_set_up' });
        return undefined;
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const passwordHash = await hashPassword(password);
      // Check again inside a transaction: two setups racing must not both create an Admin.
      const user = db.transaction((tx): UserRecord | null =>
        countUsers(tx) > 0 ? null : createUser(tx, { username, passwordHash, role: 'admin' }),
      );
      if (!user) return reply.code(409).send({ error: 'already_set_up' });

      const session = createSession(db, user.id);
      setSessionCookie(reply, request, session.token, session.expiresAt);
      return reply.code(201).send(toSessionUser(user));
    },
  );
}
```

If passing the typed `request` or `reply` to `isServerMachine` or `setSessionCookie` fails to type-check, widen those helpers' parameter types in `guard.ts`. They only read `ip`, `headers`, `protocol` and `setCookie`. Report what you changed.

- [ ] **Step 7: Run the tests to see the validation mapping is missing**

Run: `yarn vitest run apps/server/src/routes/setup.test.ts`
Expected: FAIL in "validates the username and password". Schema failures now reach the error handler and come out as `400 {"error":"bad_request"}`.

- [ ] **Step 8: Map validation errors to `validation_failed`.** In `sendApiError` in `http.ts`, add this as the first line of the function body:

```ts
  // A body, path or query that fails its route schema (ADR-0014). Same reply as before route schemas existed.
  if (error.validation) return reply.code(400).send({ error: 'validation_failed', message: error.message });
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `yarn vitest run apps/server`
Expected: PASS, every server test including the route inventory and `http.test.ts`. If the leaky-reply test gets `200` with `passwordHash` removed (the serializer strips the field instead of rejecting it), stop and report. The plan assumes strict schemas reject extra fields.

- [ ] **Step 10: Commit** (after `yarn check` passes)

```bash
git add obs-producer/apps/server obs-producer/yarn.lock
git commit -m "feat(obs-producer): routes declare shared Zod schemas, starting with health and setup"
```

---

### Task 2: Auth routes, with guards before validation

**Files:**
- Modify: `apps/server/src/routes/auth.ts`, `apps/server/src/auth/guard.ts` (comment only)
- Test: the existing `apps/server/src/routes/auth.test.ts`, `apps/server/src/auth/guard.test.ts` and `apps/server/src/auth/route-inventory.test.ts`. They're the behavior contract.

**Interfaces:**
- Consumes: `ERROR_RESPONSES` (Task 1), `requireSession` (`guard.ts`), `LoginRequestSchema`, `ChangePasswordRequestSchema` and `SessionUserSchema`.
- Produces: the auth routes declared with schemas, and the convention that guards go in `preValidation`.

This task is a refactor under existing tests. Run them before and after.

- [ ] **Step 1: Run the auth tests green first**

Run: `yarn vitest run apps/server/src/routes/auth.test.ts apps/server/src/auth`
Expected: PASS. This is the baseline.

- [ ] **Step 2: Convert the auth routes.** Replace `apps/server/src/routes/auth.ts` with:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ChangePasswordRequestSchema, LoginRequestSchema, SessionUserSchema } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { clearSessionCookie, requireSession, setSessionCookie } from '../auth/guard.ts';
import { dummyHash, hashPassword, verifyPassword } from '../auth/passwords.ts';
import { createSession, revokeSession, revokeUserSessions } from '../auth/sessions.ts';
import { findUserForLogin, setPassword, toSessionUser } from '../auth/users.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { AUTH_RATE_LIMIT } from './setup.ts';

const INVALID_CREDENTIALS = { error: 'invalid_credentials' };
const UNAUTHENTICATED = { error: 'unauthenticated' };

export function registerAuthRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.post(
    '/api/auth/login',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      // A malformed body must look and take the same as wrong credentials, so the handler deals with it.
      attachValidation: true,
      schema: {
        tags: ['auth'],
        summary: 'Log in',
        body: LoginRequestSchema,
        response: { 200: SessionUserSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const body = request.validationError ? null : request.body;
      const user = body ? findUserForLogin(db, body.username) : null;
      const ok = await verifyPassword(body?.password ?? '', user?.passwordHash ?? (await dummyHash()));
      if (!user || !ok) return reply.code(401).send(INVALID_CREDENTIALS);

      // Whoever was signed in on this browser is signed out, so a shared tablet doesn't keep their session alive.
      if (request.sessionToken) revokeSession(db, request.sessionToken);

      const session = createSession(db, user.id);
      setSessionCookie(reply, request, session.token, session.expiresAt);
      return toSessionUser(user);
    },
  );

  // `logout`, `me` and `password` use requireSession: they must work while a password change is pending,
  // or the user could never make it (ADR-0008). Guards run as preValidation, before the body is looked at.
  api.post(
    '/api/auth/logout',
    {
      preValidation: requireSession,
      schema: { tags: ['auth'], summary: 'Log out', response: { 204: z.undefined(), ...ERROR_RESPONSES } },
    },
    async (request, reply) => {
      if (request.sessionToken) revokeSession(db, request.sessionToken);
      clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );

  api.get(
    '/api/auth/me',
    {
      preValidation: requireSession,
      schema: { tags: ['auth'], summary: 'Who am I?', response: { 200: SessionUserSchema, ...ERROR_RESPONSES } },
    },
    async (request, reply) => request.user ?? reply.code(401).send(UNAUTHENTICATED),
  );

  api.post(
    '/api/auth/password',
    {
      preValidation: requireSession,
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Change your own password',
        body: ChangePasswordRequestSchema,
        response: { 200: SessionUserSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) return reply.code(401).send(UNAUTHENTICATED);
      const { currentPassword, newPassword } = request.body;
      if (newPassword.toLowerCase() === user.username) {
        return reply.code(400).send({ error: 'validation_failed', message: 'The password must not be the username' });
      }
      const record = findUserForLogin(db, user.username);
      if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
        return reply.code(400).send({ error: 'wrong_password' });
      }
      setPassword(db, record.id, await hashPassword(newPassword), { mustChangePassword: false });
      if (request.sessionToken) revokeUserSessions(db, record.id, { exceptToken: request.sessionToken });
      return { ...user, mustChangePassword: false };
    },
  );
}
```

If using `requireSession` as a typed route's `preValidation` fails to type-check, adjust the guard's parameter types in `guard.ts`. Keep its behavior identical, and report the change.

- [ ] **Step 3: Say where guards belong.** In `apps/server/src/auth/guard.ts`, change the comment above `function guard(` to:

```ts
// Builds a guard hook. Routes use it as their `preValidation`, so the caller is checked before the body is: an
// anonymous or wrong-role request is refused, never told what a valid body looks like. No session is always a 401;
// `deny` can refuse a signed-in user for another reason.
```

- [ ] **Step 4: Run the tests to verify they still pass**

Run: `yarn vitest run apps/server`
Expected: PASS. In particular, every test in `routes/auth.test.ts` passes: the malformed login gets 401, the 300-character password gets 401, and the timing test passes. The route inventory's anonymous sweep also passes. With `preHandler` instead of `preValidation`, it would fail on `POST /api/auth/password` with a 400.

- [ ] **Step 5: Commit** (after `yarn check` passes)

```bash
git add obs-producer/apps/server/src
git commit -m "refactor(obs-producer): auth routes declare shared schemas; guards run before validation"
```

---

### Task 3: User routes, the schema guard, and `parseBody` retired

**Files:**
- Modify: `apps/server/src/routes/users.ts`, `apps/server/src/http.ts`, `apps/server/src/auth/route-inventory.test.ts`
- Test: `apps/server/src/routes/users.test.ts`, `apps/server/src/auth/route-inventory.test.ts`

**Interfaces:**
- Consumes:
  - `ERROR_RESPONSES` (Task 1) and `requireRole` (`guard.ts`);
  - `UserSchema`, `CreateUserRequestSchema`, `CreateUserResponseSchema`, `UpdateUserRequestSchema` and `PasswordResetResponseSchema`;
  - `inventory()` from the route inventory test.
- Produces:
  - all six `/api/users` routes declared with schemas;
  - `ApiRoute.schema` in the inventory test;
  - `routesMissingSchemas(options)`;
  - `parseBody` deleted.

- [ ] **Step 1: Write the failing schema-guard tests.** In `apps/server/src/auth/route-inventory.test.ts`:
  1. Add `type FastifySchema` to the `fastify` type import.
  2. Add `schema: FastifySchema | undefined;` to `interface ApiRoute`.
  3. In `inventory()`'s `routes.push(…)`, add `schema: route.schema`.
  4. Add `requireUser` to the `./guard.ts` import.
  5. Below `routesOpenToAnonymous`, add the helper shown first below.
  6. Inside `describe('route inventory', …)`, append the two tests shown second.

```ts
// Every /api route must declare a response schema, and a params schema when its path has a parameter (ADR-0014).
async function routesMissingSchemas(options: Partial<AppOptions> = {}) {
  const { app, routes } = await inventory(options);
  await app.close();
  return routes
    .filter((r) => r.method !== 'HEAD')
    .flatMap((r) => [
      ...(r.schema?.response ? [] : [`${r.key} has no response schema`]),
      ...(r.url.includes(':') && !r.schema?.params ? [`${r.key} has no params schema`] : []),
    ]);
}
```

```ts
  it('gives every /api route a response schema, and a params schema when its path has parameters', async () => {
    expect(await routesMissingSchemas()).toEqual([]);
  });

  it('catches a route without schemas', async () => {
    const missing = await routesMissingSchemas({
      registerRoutes: (api) => {
        api.get('/api/schemaless/:id', { preValidation: requireUser }, async () => ({ ok: true }));
      },
    });
    expect(missing).toEqual([
      'GET /api/schemaless/:id has no response schema',
      'GET /api/schemaless/:id has no params schema',
    ]);
  });
```

Append inside `describe('POST /api/users', …)` in `apps/server/src/routes/users.test.ts`:

```ts
  it('refuses a non-Admin before looking at the body', async () => {
    const { app, db } = await withAdmin();
    const { cookies } = await signIn(db, 'producer1', 'producer');
    const res = await app.inject({ method: 'POST', url: '/api/users', cookies, payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
  });
```

- [ ] **Step 2: Run them**

Run: `yarn vitest run apps/server/src/auth/route-inventory.test.ts apps/server/src/routes/users.test.ts`
Expected:
- "gives every /api route a response schema…" **FAILS**, listing the six `/api/users` routes.
- "catches a route without schemas" **passes**.
- The new users test **passes**. It pins that the role check stays ahead of validation.

- [ ] **Step 3: Convert the user routes.** In `apps/server/src/routes/users.ts`:
  1. **Imports:** add `import type { ZodTypeProvider } from 'fastify-type-provider-zod';` and `import { z } from 'zod';`. Replace the `parseBody` import with `import { ERROR_RESPONSES } from '../http.ts';`.
  2. **Remove** `interface UserParams`.
  3. **Replace** `const ADMIN_ONLY = { preHandler: requireRole('admin') };` with:

```ts
// Guards run as preValidation, so a non-Admin is refused before their body is looked at.
const ADMIN_ONLY = { preValidation: requireRole('admin') };
const UserParamsSchema = z.strictObject({ id: z.string() });
const NO_CONTENT = z.undefined();
```

Then replace the body of `registerUserRoutes` (keeping its comment, with the parameter renamed to `fastify`) with:

```ts
export function registerUserRoutes(fastify: FastifyInstance, db: AppDatabase): void {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/api/users',
    {
      ...ADMIN_ONLY,
      schema: { tags: ['users'], summary: 'List users', response: { 200: UserSchema.array(), ...ERROR_RESPONSES } },
    },
    async () => listUsers(db),
  );

  api.post(
    '/api/users',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: 'Create a user (the temporary password is shown only in this response)',
        body: CreateUserRequestSchema,
        response: { 201: CreateUserResponseSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      if (findUserForLogin(db, request.body.username)) return reply.code(409).send({ error: 'username_taken' });
      const user = createUser(db, { ...request.body, passwordHash, mustChangePassword: true });
      return reply.code(201).send({ user, temporaryPassword });
    },
  );

  api.patch(
    '/api/users/:id',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: "Change a user's role",
        params: UserParamsSchema,
        body: UpdateUserRequestSchema,
        response: { 200: UserSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const user = findUserById(db, request.params.id);
      if (!user) return reply.code(404).send(NOT_FOUND);
      if (request.body.role !== 'admin' && isLastAdmin(db, user)) return reply.code(409).send(LAST_ADMIN);
      setRole(db, user.id, request.body.role);
      return { ...user, role: request.body.role };
    },
  );

  api.post(
    '/api/users/:id/password-reset',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: "Reset a user's password (the temporary password is shown only in this response)",
        params: UserParamsSchema,
        response: { 200: PasswordResetResponseSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const user = findUserById(db, request.params.id);
      if (!user) return reply.code(404).send(NOT_FOUND);
      setPassword(db, user.id, passwordHash, { mustChangePassword: true });
      revokeUserSessions(db, user.id);
      return { temporaryPassword };
    },
  );

  api.post(
    '/api/users/:id/sign-out',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: 'Sign a user out on every device',
        params: UserParamsSchema,
        response: { 204: NO_CONTENT, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const user = findUserById(db, request.params.id);
      if (!user) return reply.code(404).send(NOT_FOUND);
      revokeUserSessions(db, user.id);
      return reply.code(204).send();
    },
  );

  api.delete(
    '/api/users/:id',
    {
      ...ADMIN_ONLY,
      schema: {
        tags: ['users'],
        summary: 'Delete a user',
        params: UserParamsSchema,
        response: { 204: NO_CONTENT, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const user = findUserById(db, request.params.id);
      if (!user) return reply.code(404).send(NOT_FOUND);
      if (isLastAdmin(db, user)) return reply.code(409).send(LAST_ADMIN);
      if (user.id === request.user?.id) {
        return reply
          .code(409)
          .send({ error: 'cannot_delete_self', message: 'Another Admin has to delete your account.' });
      }
      deleteUser(db, user.id);
      return reply.code(204).send();
    },
  );
}
```

All five shared schemas in the existing import are still used, and so is `type UserRecord` (by `isLastAdmin`).

- [ ] **Step 4: Retire `parseBody`.** Nothing uses it any more. Delete the `parseBody` function and its comment from `apps/server/src/http.ts`, and the `import { z } from 'zod';` that only it used. Then confirm with `grep -rn parseBody obs-producer/apps` (from the repo root), which must print nothing.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn vitest run apps/server`
Expected: PASS. That includes the schema guard, both route inventory sweeps, and every test in `users.test.ts` (` Producer1 ` is still stored as `producer1`, and both race tests pass).

- [ ] **Step 6: Commit** (after `yarn check` passes)

```bash
git add obs-producer/apps/server/src
git commit -m "feat(obs-producer): user routes declare shared schemas, and a guard makes every /api route do so"
```

---

### Task 4: Swagger UI at `/docs`, the setting, and the dev wiring

**Files:**
- Create: `apps/server/src/openapi.ts`, `apps/server/src/openapi.test.ts`
- Modify:
  - `apps/server/src/app.ts`, `apps/server/src/config.ts`, `apps/server/src/server.ts`
  - `apps/server/package.json` (the `dev` script, and the `@fastify/swagger-ui` dependency)
  - `apps/web/vite.config.ts`
  - `apps/server/src/auth/route-inventory.test.ts`
- Test: `apps/server/src/config.test.ts`, `apps/server/src/openapi.test.ts`, `apps/server/src/auth/route-inventory.test.ts`

**Interfaces:**
- Consumes: every route's schema (Tasks 1–3), `SESSION_COOKIE` (`guard.ts`), `testApp` and `inventory()`.
- Produces:
  - `registerApiDocs(app, { version, apiDocs })`;
  - `AppOptions.apiDocs?: boolean`;
  - `ServerConfig.apiDocs?: boolean`, which `loadConfig` always sets;
  - `/docs` and `/docs/json` when docs are on.

- [ ] **Step 1: Add the dependency**

Run from `obs-producer/`: `yarn workspace @obs-producer/server add @fastify/swagger-ui@^6.1.1`
Expected: done, with no quarantine error.

- [ ] **Step 2: Write the failing config tests.** In `apps/server/src/config.test.ts`:
  1. In the first test, add `expect(config.apiDocs).toBe(false);`.
  2. In "reads OBS_PRODUCER_* overrides", add `OBS_PRODUCER_API_DOCS: '1'` to the input, and `apiDocs: true` to the expected object.
  3. Append:

```ts
  it('turns the API explorer on with 1 or true, and off with 0, false or nothing', () => {
    for (const on of ['1', 'true', 'TRUE']) expect(loadConfig({ OBS_PRODUCER_API_DOCS: on }).apiDocs, on).toBe(true);
    for (const off of ['0', 'false', '']) expect(loadConfig({ OBS_PRODUCER_API_DOCS: off }).apiDocs, off).toBe(false);
  });

  it('rejects any other value for OBS_PRODUCER_API_DOCS', () => {
    for (const bad of ['yes', 'on', '2']) {
      expect(() => loadConfig({ OBS_PRODUCER_API_DOCS: bad }), bad).toThrow(/OBS_PRODUCER_API_DOCS/);
    }
  });
```

- [ ] **Step 3: Write the failing explorer tests.** Create `apps/server/src/openapi.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { testApp } from './testing.ts';

// Reads a nested value from parsed JSON without a type for every level.
const at = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], value);

describe('API explorer', () => {
  it('is off unless asked for', async () => {
    const { app } = testApp();
    expect((await app.inject({ method: 'GET', url: '/docs' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(404);
  });

  it('serves Swagger UI at /docs with no online validator and nothing loaded from outside', async () => {
    const { app } = testApp({ apiDocs: true });
    const page = await app.inject({ method: 'GET', url: '/docs' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    const initializer = await app.inject({ method: 'GET', url: '/docs/static/swagger-initializer.js' });
    expect(initializer.statusCode).toBe(200);
    expect(initializer.body).toContain('validatorUrl: null');
    // Nothing is fetched from another host: no external src/href on the page, no absolute URL as a config value.
    // (The initializer has a stackoverflow link in a code comment, which loads nothing.)
    expect(page.body).not.toMatch(/(src|href)=["']https?:/);
    expect(initializer.body).not.toMatch(/:\s*["']https?:/);
  });

  it('describes the API from the shared schemas', async () => {
    const { app } = testApp({ apiDocs: true });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    expect(at(doc, 'openapi')).toMatch(/^3\./);
    expect(at(doc, 'info', 'title')).toBe('OBS Producer API');
    expect(at(doc, 'info', 'version')).toBe('1.0.0');
    expect(at(doc, 'components', 'securitySchemes', 'session')).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'obs_producer_session',
    });
    const json = 'application/json';
    expect(at(doc, 'paths', '/api/users', 'post', 'requestBody', 'content', json, 'schema', 'required')).toEqual(
      expect.arrayContaining(['username', 'role']),
    );
    const me = at(doc, 'paths', '/api/auth/me', 'get', 'responses', '200', 'content', json, 'schema', 'properties');
    expect(Object.keys(me ?? {})).toEqual(expect.arrayContaining(['id', 'username', 'role', 'mustChangePassword']));
    expect(at(doc, 'paths', '/api/users/{id}', 'delete', 'tags')).toEqual(['users']);
  });
});
```

- [ ] **Step 4: Write the failing cross-check.**
  - In `apps/server/src/auth/route-inventory.test.ts`, append inside `describe('route inventory', …)`:

```ts
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
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(documented.toSorted(byName)).toEqual(registered.toSorted(byName));
  });
```

  - Add `import '@fastify/swagger';` at the top of the test file only if TypeScript doesn't otherwise know `app.swagger()`.

- [ ] **Step 5: Run them**

Run: `yarn vitest run apps/server/src/config.test.ts apps/server/src/openapi.test.ts apps/server/src/auth/route-inventory.test.ts`
Expected:
- **FAIL:** the config tests (there's no `apiDocs`); the explorer tests (`/docs` is 404 and there's no `apiDocs` option); and the cross-check (`app.swagger` isn't a function).
- **Pass:** "is off unless asked for".

- [ ] **Step 6: Implement the setting.** In `apps/server/src/config.ts`:
  1. Add to `ServerConfig`:

```ts
  /** Serve the API explorer (Swagger UI) at /docs (ADR-0014). */
  apiDocs?: boolean;
```

  2. Add `apiDocs: parseSwitch('OBS_PRODUCER_API_DOCS', env.OBS_PRODUCER_API_DOCS),` to the object `loadConfig` returns.
  3. Append:

```ts
// On/off settings: 1 or true turn them on; 0, false, empty or unset leave them off. Anything else is probably a
// typo, so the server stops rather than guess.
function parseSwitch(name: string, raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === '1' || value === 'true') return true;
  if (value === '' || value === '0' || value === 'false') return false;
  throw new Error(`${name} must be 1, true, 0 or false, got ${JSON.stringify(raw)}`);
}
```

- [ ] **Step 7: Implement the OpenAPI document and Swagger UI.** Create `apps/server/src/openapi.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { SESSION_COOKIE } from './auth/guard.ts';

const DESCRIPTION = [
  'The OBS Producer server API. Every route takes and returns JSON.',
  '',
  '**Signing in.** Call `POST /api/auth/login` with "Try it out". Your browser keeps the `obs_producer_session` cookie and sends it with every later call, so they run as you, limited by your role. On a fresh data folder, create the first Admin with `POST /api/setup` from the server machine.',
  '',
  '**Public routes:** `GET /api/health`, `GET /api/setup`, `POST /api/setup` and `POST /api/auth/login`. Everything else needs a session, checked in this order: no session gets `401 unauthenticated`; a pending password change gets `403 password_change_required`; the wrong role gets `403 forbidden`.',
  '',
  '**Errors** look like `{ "error": "<code>", "message"?: "…" }`. A body that fails its schema gets `400 validation_failed`.',
].join('\n');

// The OpenAPI document is built from the schemas every route declares (ADR-0014). Swagger UI, and the document at
// /docs/json, are served only when asked for: always in `yarn dev`, on a venue server only with OBS_PRODUCER_API_DOCS=1.
export function registerApiDocs(app: FastifyInstance, { version, apiDocs }: { version: string; apiDocs: boolean }) {
  void app.register(fastifySwagger, {
    openapi: {
      info: { title: 'OBS Producer API', version, description: DESCRIPTION },
      tags: [
        { name: 'health', description: 'Is the server up?' },
        { name: 'setup', description: 'Creating the first Admin' },
        { name: 'auth', description: 'Logging in and out, and your own password' },
        { name: 'users', description: 'User management (Admin only)' },
      ],
      components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } } },
    },
    transform: jsonSchemaTransform,
  });
  // validatorUrl stays null: Swagger UI must not contact validator.swagger.io (hard rule 4: works offline).
  if (apiDocs) void app.register(fastifySwaggerUi, { routePrefix: '/docs', validatorUrl: null });
}
```

- [ ] **Step 8: Wire it in.**
  - **`apps/server/src/app.ts`:**
    - Import `registerApiDocs` from `./openapi.ts`.
    - Add to `AppOptions`:

      ```ts
        /** Serve the API explorer (Swagger UI) at /docs (ADR-0014). Off unless asked for. */
        apiDocs?: boolean;
      ```
    - Add `apiDocs = false` to `buildApp`'s destructured options.
    - Right after the two `set…Compiler` lines, add `registerApiDocs(app, { version, apiDocs });`. It must come before any route, so the document sees them all.
  - **`apps/server/src/server.ts`:** pass `apiDocs: config.apiDocs` to `buildApp`.
  - **`apps/server/package.json`:** change the `dev` script to `"dev": "OBS_PRODUCER_API_DOCS=1 node --watch src/main.ts"`. Yarn's script shell supports the `VAR=value` prefix on every OS.
  - **`apps/web/vite.config.ts`:** add `'/docs': server,` to `server.proxy`, after `'/api': server,`, and update the comment above the proxy to mention the API explorer.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `yarn vitest run apps/server`
Expected: PASS. If `/docs` answers with a redirect rather than 200 in this version of `@fastify/swagger-ui`, request `/docs/` in the test instead, and report it.

- [ ] **Step 10: Try the real server.** From `obs-producer/`, run:

```bash
OBS_PRODUCER_API_DOCS=1 OBS_PRODUCER_PORT=5598 OBS_PRODUCER_DATA_DIR="$(mktemp -d)" yarn workspace @obs-producer/server start > /tmp/op-docs.log 2>&1 &
for i in $(seq 1 40); do curl -sf http://127.0.0.1:5598/api/health > /dev/null && break; sleep 0.25; done
curl -s http://127.0.0.1:5598/docs/json | head -c 120; echo
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5598/docs
kill $(lsof -t -iTCP:5598 -sTCP:LISTEN)
```

Expected: the start of an OpenAPI JSON document, then `200`. Use port 5598 so that nothing the developer is already running gets touched.

- [ ] **Step 11: Commit** (after `yarn check` passes)

```bash
git add obs-producer/apps/server obs-producer/apps/web/vite.config.ts obs-producer/yarn.lock
git commit -m "feat(obs-producer): Swagger UI API explorer at /docs, on in yarn dev and opt-in on a venue server"
```

---

### Task 5: Docs, and ADR-0014

**Files:**
- Create: `docs/decisions/0014-route-schemas-and-api-explorer.md`
- Modify:
  - `docs/decisions/README.md` (generated)
  - `docs/guides/local-development.md`, `docs/guides/testing.md`
  - `AGENTS.md`, `CHANGELOG.md`
  - `../.claude/rules/obs-producer-server.md`
  - `design-docs/specs/2026-10-03-api-explorer-design.md` (status line)

- [ ] **Step 1: Write ADR-0014.** Run `yarn docs:check --next-adr` and check that it prints `0014`. Then create `docs/decisions/0014-route-schemas-and-api-explorer.md`:

```markdown
---
title: Route schemas from the shared contract, with an API explorer
status: accepted
date: 2026-10-06
---
# 0014. Route schemas from the shared contract, with an API explorer

## Context

Developers need to see the API's request and response shapes, and try calls, without reading the code. Until now each handler validated its own body and parsed its own reply, so nothing outside the handlers knew a route's shapes. [ADR-0007](0007-shared-zod-contract.md) makes the shared Zod schemas the single contract; this decides how routes declare them.

Options considered:
- **Hand-written OpenAPI, or documentation-only annotations next to the handlers' own validation.** Rejected: two descriptions of every route, which can silently disagree.
- **A request collection (a `.http` file or Bruno).** Rejected: no in-browser explorer, and it's kept up to date by hand.
- **Routes declare their Zod schemas to Fastify through `fastify-type-provider-zod`, and Swagger reads the same declarations.** Chosen.

## Decision

- **Every `/api` route declares its schemas** from `@obs-producer/shared`: `body` when it reads one, `params` when its path has a parameter, and `response` for each success status, plus the shared `'4xx'` error shape. Route modules use `withTypeProvider<ZodTypeProvider>()`, so requests and replies are typed from the same schemas.
- **Fastify validates and serializes with them.** A request that fails its schema gets `400 validation_failed`. A reply that doesn't match its schema becomes `500 internal_error`, so an unexpected field such as a password hash can't leak.
- **Auth checks run before validation.** `requireSession`, `requireUser` and `requireRole` are each route's `preValidation` hook, so an anonymous or wrong-role caller is refused before their body is looked at.
- **The API explorer is Swagger UI at `/docs`,** built by `@fastify/swagger` and `@fastify/swagger-ui` from those schemas. It's on in `yarn dev`, and on a venue server only with `OBS_PRODUCER_API_DOCS=1`. It loads nothing from the internet: Swagger UI's online validator stays off.
- **A test enforces it.** The route inventory test fails if an `/api` route has no response schema, has a path parameter without a params schema, or if the OpenAPI document and the registered routes disagree.

## Consequences

- The explorer can't go out of date, and the web app can trust that responses match the shared types.
- Writing a route means declaring its schemas. In return, `request.body`, `request.params` and the reply are typed.
- A typed route may only send the status codes its response schema declares, which is why every route lists the shared `'4xx'` error shape.
- Socket.IO messages aren't covered. Live Mode decides how to document them.
- ADR-0007 stays in force; this builds on it.
```

- [ ] **Step 2: Update the guides.**
  - **`docs/guides/local-development.md`:**
    - In "Development (hot reload)", add this bullet to the "Then open:" list: `- **API explorer:** \`http://localhost:5173/docs\`. See [Trying the API](#trying-the-api).`
    - Add this row to the "Server settings" table, after `OBS_PRODUCER_DEV_SERVER`:

      ```markdown
      | `OBS_PRODUCER_API_DOCS` | off (`yarn dev` turns it on) | Serve the API explorer at `/docs`: `1` or `true` for on, `0` or `false` for off ([ADR-0014](../decisions/0014-route-schemas-and-api-explorer.md)) |
      ```
    - Add this subsection after "Server settings":

      ```markdown
      ### Trying the API

      `yarn dev` also serves an API explorer (Swagger UI) at `http://localhost:5173/docs`. It lists every `/api` route with its request and response shapes, generated from the shared schemas, so it's always current ([ADR-0014](../decisions/0014-route-schemas-and-api-explorer.md)).

      1. Open `POST /api/auth/login`, choose **Try it out**, and log in. On a fresh data folder, create the first Admin with `POST /api/setup` first.
      2. Your browser keeps the session cookie, so every later call runs as you, limited by your role.

      On a venue server the explorer is off. To turn it on, start the server with `OBS_PRODUCER_API_DOCS=1` and open `http://<server>:5580/docs`.
      ```
  - **`docs/guides/testing.md`:** add this sentence to the end of the route inventory bullet under "Guards that protect the architecture", after its "fails CI" line:

    ```markdown
      It also checks that every `/api` route declares a response schema (and a params schema when its path has parameters), and that the OpenAPI document behind `/docs` lists exactly the registered routes ([ADR-0014](../decisions/0014-route-schemas-and-api-explorer.md)).
    ```

- [ ] **Step 3: Update `AGENTS.md`, the CHANGELOG, the server rule and the spec.**
  - **`AGENTS.md`**, in the Commands table:
    - change the `yarn dev` row's description to `Server (restarts on changes) and Vite dev server together; open \`http://localhost:5173\`. The API explorer is at \`/docs\` ([ADR-0014](docs/decisions/0014-route-schemas-and-api-explorer.md))`;
    - in the `yarn workspace @obs-producer/server start` row, add `; set \`OBS_PRODUCER_API_DOCS=1\` to serve the API explorer at \`/docs\`` before the final sentence about the overlay.
  - **`CHANGELOG.md`**, under `## [Unreleased]` → `### Added`, after the #14 line:

    ```markdown
    - API explorer for developers: Swagger UI at `/docs`, generated from the shared schemas. It's on in `yarn dev`, and on a venue server only with `OBS_PRODUCER_API_DOCS=1` (#16)
    ```
  - **The repo-root `.claude/rules/obs-producer-server.md`:**
    - Replace the bullet `**Validate every request, response and socket payload** with a schema from \`@obs-producer/shared\` (ADR-0007).` with:

      ```markdown
      - **Routes declare their schemas** (ADR-0007, ADR-0014).
        - Use `fastify.withTypeProvider<ZodTypeProvider>()`.
        - Give every `/api` route `schema: { tags, summary, body?, params?, response: { <status>: Schema, ...ERROR_RESPONSES } }`, with schemas from `@obs-producer/shared`.
        - Fastify validates and serializes with them, so don't parse bodies by hand.
        - Socket payloads are validated with shared schemas too.
      ```
    - In the "Every `/api` route checks the caller" bullet, change `Give it \`preHandler: requireUser\` or \`requireRole(...)\`` to `Give it \`preValidation: requireUser\` or \`requireRole(...)\` (preValidation, so the caller is checked before the body)`.
  - **The spec:** in `design-docs/specs/2026-10-03-api-explorer-design.md`, change the status line to `**Date:** 2026-10-03 · **Status:** approved · **Milestone:** \`obs-producer v0.2.0\` · **Issue:** #16`.

- [ ] **Step 4: Regenerate and check the docs**

Run: `yarn docs:check --fix`, then `yarn docs:check`
Expected: ADR 0014 appears in the decisions index, followed by `check-docs: OK`.

- [ ] **Step 5: Run everything**

Run: `yarn check` and `yarn test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add obs-producer .claude/rules/obs-producer-server.md
git commit -m "docs(obs-producer): ADR-0014 and guides for route schemas and the API explorer

Closes #16"
```

---

## Done when

- `yarn check` and `yarn test:e2e` pass.
- With `yarn dev` running, `http://localhost:5173/docs` shows every `/api` route with real request and response shapes. Logging in on the page makes later calls run as that user.
- A venue server started normally serves no `/docs`.
- Every acceptance criterion in #16 is backed by a test above:

  | Acceptance criterion | Where it's tested |
  |---|---|
  | Shapes and every route | Task 4: document test and cross-check |
  | Off by default, and offline | Task 4 |
  | The schema guard | Task 3 |
  | Behavior unchanged | Existing tests, plus Tasks 1–3 |
  | ADR-0014 | Task 5 |
