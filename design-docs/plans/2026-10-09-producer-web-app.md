# Producer Web App and Shared Web SDK (#4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the web side of the split. The Producer app gets its own web workspace at `/producer/`, and the OBS overlay moves into it at `/producer/overlay`. rcl-core's admin app moves to `/core/`, with `/` redirecting there. Code both GUIs share moves into a new `@rollcall/web-sdk` package. In development, rcl-core's Vite on port 5173 is the single front door for both apps, hot reload included.

**Architecture:**
- **`packages/web-sdk` (`@rollcall/web-sdk`)** is TypeScript source with no build step, like the contracts.
  - `.` exports the app shell (`App`, `AppLayout`), `ServerStatus`, the RTK Query base API (`api`, `useGetHealthQuery`), `parseHealth`, the store (`makeStore`) and the typed hooks.
  - `./vite` exports the dev proxy helpers (`serverProxy`, `frontDoorProxy`), the dev ports (`DEV_PORTS`) and a `redirectRoot` plugin.
  - Its jsdom test setup is shared by every web Vitest project.
- **`rcl-producer/web` (`@rollcall/producer-web`)** has Vite `base: '/producer/'` and two pages:
  - `index.html`, a minimal Mantine shell ("Rollcall Producer") whose home page shows the overlay address for OBS;
  - `overlay.html`, the overlay, moved with `git mv`.

  It has its own overlay Storybook and its own bundle test.
