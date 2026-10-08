# Rollcall: move obs-producer into a new repo and split it into rcl-core + rcl-producer

**Status:** approved by Mike on 2026-10-07. Phases 0–2 are planned in [the move plan](../plans/2026-10-07-rollcall-move.md).

## Context

obs-producer lives in the GROBS monorepo. It is becoming **Rollcall**, a suite of roller-derby production apps in the new private repo `wardmanm/rollcall_derby`, which is empty today. Apps are named `rcl-<app>`:

- **rcl-core** is the server. It connects to CRG and OBS and owns users, auth and shared data (teams, players, logos). Its GUI holds only data editors, plus setup, login, users and connections.
- **rcl-producer** is today's product: Theme Builder, Screen Builder, Overlay Components, dashboards, Live Mode and the OBS overlay page. It has **no server of its own**. Its server-side code runs inside core.

Core must organize endpoints per app and secure them for every kind of caller.

**Why now:** the code is still a foundation. There is an auth API, a health card and an overlay placeholder. OBS and CRG exist only in the docs. Splitting now costs little. After the builders land it would cost a lot.

### Decisions (made with Mike)

| Topic | Decision |
|---|---|
| Producer's server code | **App modules in core.** Each app ships a Fastify module that core mounts at `/api/<app>/…`, plus a web UI that core serves at `/<app>/`. One process, one port. |
| History | **Keep it.** Merge `feat/storybook` into GROBS `main`, import `obs-producer/` with `git filter-repo`, then restructure in normal PRs. |
| Callers to secure | Browser sessions, **OBS browser sources** (output tokens), **devices and scripts** (API keys), and **remote rcl apps** (a CORS allowlist plus bearer tokens). |
| Releases | **Per app.** Tags `rcl-core-v<semver>` and `rcl-producer-v<semver>`, with a CHANGELOG, milestones and release run for each. Producer declares the core versions it supports, and core checks them at startup. |
| Layout | **`rcl-*` folders at the root**, one Yarn 4 workspace, `@rollcall/` npm scope. |
| GROBS afterwards | Remove `obs-producer/` and leave a pointer. SICC stays. Closed issues, the `obs-producer-v0.1.0` tag and its release stay in GROBS. The open issue #15 transfers. |
| Private repo vs. release gate | **Private now, public before the first release.** GitHub's required-reviewer gate only works on public repos on Mike's plan. Phases 0–4 don't depend on it. |
| Boards | **#6 Rollcall - Core** and **#8 Rollcall - Producer**. #4 is closed and stays as history. |

## Target layout

