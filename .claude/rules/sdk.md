---
paths:
  - "packages/**"
---
# Shared packages (`packages/`)

- **`@rollcall/app-sdk`** (`packages/app-sdk/`) is what an rcl app's server module is written against (ADR-0019): `AppModule`, `AppContext`, `Realtime`, and the `Access`, `Permission` and `PermissionDef` types. Types only: rcl-core's server does the hosting.
  - Change it with care: every app module and rcl-core's host depend on these shapes.
- **`@rollcall/web-sdk`** (`packages/web-sdk/`) is the code every rcl app's Mantine GUI shares: the app shell (`App`, `AppLayout`), `ServerStatus`, the RTK Query base API and store, the jsdom test setup, and the dev proxy helpers (`@rollcall/web-sdk/vite`).
  - TypeScript source with no build step, like the contracts.
  - **Overlay entries never import it** (ADR-0006). The Producer app's `src/overlay/bundle.test.ts` fails if it reaches the overlay bundle.
  - React, Mantine, Redux and React Router are peer dependencies, so each app brings one copy.
  - Components get a story next to them. The admin Storybook (`rcl-core/web/.storybook/admin`) shows them (ADR-0015).
- **A shared package never imports an app's code** (`rcl-core/*/src`, `rcl-producer/*/src`). Contracts are the exception: the web SDK uses `@rollcall/core-contract` for the health check.
- **A change here is a change to every app that uses it.** Run `yarn check`, `yarn test:stories` and `yarn test:e2e`.
