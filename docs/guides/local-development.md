---
title: Local development
---
# Local development

How to get from a fresh clone to Rollcall running on your machine, and how to work on it day to day. Commands run from the repo root unless a step says otherwise. Every command is also listed in [AGENTS.md](../../AGENTS.md#commands) and each app's AGENTS.md, e.g. [rcl-core/AGENTS.md](../../rcl-core/AGENTS.md#commands).

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | ≥ 24.7 (LTS); `.nvmrc` says `24` | Runs the server directly from TypeScript ([ADR-0013](../decisions/0013-run-typescript-natively-on-node.md)); 24.7 added the built-in argon2 used for passwords |
| **Corepack** | Any recent version | Supplies the exact Yarn version the project pins |
| **Git** | Any recent version | |

**Yarn 4, not Yarn classic.** `package.json` pins `"packageManager": "yarn@4.x"`. Yarn classic (1.x) refuses to run in this project, and Corepack supplies the right version automatically.
- **Node 24** includes Corepack: run `corepack enable` once.
- **Node 25 and later** don't include it, so install it first. If Yarn classic is installed globally with npm, remove it, because it would shadow Corepack's `yarn`:

  ```bash
  npm uninstall -g yarn      # only if `yarn --version` prints 1.x
  npm install -g corepack
  corepack enable
  ```

With nvm, each Node version has its own global packages, so repeat this for each Node version you use.

## First run

```bash
git clone git@github.com:wardmanm/rollcall_derby.git
cd rollcall_derby
yarn --version                                            # should print 4.x; if it prints 1.x, see Prerequisites
yarn install                                              # all workspaces
yarn workspace @rollcall/e2e playwright install chromium   # once per machine, for the end-to-end tests
yarn check                                                # everything should pass on a fresh clone
```

## Running the app

### Development (hot reload)

```bash
yarn dev
```

This starts three processes:
- **the server** on port 5580, restarting when its code changes;
- **rcl-core's Vite dev server** on port 5173, the front door. It serves rcl-core's web app at `/core/`, redirects `/` there, passes `/producer` on to the Producer app's Vite, and passes `/api`, `/socket.io` and `/docs` to the server. The browser only ever talks to port 5173;
- **the Producer app's Vite dev server** on port 5174, reached through the front door.

Each Vite server reloads the browser when its web code changes, through the front door too.

Then open:
- **Admin app:** `http://localhost:5173`, which goes to `/core/`. On a fresh data folder it opens first-run setup: create the first Admin there. The header badge shows `Server v…` once the server answers.
- **Producer app:** `http://localhost:5173/producer/`. It asks you to sign in first, like every app but the OBS overlay.
- **OBS overlay:** `http://localhost:5173/producer/overlay`. A small card appears over a transparent page.
- **API explorer:** `http://localhost:5173/docs`. See [Trying the API](#trying-the-api).

Stop them all with Ctrl-C.

### Production (what runs at a venue)

```bash
yarn build    # every web app: rcl-core/web/dist/ and rcl-producer/web/dist/ (with the overlay)
yarn start    # the server, which also serves the builds
```

Everything is on one port:
- **Admin app:** `http://localhost:5580`, which goes to `/core/`
- **Producer app:** `http://localhost:5580/producer/`
- **OBS overlay:** `http://localhost:5580/producer/overlay`
- **Health check:** `http://localhost:5580/api/core/health`

The server listens on every network interface, so other devices on the venue network can use `http://<this machine's IP>:5580`.

### Server settings

The server reads these environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `ROLLCALL_HOST` | `0.0.0.0` | Interface to listen on (`127.0.0.1` keeps it to this machine) |
| `ROLLCALL_PORT` | `5580` | HTTP, API and Socket.IO port |
| `ROLLCALL_DATA_DIR` | `data/` | SQLite database and uploaded media (git-ignored) |
| `ROLLCALL_WEB_DIR` | `rcl-core/web/dist/` | rcl-core's web build, served at `/core/`; skipped if it doesn't exist. The Producer app's build is always `rcl-producer/web/dist/` |
| `ROLLCALL_DEV_SERVER` | `http://localhost:5580` | Where the Vite dev servers send `/api`, `/socket.io` and `/docs` |
| `ROLLCALL_API_DOCS` | off (`yarn dev` turns it on) | Serve the API explorer at `/docs`: `1` or `true` for on, `0` or `false` for off ([ADR-0014](../decisions/0014-route-schemas-and-api-explorer.md)) |

The names are prefixed because shells such as zsh already set `HOST` to the machine's name.

### Trying the API

`yarn dev` also serves an API explorer (Swagger UI) at `http://localhost:5173/docs`. It lists every `/api` route with its request and response shapes, generated from the shared schemas, so it's always current ([ADR-0014](../decisions/0014-route-schemas-and-api-explorer.md)).

1. Open `POST /api/core/auth/login`, choose **Try it out**, and log in. On a fresh data folder, create the first Admin with `POST /api/core/setup` first. Each rcl app's routes are below `/api/<app>/`.
2. Your browser keeps the session cookie, so every later call runs as you, limited by your role.

On a venue server the explorer is off. To turn it on, start the server with `ROLLCALL_API_DOCS=1` and open `http://<server>:5580/docs`.

### Storybook

`yarn storybook` shows the shared components, one at a time, outside the apps ([ADR-0015](../decisions/0015-storybook-admin-and-overlay-kept-apart.md)). It opens `http://localhost:6006`, the admin components: the web SDK's, and rcl-core's own once it has some. The Producer app's overlay components appear in the same window under **Overlay**, served from port 6007.

- **Admin stories:** switch light and dark from the toolbar.
- **Overlay stories:** switch the **Theme** (sample themes until the Theme Builder) and the **Backdrop** behind the transparent overlay.
- Ctrl-C stops both. If a port is still in use, stop that process: `lsof -nP -iTCP:6007 -sTCP:LISTEN`.

## Working on the code

### Where things live

The workspaces and what goes where are in [AGENTS.md](../../AGENTS.md#layout). Each code area also has a short agent rule in `.claude/rules/` at the repo root, pointing to the wiki pages and ADRs that govern it. Those rules are a quick map for humans too.

### TypeScript rules

These follow from running TypeScript directly on Node ([ADR-0013](../decisions/0013-run-typescript-natively-on-node.md)):
- **No build step for the server.**
- **Relative imports end in `.ts` or `.tsx`:** `import { x } from './health.ts'`.
- **No `enum`, `namespace` or constructor parameter properties.** Use `as const` objects and unions.
- **Workspace packages are imported by name:** `import { APP_NAME } from '@rollcall/core-contract'`.

### Database changes

1. Edit `rcl-core/server/src/db/schema.ts`.
2. Run `yarn workspace @rollcall/core-server db:generate --name <short-change-name>`.
3. Commit the generated SQL in `rcl-core/server/drizzle/` with the schema change.

Migrations run automatically when the server starts. To start from an empty database, stop the server and delete `data/`.

Upgrading from OBS Producer? Rollcall is a new clone, so copy your old checkout's `obs-producer/data/` folder to `data/` here (or point `ROLLCALL_DATA_DIR` at it). The server then refuses to start while `data/` holds only `obs-producer.db`: stop it and rename that file, plus any `-wal` and `-shm` files next to it, to `rollcall.db`, or delete it to start fresh.

### Adding dependencies

- **Add to the workspace that uses the package:** `yarn workspace @rollcall/core-web add <pkg>`, or `add -D` for development-only tools.
- **Check the version first:** we use the latest stable versions. Run `npm view <pkg> version`.
- **New releases are held for 24 hours:** Yarn quarantines versions published in the last day, as a guard against compromised packages. An install that fails with `YN0016 … quarantined` means that version is too new. Use the newest version outside that window and `yarn up` once it clears.
- **TypeScript and Oxlint's type checker move together:** `typescript` and `oxlint-tsgolint` must be on the same TypeScript 7.x. Upgrade them together.

### Editor setup (VS Code)

- **TypeScript 7:** install Microsoft's native TypeScript extension (search the marketplace for "TypeScript Native"). Without it, the editor uses an older TypeScript and its errors may differ from `yarn typecheck`.
- **Oxlint:** the Oxc extension shows lint errors as you type. The config is `.oxlintrc.json`.
- **Prettier:** the Prettier extension, with format on save. The config is `.prettierrc.json`.

## Before you commit

1. Run `yarn check`: type-check, lint, format check, unit tests, script tests and docs lint. `yarn format` fixes formatting.
2. If you changed something users see, run `yarn test:e2e` too.
3. Update the wiki and `CHANGELOG.md` in the same change. See the [wiki guide](../wiki-guide.md) and [AGENTS.md](../../AGENTS.md#definition-of-done).

How tests are organized is in [Testing](testing.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `This project's package.json defines "packageManager": "yarn@4…". However the current global version of Yarn is 1.22…` | Yarn classic is answering. Follow the Corepack steps in [Prerequisites](#prerequisites) |
| `EADDRINUSE`, or `Port … is already in use`, on 5580, 5173 or 5174 | Another copy is still running. Find it with `lsof -nP -iTCP:5580 -sTCP:LISTEN` (or that port) and stop it |
| `YN0016 … quarantined` during `yarn add` / `yarn up` | That version was published less than 24 hours ago. Pick the previous one for now |
| Admin badge says **Server unreachable** in dev | Start the server too (`yarn dev` starts both), or point `ROLLCALL_DEV_SERVER` at it |
| Overlay page is blank | It stays empty until the server answers over Socket.IO. Check `/api/core/health` on the same host |
| Locked out: the only Admin forgot their password | On the server machine, run `yarn workspace @rollcall/core-server reset-password <username>`. It prints a temporary password; log in with it and choose a new one |