```
rollcall_derby/
├── rcl-core/
│   ├── server/     @rollcall/core-server     host process + the "core" app module (auth, users, later teams/CRG/OBS)
│   ├── web/        @rollcall/core-web        Mantine admin GUI at /core/
│   ├── contract/   @rollcall/core-contract   Zod schemas for /api/core and the /core namespace (was packages/shared)
│   ├── AGENTS.md  CLAUDE.md  CHANGELOG.md
├── rcl-producer/
│   ├── server/     @rollcall/producer-server app module mounted by core
│   ├── web/        @rollcall/producer-web    Mantine GUI at /producer/ + Mantine-free overlay entry
│   ├── contract/   @rollcall/producer-contract
│   ├── AGENTS.md  CLAUDE.md  CHANGELOG.md
├── packages/
│   ├── app-sdk/    @rollcall/app-sdk         AppModule/AppContext/Access types and helpers (server side)
│   └── web-sdk/    @rollcall/web-sdk         shared shell, ServerStatus, SignInGate, RTK base API, Vite proxy helper
├── e2e/  docs/  design-docs/  scripts/  .github/  .claude/
└── package.json    workspaces listed explicitly (release.mjs rejects `rcl-*/*` globs)
```

**Dependency rules** (checked by `scripts/check-boundaries.test.mjs`):
- An app's server depends only on `app-sdk` and contract packages. It never depends on `core-server` or on another app's server.
- `core-server` depends on the app servers through an explicit list, `rcl-core/server/src/installed-apps.ts`. That is the only edge from core to an app, so there are no package cycles.

## Architecture

### URL scheme

| Path | What it is |
|---|---|
| `/` | 302 to `/core/` |
| `/core/`, `/api/core/*`, Socket.IO `/core` | Core GUI, API and live namespace |
| `/producer/`, `/api/producer/*`, Socket.IO `/producer` | Producer GUI, API and live namespace |
| `/producer/overlay[/<token>]` | OBS output page. Namespace `/producer/overlay` is public until output tokens arrive |
| `/docs` | One API explorer with tags grouped by app (`core/users`, …) |

- Login lives in core-web. `SignInGate` in web-sdk sends signed-out users to `/core/login?next=…`. `next` must start with `/` and not `//`.
- Unknown `/api/*` paths return `404 {error:'not_found'}` (a carry-over).

### AppModule (packages/app-sdk)

```ts
export interface AppModule {
  id: string;                 // 'producer' → /api/producer, /producer/, ns /producer…, perms 'producer:*', tables producer_*
  title: string; version: string;
  requiresCore: string;       // semver range from package.json "rollcall.requiresCore"
  permissions: readonly PermissionDef[];        // { key: 'producer:themes.edit', summary, roles: ['producer'] }
  migrationsFolder?: string;  // run with migrationsTable `__drizzle_migrations_<id>`
  web?: { dir: string; pages?: Record<string, string> };   // { overlay: 'overlay.html' }; index.html = SPA fallback
  register(api: FastifyInstance, ctx: AppContext): void | Promise<void>;  // already prefixed /api/<id>
  realtime?(rt: { namespace(name: `/${string}`, o: { access: Access }): Namespace }, ctx: AppContext): void;
}
export interface AppContext {
  log: FastifyBaseLogger; coreVersion: string;
  db<S extends Record<string, unknown>>(schema: S): BetterSQLite3Database<S>;   // same SQLite connection
  // added later: core data services (teams, players, logos), crg, obs, events
}
```

- **Core registers itself as module `core`**, using the same machinery.
- **Startup:**
  1. Run core's migrations. Core keeps the default migrations table, so existing databases still open.
  2. For each installed module, check that its id is unique and that `semver.satisfies(coreVersion, requiresCore)`. If either check fails, log a clear error, skip that module and keep core running.
  3. Run the module's migrations, then register its routes, namespaces and web dir.
- **Data ownership:**
  - App tables are prefixed `<id>_`, and a test enforces it.
  - There are no foreign keys across apps. Apps reach core data by ID through `ctx` services.
- `GET /api/core/apps` (signed in) feeds the app launcher on core's home page.
- A unit test asserts that every installed app accepts the current core version. Before 1.0, `^0.1.0` excludes 0.2.0, so bumping core's minor version is always a deliberate decision for producer too.

### Access model (replaces `PUBLIC_API_ROUTES`, `requireUser` and `requireRole`)

```ts
type Permission = `${string}:${string}`;     // 'core:users.manage'
type Access =
  | { public: string }                                      // reason, shown in /docs
  | { signedIn: true; allowPendingPasswordChange?: true }   // only me / password / logout
  | { permission: Permission };
// route: { config: { access: { permission: 'core:users.manage' } }, schema: {...} }
```

- **One central `onRoute` hook in the `/api` plugin:**
  - It throws at startup when an `/api` route has no `access`, or when its permission is undeclared or carries another app's prefix. Access is denied by default.
  - Otherwise it puts the guard first in `preValidation`.
- **Principal resolution.** `request.principal` is resolved in `onRequest` by a chain of resolvers.
  - **Built now:** `session`, the cookie session, keeping the Origin==Host CSRF check.
  - **Designed now, built later:** `apiKey` (bearer token, hashed at rest, Admin-managed, scoped to permissions; when present the cookie is ignored and the Origin check doesn't apply) and `outputToken` (a capability for one output, built with Live Mode). The **CORS allowlist** is also designed now: off by default, origins set by an Admin, bearer tokens only, never `credentials`.
- **Roles map to permission sets.** Each `PermissionDef` lists the roles it is granted to, and Admin holds every permission.
- **Socket.IO namespaces** are created only through a helper that requires `access`. The bare `/` namespace refuses every connection.
- **Inventory test, evolved** (`route-inventory.test.ts`):
  - Anonymous requests get 401 on every non-public route.
  - The public set is pinned in the test.
  - A signed-in user without the route's permission gets 403. This covers the carry-over: Producer gets 403 on users routes.
  - With a password change pending, routes get `password_change_required`, and a negative-control probe proves the check runs.
  - Namespaces get the same sweep.
  - The schema and OpenAPI parity checks stay as they are.

### Web split and dev setup

- **Vite bases:** core-web uses `base: '/core/'` and producer-web uses `base: '/producer/'`. The overlay entry moves to producer-web with `git mv`.
- **Dev:**
  - core-web's Vite (:5173) is the front door. It proxies `/api`, `/docs` and `/socket.io` (ws) to the server (:5580), and `/producer` (ws, for HMR) to producer-web's Vite (:5174).
  - The proxy entries come from a `@rollcall/web-sdk/vite` helper, and `dev-proxy.test.ts` checks that every entry keeps `changeOrigin` off.
  - **Spike HMR through this proxy first.** If it doesn't work, open :5174 directly. Cookies ignore the port, so the session still works.
  - Don't proxy Vite through the Fastify server: engine.io destroys WebSocket upgrades it doesn't own.
- **Storybooks:** core-web's on 6006 (Mantine, with the web-sdk stories) composes producer's overlay Storybook on 6007. Producer gets a dashboard Storybook only with its first story, because a story project with no stories fails.
- **Overlay isolation:** `bundle.test.ts` moves to producer-web and also asserts that no web-sdk code reaches the overlay bundle.

## Phases

Each phase is one PR. Each must pass `yarn check`, `yarn test:stories` and `yarn test:e2e` before merge. ⏸ marks steps that push to GitHub or change GitHub settings; Mike confirms each one when it comes up.

### Phase 0: Finish in GROBS and set up GitHub
1. ⏸ Merge `feat/storybook` into GROBS `main` and push. Its commits close GROBS #17.
2. Run `brew install git-filter-repo`. It isn't installed yet.
3. ⏸ **In Mike's board UI, before any issues exist:**
   - On #6, add an **Auto-add to project** workflow: repo `rollcall_derby`, filter `label:rcl-core`.
   - On #8, the same with `label:rcl-producer`.
   - On both boards, turn on **Item closed → Done** and **Pull request merged → Done**.
   - GitHub Free allows one auto-add workflow; each board needs only one. If a board won't accept it, the fallback is adding items by hand.
4. ⏸ In `rollcall_derby`:
   - Create the labels `rcl-core`, `rcl-producer`, `chore` and `patch`. `bug` and `enhancement` are defaults.
   - Create the milestones **`rcl-core v0.1.0`** and **`rcl-producer v0.2.0`**.
   - Create the issues listed below.

### Phase 1: Import with history (the first push goes straight to `main`, since there is no branch to PR against)
**Recipe**, run on a fresh clone of GROBS `main`:
```sh
git clone git@github.com:wardmanm/GROBS.git rollcall-import && cd rollcall-import
git filter-repo \
  --path obs-producer/ --path .github/ --path .claude/ --path LICENSE \
  --path-rename obs-producer/: \
  --message-callback 'import re
return re.sub(rb"(?<![\w/&])#(\d+)\b", rb"wardmanm/GROBS#\1", message)'
```

- **Left out on purpose:** GROBS's root `AGENTS.md`, `CLAUDE.md`, `README.md` and `.gitignore`. They would collide with obs-producer's own files at the new root. The parts still needed are merged by hand in the fix-up commit below.
- **The tag** `obs-producer-v0.1.0` is deleted from the filtered clone and never pushed: the tag and its GitHub Release stay in GROBS, and Rollcall only gets `rcl-<app>-v…` tags (Mike, 2026-10-08).
- **Commit signatures** are dropped by filter-repo.

**Fix-up commit:** `chore(repo): run from the repo root after the move from GROBS`. Its body carries `Closes #<import issue>`.
- **Workflows:**
  - Drop `working-directory: obs-producer`, the `obs-producer/**` path filters and the artifact path prefix.
  - Rename the files to `app.yml`, `docs.yml` and `release.yml`.
  - Add PR `concurrency` with `cancel-in-progress`, to save private-repo minutes.
- **`.claude`:** change the rules' globs to drop the `obs-producer/` prefix. Point the release skill at `wardmanm/rollcall_derby`.
- **Merge in GROBS root content:** the `.gitignore` entries (storybook, screenshots, `CLAUDE.local.md`, `.claude/settings.local.json`), the Git-workflow section into `AGENTS.md`, and the instruction-layering notes into `CLAUDE.md`.
- **Fix broken links:** `AGENTS.md`'s `../AGENTS.md` and `README.md`'s `../LICENSE`. `check-docs` fails without these fixes.
- **Repo references:**
  - Change `REPO_URL` in `scripts/release.mjs` to the new repo, and update its tests. The tag prefix waits for Phase 5.
  - In the CHANGELOG, change `#N` to `wardmanm/GROBS#N`. Point the `[Unreleased]` link at `rollcall_derby`'s commit history.
  - Issue-form URLs, the clone steps in `local-development.md`, and the "touches obs-producer/" lines in the testing guide and wiki guide.

**Verify, then ⏸ push `main`:**
- `git log --format=%B | grep -nE '(^|[^/\w&])#[0-9]+'` finds nothing.
- `diff -r` against GROBS `obs-producer/` shows only the fix-up changes.
- `yarn install --immutable && yarn check && yarn build && yarn test:stories && yarn test:e2e` passes.
- `main` becomes the default branch, which closing keywords need.

**⏸ After the push:**
- Set the Actions token to read-only.
- Run `gh issue transfer 15 wardmanm/rollcall_derby`. Labels with matching names carry over; the milestone is dropped and the issue gets a new number. Then label it `rcl-core` and add milestone `rcl-core v0.1.0`.
- Close the GROBS milestone `obs-producer v0.2.0` with the note "continues in Rollcall".

**GROBS cleanup PR** (`chore(repo): obs-producer moved to Rollcall`):
- Delete `obs-producer/`, its three workflows, the `.claude` rules and release skill, the issue forms, the PR template and `dependabot.yml`.
- Point the root `README.md`, `AGENTS.md` and `CLAUDE.md` to Rollcall.
- Keep the tag ruleset, which protects `obs-producer-v0.1.0`.

### Phase 2: Rename to Rollcall and adopt the rcl-core layout (still one app)
- **2a, `feat(repo): rename to Rollcall`:**
  - `APP_NAME = 'Rollcall'`.
  - Env vars `OBS_PRODUCER_*` → `ROLLCALL_*`.
  - Cookie `rollcall_session`, database file `rollcall.db`. There is no data migration, since only dev data exists; the CHANGELOG notes "sign in again".
  - Rename the root package to `rollcall`. Update the OpenAPI title, page titles and the e2e assertion.
  - `reset-password` refuses when `rollcall.db` is missing and prints the path (a carry-over).
  - Add **ADR-0016**.
- **2b, `refactor(repo): rcl-core layout`** (moves only):
  - `apps/server` → `rcl-core/server`, `packages/shared` → `rcl-core/contract`, `apps/web` → `rcl-core/web`. The overlay stays in `rcl-core/web` for now.
  - The folders stay the same depth, so default paths and tsconfig `extends` still resolve.
  - Update the oxlint, Prettier, Vitest and Storybook paths, and the `.claude/rules` globs.
  - Add `rcl-core/AGENTS.md` and `rcl-core/CLAUDE.md`.
  - Regenerate `yarn.lock` and check that only workspace lines changed.
  - Add **ADR-0017**.

### Phase 3: Access model (inside core, before the split)
- Implement the access model above in `rcl-core/server/src/auth/` (the declarative `access`, the onRoute enforcement, the session principal and permissions).
- Migrate the setup, auth, users and health routes. Evolve the inventory test.
- Add **ADR-0018**, superseding 0008. Hard rule 5 becomes "Every API route and socket event checks the caller's access."
- Update `docs/features/users-and-access.md` with the permission matrix.

### Phase 4: Split into app modules
- **4a, `feat(rcl-producer): producer web app and shared web SDK`:**
  - Add `rcl-producer/web` with the moved overlay and a minimal Mantine shell. Add `packages/web-sdk`.
  - Set the Vite bases. Core serves both build folders from a temporary hardcoded list.
  - Set up the dev front door (after the HMR spike).
  - Split the Storybooks. e2e covers `/core/`, `/producer/` and `/producer/overlay`.
  - CHANGELOG: the OBS URL moves from `/overlay` to `/producer/overlay`, with no redirect.
- **4b, `feat(rcl-core): host rcl apps as modules`:**
  - Add `packages/app-sdk`, `rcl-producer/server` and `rcl-producer/contract`. Make core itself module `core`.
  - Routes move under `/api/core/*`. The overlay namespace becomes `/producer/overlay`.
  - Add per-app migrations, the compatibility check, `/api/core/apps`, the `/api/*` 404, and the boundary test.
  - Add **ADR-0019**, superseding 0004 and 0007. It restates hard rules 3 and 4 for rcl-core and replaces the root rule "tools share no code".

### Phase 5: Per-app releases and process
- **`release.mjs`:**
  - Every command takes `--app rcl-core|rcl-producer`.
  - Per app it uses `<app>/CHANGELOG.md`, `<app>/*/package.json`, tag prefix `<app>-v`, milestone prefix `<app> v`, and the titles "Rollcall Core" / "Rollcall Producer".
  - `issueRefs` already skips `owner/repo#N`, so GROBS references never get release comments.
