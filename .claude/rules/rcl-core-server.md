---
paths:
  - "rcl-core/server/**"
---
# rcl-core server (`rcl-core/server/`)

- **Hard rules 1–5** in `AGENTS.md` apply here:
  - CRG is listen-only (ADR-0005).
  - The server is the hub and works offline (ADR-0019).
  - Authorization happens on the server (ADR-0018).
- **TypeScript runs directly on Node (ADR-0013):** `.ts` import extensions, erasable syntax only, no build step.
- **This server hosts every rcl app as a module** (ADR-0019). `src/apps.ts` runs the startup checks and migrations, `src/app.ts` mounts each app's routes below `/api/<id>/`, and `src/realtime.ts` its namespaces. Database, Socket.IO and listening are wired in `startServer()` (`src/server.ts`).
  - Installed apps are listed in `src/installed-apps.ts`, the only file that may import an app's server (`scripts/check-boundaries.test.mjs`).
  - Core's own routes go in its module, `src/core-app.ts`, with paths relative to `/api/core` (`/users`, not `/api/core/users`), so `app.inject()` can test them.
- **Routes declare their schemas** (ADR-0019, ADR-0014).
  - Use `fastify.withTypeProvider<ZodTypeProvider>()`.
  - Give every `/api` route `schema: { tags, summary, body?, params?, response: { <status>: Schema, ...ERROR_RESPONSES } }`, with schemas from `@rollcall/core-contract`. Tags are named `core/<area>`.
  - Fastify validates and serializes with them, so don't parse bodies by hand.
  - Socket payloads are validated with shared schemas too.
- **Every `/api` route declares who may call it** (hard rule 5, ADR-0018).
  - Put it in `config.access`: `{ public: '<reason>' }`, `{ signedIn: true }` or `{ permission: 'core:<action>' }`. Only `me` and `password` add `allowPendingPasswordChange: true`; `logout` is public, so it always works.
  - A new permission goes in `CORE_PERMISSIONS` (`src/auth/permissions.ts`) and in the table on `docs/features/users-and-access.md`. A test keeps the two in step.
  - The server won't start with a missing or wrong declaration. Don't write your own role checks; read the caller from `request.principal`.
  - A handler that awaits before it writes calls `request.recheckAccess()` after the await.
  - Callers are signed-in sessions or API keys (ADR-0020). Read the person with `userOf(request.principal)`, never `request.principal.user`.
  - A new permission sets `peopleOnly: true` if a leaked API key holding it could take over accounts or make more keys.
- **Uploaded images and fonts** go through `src/media.ts` (ADR-0022): `saveMedia` keeps only real PNG, JPEG or WebP bytes, or with `fontTypeOf` real WOFF2, WOFF, TTF or OTF bytes, and `removeMedia` deletes the row and file once nothing points at them.
  - A new column that refers to media goes in `MEDIA_REFERENCES` (`src/db/schema.ts`), or the startup sweep deletes its files.
  - `/media/<id>` is public, outside `/api`, and `media` is a reserved app id.
  - Upload routes take the raw body in a plugin of their own, with their content types and a 5 MB `bodyLimit`, through `registerUploads` (`src/routes/uploads.ts`).
- **Bundled fonts** are in `fonts/`, listed in `src/fonts/bundled.ts` and served at `/fonts/<folder>/<file>` to anyone, so `fonts` is a reserved app id too.
- **Socket.IO:** each app creates its namespaces with `rt.namespace(name, { access })` in its module's `realtime()`, at or below `/<id>`. `/` refuses everyone, and namespaces take sessions only, never API keys.
- **Database changes:**
  1. Edit `src/db/schema.ts`.
  2. Run `yarn workspace @rollcall/core-server db:generate --name <change>`.
  3. Commit the migration.
  4. New entities also update `docs/architecture/data-model.md`.
- **Keep these in sync in the same change:**
  - `docs/architecture/README.md`
  - `docs/architecture/integrations/*.md` (when touching OBS or CRG code)
  - the feature page under `docs/features/` for any behavior you change
