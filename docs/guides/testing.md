---
title: Testing
---
# Testing

What to test, where the tests live, and how to run them. New code is written test-first: write a failing test, watch it fail for the right reason, then make it pass.

## Layers

| Layer | Tool | Where | Runs with |
|---|---|---|---|
| Unit and integration | [Vitest](https://vitest.dev/) | `*.test.ts(x)` next to the code, in every workspace | `yarn test` |
| React components | Vitest + React Testing Library, jsdom | `rcl-core/web`, `rcl-producer/web` and `packages/web-sdk`: `src/**/*.test.tsx` | `yarn test` |
| Stories | Storybook + Vitest browser mode (Playwright's Chromium) | `*.stories.tsx` next to the component | `yarn test:stories` |
| End to end | [Playwright](https://playwright.dev/) | `e2e/tests/*.spec.ts` | `yarn test:e2e` |
| Repo scripts | Node's built-in test runner | `scripts/*.test.mjs` | `yarn test:scripts` |

`yarn check` runs everything except end-to-end. CI runs all of it, plus `yarn test:stories`, on every push and pull request, via `.github/workflows/app.yml` and `docs.yml`. The release workflow runs it again before anyone can approve a release.

## Vitest

- **Projects, set in `vitest.config.ts`:**
  - **`node`:** every app's `server` and `contract`, such as `rcl-core/server`, in Node.
  - **`core-web`**, **`producer-web`** and **`web-sdk`:** `rcl-core/web`, `rcl-producer/web` and `packages/web-sdk`, in jsdom, all with `packages/web-sdk/src/test/setup.ts`.
- **A few web tests need real Node APIs:** the dev proxy checks, the dev overlay route and the overlay bundle check. Each opts out of jsdom with `// @vitest-environment node` at the top of the file.
- **Running a subset:** `yarn vitest run <path or name>`, e.g. `yarn vitest run rcl-core/server` or `yarn vitest run -t "health"`. `yarn vitest` watches for changes.

### Patterns used here

- **Server routes:** `testApp()` from `rcl-core/server/src/testing.ts` builds the Fastify app on a private in-memory SQLite database without listening, so `app.inject({ method: 'GET', url: '/api/core/health' })` tests a route in memory. `addUser(db, username, password, role)` adds an account, and `createSession(db, userId)` gives you a token to send as the `rollcall_session` cookie. Pass `registerRoutes` to add a throwaway route below `/api/core/`, with `config: { access: … }` like any route, or `apps` to host a throwaway app module with its own routes, namespaces and permissions (see `rcl-core/server/src/auth/access.test.ts`). Use `startServer()` with `port: 0` only when you need a real socket or the on-disk data directory (see `rcl-core/server/src/server.test.ts`).
- **Files and databases:** create a temp directory per test (`mkdtempSync(join(tmpdir(), '…'))`) and remove it in `afterEach`. Never touch `data/`.
- **RTK Query:** stub `fetch` with `vi.stubGlobal('fetch', …)` and dispatch the endpoint (`packages/web-sdk/src/api.test.ts`). The API's base URL is absolute so Node's `fetch` accepts it.
- **Pages that talk to the server:** `fakeServer` and `signedIn` from `@rollcall/web-sdk/testing` answer each request by `'METHOD /path'` and record what was sent; anything not listed gets `404 not_found`. Open rcl-core's app at an address with `openCore` (`rcl-core/web/src/test/open-core.tsx`). See `rcl-core/web/src/pages/*.test.tsx`.
- **Mantine menus in jsdom:** jsdom has no layout, so Mantine may hide an open menu as if its button were off screen. Find its items with `{ hidden: true }`.
- **Socket.IO in the overlay:** inject a fake socket through `makeOverlayStore(() => fakeSocket)` and emit events by hand (`rcl-producer/web/src/overlay/live.test.ts`).
- **Components:** render with React Testing Library and query by role or text, as a user would. Wrap anything that uses Mantine in `MantineProvider`; the full `App` already does.
- **Shared schemas:** every schema in `rcl-core/contract` gets tests for an accepted payload and for each rejected shape that matters.

### Guards that protect the architecture

- **Overlay bundle (`rcl-producer/web/src/overlay/bundle.test.ts`).** It runs a real Vite build of the Producer app and fails if any Mantine or web SDK module reaches the overlay bundle ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)). It also checks that both *are* in the Producer app's own bundle, which proves the check works.
- **Boundaries (`scripts/check-boundaries.test.mjs`).** It fails if an app's server depends on rcl-core's server or on another app's, if rcl-core's server imports an app anywhere but `src/installed-apps.ts`, or if any workspace imports a `@rollcall` package it doesn't list ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)). Fixture repos prove each rule fires.
- **Installed apps (`rcl-core/server/src/installed-apps.test.ts`).** Every installed app must accept the current rcl-core version, and its migrations may only create tables named after it (`<id>_…`).
- **Reconnect after restart (`rcl-core/server/src/server.test.ts`).** It restarts the server on the same port and expects a Socket.IO client to reconnect on its own, so OBS outputs can't go stale.
- **Access inventories (`rcl-core/server/src/auth/route-inventory.test.ts`, `rcl-core/server/src/realtime.test.ts`).** They record every `/api` route and every Socket.IO namespace as it's created, then send each one a request or connection. A route or namespace with no access declaration can't start at all (`src/auth/access.test.ts`). The inventories check that each declaration is enforced ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)):
  - **Pinned:** the public routes and namespaces, and the routes that work while a password change is pending, are listed in the tests, so changing them means changing a test.
  - **Anonymous:** everything that isn't public refuses with `unauthenticated` (401 for routes).
  - **With a password change pending:** everything except `me`, `password` and the public routes (such as `logout`) refuses with `password_change_required`.
  - **Missing permission:** each role is refused with `forbidden` wherever it lacks the permission.
  - **API keys** ([ADR-0020](../decisions/0020-api-keys.md)):
    - A key holding every permission a key may hold is refused with `forbidden` on routes for any signed-in user and on people-only permissions, and gets through elsewhere. A test app supplies a route a key may call.
    - A wrong key is refused with `unauthenticated` everywhere but public routes.
    - Namespaces ignore keys.
  - **Proof it works:** each sweep runs again as an Admin, who gets through everywhere, so the sweep must report every route.

  The route inventory also checks that every `/api` route declares a response schema (and a params schema when its path has parameters), and that the OpenAPI document behind `/docs` lists exactly the registered routes ([ADR-0014](../decisions/0014-route-schemas-and-api-explorer.md)).

