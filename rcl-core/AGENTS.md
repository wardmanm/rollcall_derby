# rcl-core — agent instructions

rcl-core is Rollcall's host: the one server process, accounts and access, shared data such as teams, the CRG and OBS connections, and the admin web app for that data ([ADR-0016](../docs/decisions/0016-obs-producer-becomes-rollcall.md)). Until the split, it also holds the OBS overlay entry, which moves to rcl-producer.

These rules add to the repo-root [AGENTS.md](../AGENTS.md). Its hard rules apply here.

## Layout

```
rcl-core/
├── server/     @rollcall/core-server: Fastify API, Socket.IO, OBS/CRG connections, SQLite
├── web/        @rollcall/core-web: React SPA (admin + dashboards) and the OBS overlay entry
└── contract/   @rollcall/core-contract: Zod schemas and types, used as TypeScript source (no build step)
```

## Commands

Run from the repo root.

| Command | What it does |
|---|---|
| `yarn workspace @rollcall/core-server start` | Server alone. Listens on `ROLLCALL_HOST`:`ROLLCALL_PORT` (default `0.0.0.0:5580`), data in `ROLLCALL_DATA_DIR` (default `data/` at the repo root, git-ignored), web build from `ROLLCALL_WEB_DIR` (default `rcl-core/web/dist/`); set `ROLLCALL_API_DOCS=1` to serve the API explorer at `/docs`; the overlay is at `/overlay`. It refuses to start while an old `OBS_PRODUCER_*` setting is set |
| `yarn workspace @rollcall/core-web dev` | Vite alone on port 5173, proxying `/api`, `/socket.io` and `/docs` to `ROLLCALL_DEV_SERVER` (default `http://localhost:5580`) |
| `yarn workspace @rollcall/core-server db:generate --name <change>` | Generate a Drizzle migration after editing `server/src/db/schema.ts`. Migrations run automatically at startup |
| `yarn workspace @rollcall/core-server reset-password <username>` | On the server machine: give a locked-out user (usually the only Admin) a temporary password, forcing a new one at their next login. Uses `ROLLCALL_DATA_DIR` like the server, and refuses a folder with no `rollcall.db` |
