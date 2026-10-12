---
paths:
  - "e2e/**"
---
# End-to-end tests (`e2e/`)

- **Playwright runs against the real production build**, served by the real server on port 5590 with a fresh data folder for each run, removed afterwards (`playwright.config.ts`, `global-teardown.ts`). Run `yarn test:e2e`.
- **Only test what a browser alone can show:** pages load, overlays are transparent, routes resolve, the accounts flow works end to end. Logic belongs in Vitest.
- **`tests/accounts.spec.ts` runs in order** on a fresh install: setup comes first, and each test signs in for itself.
- **Guide:** `docs/guides/testing.md`.