- **`rcl-core/web`** has Vite `base: '/core/'`. It keeps the admin Storybook, which now shows the web SDK's stories.
- **The server** serves a list of web apps, `{ base, dir, pages? }`, from `rcl-core/server/src/web-apps.ts`. Each app is served below its base, with its pages at their paths and `index.html` as the fallback. `/` redirects to the first app (core's). The list is temporary: Phase 4b builds it from each app module's `web`.

**Tech Stack:** Vite 8 (Rolldown) with `@vitejs/plugin-react` 6; React 19; React Router 8; Mantine 9; Redux Toolkit 2 / RTK Query; Socket.IO client 4.8; Fastify 5 with `@fastify/static` 10; Storybook 10 with `@storybook/addon-vitest`; Vitest 5 (jsdom, and browser mode for stories); Playwright 1.63; Yarn 4 workspaces; TypeScript 7.

**Spec:** [`design-docs/specs/2026-10-07-rollcall-split-design.md`](../specs/2026-10-07-rollcall-split-design.md). This plan implements Phase 4a, plus the "URL scheme" and "Web split and dev setup" sections. Issue: **#4**.

**How this plan was checked:** every code block was built on a throwaway branch, with one commit per task. On that branch:
- after each task, `yarn check`, `yarn build`, `yarn test:stories` and `yarn test:e2e` all passed;
- the docs lint passed on the final docs.

The spec asks for a hot-reload spike before the dev setup, and it was run in a real browser, with three results:
- an edit to the Producer app hot-updated a page opened at `http://localhost:5173/producer/`, without reloading it;
- the overlay rendered live through 5173;
- `/` redirected to `/core/`, where hot reload also connected.

So the spec's fallback, opening port 5174 directly, isn't needed.

## Global Constraints

- **URL scheme** (spec):
  - `/` gives a **302 to `/core/`**.
  - `/core/` is the core GUI.
  - `/producer/` is the Producer GUI.
  - **`/producer/overlay[/<token>]`** is the OBS output page.
  - The Socket.IO namespace stays `/overlay` until Phase 4b.
- **Vite bases:** core-web uses `base: '/core/'` and producer-web uses `base: '/producer/'`. The overlay entry moves to producer-web with `git mv`.
- **Dev setup:**
  - core-web's Vite (:5173) is the front door. It proxies `/api`, `/docs` and `/socket.io` (ws) to the server (:5580), and `/producer` (ws, for hot reload) to producer-web's Vite (:5174).
  - The proxy entries come from a `@rollcall/web-sdk/vite` helper, and the dev-proxy tests check that every entry keeps `changeOrigin` off.
  - Don't proxy Vite through the Fastify server: engine.io destroys WebSocket upgrades it doesn't own.
- **Storybooks:**
  - core-web's on 6006 (Mantine, with the web-sdk stories) composes producer's overlay Storybook on 6007.
  - Producer gets a dashboard Storybook only with its first story, because a story project with no stories fails.
- **Overlay isolation:** the bundle test moves to producer-web and also asserts that no web-sdk code reaches the overlay bundle.
- **e2e** covers `/core/`, `/producer/` and `/producer/overlay`.
- **CHANGELOG:** the OBS URL moves from `/overlay` to `/producer/overlay`, **with no redirect**.
- **Workspaces are listed one folder pattern each:** `"rcl-core/*", "rcl-producer/*", "packages/*", "e2e"`. `scripts/release.mjs` only reads `dir/*` and plain folder names.
- **No new third-party dependencies.** The new workspaces reuse the exact version ranges already in `rcl-core/web/package.json`. After `yarn install`, the lockfile diff only adds or edits `@rollcall/*` workspace entries.
- **Runtime and TypeScript (ADR-0013):** `.ts`/`.tsx` extensions on relative imports, erasable syntax only, `import type` for types.
- **No `as` casts in `src/`** outside test files, and **no new inline `oxlint-disable` comments.**
- **Every commit passes `yarn format && yarn check`.** Tasks 1–4 also pass `yarn build && yarn test:stories && yarn test:e2e`, because they change what users see or what those tests run.
- **Commits** follow Conventional Commits, with scope `sdk`, `rcl-producer`, `rcl-core` or `repo`.
  - Each ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  - Task 5's commit says `Closes #4`.
- **Nothing is pushed** without Mike's explicit OK (Task 6).

## Review Focus

1. **OBS browser sources still pointing at `/overlay`.** They get a 404, not a redirect (spec). The CHANGELOG tells people to update each source. Test in Task 3: `/overlay` answers a JSON 404.
2. **Deep links and reloads in either app:** `/core`, `/core/teams/42`, `/producer`, `/producer/screens/3?tab=layout`. Each must load its own app's `index.html`, never the other app's, and never the overlay page. Tests in Tasks 2 and 3.
3. **Only one app built.** For example, `yarn workspace @rollcall/producer-web build` alone. The server must still serve that app, its pages and the API. The first `@fastify/static` registration is the one that adds `reply.sendFile`. Test in Task 2.
4. **The overlay pulling in the web SDK or Mantine by accident**, say through a stray import. Test in Task 2: the bundle test reads every module in the overlay's chunks.
5. **A page opened through the front door in development:** hot reload, `/api` and the overlay's Socket.IO connection must all work through port 5173. There's no automated test for a running dev server, so Task 4 has a scripted check (curl, plus one browser check) as its own step.

## Decisions this plan makes

The spec leaves these open. Each is decided here so implementers and reviewers don't have to guess.

- **`ROLLCALL_WEB_DIR` keeps meaning rcl-core's web build**, so ADR-0016's list of settings stays true. The Producer app's build is always `rcl-producer/web/dist/`, from the temporary list. Phase 4b revisits both with app modules.
- **The server's list of web apps is `{ base, dir, pages? }`**, mirroring the spec's `AppModule.web = { dir, pages }`, so Phase 4b only changes where the list comes from.
  - `/` redirects to the first app's base.
  - Any other path no app claims gets the same JSON 404 as unknown routes always have.
- **`CORE_BASE` and `PRODUCER_BASE`** live in each app's `src/base.ts` and feed Vite's `base`, the router's `basename` and the overlay address. They're constants, not `import.meta.env.BASE_URL`, because Vitest forces `base` to `/` in tests.
- **What the web SDK holds in Phase 4a:** `App`, `AppLayout` (now taking a `title`), `ServerStatus` and its stories, the base API with `getHealth`, `parseHealth`, the store and typed hooks, the jsdom test setup, and the Vite helpers.
  - `SignInGate` arrives with #11.
  - React, Mantine, Redux, React Router and Vite are peer dependencies, also listed as dev dependencies for the package's own tests.
- **The Producer shell** is titled "Rollcall Producer" (`${APP_NAME} Producer`, never bare "Producer", which is a role). Its home page shows the overlay address to add to OBS.
  - It has no stories yet, so it has no dashboard Storybook (spec).
- **The admin Storybook lists only the web SDK's stories** until rcl-core has a story of its own, because Storybook warns about a pattern that matches nothing. The rules file says to add rcl-core's pattern with its first story.
- **The Vitest projects** are renamed `core-web`, `producer-web` and `web-sdk`. All three use `packages/web-sdk/src/test/setup.ts`.
- **The root `build`** runs `yarn workspaces foreach --all --exclude rollcall run build`, so a new web app is built without editing the script.
- **Dev ports live in `DEV_PORTS`** (`@rollcall/web-sdk/vite`): 5173 for core and 5174 for the Producer app.
  - Both use `strictPort`, so a taken port fails loudly instead of drifting away from the front door's proxy.
  - The front door also redirects `/` to `/core/` in development (`redirectRoot`), as the server does.
- **The overlay's Socket.IO namespace stays `/overlay`.** Phase 4b renames it.
- **Not done here:** app modules, `/api/core/*`, the `/api/*` 404, the compatibility check and ADR-0019 (Phase 4b); `SignInGate` (#11); a Producer dashboard Storybook.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `packages/web-sdk/**` (moved from `rcl-core/web/src`, plus new package files) | Shared GUI code and the Vite helpers | 1, 4 |
| `rcl-core/web/{vite.config.ts,package.json,.storybook/admin/main.ts}`, `src/{main.tsx,routes.tsx,App.test.tsx,dev-proxy.test.ts,pages/HomePage.tsx}` | rcl-core's GUI on the SDK | 1 |
| `package.json`, `vitest.config.ts`, `yarn.lock` | Workspaces and Vitest projects | 1, 2 |
| `rcl-producer/web/**` (overlay moved from `rcl-core/web`) | The Producer app and the OBS overlay | 2 |
| `rcl-core/server/src/web-apps.ts` (+ test, replacing `static.test.ts`), `app.ts`, `server.ts` | Serving each app below its base | 2, 3 |
| `vitest.stories.config.ts`, `e2e/tests/*.spec.ts` | Story tests and end-to-end tests for both apps | 2, 3 |
| `rcl-core/web/src/base.ts`, `vite.config.ts`, `src/main.tsx`, `tsconfig.node.json` | rcl-core at `/core/` | 3 |
| `packages/web-sdk/src/vite.ts` (+ test), both apps' `vite.config.ts` and `src/dev-proxy.test.ts` | The dev front door | 4 |
| `AGENTS.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `rcl-core/{AGENTS,CLAUDE}.md`, `rcl-producer/{AGENTS,CLAUDE}.md`, `.claude/rules/*`, `docs/**` | Docs and agent rules | 5 |

---

### Task 1: The shared web SDK

**Files:**
- Move (`git mv`) from `rcl-core/web/src/` to `packages/web-sdk/src/`: `App.tsx`, `layout/AppLayout.tsx`, `components/ServerStatus.tsx`, `components/ServerStatus.stories.tsx`, `store/api.ts`, `store/api.test.ts`, `store/store.ts`, `store/hooks.ts`, `health.ts`, `health.test.ts`, `test/setup.ts`
- Create: `packages/web-sdk/{package.json,tsconfig.json,tsconfig.node.json}`, `packages/web-sdk/src/{index.ts,vite.ts}`
- Modify: `rcl-core/web/{vite.config.ts,package.json,.storybook/admin/main.ts}`, `rcl-core/web/src/{main.tsx,routes.tsx,pages/HomePage.tsx,App.test.tsx,dev-proxy.test.ts}`, `package.json`, `vitest.config.ts`, `yarn.lock`
- Test: `packages/web-sdk/src/vite.test.ts` (new), plus the moved tests, `rcl-core/web/src/App.test.tsx` and `rcl-core/web/src/dev-proxy.test.ts`

**Interfaces:**
- Consumes: `HealthResponseSchema`, `HealthResponse` and `APP_NAME` from `@rollcall/core-contract`.
- Produces, from `@rollcall/web-sdk`:
  - `App({ router, store })`, `AppLayout({ title }: { title: string })` and `ServerStatus()`;
  - `api` (reducerPath `'api'`, endpoint `getHealth`) and `useGetHealthQuery`;
  - `parseHealth(json: unknown): HealthResponse`;
  - `makeStore()` and the types `AppStore`, `RootState`, `AppDispatch`;
  - `useAppDispatch` and `useAppSelector`.
- Produces, from `@rollcall/web-sdk/vite`: `serverProxy(target?: string): Record<string, ProxyOptions>`, with the entries `/api`, `/docs` and `/socket.io` (ws). The target defaults to `ROLLCALL_DEV_SERVER` or `http://localhost:5580`.

- [ ] **Step 0: Branch, and commit this plan.**

```bash
git switch -c feat/producer-web-app
git add design-docs/plans/2026-10-09-producer-web-app.md
git commit -F - <<'EOF'
docs(repo): plan for the Producer web app and shared web SDK

Phase 4a of the Rollcall split spec (#4).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Remind Mike, in one line, to move #4 to "In progress" on board #8.

- [ ] **Step 1: Move the shared code, keeping its history.**

```bash
mkdir -p packages/web-sdk/src/test
for f in health.ts health.test.ts App.tsx test/setup.ts; do git mv "rcl-core/web/src/$f" "packages/web-sdk/src/$f"; done
for f in api.ts api.test.ts store.ts hooks.ts; do git mv "rcl-core/web/src/store/$f" "packages/web-sdk/src/$f"; done
git mv rcl-core/web/src/components/ServerStatus.tsx packages/web-sdk/src/ServerStatus.tsx
git mv rcl-core/web/src/components/ServerStatus.stories.tsx packages/web-sdk/src/ServerStatus.stories.tsx
git mv rcl-core/web/src/layout/AppLayout.tsx packages/web-sdk/src/AppLayout.tsx
rmdir rcl-core/web/src/components rcl-core/web/src/layout rcl-core/web/src/store rcl-core/web/src/test
```

- [ ] **Step 2: Write the failing test, and point rcl-core's GUI at the SDK.**

Create `packages/web-sdk/src/vite.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { serverProxy } from './vite.ts';

describe('serverProxy', () => {
  it('passes the API, the API explorer and Socket.IO to the server, keeping Host as it is', () => {
    const proxy = serverProxy('http://localhost:5580');
    expect(Object.keys(proxy)).toEqual(['/api', '/docs', '/socket.io']);
    for (const [path, entry] of Object.entries(proxy)) {
      expect(entry.target, path).toBe('http://localhost:5580');
      expect(entry.changeOrigin, path).not.toBe(true);
    }
    expect(proxy['/socket.io']?.ws).toBe(true);
  });
});
```

Replace `rcl-core/web/src/dev-proxy.test.ts` with:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { serverProxy } from '@rollcall/web-sdk/vite';
import config from '../vite.config.ts';

// The dev proxy is the shared helper's, which keeps `Host` unchanged for the server's Origin checks (ADR-0018).
describe('dev proxy', () => {
  it('passes the API, the API explorer and Socket.IO to the server', () => {
    expect(config.server?.proxy).toEqual(serverProxy());
  });
});
```

Replace `rcl-core/web/src/routes.tsx` with:

```tsx
import type { RouteObject } from 'react-router';
import { APP_NAME } from '@rollcall/core-contract';
import { AppLayout } from '@rollcall/web-sdk';
import { HomePage } from './pages/HomePage.tsx';

// Feature pages (Teams, Users) are added here as they're built.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout title={APP_NAME} />,
    children: [{ index: true, element: <HomePage /> }],
  },
];
```

Then change the imports in three more files:
- **`rcl-core/web/src/main.tsx` and `rcl-core/web/src/App.test.tsx`:** replace the three lines `import { App } from './App.tsx';`, `import { routes } from './routes.tsx';` and `import { makeStore } from './store/store.ts';` with:

  ```tsx
  import { App, makeStore } from '@rollcall/web-sdk';
  import { routes } from './routes.tsx';
  ```

- **`rcl-core/web/src/pages/HomePage.tsx`:** `import { useGetHealthQuery } from '../store/api.ts';` becomes `import { useGetHealthQuery } from '@rollcall/web-sdk';`.

- [ ] **Step 3: Run the tests and see them fail.**

Run: `yarn vitest run rcl-core/web packages/web-sdk`
Expected: FAIL. Nothing can load `@rollcall/web-sdk` yet, and the `web` Vitest project's setup file has moved.

- [ ] **Step 4: Make the package.**

Create `packages/web-sdk/package.json`:

```json
{
  "name": "@rollcall/web-sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./vite": "./src/vite.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.node.json"
  },
  "dependencies": {
    "@rollcall/core-contract": "workspace:^"
  },
  "peerDependencies": {
    "@mantine/core": "^9.6.3",
    "@mantine/hooks": "^9.6.3",
    "@reduxjs/toolkit": "^2.13.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-redux": "^9.3.0",
    "react-router": "^8.4.0",
    "vite": "^8.3.1"
  },
  "devDependencies": {
    "@mantine/core": "^9.6.3",
    "@mantine/hooks": "^9.6.3",
    "@reduxjs/toolkit": "^2.13.0",
    "@storybook/react-vite": "^10.6.1",
    "@testing-library/dom": "^10.4.2",
    "@testing-library/react": "^16.3.3",
    "@types/node": "^24",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-redux": "^9.3.0",
    "react-router": "^8.4.0",
    "storybook": "^10.6.1",
    "typescript": "^7.0.2",
    "vite": "^8.3.1"
  }
}
```

Create `packages/web-sdk/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src"],
  "exclude": ["src/vite.ts", "src/vite.test.ts"]
}
```

Create `packages/web-sdk/tsconfig.node.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src/vite.ts", "src/vite.test.ts"]
}
```

Create `packages/web-sdk/src/vite.ts`:

```ts
import type { ProxyOptions } from 'vite';

// Dev-server proxy entries for every rcl web app (ADR-0004): the browser talks only to Vite, which passes API,
// API explorer (/docs) and Socket.IO traffic to the Rollcall server. Object entries, never the string shorthand:
// the shorthand turns on `changeOrigin`, which rewrites `Host`, and the server's CSRF and socket checks compare
// `Origin` with `Host` (ADR-0018).
export function serverProxy(
  target = process.env.ROLLCALL_DEV_SERVER ?? 'http://localhost:5580',
): Record<string, ProxyOptions> {
  return {
    '/api': { target },
    '/docs': { target },
    '/socket.io': { target, ws: true },
  };
}
```

Create `packages/web-sdk/src/index.ts`:

```ts
// Shared web code for every rcl app's Mantine GUI (split spec): the app shell, the server badge, the RTK Query base
// API and the store. Overlay entries never import it (ADR-0006); the dev proxy helper is in `@rollcall/web-sdk/vite`.
export { App } from './App.tsx';
export { AppLayout } from './AppLayout.tsx';
export { ServerStatus } from './ServerStatus.tsx';
export { api, useGetHealthQuery } from './api.ts';
export { parseHealth } from './health.ts';
export { useAppDispatch, useAppSelector } from './hooks.ts';
export { makeStore, type AppDispatch, type AppStore, type RootState } from './store.ts';
```

Replace `packages/web-sdk/src/AppLayout.tsx` with:

```tsx
import { AppShell, Group, Title } from '@mantine/core';
import { Outlet } from 'react-router';
import { ServerStatus } from './ServerStatus.tsx';

export interface AppLayoutProps {
  /** The app's name in the header, such as "Rollcall" or "Rollcall Producer". */
  title: string;
}

// The shell every rcl app's GUI shares: a header with the app's name and the server badge, and the page below.
export function AppLayout({ title }: AppLayoutProps) {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={1} size="h3">
            {title}
          </Title>
          <ServerStatus />
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
```

Fix the imports and comments in the other moved files:
- **`App.tsx`:**
  - `import type { AppStore } from './store/store.ts';` becomes `import type { AppStore } from './store.ts';`.
  - The comment above `App` becomes `// Providers for an rcl app's GUI. Its main.tsx passes a browser router; tests pass a memory router.`
- **`store.ts`:** the comment above `makeStore` becomes `// The store for an rcl app's GUI. Overlay entries get their own lean store (ADR-0006).`
- **`api.ts`:** `from '../health.ts'` becomes `from './health.ts'`.
- **`ServerStatus.tsx`:** `from '../store/api.ts'` becomes `from './api.ts'`.
- **`ServerStatus.stories.tsx`:** `from '../store/store.ts'` becomes `from './store.ts'`.

**Wire it up.**

`rcl-core/web/vite.config.ts` uses the helper:
- Replace the comment and the line `const server = process.env.ROLLCALL_DEV_SERVER ?? 'http://localhost:5580';` with `import { serverProxy } from '@rollcall/web-sdk/vite';`, placed among the imports.
- Replace the `server: { proxy: { … } }` block with:

  ```ts
    // In development Vite passes API, Socket.IO and API explorer traffic to the Rollcall server (ADR-0004).
    server: { proxy: serverProxy() },
  ```

The overlay plugin and the build inputs stay in this task.

The other wiring:
- **`rcl-core/web/package.json`:** add `"@rollcall/web-sdk": "workspace:^"` to `dependencies`, in alphabetical order.
- **Root `package.json`:** `"workspaces"` becomes `["rcl-core/*", "packages/*", "e2e"]`.
- **`rcl-core/web/.storybook/admin/main.ts`:** replace the comment above `config` and the `stories` line with:

```ts
// The admin Storybook: shared Mantine components from the web SDK and the admin app (ADR-0015). Overlay components
// have their own Storybook, so Mantine never loads next to them (ADR-0006). Nothing here calls home: telemetry, crash
// reports and update notices are off.
const config: StorybookConfig = {
  // rcl-core's own components add '../../src/**/*.stories.tsx' here with their first story: Storybook warns about a
  // pattern that matches nothing.
  stories: ['../../../../packages/web-sdk/src/**/*.stories.tsx'],
```

`vitest.config.ts`:
- The first comment line becomes `` // `yarn test` runs every workspace: Node for server and contract, jsdom + React for the web apps and the web SDK. ``
- Replace the `web` project with these two:

```ts
      {
        extends: './rcl-core/web/vite.config.ts',
        test: {
          name: 'core-web',
          root: './rcl-core/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['../../packages/web-sdk/src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'web-sdk',
          root: './packages/web-sdk',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
        },
      },
```

Then run `yarn install`, and check that `git diff yarn.lock` only adds the `@rollcall/web-sdk` workspace entry and its dependency lines. The `YN0086` peer warning about `@storybook/icons` was already there on `main`.

- [ ] **Step 5: Run the tests and see them pass.**

Run: `yarn vitest run rcl-core/web packages/web-sdk`
Expected: PASS. That's `core-web` (App, dev proxy, overlay and live tests) and `web-sdk` (api, health, vite). `yarn test` in full shows 193 tests passing.

Run: `yarn test:stories`
Expected: PASS, 8 tests: ServerStatus's 3 (from the SDK) and PlaceholderCard's 5. There's no "No story files found" warning.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check && yarn build && yarn test:e2e
git add -A package.json yarn.lock vitest.config.ts packages rcl-core/web
git commit -F - <<'EOF'
feat(sdk): shared web SDK for the rcl apps' GUIs

The app shell, server badge, RTK Query base API, store and the dev proxy
move from rcl-core/web into @rollcall/web-sdk (packages/web-sdk), with their
history. AppLayout takes the app's title. The admin Storybook shows the SDK's
stories, and every web Vitest project shares its jsdom setup.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: The Producer app, with the OBS overlay

**Files:**
- Move (`git mv`) from `rcl-core/web/` to `rcl-producer/web/`: `overlay.html`, `src/overlay/` (everything in it) and `.storybook/overlay/`
- Create:
  - `rcl-producer/web/{package.json,tsconfig.json,tsconfig.node.json,index.html,vite.config.ts,public/favicon.svg}`
  - `rcl-producer/web/src/{base.ts,main.tsx,routes.tsx,pages/HomePage.tsx}`
  - `rcl-core/server/src/web-apps.ts`, `e2e/tests/producer.spec.ts`
- Modify: `rcl-producer/web/src/overlay/bundle.test.ts`, `rcl-core/web/{vite.config.ts,package.json}`, `rcl-core/server/src/{app.ts,server.ts}`, `package.json`, `vitest.config.ts`, `vitest.stories.config.ts`, `e2e/tests/overlay.spec.ts`, `yarn.lock`
- Test: `rcl-producer/web/src/App.test.tsx` (new), `rcl-producer/web/src/overlay/bundle.test.ts`, `rcl-core/server/src/web-apps.test.ts` (`git mv` from `static.test.ts`, rewritten), and the e2e specs

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces:
  - **`rcl-core/server/src/web-apps.ts`:**
    - `interface WebApp { base: string; dir: string; pages?: Record<string, string> }`;
    - `installedWebApps(coreWebDir: string): WebApp[]`;
    - `serveWebApps(app: FastifyInstance, webApps: readonly WebApp[]): void`.
  - **`AppOptions.webApps?: readonly WebApp[]`** replaces `AppOptions.webDir`.
  - **`PRODUCER_BASE = '/producer/'`** in `rcl-producer/web/src/base.ts`.

In this task rcl-core's app stays at `/`; Task 3 moves it to `/core/`.

- [ ] **Step 1: Move the overlay, keeping its history.**

```bash
mkdir -p rcl-producer/web/src/pages rcl-producer/web/public rcl-producer/web/.storybook
git mv rcl-core/web/overlay.html rcl-producer/web/overlay.html
git mv rcl-core/web/src/overlay rcl-producer/web/src/overlay
git mv rcl-core/web/.storybook/overlay rcl-producer/web/.storybook/overlay
cp rcl-core/web/public/favicon.svg rcl-producer/web/public/favicon.svg
git mv rcl-core/server/src/static.test.ts rcl-core/server/src/web-apps.test.ts
```

The overlay Storybook's paths (`../../src/overlay/…`) are the same relative to its new home, so its files don't change.

- [ ] **Step 2: Write the failing tests.**

Create `rcl-producer/web/src/App.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App, makeStore } from '@rollcall/web-sdk';
import { routes } from './routes.tsx';

const health = { status: 'ok', name: 'Rollcall', version: '0.1.0', uptimeSeconds: 5 };
afterEach(() => vi.unstubAllGlobals());

describe('the Producer app', () => {
  it('shows its shell, the server version and where to point OBS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(health)),
    );
    render(<App router={createMemoryRouter(routes)} store={makeStore()} />);
    expect(await screen.findByRole('heading', { name: 'Rollcall Producer' })).toBeTruthy();
    expect(await screen.findByText('Server v0.1.0')).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/producer/overlay`)).toBeTruthy();
  });
});
```

Replace `rcl-producer/web/src/overlay/bundle.test.ts` with:

```ts
// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// ADR-0006: the overlay entry must stay lean. This builds the Producer app for real and inspects which modules
// each page actually loads.
interface ManifestChunk {
  file: string;
  imports?: string[];
}

