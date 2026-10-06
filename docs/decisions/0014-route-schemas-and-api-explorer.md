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
- **A test enforces it.** The route inventory test fails if an `/api` route has no success (2xx) response schema, has a path parameter without a params schema, or if the OpenAPI document and the registered routes disagree.

## Consequences

- The explorer can't go out of date, and the web app can trust that responses match the shared types.
- Writing a route means declaring its schemas. In return, `request.body`, `request.params` and the reply are typed.
- TypeScript only lets a typed route send the status codes its response schema declares, which is why every route lists the shared `'4xx'` error shape. At runtime a status without a schema goes out unchecked, which is why the route inventory requires a success (2xx) schema on every route.
- Socket.IO messages aren't covered. Live Mode decides how to document them.
- ADR-0007 stays in force; this builds on it.
