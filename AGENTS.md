# OBS Producer — agent instructions

OBS Producer is a web app hosted on the local network for producing roller derby streams:
- **Builders** for teams, themes, and overlay screens. Each screen is loaded into OBS as a browser source.
- **Live Mode** for events, games, and tracks running at the same time, with producer dashboards that preview and control what's on air.
- **Integrations** that control OBS and *listen* to the CRG scoreboard.

**Status:** foundation in place (milestone `obs-producer v0.1.0`): server, web app shell, OBS overlay page, tooling, CI and the release pipeline. Features start with Phase 1 on the [roadmap](docs/product/roadmap.md). To run it locally, see [local development](docs/guides/local-development.md).

These rules apply to AI agents and human contributors alike. They add to the repo-root [AGENTS.md](../AGENTS.md).

## Start here

- [Wiki home](docs/README.md) — everything about the product, features, architecture and decisions.
- [Wiki guide](docs/wiki-guide.md) — how the wiki is organized and maintained. Read it before editing docs.
- [Glossary](docs/product/glossary.md) — use these terms exactly. A **Screen** (ours) is not an OBS **Scene**. An **Overlay Component** is not a React component.

## Hard rules

These must never be broken. Each one is copied word for word from the ADR in brackets, and that ADR is the canonical wording. If you change a rule, change the ADR (by superseding it) and this list together.

1. **CRG is listen-only.** Outbound WebSocket messages to CRG are exactly `Register` and `Ping`, sent through the single CRG send wrapper. The only HTTP request allowed is `GET /SaveJSON/`. Never send `Set`, `StartNewGame` or command keys. Never call `/Load/*` or `/Media/*`. ([ADR-0005](docs/decisions/0005-crg-is-listen-only.md))
2. **No scoring, no score displays.** CRG owns scoring, clocks and its own scoreboard overlay. We build rosters and custom game-data displays. ([ADR-0005](docs/decisions/0005-crg-is-listen-only.md))
3. **The server is the hub.** Browsers (dashboards, overlays) never connect to OBS or CRG directly. Secrets such as the OBS password never reach a browser. ([ADR-0004](docs/decisions/0004-server-is-the-hub.md))
4. **Works offline at the venue.** Nothing at runtime depends on the internet: no CDNs, no hosted fonts, no cloud APIs. The server serves every asset. ([ADR-0004](docs/decisions/0004-server-is-the-hub.md))
5. **Authorization happens on the server.** Every API route and socket event checks the caller's role. Hiding UI is not access control. ([ADR-0008](docs/decisions/0008-auth-rbac-and-overlay-access.md))
6. **Server data lives in RTK Query, never copied into slices.** Overlay components are presentational: they get data through props and never read the admin store. ([ADR-0003](docs/decisions/0003-client-state-with-redux-toolkit.md), [ADR-0006](docs/decisions/0006-one-overlay-renderer-css-variable-theming.md))
7. **Releases are deliberate.** A release is cut only by a person running the release workflow and approving it. Agents never approve a release deployment, and never create release tags or GitHub Releases or start the release workflow (even as a dry run) unless the user explicitly asks them to for a specific version. ([ADR-0010](docs/decisions/0010-deliberate-releases-patch-tracking.md))

## Stack

Details and rationale are in the [ADRs](docs/decisions/README.md).

- TypeScript 7 (strict) monorepo with Yarn 4 workspaces, Node ≥ 24.7 (the 24 LTS line) ([ADR-0012](docs/decisions/0012-typescript-7-and-oxlint.md))
- Web: Vite + React SPA, React Router, Mantine for admin UI, Redux Toolkit + RTK Query ([ADR-0012](docs/decisions/0012-typescript-7-and-oxlint.md), [ADR-0003](docs/decisions/0003-client-state-with-redux-toolkit.md))
- Server: Fastify + Socket.IO; SQLite via Drizzle ([ADR-0012](docs/decisions/0012-typescript-7-and-oxlint.md), [ADR-0004](docs/decisions/0004-server-is-the-hub.md))
- Contract: Zod schemas in `packages/shared` ([ADR-0007](docs/decisions/0007-shared-zod-contract.md))
- TypeScript runs natively on Node with no build step: erasable syntax only (no `enum`/`namespace`), `.ts` extensions on relative imports ([ADR-0013](docs/decisions/0013-run-typescript-natively-on-node.md))
- Lint and format: Oxlint with type-aware rules (not ESLint), Prettier ([ADR-0012](docs/decisions/0012-typescript-7-and-oxlint.md))
- Tests: Vitest, React Testing Library, Playwright

## Layout

```
obs-producer/
├── docs/              the wiki (living pages + ADRs)
├── design-docs/       dated specs and plans (working papers, not maintained after use)
├── CHANGELOG.md       release notes; add a line under Unreleased for user-visible changes
├── scripts/           check-docs.mjs (docs lint), release.mjs (release helper) + tests
├── apps/server/       @obs-producer/server: Fastify API, Socket.IO, OBS/CRG connections, SQLite
├── apps/web/          @obs-producer/web: React SPA (admin + dashboards) and the overlay entry
├── packages/shared/   @obs-producer/shared: Zod schemas and types, used as TypeScript source (no build step)
├── package.json       Yarn 4 workspaces root (packageManager pins the Yarn version)
└── tsconfig.base.json strict settings every workspace extends
```