interface OutputChunk {
  type: 'chunk' | 'asset';
  fileName: string;
  moduleIds?: string[];
}

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), 'rollcall-producer-build-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

// Every JavaScript file a page loads: its entry chunk and everything it imports, transitively.
function filesFor(manifest: Record<string, ManifestChunk>, key: string, seen = new Set<string>()): string[] {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return [];
  seen.add(key);
  return [chunk.file, ...(chunk.imports ?? []).flatMap((k) => filesFor(manifest, k, seen))];
}

const mantine = (id: string) => id.includes('/@mantine/');
const webSdk = (id: string) => id.includes('/packages/web-sdk/');

describe('overlay bundle', () => {
  it('contains no Mantine and no web SDK code', async () => {
    const result = (await build({
      root: webRoot,
      configFile: join(webRoot, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, manifest: true },
    })) as { output: OutputChunk[] };
    const manifest = JSON.parse(readFileSync(join(outDir, '.vite/manifest.json'), 'utf8')) as Record<
      string,
      ManifestChunk
    >;
    const modulesOf = (page: string) => {
      const files = new Set(filesFor(manifest, page));
      return result.output.filter((c) => files.has(c.fileName)).flatMap((c) => c.moduleIds ?? []);
    };
    const app = modulesOf('index.html');
    const overlay = modulesOf('overlay.html');

    expect(overlay.length).toBeGreaterThan(0);
    // The Producer app loads both, which proves the checks can see them.
    expect(app.some(mantine)).toBe(true);
    expect(app.some(webSdk)).toBe(true);
    expect(overlay.filter(mantine)).toEqual([]);
    expect(overlay.filter(webSdk)).toEqual([]);
  }, 60_000);
});
```

Replace `rcl-core/server/src/web-apps.test.ts` with:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testApp } from './testing.ts';
import type { WebApp } from './web-apps.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

// A fake production build: index.html saying which app it is, any extra pages, and one asset.
function build(app: string, pages: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), `rollcall-${app}-web-`));
  dirs.push(dir);
  writeFileSync(join(dir, 'index.html'), `<!doctype html><title>${app}</title><div id="${app}-root"></div>`);
  for (const page of pages) writeFileSync(join(dir, `${page}.html`), `<!doctype html><div id="${app}-${page}"></div>`);
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', `${app}.js`), `console.log("${app}")`);
  return dir;
}

function appWithBuilds(): WebApp[] {
  return [
    { base: '/', dir: build('core') },
    { base: '/producer/', dir: build('producer', ['overlay']), pages: { overlay: 'overlay.html' } },
  ];
}

async function get(webApps: readonly WebApp[], url: string) {
  const { app } = testApp({ webApps });
  const res = await app.inject({ method: 'GET', url });
  await app.close();
  return res;
}

describe('serving the web apps', () => {
  it("serves each app's index.html at its base", async () => {
    const webApps = appWithBuilds();
    for (const [url, root] of [
      ['/', 'core-root'],
      ['/producer/', 'producer-root'],
    ] as const) {
      const res = await get(webApps, url);
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type'], url).toMatch(/text\/html/);
      expect(res.body, url).toContain(`<div id="${root}">`);
    }
  });

  it("serves each app's built assets below its base", async () => {
    const webApps = appWithBuilds();
    for (const url of ['/assets/core.js', '/producer/assets/producer.js']) {
      const res = await get(webApps, url);
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type'], url).toMatch(/javascript/);
    }
  });

  it("falls back to the right app's index.html for client-side routes", async () => {
    const webApps = appWithBuilds();
    for (const [url, root] of [
      ['/teams/42', 'core-root'],
      ['/producer', 'producer-root'],
      ['/producer/screens/3?tab=layout', 'producer-root'],
      ['/producerish', 'core-root'],
    ] as const) {
      expect((await get(webApps, url)).body, url).toContain(`<div id="${root}">`);
    }
  });

  it("serves an app's page at its path and everything below it", async () => {
    const webApps = appWithBuilds();
    for (const url of [
      '/producer/overlay',
      '/producer/overlay/',
      '/producer/overlay/some-output-token',
      '/producer/overlay?x=1',
    ]) {
      const res = await get(webApps, url);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toContain('<div id="producer-overlay">');
    }
  });

  it("does not treat look-alike paths as an app's page", async () => {
    expect((await get(appWithBuilds(), '/producer/overlays-list')).body).toContain('<div id="producer-root">');
  });

  it('keeps JSON 404s for unknown API routes', async () => {
    const res = await get(appWithBuilds(), '/api/nope');
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('serves the apps that are built and skips the rest', async () => {
    const webApps = [
      { base: '/', dir: join(tmpdir(), 'rollcall-web-does-not-exist') },
      { base: '/producer/', dir: build('producer', ['overlay']), pages: { overlay: 'overlay.html' } },
    ];
    expect((await get(webApps, '/producer/screens/3')).body).toContain('<div id="producer-root">');
    expect((await get(webApps, '/producer/overlay')).body).toContain('<div id="producer-overlay">');
    expect((await get(webApps, '/')).statusCode).toBe(404);
  });

  it('still serves the API when there is no web build yet', async () => {
    const webApps = [{ base: '/', dir: join(tmpdir(), 'rollcall-web-does-not-exist') }];
    const { app } = testApp({ webApps });
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'Not Found' });
    await app.close();
  });
});
```