- **Workflows:** a reusable `release.yml` (`workflow_call`, input `app`) with two callers, `rcl-core-release.yml` and `rcl-producer-release.yml`. The preflight also runs `test:stories`, which closes a gap noted in the Storybook work.
- **CHANGELOGs:**
  - `git mv CHANGELOG.md rcl-producer/CHANGELOG.md` to keep the 0.1.0 lineage.
  - Start a new `rcl-core/CHANGELOG.md`.
  - Unreleased entries for accounts, users and the API explorer move to core. The overlay namespace and URL entries stay with producer.
- **`check-docs`:**
  - Link-check the `rcl-*/` AGENTS, CLAUDE, README and CHANGELOG files.
  - Feature pages need `app:` frontmatter, and the features table gets an App column.
- **Instruction files:**
  - Root `AGENTS.md` keeps all 7 hard rules, since they apply repo-wide. The per-app `AGENTS.md` files hold each app's layout and commands.
  - Rules files: `rcl-core-{server,web,contract}.md`, `rcl-producer-{server,web,overlay}.md`, `sdk.md` and `e2e.md`.
  - `/release` takes `<app> <version>`. Commit scopes are `rcl-core`, `rcl-producer`, `sdk` and `repo`.
- **Issue forms** get a required App dropdown. Labels are applied at triage, since forms can't set labels from a dropdown.
- ⏸ **Before the first release**, make the repo public. Then recreate the `release` environment (required reviewer `wardmanm`, `main` only), the tag ruleset on `refs/tags/*-v*`, and immutable releases.
- Add **ADR-0020**, superseding 0010. It restates hard rule 7.
- Release order: core first (`rcl-core v0.1.0`), then producer (`rcl-producer v0.2.0`).

