---
title: Local development
---
# Local development

How to get from a fresh clone to OBS Producer running on your machine, and how to work on it day to day. Commands run from `obs-producer/` unless a step says otherwise. Every command is also listed in [AGENTS.md](../../AGENTS.md#commands).

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
git clone git@github.com:wardmanm/GROBS.git
cd GROBS/obs-producer
yarn --version                                            # should print 4.x; if it prints 1.x, see Prerequisites
yarn install                                              # all workspaces
yarn workspace @obs-producer/e2e playwright install chromium   # once per machine, for the end-to-end tests
yarn check                                                # everything should pass on a fresh clone
```

## Running the app

### Development (hot reload)

```bash
yarn dev
```

This starts two processes:
- **the server** on port 5580, restarting when its code changes;
- **the Vite dev server** on port 5173, reloading the browser when web code changes. It passes `/api`, `/socket.io` and `/docs` through to the server, so the browser only ever talks to port 5173.

Then open:
- **Admin app:** `http://localhost:5173`. The header badge shows `Server v…` once the server answers.
- **OBS overlay:** `http://localhost:5173/overlay`. A small card appears over a transparent page.
- **API explorer:** `http://localhost:5173/docs`. See [Trying the API](#trying-the-api).

Stop both with Ctrl-C.

### Production (what runs at a venue)

```bash
yarn build    # web app + overlay into apps/web/dist/
yarn start    # the server, which also serves the build
```

Everything is on one port:
- **Admin app:** `http://localhost:5580`
- **Overlay:** `http://localhost:5580/overlay`
- **Health check:** `http://localhost:5580/api/health`

The server listens on every network interface, so other devices on the venue network can use `http://<this machine's IP>:5580`.

### Server settings

The server reads these environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `OBS_PRODUCER_HOST` | `0.0.0.0` | Interface to listen on (`127.0.0.1` keeps it to this machine) |
| `OBS_PRODUCER_PORT` | `5580` | HTTP, API and Socket.IO port |
| `OBS_PRODUCER_DATA_DIR` | `obs-producer/data/` | SQLite database and uploaded media (git-ignored) |
| `OBS_PRODUCER_WEB_DIR` | `apps/web/dist/` | Web build to serve; skipped if it doesn't exist |
| `OBS_PRODUCER_DEV_SERVER` | `http://localhost:5580` | Where the Vite dev server sends `/api`, `/socket.io` and `/docs` |
| `OBS_PRODUCER_API_DOCS` | off (`yarn dev` turns it on) | Serve the API explorer at `/docs`: `1` or `true` for on, `0` or `false` for off ([ADR-0014](../decisions/0014-route-schemas-and-api-explorer.md)) |

The names are prefixed because shells such as zsh already set `HOST` to the machine's name.

### Trying the API

`yarn dev` also serves an API explorer (Swagger UI) at `http://localhost:5173/docs`. It lists every `/api` route with its request and response shapes, generated from the shared schemas, so it's always current ([ADR-0014](../decisions/0014-route-schemas-and-api-explorer.md)).

1. Open `POST /api/auth/login`, choose **Try it out**, and log in. On a fresh data folder, create the first Admin with `POST /api/setup` first.
2. Your browser keeps the session cookie, so every later call runs as you, limited by your role.

On a venue server the explorer is off. To turn it on, start the server with `OBS_PRODUCER_API_DOCS=1` and open `http://<server>:5580/docs`.

## Working on the code

### Where things live

The workspaces and what goes where are in [AGENTS.md](../../AGENTS.md#layout). Each code area also has a short agent rule in `.claude/rules/` at the repo root, pointing to the wiki pages and ADRs that govern it. Those rules are a quick map for humans too.

### TypeScript rules

These follow from running TypeScript directly on Node ([ADR-0013](../decisions/0013-run-typescript-natively-on-node.md)):
- **No build step for the server.**
- **Relative imports end in `.ts` or `.tsx`:** `import { x } from './health.ts'`.
- **No `enum`, `namespace` or constructor parameter properties.** Use `as const` objects and unions.
- **Workspace packages are imported by name:** `import { APP_NAME } from '@obs-producer/shared'`.

### Database changes

1. Edit `apps/server/src/db/schema.ts`.
2. Run `yarn workspace @obs-producer/server db:generate --name <short-change-name>`.
3. Commit the generated SQL in `apps/server/drizzle/` with the schema change.

Migrations run automatically when the server starts. To start from an empty database, stop the server and delete `obs-producer/data/`.

### Adding dependencies

- **Add to the workspace that uses the package:** `yarn workspace @obs-producer/web add <pkg>`, or `add -D` for development-only tools.
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
| `EADDRINUSE` on 5580 or 5173 | Another copy is still running. Find it with `lsof -nP -iTCP:5580 -sTCP:LISTEN` and stop it |
| `YN0016 … quarantined` during `yarn add` / `yarn up` | That version was published less than 24 hours ago. Pick the previous one for now |
| Admin badge says **Server unreachable** in dev | Start the server too (`yarn dev` starts both), or point `OBS_PRODUCER_DEV_SERVER` at it |
| Overlay page is blank | It stays empty until the server answers over Socket.IO. Check `/api/health` on the same host |
| Locked out: the only Admin forgot their password | On the server machine, run `yarn workspace @obs-producer/server reset-password <username>`. It prints a temporary password; log in with it and choose a new one |
