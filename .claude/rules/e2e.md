---
paths:
  - "e2e/**"
---
# End-to-end tests (`e2e/`)

- **Playwright runs against the real production build**, served by the real server on port 5590 with a throwaway data directory (`playwright.config.ts`). Run `yarn test:e2e`.
- **Only test what a browser alone can show:** pages load, overlays are transparent, routes resolve. Logic belongs in Vitest.
- **Guide:** `docs/guides/testing.md`.