### ADRs and wiki
- **ADR-0001 forbids rewording accepted ADRs.** So ADR-0016 carries a "Names used in earlier ADRs" table: `apps/server` → `rcl-core/server`, `/overlay` → `/producer/overlay`, `@obs-producer/*` → `@rollcall/*`, and so on. That covers 0003, 0005, 0006, 0013, 0014 and 0015 without rewriting them.
- **New ADRs:**
  - 0016: Rollcall naming, repo and URL scheme.
  - 0017: `rcl-*` workspace layout; supersedes 0012.
  - 0018: access model; supersedes 0008.
  - 0019: app modules and per-app contracts; supersedes 0004 and 0007.
  - 0020: per-app releases; supersedes 0010.
- **Glossary:** add Rollcall, rcl app, rcl-core, rcl-producer ("the Producer app", never bare "Producer", which is a role), App module, Permission, API key and Output token.
- **Vision:** rewrite it for the suite.
- **Feature `app:` values:**
  - core: team-builder, users-and-access
  - producer: theme-builder, screen-builder, overlay-components, live-mode, obs-control, crg-automation
  - both: import-export

## Issues to create in rollcall_derby (Phase 0, step 4)

Every commit and PR that finishes one ends with `Closes #N`. Numbers belong to the repo, so they never collide across boards. Labels put each issue on its board automatically.