In `e2e/tests/overlay.spec.ts`:
- every `page.goto('/overlay')` becomes `page.goto('/producer/overlay')`;
- `page.goto('/overlay/some-output-token')` becomes `page.goto('/producer/overlay/some-output-token')`;
- the third test's title becomes `'also answers below /producer/overlay, where output URLs will live'`.

Create `e2e/tests/producer.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('the Producer app shows its shell, a reachable server and where to point OBS', async ({ page, baseURL }) => {
  await page.goto('/producer/');
  await expect(page.getByRole('heading', { name: 'Rollcall Producer' })).toBeVisible();
  await expect(page.getByText(/^Server v\d+\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByText(`${baseURL}/producer/overlay`)).toBeVisible();
});
```

- [ ] **Step 3: Run the tests and see them fail.**

Run: `yarn vitest run rcl-core/server/src/web-apps.test.ts`
Expected: FAIL. `testApp` ignores the unknown `webApps` option, so nothing serves the builds. Every test that expects a page gets a 404.

(The Producer app's own tests can't run until its workspace exists in Step 4.)

- [ ] **Step 4: Make the Producer app.**

Create `rcl-producer/web/package.json`:

```json
{
  "name": "@rollcall/producer-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.node.json",
    "storybook": "storybook dev -c .storybook/overlay -p 6007 --host localhost --exact-port --no-open --no-version-updates"
  },
  "dependencies": {
    "@mantine/core": "^9.6.3",
    "@mantine/hooks": "^9.6.3",
    "@reduxjs/toolkit": "^2.13.0",
    "@rollcall/core-contract": "workspace:^",
    "@rollcall/web-sdk": "workspace:^",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-redux": "^9.3.0",
    "react-router": "^8.4.0",
    "socket.io-client": "^4.8.4"
  },
  "devDependencies": {
    "@storybook/addon-a11y": "^10.6.1",
    "@storybook/addon-docs": "^10.6.1",
    "@storybook/addon-vitest": "^10.6.1",
    "@storybook/react-vite": "^10.6.1",
    "@testing-library/dom": "^10.4.2",
    "@testing-library/react": "^16.3.3",
    "@types/node": "^24",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "jsdom": "^30.1.1",
    "storybook": "^10.6.1",
    "typescript": "^7.0.2",
    "vite": "^8.3.1"
  }
}
```

`rcl-producer/web/tsconfig.json` is a copy of `rcl-core/web/tsconfig.json` (`cp`). Create `rcl-producer/web/tsconfig.node.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["vite.config.ts", "src/base.ts"]
}
```

Create `rcl-producer/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>Rollcall Producer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `rcl-producer/web/src/base.ts`:

```ts
// Where the server serves the Producer app (split spec). Vite's `base`, the router's basename and the overlay
// address all come from here, so they can't disagree.
export const PRODUCER_BASE = '/producer/';
```

Create `rcl-producer/web/vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { serverProxy } from '@rollcall/web-sdk/vite';
import { PRODUCER_BASE } from './src/base.ts';

// Two pages: the Producer app (index.html) and the lean OBS overlay (overlay.html, ADR-0006).
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// Serve the overlay at /producer/overlay in development too, matching the production server: real files (and
// other tools' own paths, such as the overlay Storybook's config files) win, and only an unmatched
// /producer/overlay request falls back to the overlay page. Returning a function from configureServer runs this
// after Vite's own middlewares, the same precedence as the production server's not-found handler
// (rcl-core/server/src/web-apps.ts).
const overlayRoute: Plugin = {
  name: 'rollcall-overlay-route',
  configureServer(dev) {
    return () => {
      dev.middlewares.use((req, _res, next) => {
        if (req.url && /^\/producer\/overlay(\/|$|\?)/.test(req.url)) req.url = '/producer/overlay.html';
        next();
      });
    };
  },
};

export default defineConfig({
  base: PRODUCER_BASE,
  plugins: [react(), overlayRoute],
  // Port 5174, next to rcl-core's 5173. In development Vite passes API, Socket.IO and API explorer traffic to the
  // Rollcall server (ADR-0004).
  server: { port: 5174, strictPort: true, proxy: serverProxy() },
  build: {
    rolldownOptions: {
      input: { main: page('./index.html'), overlay: page('./overlay.html') },
    },
  },
});
```

Create `rcl-producer/web/src/main.tsx`:

```tsx
import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App, makeStore } from '@rollcall/web-sdk';
import { PRODUCER_BASE } from './base.ts';
import { routes } from './routes.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App router={createBrowserRouter(routes, { basename: PRODUCER_BASE })} store={makeStore()} />
  </StrictMode>,
);
```

Create `rcl-producer/web/src/routes.tsx`:

```tsx
import type { RouteObject } from 'react-router';
import { APP_NAME } from '@rollcall/core-contract';
import { AppLayout } from '@rollcall/web-sdk';
import { HomePage } from './pages/HomePage.tsx';

// Theme Builder, Screen Builder and Live Mode pages are added here as they're built.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout title={`${APP_NAME} Producer`} />,
    children: [{ index: true, element: <HomePage /> }],
  },
];
```

Create `rcl-producer/web/src/pages/HomePage.tsx`:

```tsx
import { Card, Code, Stack, Text, Title } from '@mantine/core';
import { PRODUCER_BASE } from '../base.ts';

// The Producer app's home until the builders and Live Mode arrive: where to point OBS.
export function HomePage() {
  const overlayUrl = `${window.location.origin}${PRODUCER_BASE}overlay`;
  return (
    <Stack maw={560}>
      <Title order={2}>OBS overlay</Title>
      <Card withBorder>
        <Stack gap="xs">
          <Text>Add this address to OBS as a browser source:</Text>
          <Code block>{overlayUrl}</Code>
        </Stack>
      </Card>
    </Stack>
  );
}
```

**rcl-core's web app without the overlay.** Replace `rcl-core/web/vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serverProxy } from '@rollcall/web-sdk/vite';

export default defineConfig({
  plugins: [react()],
  // In development Vite passes API, Socket.IO and API explorer traffic to the Rollcall server (ADR-0004).
  server: { proxy: serverProxy() },
});
```

In `rcl-core/web/package.json`:
- remove `socket.io-client` from `dependencies`;
- the `storybook` script becomes `storybook dev -c .storybook/admin -p 6006 --host localhost --exact-port --no-version-updates`.

**The server serves each app below its base.** Create `rcl-core/server/src/web-apps.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/** One rcl app's web build, served below `base` (split spec). */
export interface WebApp {
  /** Where it's served, matching its Vite `base`: `/producer/`, or `/` for the app at the root. */
  base: string;
  /** Its production build folder. Skipped while it has no index.html (e.g. in development). */
  dir: string;
  /**
   * More HTML pages, each answering one path below `base` and everything under it, such as
   * `{ overlay: 'overlay.html' }`.
   */
  pages?: Record<string, string>;
}

const PRODUCER_WEB_DIR = fileURLToPath(new URL('../../../rcl-producer/web/dist', import.meta.url));

// The web builds this server serves. Temporary: Phase 4b replaces this list with each installed app module's `web`.
export function installedWebApps(coreWebDir: string): WebApp[] {
  return [
    { base: '/', dir: coreWebDir },
    { base: '/producer/', dir: PRODUCER_WEB_DIR, pages: { overlay: 'overlay.html' } },
  ];
}

// Serves each app's build below its base: real files as they are, its pages at their paths, and index.html for
// every other GET below the base, so client-side routes like /producer/screens/3 load. API and Socket.IO paths, and
// paths no app claims, get a JSON 404.
export function serveWebApps(app: FastifyInstance, webApps: readonly WebApp[]): void {
  const built = webApps.filter((web) => existsSync(join(web.dir, 'index.html')));
  built.forEach((web, i) => {
    // Only the first registration may add reply.sendFile; the others share it.
    void app.register(fastifyStatic, { root: web.dir, prefix: web.base, wildcard: false, decorateReply: i === 0 });
  });
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    const web = request.method === 'GET' && !/^\/(api|socket\.io)(\/|$)/.test(path) ? appAt(built, path) : undefined;
    if (!web) {
      return reply
        .code(404)
        .send({ message: `Route ${request.method}:${request.url} not found`, error: 'Not Found', statusCode: 404 });
    }
    return reply.type('text/html').sendFile(pageAt(web, path), web.dir);
  });
}

