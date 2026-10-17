# rcl-core — agent instructions

rcl-core is Rollcall's host: the one server process, accounts and access, shared data such as teams, the CRG and OBS connections, and the admin web app for that data ([ADR-0016](../docs/decisions/0016-obs-producer-becomes-rollcall.md)). It hosts every rcl app as a module, itself included as module `core` ([ADR-0019](../docs/decisions/0019-rcl-apps-as-modules.md)): each app's routes below `/api/<id>/`, its Socket.IO namespaces below `/<id>`, and its web build at `/<id>/`. The installed apps are listed in `server/src/installed-apps.ts`.

These rules add to the repo-root [AGENTS.md](../AGENTS.md). Its hard rules apply here.

## Layout

```
rcl-core/
├── server/     @rollcall/core-server: the host (Fastify, Socket.IO, SQLite, OBS/CRG connections) and core's own module
├── web/        @rollcall/core-web: the admin React SPA, served at /core/
├── contract/   @rollcall/core-contract: Zod schemas and types for /api/core, used as TypeScript source (no build step)
└── CHANGELOG.md  rcl-core's release notes: add a line under Unreleased for each user-visible change
```

## Commands

Run from the repo root.

| Command | What it does |
|---|---|
| `yarn workspace @rollcall/core-server start` | Server alone. Listens on `ROLLCALL_HOST`:`ROLLCALL_PORT` (default `0.0.0.0:5580`), data in `ROLLCALL_DATA_DIR` (default `data/` at the repo root, git-ignored), rcl-core's web build from `ROLLCALL_WEB_DIR` (default `rcl-core/web/dist/`) and the Producer app's from `rcl-producer/web/dist/`; set `ROLLCALL_API_DOCS=1` to serve the API explorer at `/docs`; the OBS overlay is at `/producer/overlay`. It refuses to start while an old `OBS_PRODUCER_*` setting is set |
| `yarn workspace @rollcall/core-web dev` | The front door: Vite on port 5173, serving `/core/`, redirecting `/` there, and passing `/api`, `/socket.io` and `/docs` to `ROLLCALL_DEV_SERVER` (default `http://localhost:5580`) and `/producer` to the Producer app's Vite on port 5174 |
| `yarn workspace @rollcall/core-server db:generate --name <change>` | Generate a Drizzle migration after editing `server/src/db/schema.ts`. Migrations run automatically at startup |
| `yarn workspace @rollcall/core-server reset-password <username>` | On the server machine: give a locked-out user (usually the only Admin) a temporary password, forcing a new one at their next login. Uses `ROLLCALL_DATA_DIR` like the server, and refuses a folder with no `rollcall.db` |