| Issue | Type | Labels → board | Milestone |
|---|---|---|---|
| Import obs-producer from GROBS with its history (Phase 1) | chore | rcl-core, rcl-producer | rcl-core v0.1.0 |
| Rename to Rollcall and adopt the rcl-core layout (Phase 2) | chore | rcl-core | rcl-core v0.1.0 |
| Declarative access with per-app permissions (Phase 3) | enhancement | rcl-core | rcl-core v0.1.0 |
| Producer web app and shared web SDK; overlay moves to `/producer/overlay` (4a) | enhancement | rcl-producer | rcl-producer v0.2.0 |
| Core hosts rcl apps as modules (4b) | enhancement | rcl-core, rcl-producer | rcl-core v0.1.0 |
| Per-app releases: tags, changelogs, workflows, go public (Phase 5) | chore | rcl-core, rcl-producer | rcl-core v0.1.0 |
| _(transferred GROBS #15)_ Auth in the web app: setup, login, users, plus `SignInGate` and the carry-overs (idempotent logout, localhost hint on setup, `{}` for body-less POSTs, friendly validation messages) | enhancement | rcl-core | rcl-core v0.1.0 |
| API keys for devices and scripts | enhancement | rcl-core | rcl-core v0.1.0 |
| Auth hardening: re-check the caller after an `await`, warm `dummyHash()`, clean up when `listen()` fails | chore | rcl-core | rcl-core v0.1.0 |
| CORS allowlist for remote rcl apps | enhancement | rcl-core | backlog |
| Output token URLs (with Live Mode) | enhancement | rcl-producer | backlog |

Feature issues for Team/player/logo editors, CRG and OBS connections, and the Theme and Screen builders are created when each one is planned. They are not part of this work.

## Risks

- **filter-repo:**
  - The `#N` regex could also rewrite prose. The post-import grep catches that.
  - Rewritten `Closes wardmanm/GROBS#N` lines add cross-reference events on GROBS issues. All of them are closed, and #15 is never named with a closing keyword.
- **`yarn.lock` churn** in Phases 2b and 4: diff the lockfile. For the new `semver` dependency, check the current version first and allow for Yarn's 24-hour quarantine on new releases.
- **Playwright** needs `build` to build every web app. Its health URL moves to `/api/core/health` in 4b.
- **Fastify:**
  - The second `@fastify/static` registration needs `decorateReply: false`.
  - `onRoute` also sees the HEAD routes Fastify adds automatically; they inherit `config.access`.
- **Drizzle:** never edit the SQL of moved migrations, because the hashes are checked.
- **OBS browser sources** break when `/overlay` moves to `/producer/overlay`. The page is placeholder-only, so a CHANGELOG note is enough.
- **Private-repo Actions minutes:** the PR `concurrency` setting keeps usage down until the repo goes public.

## Verification

- **Every phase:** `yarn check && yarn build && yarn test:stories && yarn test:e2e`, plus a review of the lockfile diff.
- **Phase 1:**
  - The `#N` grep and the `diff -r` against GROBS show only the expected changes.
  - The first CI run on `rollcall_derby` passes.
  - The import issue closes, and its card lands in **Done** on boards #6 and #8.
- **Phase 3:**
  - The inventory test fails when a route has no `access`, an unknown permission or another app's prefix (each a self-test).
  - Producer and Announcer get 403 on users routes.
- **Phase 4:**
  - In `yarn dev`, sign in at `/core/`, open `/producer/`, and HMR works in both.
  - `/producer/overlay` renders transparent with no Mantine.
  - A module whose `requiresCore` doesn't match is skipped with a logged error while core keeps serving.
  - `/docs` lists `core/*` and `producer/*` tags.
- **Phase 5:**
  - `node scripts/release.mjs check 0.1.0 --app rcl-core` passes.
  - Running the release workflow with `dry_run=true` is done **only by Mike** (hard rule 7).

## After approval

1. Following the brainstorming process, invoke **writing-plans** to write the detailed implementation plan for Phases 0–2. It goes in the new repo at `design-docs/plans/`, and this spec goes at `design-docs/specs/2026-10-07-rollcall-split-design.md`, both committed in Phase 2. Phases 3, 4 and 5 each get their own plan when reached.
2. Update memory:
   - Boards are now #6 and #8, filled by auto-add labels.
   - Copy the memories into the project folder for the new clone (`~/Documents/Repos/rollcall_derby`).
   - Shrink `auth-plan-carryovers.md` once its items exist as issues.
3. Remind Mike to move each issue to "In progress" when work on it starts.