// The app with the longest base that `path` is at or below ('/producer' counts as '/producer/').
function appAt(apps: readonly WebApp[], path: string): WebApp | undefined {
  return apps
    .filter((web) => `${path}/`.startsWith(web.base))
    .reduce<WebApp | undefined>((best, web) => (best && best.base.length >= web.base.length ? best : web), undefined);
}

// The page that answers `path`: one of the app's own pages, or its index.html.
function pageAt(web: WebApp, path: string): string {
  const below = path.slice(web.base.length);
  const page = Object.entries(web.pages ?? {}).find(([name]) => below === name || below.startsWith(`${name}/`));
  return page?.[1] ?? 'index.html';
}
```

In `rcl-core/server/src/app.ts`:
- delete the imports of `existsSync`, `join` and `fastifyStatic`;
- add `import { serveWebApps, type WebApp } from './web-apps.ts';` after the routes imports;
- in `AppOptions`, replace the `webDir` doc comment and field with:

  ```ts
    /** The rcl apps' web builds to serve, each below its own base. */
    webApps?: readonly WebApp[];
  ```

- in `buildApp`'s parameters, `webDir,` becomes `webApps = [],`;
- the line `if (webDir && existsSync(join(webDir, 'index.html'))) serveWebBuild(app, webDir);` becomes `serveWebApps(app, webApps);`;
- delete the whole `serveWebBuild` function and its comment.

In `rcl-core/server/src/server.ts`:
- add `import { installedWebApps } from './web-apps.ts';` after the `realtime.ts` import;
- the `buildApp` line becomes:

```ts
  const webApps = installedWebApps(config.webDir);
  const app = buildApp({ version, logger, webApps, db, apiDocs: config.apiDocs, permissions });
```

**Workspaces, scripts and test configs.**

In the root `package.json`:
- `"workspaces"` becomes `["rcl-core/*", "rcl-producer/*", "packages/*", "e2e"]`;
- `"build"` becomes `"yarn workspaces foreach --all --exclude rollcall run build"`;
- `"storybook"` becomes `"yarn workspace @rollcall/producer-web storybook & yarn workspace @rollcall/core-web storybook"`.

In `vitest.config.ts`, add this project between `core-web` and `web-sdk`:

```ts
      {
        extends: './rcl-producer/web/vite.config.ts',
        test: {
          name: 'producer-web',
          root: './rcl-producer/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['../../packages/web-sdk/src/test/setup.ts'],
        },
      },
```

In `vitest.stories.config.ts`, replace `storybookProject` and the `projects` line with:

```ts
const storybookProject = (name: 'admin' | 'overlay', web: 'rcl-core/web' | 'rcl-producer/web') => ({
  extends: `./${web}/vite.config.ts`,
  plugins: [storybookTest({ configDir: fileURLToPath(new URL(`./${web}/.storybook/${name}`, import.meta.url)) })],
  test: {
    name: `storybook-${name}`,
    root: `./${web}`,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' as const }],
    },
  },
});

export default defineConfig({
  test: {
    projects: [storybookProject('admin', 'rcl-core/web'), storybookProject('overlay', 'rcl-producer/web')],
  },
});
```

Run `yarn install`. The lockfile gains the `@rollcall/producer-web` workspace entry, and `@rollcall/core-web` loses `socket.io-client`.

- [ ] **Step 5: Run the tests and see them pass.**

Run: `yarn vitest run rcl-core/server/src/web-apps.test.ts rcl-producer/web`
Expected: PASS. There are 8 serving tests, and the Producer app has App, bundle, live and PlaceholderCard tests. `yarn test` in full shows 195 tests passing.

- [ ] **Step 6: Check, build, run the story and end-to-end tests, and commit.**

```bash
yarn format && yarn check && yarn build && yarn test:stories && yarn test:e2e
```

Expected:
- `yarn build` builds both `rcl-core/web/dist` and `rcl-producer/web/dist`;
- story tests: 8 pass, with the overlay Storybook now in `rcl-producer/web`;
- e2e: 5 pass (admin, producer, three overlay).

```bash
git add -A package.json yarn.lock vitest.config.ts vitest.stories.config.ts rcl-core rcl-producer e2e
git commit -F - <<'EOF'
feat(rcl-producer): Producer web app at /producer/, with the OBS overlay

New workspace rcl-producer/web: a Mantine shell titled "Rollcall Producer"
whose home page shows the overlay address, and the overlay, moved from
rcl-core/web with its Storybook and history, now at /producer/overlay. The
server serves each app's build below its base (web-apps.ts). The bundle test
now also proves no web SDK module reaches the overlay.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: rcl-core's app moves to `/core/`

**Files:**
- Create: `rcl-core/web/src/base.ts`
- Modify: `rcl-core/web/{vite.config.ts,tsconfig.node.json}`, `rcl-core/web/src/main.tsx`, `rcl-core/server/src/{web-apps.ts,app.ts}`, `e2e/tests/admin.spec.ts`
- Test: `rcl-core/server/src/web-apps.test.ts`, `e2e/tests/admin.spec.ts`

**Interfaces:**
- Consumes: `WebApp`, `installedWebApps` and `serveWebApps` (Task 2).
- Produces:
  - `CORE_BASE = '/core/'` in `rcl-core/web/src/base.ts`.
  - `serveWebApps` now redirects `GET /` (302) to the first app's base, unless some app is served at `/`.
  - `installedWebApps` lists core first, at `/core/`.

- [ ] **Step 1: Write the failing tests.**

In `rcl-core/server/src/web-apps.test.ts`:
- in `appWithBuilds`, core's `base: '/'` becomes `base: '/core/'`;
- in the first test, `['/', 'core-root']` becomes `['/core/', 'core-root']`;
- in the second test, `'/assets/core.js'` becomes `'/core/assets/core.js'`.

In the third test, the list becomes:

```ts
      ['/core', 'core-root'],
      ['/core/teams/42', 'core-root'],
      ['/producer', 'producer-root'],
      ['/producer/screens/3?tab=layout', 'producer-root'],
```

Replace the test `'keeps JSON 404s for unknown API routes'` with:

```ts
  it('sends / to the first app', async () => {
    const res = await get(appWithBuilds(), '/');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/core/');
  });

  it('answers paths no app claims, and unknown API routes, with a JSON 404', async () => {
    // /overlay is where the OBS overlay was before it moved to /producer/overlay; it has no redirect.
    for (const url of ['/api/nope', '/overlay', '/teams/42', '/producerish']) {
      const res = await get(appWithBuilds(), url);
      expect(res.statusCode, url).toBe(404);
      expect(res.headers['content-type'], url).toMatch(/application\/json/);
    }
  });
```

In `'serves the apps that are built and skips the rest'`:
- core's `base: '/'` becomes `base: '/core/'`;
- the last line becomes `expect((await get(webApps, '/core/')).statusCode).toBe(404);`.

In `'still serves the API when there is no web build yet'`:
- `base: '/'` becomes `base: '/core/'`;
- `url: '/'` becomes `url: '/core/'`.

Replace `e2e/tests/admin.spec.ts` with:

```ts
import { expect, test } from '@playwright/test';

test('the admin app lives at /core/, where / takes you, and shows a reachable server', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/core\/$/);
  await expect(page.getByRole('heading', { name: 'Rollcall' })).toBeVisible();
  await expect(page.getByText(/^Server v\d+\.\d+\.\d+/)).toBeVisible();
});
```

- [ ] **Step 2: Run the tests and see them fail.**

Run: `yarn vitest run rcl-core/server/src/web-apps.test.ts`
Expected: FAIL, 1 test: `sends / to the first app` gets 404 instead of 302. The other changed tests already pass, because serving doesn't depend on where core's base is; they pin the new layout.

- [ ] **Step 3: Serve core at `/core/`, and redirect `/` there.**

Create `rcl-core/web/src/base.ts`:

```ts
// Where the server serves rcl-core's web app (split spec); `/` redirects here. Vite's `base` and the router's
// basename both come from here, so they can't disagree.
export const CORE_BASE = '/core/';
```

In `rcl-core/web/vite.config.ts`, add `import { CORE_BASE } from './src/base.ts';` after the web SDK import, and add `base: CORE_BASE,` as the first property of the config. Then:
- **`rcl-core/web/tsconfig.node.json`:** `"include"` becomes `["vite.config.ts", "postcss.config.js", "src/base.ts"]`.
- **`rcl-core/web/src/main.tsx`:**
  - add `import { CORE_BASE } from './base.ts';` above the routes import;
  - `createBrowserRouter(routes)` becomes `createBrowserRouter(routes, { basename: CORE_BASE })`.

In `rcl-core/server/src/web-apps.ts`, the comment and first entry of `installedWebApps` become:

```ts
// The web builds this server serves, core's first. Temporary: Phase 4b replaces this list with each installed app
// module's `web`.
export function installedWebApps(coreWebDir: string): WebApp[] {
  return [
    { base: '/core/', dir: coreWebDir },
```

The comment above `serveWebApps`, and the function's first lines, become:

```ts
// Serves each app's build below its base: real files as they are, its pages at their paths, and index.html for
// every other GET below the base, so client-side routes like /producer/screens/3 load. `/` redirects to the first
// app (core's). API and Socket.IO paths, and paths no app claims, get a JSON 404.
export function serveWebApps(app: FastifyInstance, webApps: readonly WebApp[]): void {
  const home = webApps[0]?.base;
  if (home && !webApps.some((web) => web.base === '/')) {
    app.get('/', (_request, reply) => reply.redirect(home, 302));
  }
```

In `rcl-core/server/src/app.ts`, the `webApps` doc comment becomes `` /** The rcl apps' web builds to serve, each below its own base. `/` redirects to the first one. */ ``.

- [ ] **Step 4: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server/src/web-apps.test.ts rcl-core/web`
Expected: PASS. There are 9 serving tests, and `core-web` still passes, because tests use a memory router. `yarn test` in full shows 196 tests passing.

- [ ] **Step 5: Check, build, run the story and end-to-end tests, and commit.**

```bash
yarn format && yarn check && yarn build && yarn test:stories && yarn test:e2e
```

Expected: all pass, with 8 story tests and 5 e2e tests. The admin Storybook still works: Storybook serves its iframe from `/` whatever the app's `base` is.

```bash
git add rcl-core e2e
git commit -F - <<'EOF'
feat(rcl-core): the admin app moves to /core/, and / redirects there