## Stories

Shared components get a story next to them (`Component.stories.tsx`), and every story is also a test, run through its own Vitest config, `vitest.stories.config.ts` ([ADR-0015](../decisions/0015-storybook-admin-and-overlay-kept-apart.md)). `yarn test:stories` renders each one in Chromium and fails on a render error, a failed `play` check, or an accessibility violation.

- **Which Storybook:** the admin Storybook (`rcl-core/web/.storybook/admin`) shows the web SDK's components, and rcl-core's own once it has some: its first story also adds `../../src/**/*.stories.tsx` to that Storybook's `main.ts`, since Storybook warns about a pattern that matches nothing. Overlay components (`rcl-producer/web/src/overlay`) go in the overlay Storybook (`rcl-producer/web/.storybook/overlay`). The Producer app's other components get a dashboard Storybook with their first story.
- **Server data:** give each story its own answer with a `beforeEach` that stubs `fetch` and restores it (see `packages/web-sdk/src/ServerStatus.stories.tsx`). A fresh `makeStore()` per story keeps RTK Query empty.
- **Themes in CI:** a story pinned to a sample theme with `globals: { overlayTheme: 'light' }` is checked for contrast like any other.
- **Isolation:** every overlay story checks for no Mantine variables or stylesheet on the page, and that theme variables reach it, the same check the e2e test makes on the real overlay page.

## Playwright

- **What it tests:** the real production setup. `e2e/playwright.config.ts` builds every web app and starts the server on port **5590**, separate from the development port 5580, with a fresh data folder for each run under the OS temp folder. It stops the server and removes the folder afterwards.
- **First time on a machine:** run `yarn workspace @rollcall/e2e playwright install chromium`.
- **Running:** `yarn test:e2e`, or `yarn test:e2e --grep overlay` for a subset.
- **Scope:** end-to-end tests cover what only a real browser can show: the accounts flow on a fresh install (setup, signing in and out, a new Producer choosing their own password), each app's shell loading, the overlay at `/producer/overlay` staying public, transparent and free of Mantine styles, and routes resolving. Logic belongs in Vitest.
- **`accounts.spec.ts` runs in order:** first-run setup must come first, and each test opens its own browser, so it signs in for itself.
- **Failures in CI:** the workflow uploads the HTML report as the `playwright-report` artifact.

## What every change needs

- Tests for new behavior, written first. A bug fix starts with a test that reproduces the bug.
- `yarn check` passing; changes to what users see also need `yarn test:e2e`.
- No warnings in test output. React `act()` warnings and console errors count as failures to fix.