## Commands

**One-time setup:** Yarn 4 comes from Corepack, pinned by `packageManager` in `package.json`. Yarn classic (1.x) refuses to run here. Node 25+ doesn't bundle Corepack, so run `npm install -g corepack && corepack enable` (after `npm uninstall -g yarn` if Yarn classic is installed globally). For end-to-end tests, also run `yarn workspace @obs-producer/e2e playwright install chromium` once.

Run from `obs-producer/`:

| Command | What it does |
|---|---|
| `yarn install` | Install dependencies for all workspaces (CI uses `yarn install --immutable`) |
| `yarn check` | **Run before every commit:** typecheck, lint, format check, unit tests, script tests and docs lint |
| `yarn dev` | Server (restarts on changes) and Vite dev server together; open `http://localhost:5173`. The API explorer is at `/docs` ([ADR-0014](docs/decisions/0014-route-schemas-and-api-explorer.md)) |
| `yarn build` / `yarn start` | Production build of the web app (admin app + OBS overlay), then run the server that serves it |
| `yarn typecheck` | Type-check every workspace with TypeScript 7 |
| `yarn lint` | Oxlint with type-aware rules, React hooks and jsx-a11y rules ([ADR-0012](docs/decisions/0012-typescript-7-and-oxlint.md)). Config: `.oxlintrc.json` |
| `yarn format` / `yarn format:check` | Prettier (Markdown is excluded; the docs lint covers it) |
| `yarn test` | Vitest: every workspace's `*.test.ts(x)` next to the code (Node for server/shared, jsdom for web) |
| `yarn test:e2e` | Playwright end-to-end tests in `e2e/tests/`: builds the app and runs the real server on port 5590 |
| `yarn test:scripts` | Tests for the docs lint and release helper (`node --test "scripts/*.test.mjs"`) |
| `yarn docs:check` | Docs lint (`node scripts/check-docs.mjs`); add `--fix`, `--questions` or `--next-adr` as needed |
| `yarn workspace @obs-producer/server start` | Server alone. Listens on `OBS_PRODUCER_HOST`:`OBS_PRODUCER_PORT` (default `0.0.0.0:5580`), data in `OBS_PRODUCER_DATA_DIR` (default `obs-producer/data/`, git-ignored), web build from `OBS_PRODUCER_WEB_DIR` (default `apps/web/dist/`); set `OBS_PRODUCER_API_DOCS=1` to serve the API explorer at `/docs`; the overlay is at `/overlay` |
| `yarn workspace @obs-producer/web dev` | Vite alone on port 5173, proxying `/api` and `/socket.io` to `OBS_PRODUCER_DEV_SERVER` (default `http://localhost:5580`) |
| `yarn workspace @obs-producer/server db:generate --name <change>` | Generate a Drizzle migration after editing `apps/server/src/db/schema.ts`. Migrations run automatically at startup |
| `yarn workspace @obs-producer/server reset-password <username>` | On the server machine: give a locked-out user (usually the only Admin) a temporary password, forcing a new one at their next login. Uses `OBS_PRODUCER_DATA_DIR` like the server |
| `node scripts/release.mjs prepare\|check\|notes <version>` | Release helper ([releasing](docs/guides/releasing.md)); `tag-absent\|milestone\|issues` are used by the release workflow |

**Upgrading TypeScript:** `oxlint-tsgolint` embeds its own TypeScript 7.x. Upgrade it together with `typescript` so linting and `tsc` agree on the types.

## Documentation rules

The full process is in the [wiki guide](docs/wiki-guide.md).

1. **Docs change in the same commit as the behavior they describe.** A behavior change that leaves its feature or architecture page untouched is incomplete.
2. **One home per fact.** See [where things go](docs/wiki-guide.md#where-things-go). Link to the home instead of copying it.
3. **Decisions become ADRs** in `docs/decisions/`. Number them with `--next-adr`, start from `docs/templates/adr.md`, and run `--fix` to add them to the index. Never rewrite an accepted ADR; supersede it with a new one.
4. **Status lives only in frontmatter.** After changing a feature's or ADR's frontmatter, run `--fix`. Never hand-edit the generated tables.
5. **Unresolved questions go in the page's `## Open questions` section.** When one is answered, move the answer into the page body (plus an ADR if it's a decision) and delete the question.
6. **Use the glossary's terms.** Add any new domain term to the glossary in the same change.

## Definition of done

- Behavior matches its feature page, and the page is updated if behavior changed.
- Tests are added or updated, and `yarn check` passes. Changes to what users see also pass `yarn test:e2e`.
- User-visible changes have a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), ending with the issue number.
- Every hard rule above still holds.