rcl-core's web app is built and served below /core/ (CORE_BASE for Vite and
the router). The server redirects / to the first web app, core's. Paths no
app claims, including the old /overlay, get a JSON 404.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: The dev front door

**Files:**
- Modify: `packages/web-sdk/src/vite.ts`, `rcl-core/web/vite.config.ts`, `rcl-producer/web/vite.config.ts`
- Test: `packages/web-sdk/src/vite.test.ts`, `rcl-core/web/src/dev-proxy.test.ts`, `rcl-producer/web/src/dev-proxy.test.ts` (new)

**Interfaces:**
- Consumes: `serverProxy` (Task 1), `CORE_BASE` (Task 3).
- Produces, from `@rollcall/web-sdk/vite`:
  - `DEV_PORTS = { core: 5173, producer: 5174 } as const`;
  - `frontDoorProxy(target?: string): Record<string, ProxyOptions>`, which is `serverProxy(target)` plus `'/producer': { target: 'http://localhost:5174', ws: true }`;
  - `redirectRoot(home: string): Plugin`.

- [ ] **Step 1: Write the failing tests.** Replace `packages/web-sdk/src/vite.test.ts` with:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEV_PORTS, frontDoorProxy, serverProxy } from './vite.ts';

describe('serverProxy', () => {
  it('passes the API, the API explorer and Socket.IO to the server, keeping Host as it is', () => {
    const proxy = serverProxy('http://localhost:5580');
    expect(Object.keys(proxy)).toEqual(['/api', '/docs', '/socket.io']);
    for (const [path, entry] of Object.entries(proxy)) {
      expect(entry.target, path).toBe('http://localhost:5580');
      expect(entry.changeOrigin, path).not.toBe(true);
    }
    expect(proxy['/socket.io']?.ws).toBe(true);
  });
});

describe('frontDoorProxy', () => {
  it("adds the Producer app's dev server, WebSockets included, keeping Host as it is", () => {
    const proxy = frontDoorProxy('http://localhost:5580');
    expect(proxy).toMatchObject(serverProxy('http://localhost:5580'));
    expect(proxy['/producer']).toEqual({ target: `http://localhost:${DEV_PORTS.producer}`, ws: true });
    for (const [path, entry] of Object.entries(proxy)) expect(entry.changeOrigin, path).not.toBe(true);
  });
});
```

Replace `rcl-core/web/src/dev-proxy.test.ts` with:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { frontDoorProxy } from '@rollcall/web-sdk/vite';
import config from '../vite.config.ts';

// rcl-core's Vite is the front door: the shared helper's proxy, which keeps `Host` unchanged for the server's Origin
// checks (ADR-0018) and reaches the Producer app's Vite too.
describe('dev proxy', () => {
  it('passes the server paths and /producer on', () => {
    expect(config.server?.proxy).toEqual(frontDoorProxy());
  });
});
```

Create `rcl-producer/web/src/dev-proxy.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { serverProxy } from '@rollcall/web-sdk/vite';
import config from '../vite.config.ts';

// The dev proxy is the shared helper's, which keeps `Host` unchanged for the server's Origin checks (ADR-0018).
describe('dev proxy', () => {
  it('passes the API, the API explorer and Socket.IO to the server', () => {
    expect(config.server?.proxy).toEqual(serverProxy());
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run packages/web-sdk rcl-core/web/src/dev-proxy.test.ts rcl-producer/web/src/dev-proxy.test.ts`
Expected: FAIL. `frontDoorProxy` and `DEV_PORTS` don't exist yet, and rcl-core's proxy has no `/producer` entry.

(The Producer app's test already passes: its proxy is `serverProxy()` since Task 2. It pins that from now on.)

- [ ] **Step 3: Build the front door.**

Replace `packages/web-sdk/src/vite.ts` with:

```ts
import type { Plugin, ProxyOptions } from 'vite';

/** Each rcl web app's Vite dev server port. rcl-core's is the front door: open it, not the others. */
export const DEV_PORTS = { core: 5173, producer: 5174 } as const;

// Dev-server proxy entries for every rcl web app (ADR-0004): the browser talks only to Vite, which passes API,
// API explorer (/docs) and Socket.IO traffic to the Rollcall server. Object entries, never the string shorthand:
// the shorthand turns on `changeOrigin`, which rewrites `Host`, and the server's CSRF and socket checks compare
// `Origin` with `Host` (ADR-0018).
export function serverProxy(
  target = process.env.ROLLCALL_DEV_SERVER ?? 'http://localhost:5580',
): Record<string, ProxyOptions> {
  return {
    '/api': { target },
    '/docs': { target },
    '/socket.io': { target, ws: true },
  };
}

// The front door's proxy (rcl-core's Vite): the server's paths, plus the Producer app's own Vite below /producer,
// WebSockets included, so its hot reload works through the front door too.
export function frontDoorProxy(target?: string): Record<string, ProxyOptions> {
  return { ...serverProxy(target), '/producer': { target: `http://localhost:${DEV_PORTS.producer}`, ws: true } };
}

/** A Vite plugin that sends `/` to `home`, as the production server does. */
export function redirectRoot(home: string): Plugin {
  return {
    name: 'rollcall-redirect-root',
    configureServer(dev) {
      dev.middlewares.use((req, res, next) => {
        if (req.url !== '/') return next();
        res.writeHead(302, { Location: home }).end();
      });
    },
  };
}
```

Replace `rcl-core/web/vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { DEV_PORTS, frontDoorProxy, redirectRoot } from '@rollcall/web-sdk/vite';
import { CORE_BASE } from './src/base.ts';

export default defineConfig({
  base: CORE_BASE,
  plugins: [react(), redirectRoot(CORE_BASE)],
  // The front door in development: Vite passes API, Socket.IO and API explorer traffic to the Rollcall server
  // (ADR-0004), and /producer to the Producer app's own Vite, so everything works through this one port.
  server: { port: DEV_PORTS.core, strictPort: true, proxy: frontDoorProxy() },
});
```

In `rcl-producer/web/vite.config.ts`:
- the web SDK import becomes `import { DEV_PORTS, serverProxy } from '@rollcall/web-sdk/vite';`;
- the `server` comment and line become:

```ts
  // Reached through rcl-core's Vite (the front door) at /producer/, or directly on its own port. Either way it passes
  // API, Socket.IO and API explorer traffic to the Rollcall server (ADR-0004).
  server: { port: DEV_PORTS.producer, strictPort: true, proxy: serverProxy() },
```

- [ ] **Step 4: Run them and see them pass.**

Run: `yarn vitest run packages/web-sdk rcl-core/web rcl-producer/web`
Expected: PASS. `yarn test` in full shows 198 tests passing.

- [ ] **Step 5: Check the front door by hand.** The spec asks for this, and no automated test covers a running dev server.

1. Make sure ports 5580, 5173 and 5174 are free (`lsof -nP -iTCP:5173 -sTCP:LISTEN`, and the same for the others), then run `yarn dev` in the background. Once `curl -sf http://localhost:5173/core/` answers:

   ```bash
   curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:5173/   # 302 -> http://localhost:5173/core/
   curl -s http://localhost:5173/producer/ | grep -o "<title>[^<]*</title>"             # <title>Rollcall Producer</title>
   curl -s http://localhost:5173/producer/overlay | grep -o "<title>[^<]*</title>"      # <title>Rollcall overlay</title>
   curl -s http://localhost:5173/api/health                                              # {"status":"ok",…}
   ```

2. In a browser (Playwright MCP or by hand):
   1. Open `http://localhost:5173/producer/`. The console shows `[vite] connected.`.
   2. Set `window.__marker = 1`.
   3. Edit the text in `rcl-producer/web/src/pages/HomePage.tsx`. The page shows the change while `window.__marker` is still `1`, which means it was a hot update, not a reload.
   4. Undo the edit.
   5. Open `http://localhost:5173/producer/overlay`: the card `Rollcall v0.1.0` appears on a transparent page.
   6. Open `http://localhost:5173/`: you land on `/core/`, and the console shows `[vite] connected.`.
3. Stop `yarn dev`. Delete any `.playwright-mcp/` folder the browser tool left behind, and run `git status`: nothing should be left over.

- [ ] **Step 6: Check, build, run the story and end-to-end tests, and commit.**

```bash
yarn format && yarn check && yarn build && yarn test:stories && yarn test:e2e
git add packages rcl-core/web rcl-producer/web
git commit -F - <<'EOF'
feat(repo): one dev front door for both web apps

rcl-core's Vite (5173) passes /producer, WebSockets included, to the Producer
app's Vite (5174), and the server's paths to the server, so both apps and their
hot reload work through one port. / redirects to /core/ as on the server. Ports
and proxies come from @rollcall/web-sdk/vite.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Docs, agent rules and the CHANGELOG

**Files:**
- Create: `rcl-producer/AGENTS.md`, `rcl-producer/CLAUDE.md`, `.claude/rules/rcl-producer-web.md`, `.claude/rules/sdk.md`
- Move (`git mv`): `.claude/rules/rcl-core-overlay.md` to `.claude/rules/rcl-producer-overlay.md`
- Modify: `AGENTS.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `rcl-core/AGENTS.md`, `rcl-core/CLAUDE.md`, `.claude/rules/rcl-core-web.md`, `docs/architecture/README.md`, `docs/features/users-and-access.md`, `docs/guides/local-development.md`, `docs/guides/testing.md`

**Interfaces:** none. The docs describe what Tasks 1–4 built, and the docs lint checks the links.

Each edit below replaces the quoted text **exactly once**. If the text isn't there exactly once, stop and compare with the file.

- [ ] **Step 1: The Producer app's own files.** Create `rcl-producer/AGENTS.md`:

````markdown
# rcl-producer — agent instructions

rcl-producer is the Producer app: themes, screens, Live Mode, producer dashboards and the OBS overlay ([ADR-0016](../docs/decisions/0016-obs-producer-becomes-rollcall.md)). It has no server process of its own. rcl-core's server serves its web build at `/producer/`, and its server code will run inside rcl-core as an app module (Phase 4b of the split spec).

