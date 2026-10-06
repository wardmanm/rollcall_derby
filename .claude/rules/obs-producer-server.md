---
paths:
  - "obs-producer/apps/server/**"
---
# obs-producer server (`obs-producer/apps/server/`)

- **Hard rules 1–5** in `obs-producer/AGENTS.md` apply here:
  - CRG is listen-only (ADR-0005).
  - The server is the hub and works offline (ADR-0004).
  - Authorization happens on the server (ADR-0008).
- **TypeScript runs directly on Node (ADR-0013):** `.ts` import extensions, erasable syntax only, no build step.
- **Routes go in `buildApp()`** (`src/app.ts`) so `app.inject()` can test them. Database, Socket.IO and listening are wired in `startServer()` (`src/server.ts`).
- **Routes declare their schemas** (ADR-0007, ADR-0014).
  - Use `fastify.withTypeProvider<ZodTypeProvider>()`.
  - Give every `/api` route `schema: { tags, summary, body?, params?, response: { <status>: Schema, ...ERROR_RESPONSES } }`, with schemas from `@obs-producer/shared`.
  - Fastify validates and serializes with them, so don't parse bodies by hand.
  - Socket payloads are validated with shared schemas too.
- **Every `/api` route checks the caller** (hard rule 5).
  - Give it `preValidation: requireUser` or `requireRole(...)` (preValidation, so the caller is checked before the body) from `src/auth/guard.ts`.
  - If anyone may call it, add it to `PUBLIC_API_ROUTES` in the same file instead.
  - Only `me`, `password` and `logout` use `requireSession`.
  - The route inventory test (`src/auth/route-inventory.test.ts`) fails CI otherwise.
- **Socket.IO:** the default namespace `/` requires a session. `/overlay` is public until output token URLs arrive.
- **Database changes:**
  1. Edit `src/db/schema.ts`.
  2. Run `yarn workspace @obs-producer/server db:generate --name <change>`.
  3. Commit the migration.
  4. New entities also update `obs-producer/docs/architecture/data-model.md`.
- **Keep these in sync in the same change:**
  - `obs-producer/docs/architecture/README.md`
  - `obs-producer/docs/architecture/integrations/*.md` (when touching OBS or CRG code)
  - the feature page under `obs-producer/docs/features/` for any behavior you change
