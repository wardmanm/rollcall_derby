---
paths:
  - "rcl-core/server/**"
---
# rcl-core server (`rcl-core/server/`)

- **Hard rules 1–5** in `AGENTS.md` apply here:
  - CRG is listen-only (ADR-0005).
  - The server is the hub and works offline (ADR-0004).
  - Authorization happens on the server (ADR-0018).
- **TypeScript runs directly on Node (ADR-0013):** `.ts` import extensions, erasable syntax only, no build step.
- **Routes go in `buildApp()`** (`src/app.ts`) so `app.inject()` can test them. Database, Socket.IO and listening are wired in `startServer()` (`src/server.ts`).
- **Routes declare their schemas** (ADR-0007, ADR-0014).
  - Use `fastify.withTypeProvider<ZodTypeProvider>()`.
  - Give every `/api` route `schema: { tags, summary, body?, params?, response: { <status>: Schema, ...ERROR_RESPONSES } }`, with schemas from `@rollcall/core-contract`.
  - Fastify validates and serializes with them, so don't parse bodies by hand.
  - Socket payloads are validated with shared schemas too.
- **Every `/api` route declares who may call it** (hard rule 5, ADR-0018).
  - Put it in `config.access`: `{ public: '<reason>' }`, `{ signedIn: true }` or `{ permission: 'core:<action>' }`. Only `me`, `password` and `logout` add `allowPendingPasswordChange: true`.
  - A new permission goes in `CORE_PERMISSIONS` (`src/auth/permissions.ts`) and in the table on `docs/features/users-and-access.md`. A test keeps the two in step.
  - The server won't start with a missing or wrong declaration. Don't write your own role checks; read the caller from `request.principal`.
  - A handler that awaits before it writes calls `request.recheckAccess()` after the await.
- **Socket.IO:** create namespaces only with `realtime.namespace(name, { access })` in `src/realtime.ts`. `/` refuses everyone. `/overlay` is public until output token URLs arrive.
- **Database changes:**
  1. Edit `src/db/schema.ts`.
  2. Run `yarn workspace @rollcall/core-server db:generate --name <change>`.
  3. Commit the migration.
  4. New entities also update `docs/architecture/data-model.md`.
- **Keep these in sync in the same change:**
  - `docs/architecture/README.md`
  - `docs/architecture/integrations/*.md` (when touching OBS or CRG code)
  - the feature page under `docs/features/` for any behavior you change
