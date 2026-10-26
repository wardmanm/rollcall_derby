---
paths:
  - "packages/**"
---
# Shared packages (`packages/`)

- **`@rollcall/app-sdk`** (`packages/app-sdk/`) is what an rcl app's server module is written against (ADR-0019): `AppModule`, `AppContext`, `Realtime`, and the `Access`, `Permission` and `PermissionDef` types. `PermissionDef.peopleOnly` keeps a permission off API keys (ADR-0020). Types only: rcl-core's server does the hosting.
  - `AppContext` is one object per app, passed to both `register()` and `realtime()`. Core's data reaches apps only through its read-only services, such as `fonts.list()` (ADR-0023), never through core's tables.
  - An app module lists the kinds of item it stores that travel in export files with `transfer(ctx)` (`TransferKind`, ADR-0024).
  - Change it with care: every app module and rcl-core's host depend on these shapes.
- **`@rollcall/web-sdk`** (`packages/web-sdk/`) is the code every rcl app's Mantine GUI shares:
  - the app shell (`App`, `AppLayout` with its links and `UserMenu`, `PageNotFound`, the Mantine `theme`), `SignInGate` and `ServerStatus`;
  - the RTK Query base API (health, setup status, who's signed in, logout) and store, and `ROLE_NAMES` for showing roles;
  - the form helpers `fieldErrors`, `pathErrors` and `problemWith`;
  - `CORE_PAGES`, `safeNext` and `useGoTo`, for sending people to rcl-core's sign-in pages and back;
  - the jsdom test setup, the test helpers (`@rollcall/web-sdk/testing`) and the dev proxy helpers (`@rollcall/web-sdk/vite`).
  - TypeScript source with no build step, like the contracts.
  - **Overlay entries never import it** (ADR-0006). The Producer app's `src/overlay/bundle.test.ts` fails if it reaches the overlay bundle.
  - React, Mantine, Redux and React Router are peer dependencies, so each app brings one copy.
  - Components get a story next to them. The admin Storybook (`rcl-core/web/.storybook/admin`) shows them (ADR-0015).
- **A shared package never imports an app's code** (`rcl-core/*/src`, `rcl-producer/*/src`). Contracts are the exception: the web SDK uses `@rollcall/core-contract` for the health check and signing in.
- **A change here is a change to every app that uses it.** Run `yarn check`, `yarn test:stories` and `yarn test:e2e`.