These rules add to the repo-root [AGENTS.md](../AGENTS.md). Its hard rules apply here.

## Layout

```
rcl-producer/
└── web/     @rollcall/producer-web: the Producer app at /producer/ (Mantine), and the OBS overlay at /producer/overlay (no Mantine)
```

The app shell, the server badge, the RTK Query base API and store, and the dev proxy come from `@rollcall/web-sdk` (`packages/web-sdk/`).

## Commands

Run from the repo root.

| Command | What it does |
|---|---|
| `yarn workspace @rollcall/producer-web dev` | Vite alone on port 5174, at `/producer/`, passing `/api`, `/socket.io` and `/docs` to `ROLLCALL_DEV_SERVER`. `yarn dev` starts it with everything else; open it through the front door, `http://localhost:5173/producer/` |
| `yarn workspace @rollcall/producer-web build` | Production build into `rcl-producer/web/dist/`, which the server serves at `/producer/` |
| `yarn workspace @rollcall/producer-web storybook` | The overlay Storybook alone, on port 6007 |
````

Create `rcl-producer/CLAUDE.md`:

```markdown
@AGENTS.md

## Claude Code notes

These add to the repo-root `CLAUDE.md`. Shared rules belong in `AGENTS.md` above, not here.

- **Path-scoped rules** for this app are `.claude/rules/rcl-producer-{web,overlay}.md` at the repo root. Update them in the same change when code here moves.
```

- [ ] **Step 2: The path-scoped rules.**

```bash
git mv .claude/rules/rcl-core-overlay.md .claude/rules/rcl-producer-overlay.md
```

Replace the contents of `.claude/rules/rcl-producer-overlay.md` with:

```markdown
---
paths:
  - "rcl-producer/web/src/overlay/**"
  - "rcl-producer/web/overlay.html"
---
# rcl-producer OBS overlay (`rcl-producer/web/src/overlay/`, ADR-0006)

- **Never import Mantine, `@rollcall/web-sdk` or the Producer app's own code** (`src/pages`, `src/routes.tsx`, `src/main.tsx`). `src/overlay/bundle.test.ts` fails if a Mantine or web SDK module reaches the overlay bundle.
- **Overlay components** (`src/overlay/components/`) are presentational:
  - Data comes in through props.
  - Styling uses CSS modules and theme custom properties (`--theme-*`) only, never hard-coded colors or fonts.
  - Fonts are local only (hard rule 4).
  - Get a story next to them, in the overlay Storybook, which never loads Mantine (ADR-0015).
- **Live state** comes only from Socket.IO, into the RTK Query cache in `live.ts` (hard rule 6), and is validated with shared schemas.
  - A reload rebuilds state from the server.
  - A disconnect keeps the last state.
  - Render nothing until the server has spoken.
- **`html` and `body` stay transparent.**
- **The page is served at `/producer/overlay`** and everything below it, where output URLs will live (`rcl-core/server/src/web-apps.ts`).
- **Docs:**
  - component catalog and options: `docs/features/overlay-components.md`
  - renderer and theming: `docs/decisions/0006-one-overlay-renderer-css-variable-theming.md`
```

Create `.claude/rules/rcl-producer-web.md`:

```markdown
---
paths:
  - "rcl-producer/web/**"
---
# rcl-producer web app (`rcl-producer/web/`)

- **Served at `/producer/`** (split spec). `src/base.ts` holds that path for Vite, the router and the overlay address; the server's list of web apps is `rcl-core/server/src/web-apps.ts`.
- **The shell, the server badge, the store and the base API come from `@rollcall/web-sdk`.** Add endpoints to the base API with `api.injectEndpoints` rather than creating a second API.
- **Server data lives only in RTK Query**, never copied into slices (hard rule 6, ADR-0003). Validate responses with the shared Zod schemas in `transformResponse` (ADR-0007).
- **Overlay code** under `src/overlay/` has its own, stricter rule (`rcl-producer-overlay.md`).
- **Testing:** React Testing Library in jsdom; see `docs/guides/testing.md`. The Producer app's own components get a dashboard Storybook with their first story (split spec).
- **Feature pages:** `theme-builder`, `screen-builder`, `overlay-components`, `live-mode`, `obs-control` and `crg-automation` in `docs/features/`. Update the page in the same change as the behavior.
```

Create `.claude/rules/sdk.md`:

```markdown
---
paths:
  - "packages/**"
---
# Shared packages (`packages/`)

- **`@rollcall/web-sdk`** (`packages/web-sdk/`) is the code every rcl app's Mantine GUI shares: the app shell (`App`, `AppLayout`), `ServerStatus`, the RTK Query base API and store, the jsdom test setup, and the dev proxy helpers (`@rollcall/web-sdk/vite`).
  - TypeScript source with no build step, like the contracts.
  - **Overlay entries never import it** (ADR-0006). The Producer app's `src/overlay/bundle.test.ts` fails if it reaches the overlay bundle.
  - React, Mantine, Redux and React Router are peer dependencies, so each app brings one copy.
  - Components get a story next to them. The admin Storybook (`rcl-core/web/.storybook/admin`) shows them (ADR-0015).
- **A shared package never imports an app's code** (`rcl-core/*/src`, `rcl-producer/*/src`). Contracts are the exception: the web SDK uses `@rollcall/core-contract` for the health check.
- **A change here is a change to every app that uses it.** Run `yarn check`, `yarn test:stories` and `yarn test:e2e`.
```

Replace the contents of `.claude/rules/rcl-core-web.md` with:

