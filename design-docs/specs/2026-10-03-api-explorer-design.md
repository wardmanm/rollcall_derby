# API explorer (Swagger): design

**Date:** 2026-10-03 · **Status:** approved in chat, written for review · **Milestone:** `obs-producer v0.2.0` (proposed)

## Goal

A developer can open a page that lists every `/api` endpoint, see each one's request and response shapes, and make test calls from the browser. The page is Swagger UI. It's generated from the same shared Zod schemas the server validates with ([ADR-0007](../../docs/decisions/0007-shared-zod-contract.md)), so it can't drift out of date.

## Decisions (confirmed with Mike)

| Topic | Decision |
|---|---|
| Tools | Existing ones only. [`@fastify/swagger`](https://github.com/fastify/fastify-swagger) builds the OpenAPI document; [`@fastify/swagger-ui`](https://github.com/fastify/fastify-swagger-ui) serves the Swagger page. [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod) turns our Zod schemas into what both need |
| Where it lives | `/docs` |
| When it's on | Always in `yarn dev`. On the venue server only when `OBS_PRODUCER_API_DOCS=1` is set. A normal install doesn't expose it |
| Source of truth | Each `/api` route declares its schemas from `@obs-producer/shared`. Fastify validates requests and shapes responses with them, and Swagger reads the same declaration |

## Scope

**In scope:**
- Every existing `/api` route declares its schemas.
- The OpenAPI document, and Swagger UI at `/docs`. Both work offline.
- The `OBS_PRODUCER_API_DOCS` setting.
- Logging in from the page.
- A CI guard so new routes can't skip their schemas.
- Docs, and ADR-0014.

**Out of scope:**
- Socket.IO messages. OpenAPI doesn't describe sockets well, and there's only one event so far. Revisit with Live Mode.
- Generating a web client from the OpenAPI document.
- Listing every possible error code per route. The error shape and codes are described once.
- Showing the page to operators or crew. It's a developer tool.

## How it works

### Route schemas

- **The type provider.** `buildApp()` sets Fastify's validator and serializer compilers from `fastify-type-provider-zod`. Route modules use `api.withTypeProvider<ZodTypeProvider>()`, so `request.body` and `request.params` are typed from the schemas. That replaces generics such as `api.patch<{ Params: UserParams }>`.
- **What every `/api` route declares:**
  - `tags` (`health`, `setup`, `auth`, `users`) and a one-line `summary`;
  - `body`, when the route reads one;
  - `params`, when the path has a `:param`;
  - `response`, with a schema for each success status: `200`, `201`, or `204` for no content.
- **Input validation moves to Fastify.**
  - Fastify validates input before the handler runs, so the hand-rolled `parseBody` helper is removed.
  - Handlers no longer call `XSchema.parse(...)` on what they return. Fastify serializes through the response schema instead.
- **Response schemas catch leaks.** A reply that doesn't match its response schema becomes `500 {"error":"internal_error"}`, so a field like `passwordHash` can't slip out unnoticed. Our schemas are strict objects, so an extra field fails rather than being silently dropped.

### Behavior that stays the same

- **Validation errors** are still `400 {"error":"validation_failed","message":"…"}`, with a readable message. The `/api` error handler (`sendApiError`) maps Fastify's validation errors to that shape.
- **A malformed login still looks like wrong credentials.** `POST /api/auth/login` uses Fastify's `attachValidation`, so a bad body still runs the dummy hash and returns `401 invalid_credentials`. The documented body is `LoginRequestSchema`.
- **"The new password must not be the username"** stays in the handler, because it needs the signed-in user.
- **Auth, CSRF, rate limits and the route inventory** are unchanged.

### The OpenAPI document and Swagger UI

- **Document details:**
  - `@fastify/swagger` is registered before any route, with `transform: jsonSchemaTransform`.
  - Info: title "OBS Producer API", version = the app version.
  - A security scheme describes the `obs_producer_session` cookie.
  - The description explains the error shape `{ error, message? }`, the common codes and the order of auth checks.
  - The document is always built, which is cheap. Only the page and its JSON are switched on and off.
- **When docs are on,** `@fastify/swagger-ui` serves:
  - the page at `/docs`;
  - the document at `/docs/json`.
- **Offline:** Swagger UI's files come from the installed package. Its online validator is switched off (`validatorUrl: null`), because by default the page contacts `validator.swagger.io` (hard rule 4).
- **Logging in:**
  1. The page is same-origin, so in Swagger UI's "Try it out" you call `POST /api/auth/login`.
  2. The browser keeps the session cookie.
  3. Later calls send it automatically, and the CSRF Origin check passes.
  4. Calls are limited by your role, as anywhere else.
- **In development:**
  - The server's `dev` script sets `OBS_PRODUCER_API_DOCS=1`, using Yarn's cross-platform `VAR=value` syntax.
  - The Vite dev server proxies `/docs` as well as `/api`. So `http://localhost:5173/docs` works, on the same origin as the app, sharing its login.
- **When docs are off,** nothing is registered under `/docs`.

### The setting

`OBS_PRODUCER_API_DOCS` takes these values:
- `1` or `true`: on.
- `0`, `false` or unset: off.
- Anything else: the server refuses to start with a clear message, like `OBS_PRODUCER_PORT` does.

### Security

- Off by default on the venue server.
- When on, the page reveals only the shape of the API. Every call still needs the right session and role, so it grants nothing new.
- `/docs` is outside `/api`, so the route inventory doesn't treat it as an API route. It serves only documentation.

## Tests (written first)

- **Schema guard,** an extension of the route inventory:
  - every `/api` route declares a `response` schema;
  - every route with a `:param` declares `params`;
  - the OpenAPI document lists exactly the `/api` routes the inventory sees, so nothing is missing or stale.
- **The document:**
  - with docs on, `GET /docs/json` returns OpenAPI 3;
  - `POST /api/users` shows the `username` and `role` body fields;
  - `GET /api/auth/me` shows the `SessionUser` fields;
  - the cookie security scheme is present.
- **Swagger UI:**
  - with docs on, `GET /docs` serves the page;
  - its config has the validator off;
  - the page references no outside hosts.
- **Docs off:** `GET /docs` and `GET /docs/json` return 404.
- **Setting:** `loadConfig` accepts `1`, `true`, `0` and `false`, and rejects other values.
- **Unchanged behavior:**
  - a bad body still gets `400 validation_failed`;
  - a malformed login still gets `401 invalid_credentials`;
  - a probe route that returns an extra field gets `500 internal_error`.
- **Existing tests keep passing.** They are the behavior contract for every converted route.

## Docs

- **ADR-0014, "Route schemas from the shared contract, with an OpenAPI explorer".** It builds on ADR-0007 (which stays accepted) and records:
  - the type provider;
  - Swagger;
  - `/docs`, and the setting that controls it;
  - the rule that every `/api` route declares its schemas.
- **`guides/local-development.md`:**
  - the setting, added to the server settings table;
  - a short "Trying the API" section: open `/docs`, log in through `POST /api/auth/login`, then call anything.
- **`guides/testing.md`:** the schema guard, listed under the architecture guards.
- **`AGENTS.md`:** the `/docs` explorer, in the `yarn dev` command's description.
- **`.claude/rules/obs-producer-server.md`:** routes declare `body`, `params` and `response` from `@obs-producer/shared` through the type provider. `parseBody` is gone.
- **CHANGELOG:** one line, with the new issue's number.
