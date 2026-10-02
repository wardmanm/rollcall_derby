---
title: Testing
---
# Testing

What to test, where the tests live, and how to run them. New code is written test-first: write a failing test, watch it fail for the right reason, then make it pass.

## Layers

| Layer | Tool | Where | Runs with |
|---|---|---|---|
| Unit and integration | [Vitest](https://vitest.dev/) | `*.test.ts(x)` next to the code, in every workspace | `yarn test` |
| React components | Vitest + React Testing Library, jsdom | `apps/web/src/**/*.test.tsx` | `yarn test` |
| End to end | [Playwright](https://playwright.dev/) | `e2e/tests/*.spec.ts` | `yarn test:e2e` |
| Repo scripts | Node's built-in test runner | `scripts/*.test.mjs` | `yarn test:scripts` |

`yarn check` runs everything except end-to-end. CI runs all of it on every push that touches `obs-producer/`, via `.github/workflows/obs-producer-app.yml` and `obs-producer-docs.yml`. The release workflow runs it again before anyone can approve a release.

## Vitest

- **Two environments, set in `vitest.config.ts`:**
  - **`node`:** `packages/*` and `apps/server`.
  - **`web`:** `apps/web`, in jsdom, with `apps/web/src/test/setup.ts`.
- **One web test needs real Node APIs.** It opts out of jsdom with `// @vitest-environment node` at the top of the file (the overlay bundle check below).
- **Running a subset:** `yarn vitest run <path or name>`, e.g. `yarn vitest run apps/server` or `yarn vitest run -t "health"`. `yarn vitest` watches for changes.

### Patterns used here

- **Server routes:** `testApp()` from `apps/server/src/testing.ts` builds the Fastify app on a private in-memory SQLite database without listening, so `app.inject({ method: 'GET', url: '/api/health' })` tests a route in memory. `addUser(db, username, password, role)` adds an account, and `createSession(db, userId)` gives you a token to send as the `obs_producer_session` cookie. Pass `registerRoutes` to add a throwaway route (see `apps/server/src/auth/guard.test.ts`). Use `startServer()` with `port: 0` only when you need a real socket or the on-disk data directory (see `apps/server/src/server.test.ts`).
- **Files and databases:** create a temp directory per test (`mkdtempSync(join(tmpdir(), '…'))`) and remove it in `afterEach`. Never touch `obs-producer/data/`.
- **RTK Query:** stub `fetch` with `vi.stubGlobal('fetch', …)` and dispatch the endpoint (`apps/web/src/store/api.test.ts`). The API's base URL is absolute so Node's `fetch` accepts it.
- **Socket.IO in the overlay:** inject a fake socket through `makeOverlayStore(() => fakeSocket)` and emit events by hand (`apps/web/src/overlay/live.test.ts`).
- **Components:** render with React Testing Library and query by role or text, as a user would. Wrap anything that uses Mantine in `MantineProvider`; the full `App` already does.
- **Shared schemas:** every schema in `packages/shared` gets tests for an accepted payload and for each rejected shape that matters.

### Guards that protect the architecture

- **Overlay bundle (`apps/web/src/overlay/bundle.test.ts`).** It runs a real Vite build and fails if Mantine or admin-app code reaches the overlay bundle ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)). It also checks that Mantine *is* in the admin bundle, which proves the check works.
- **Reconnect after restart (`apps/server/src/server.test.ts`).** It restarts the server on the same port and expects a Socket.IO client to reconnect on its own, so OBS outputs can't go stale.

## Playwright

- **What it tests:** the real production setup. `e2e/playwright.config.ts` builds the web app and starts the server on port **5590**, separate from the development port 5580, with a throwaway data directory under the OS temp folder. It stops the server afterwards.
- **First time on a machine:** run `yarn workspace @obs-producer/e2e playwright install chromium`.
- **Running:** `yarn test:e2e`, or `yarn test:e2e --grep overlay` for a subset.
- **Scope:** end-to-end tests cover what only a real browser can show: the admin shell loads, the overlay is transparent and loads no Mantine styles, and routes resolve. Logic belongs in Vitest.
- **Failures in CI:** the workflow uploads the HTML report as the `playwright-report` artifact.

## What every change needs

- Tests for new behavior, written first. A bug fix starts with a test that reproduces the bug.
- `yarn check` passing; changes to what users see also need `yarn test:e2e`.
- No warnings in test output. React `act()` warnings and console errors count as failures to fix.