```markdown
---
paths:
  - "rcl-core/web/**"
---
# rcl-core web app (`rcl-core/web/`)

- **Served at `/core/`**, and `/` redirects there (split spec). `src/base.ts` holds that path for Vite and the router; the server's list of web apps is `rcl-core/server/src/web-apps.ts`.
- **In development this Vite server is the front door** (port 5173): it passes `/producer` on to the Producer app's Vite (port 5174) and the server's paths to the server. Its proxy comes from `@rollcall/web-sdk/vite`; `src/dev-proxy.test.ts` pins it.
- **The shell, the server badge, the store and the base API come from `@rollcall/web-sdk`.** Add endpoints to the base API with `api.injectEndpoints` rather than creating a second API.
- **Server data lives only in RTK Query**, never copied into slices (hard rule 6, ADR-0003).
  - Slices are for client-only state.
  - Use `useAppDispatch` and `useAppSelector` from the web SDK, never the untyped hooks.
- **Validate responses** with the shared Zod schemas in `transformResponse` (ADR-0007).
- **Admin UI:** Mantine 9 and React Router 8 (ADR-0017). Routes live in `src/routes.tsx`, and each area's behavior is specified in `docs/features/*.md`. Update that page in the same change.
- **Testing:** React Testing Library in jsdom; see `docs/guides/testing.md`.
- **Shared admin components** get a story next to them, in the admin Storybook (ADR-0015). The first one also adds `'../../src/**/*.stories.tsx'` to `.storybook/admin/main.ts`. See `docs/guides/testing.md#stories`.
```

- [ ] **Step 3: Root files and rcl-core's instructions.**

**`AGENTS.md`:**
- `Until the split, all code is in [rcl-core](rcl-core/AGENTS.md).` becomes `` The Producer app's web code is in [rcl-producer](rcl-producer/AGENTS.md) and shared web code in `packages/web-sdk`; all server code stays in [rcl-core](rcl-core/AGENTS.md) until app modules arrive. ``
- In the Layout block, after the `rcl-core/` line, add:

  ```
  ├── rcl-producer/      the Producer app: its web app and the OBS overlay (see rcl-producer/AGENTS.md)
  ├── packages/          code shared across apps: web-sdk (@rollcall/web-sdk)
  ```

- In the Commands table, four rows change. The `yarn dev` row becomes:

  ```markdown
  | `yarn dev` | The server (restarts on changes) and each web app's Vite dev server; open `http://localhost:5173`, the front door, which redirects to `/core/` and passes `/producer/` on. The API explorer is at `/docs` ([ADR-0014](docs/decisions/0014-route-schemas-and-api-explorer.md)) |
  ```

  The `yarn build` / `yarn start` row becomes:

  ```markdown
  | `yarn build` / `yarn start` | Production build of every web app (rcl-core's at `/core/`, the Producer app and its OBS overlay at `/producer/`), then run the server that serves them |
  ```

  The `yarn test` row's parenthesis becomes `(Node for server and contract, jsdom for the web apps and the web SDK)`.

  The `yarn storybook` row becomes:

  ```markdown
  | `yarn storybook` | Both Storybooks in one window at `http://localhost:6006` (admin, from `rcl-core/web`), with the overlay section from port 6007 (`rcl-producer/web`) |
  ```

**`CLAUDE.md`:** `` one file per code area (each app's `CLAUDE.md` names its own), plus `e2e.md`. `` becomes `` one file per code area (each app's `CLAUDE.md` names its own), plus `sdk.md` for `packages/` and `e2e.md`. ``

**`README.md`:** `` `rcl-core` today, with `rcl-producer` coming. `` becomes `` `rcl-core` and `rcl-producer`. ``

**`rcl-core/AGENTS.md`:**
- `Until the split, it also holds the OBS overlay entry, which moves to rcl-producer.` becomes `` It also serves every rcl app's web build, each below its own path: its own at `/core/`, the Producer app's at `/producer/`. ``
- In the Layout block, the `web/` line becomes `├── web/        @rollcall/core-web: the admin React SPA, served at /core/`.
- In the server `start` row, the text from `` web build from `ROLLCALL_WEB_DIR` `` through `` the overlay is at `/overlay`. `` becomes:

  ```markdown
  rcl-core's web build from `ROLLCALL_WEB_DIR` (default `rcl-core/web/dist/`) and the Producer app's from `rcl-producer/web/dist/`; set `ROLLCALL_API_DOCS=1` to serve the API explorer at `/docs`; the OBS overlay is at `/producer/overlay`.
  ```

- The `yarn workspace @rollcall/core-web dev` row becomes:

  ```markdown
  | `yarn workspace @rollcall/core-web dev` | The front door: Vite on port 5173, serving `/core/`, redirecting `/` there, and passing `/api`, `/socket.io` and `/docs` to `ROLLCALL_DEV_SERVER` (default `http://localhost:5580`) and `/producer` to the Producer app's Vite on port 5174 |
  ```

**`rcl-core/CLAUDE.md`:** `` `.claude/rules/rcl-core-{server,web,overlay,contract}.md` `` becomes `` `.claude/rules/rcl-core-{server,web,contract}.md` ``.

- [ ] **Step 4: The wiki.**

**`docs/architecture/README.md`, the Pieces table:**
- The `rcl-core/web` row becomes:

  ```markdown
  | `rcl-core/web` | React SPA for rcl-core's admin GUI: setup, sign-in, users and the data editors, served at `/core/` |
  ```

- After the `rcl-core/contract` row, add:

  ```markdown
  | `rcl-producer/web` | React SPA for the builders, Live Mode and dashboards, served at `/producer/`. A separate lightweight **overlay entry** at `/producer/overlay` renders outputs for OBS |
  | `packages/web-sdk` | Code every app's Mantine GUI shares: the app shell, the server badge, the RTK Query base API and store, and the dev proxy. Overlay entries never use it |
  ```

**`docs/features/users-and-access.md`:**
- In R5, `` Until output tokens arrive with Live Mode, `/overlay` is public. `` becomes `` Until output tokens arrive with Live Mode, `/producer/overlay` is public. ``
- In Behavior, `` - **OBS outputs** don't log in. `/overlay` is public until output token URLs arrive (R5). `` becomes `` - **OBS outputs** don't log in. `/producer/overlay` is public until output token URLs arrive (R5). ``

**`docs/guides/local-development.md`:** replace the paragraphs from `This starts two processes:` through `Stop both with Ctrl-C.` with:

```markdown
This starts three processes:
- **the server** on port 5580, restarting when its code changes;
- **rcl-core's Vite dev server** on port 5173, the front door. It serves rcl-core's web app at `/core/`, redirects `/` there, passes `/producer` on to the Producer app's Vite, and passes `/api`, `/socket.io` and `/docs` to the server. The browser only ever talks to port 5173;
- **the Producer app's Vite dev server** on port 5174, reached through the front door.

Each Vite server reloads the browser when its web code changes, through the front door too.

Then open:
- **Admin app:** `http://localhost:5173`, which goes to `/core/`. The header badge shows `Server v…` once the server answers.
- **Producer app:** `http://localhost:5173/producer/`.
- **OBS overlay:** `http://localhost:5173/producer/overlay`. A small card appears over a transparent page.
- **API explorer:** `http://localhost:5173/docs`. See [Trying the API](#trying-the-api).

Stop them all with Ctrl-C.
```

In the Production block, the two commands become:

```
yarn build    # every web app: rcl-core/web/dist/ and rcl-producer/web/dist/ (with the overlay)
yarn start    # the server, which also serves the builds
```

And the three bullets after "Everything is on one port:" become:

```markdown
- **Admin app:** `http://localhost:5580`, which goes to `/core/`
- **Producer app:** `http://localhost:5580/producer/`
- **OBS overlay:** `http://localhost:5580/producer/overlay`
- **Health check:** `http://localhost:5580/api/health`
```

In the settings table:
- The `ROLLCALL_WEB_DIR` row becomes:

  ```markdown
  | `ROLLCALL_WEB_DIR` | `rcl-core/web/dist/` | rcl-core's web build, served at `/core/`; skipped if it doesn't exist. The Producer app's build is always `rcl-producer/web/dist/` |
  ```

- In the `ROLLCALL_DEV_SERVER` row, `Where the Vite dev server sends` becomes `Where the Vite dev servers send`.

In the Storybook section:
- `` `yarn storybook` shows the web app's shared components, one at a time, outside the app `` becomes `` `yarn storybook` shows the shared components, one at a time, outside the apps ``.
- `` It opens `http://localhost:6006`, the admin components. The overlay components appear in the same window under **Overlay**, served from port 6007. `` becomes `` It opens `http://localhost:6006`, the admin components: the web SDK's, and rcl-core's own once it has some. The Producer app's overlay components appear in the same window under **Overlay**, served from port 6007. ``

In Troubleshooting, the `EADDRINUSE` row becomes:

```markdown
| `EADDRINUSE`, or `Port … is already in use`, on 5580, 5173 or 5174 | Another copy is still running. Find it with `lsof -nP -iTCP:5580 -sTCP:LISTEN` (or that port) and stop it |
```

**`docs/guides/testing.md`:** in the Layers table:
- The React components row's "Where" becomes `` `rcl-core/web`, `rcl-producer/web` and `packages/web-sdk`: `src/**/*.test.tsx` ``.
- The Stories row's "Where" becomes `` `*.stories.tsx` next to the component ``.

The Vitest environments bullet becomes:

```markdown
- **Projects, set in `vitest.config.ts`:**
  - **`node`:** `rcl-core/contract` and `rcl-core/server`, in Node.
  - **`core-web`**, **`producer-web`** and **`web-sdk`:** `rcl-core/web`, `rcl-producer/web` and `packages/web-sdk`, in jsdom, all with `packages/web-sdk/src/test/setup.ts`.
```

Two example paths change:
- `` (`rcl-core/web/src/store/api.test.ts`) `` becomes `` (`packages/web-sdk/src/api.test.ts`) ``.
- `` (`rcl-core/web/src/overlay/live.test.ts`) `` becomes `` (`rcl-producer/web/src/overlay/live.test.ts`) ``.

The Overlay bundle bullet becomes:

```markdown
- **Overlay bundle (`rcl-producer/web/src/overlay/bundle.test.ts`).** It runs a real Vite build of the Producer app and fails if any Mantine or web SDK module reaches the overlay bundle ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)). It also checks that both *are* in the Producer app's own bundle, which proves the check works.
```

The "Which Storybook" bullet becomes:

```markdown
- **Which Storybook:** the admin Storybook (`rcl-core/web/.storybook/admin`) shows the web SDK's components, and rcl-core's own once it has some: its first story also adds `../../src/**/*.stories.tsx` to that Storybook's `main.ts`, since Storybook warns about a pattern that matches nothing. Overlay components (`rcl-producer/web/src/overlay`) go in the overlay Storybook (`rcl-producer/web/.storybook/overlay`). The Producer app's other components get a dashboard Storybook with their first story.
```

The remaining changes:
- `` (see `ServerStatus.stories.tsx`) `` becomes `` (see `packages/web-sdk/src/ServerStatus.stories.tsx`) ``.
- In the Playwright section, `` `e2e/playwright.config.ts` builds the web app and starts the server `` becomes `` `e2e/playwright.config.ts` builds every web app and starts the server ``.
- The Scope bullet becomes:

```markdown
- **Scope:** end-to-end tests cover what only a real browser can show: `/` takes you to `/core/`, each app's shell loads, the overlay at `/producer/overlay` is transparent and loads no Mantine styles, and routes resolve. Logic belongs in Vitest.
```

- [ ] **Step 5: CHANGELOG.** Under `## [Unreleased]`:
  - Append to **Added**:

```markdown
- The Producer app at `/producer/`. For now it shows the address to add to OBS for the overlay (#4)
```

  - Append to **Changed**:

```markdown
- Each app now has its own address: the admin app is at `/core/` (`/` takes you there) and the Producer app at `/producer/`. **The OBS overlay moved from `/overlay` to `/producer/overlay`, with no redirect:** change the URL of each OBS browser source (#4)
```

- [ ] **Step 6: Check that nothing still points at the old places.**

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=design-docs --exclude-dir=.git --exclude-dir=dist --exclude-dir=.superpowers \
  -e 'rcl-core/web/src/overlay' -e 'rcl-core/web/src/store' -e 'rcl-core/web/src/components' -e 'rcl-core-overlay' -e 'localhost:5173/overlay' -e 'localhost:5580/overlay' .
```

Expected: no output.

- [ ] **Step 7: Check and commit.**

```bash
node scripts/check-docs.mjs
yarn format && yarn check
git add -A AGENTS.md CLAUDE.md README.md CHANGELOG.md rcl-core/AGENTS.md rcl-core/CLAUDE.md rcl-producer/AGENTS.md rcl-producer/CLAUDE.md .claude/rules docs
git commit -F - <<'EOF'
docs(repo): Producer app, web SDK and the new addresses

AGENTS and CLAUDE files for rcl-producer, path rules for its web app, overlay
and the shared packages, and the guides, architecture page and CHANGELOG for
/core/, /producer/, the overlay's move to /producer/overlay and the dev front
door.

Closes #4

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Expected: `check-docs: OK`, and `git status` is clean afterwards.

---

### Task 6: Phase 4a hand-off ⏸

- [ ] **Step 1: The full checks the spec requires before merge.**

```bash
yarn install --immutable && yarn check && yarn build && yarn test:stories && yarn test:e2e
```

Expected: all pass (198 unit tests, 8 story tests, 5 e2e tests). `git diff main.. -- yarn.lock` touches only `@rollcall/*` workspace entries.

- [ ] **Step 2: Review the whole branch.** Run `git log --oneline main..` (6 commits, including the plan) and `git diff --stat main..`. Check that the moves show as renames (`git log --follow rcl-producer/web/src/overlay/live.ts` reaches back into rcl-core history). Then use superpowers:requesting-code-review on the branch, and fix what it confirms.

- [ ] **Step 3: Check `yarn dev` and `yarn start` by hand.**
  - `yarn dev`: repeat Task 4, Step 5.
  - `yarn build && yarn start`:
    - `http://localhost:5580/` lands on `/core/`;
    - `/producer/` shows the overlay address;
    - `/producer/overlay` shows the card;
    - `/overlay` gives a 404.

    Stop the server afterwards.

- [ ] **Step 4: ⏸ Ask Mike, then merge and push.**

```bash
git switch main && git merge --ff-only feat/producer-web-app
git push origin main && git branch -d feat/producer-web-app
```

Then:
- Check that #4 closed and its card is in "Done" on board #8 (`gh project item-list 8 --owner wardmanm`). If it isn't, remind Mike.
- Update `rollcall-pivot.md` in memory: Phase 4a is done, and Phase 4b (#5, app modules) is next, with its own plan.
- Remind Mike to update the OBS browser source URLs to `/producer/overlay`.
