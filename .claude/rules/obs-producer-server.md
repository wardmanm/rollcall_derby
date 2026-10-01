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
- **Validate every request, response and socket payload** with a schema from `@obs-producer/shared` (ADR-0007).
- **Database changes:**
  1. Edit `src/db/schema.ts`.
  2. Run `yarn workspace @obs-producer/server db:generate --name <change>`.
  3. Commit the migration.
  4. New entities also update `obs-producer/docs/architecture/data-model.md`.
- **Keep these in sync in the same change:**
  - `obs-producer/docs/architecture/README.md`
  - `obs-producer/docs/architecture/integrations/*.md` (when touching OBS or CRG code)
  - the feature page under `obs-producer/docs/features/` for any behavior you change
