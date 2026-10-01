---
paths:
  - "obs-producer/e2e/**"
---
# obs-producer end-to-end tests (`obs-producer/e2e/`)

- **Playwright runs against the real production build**, served by the real server on port 5590 with a throwaway data directory (`playwright.config.ts`). Run `yarn test:e2e`.
- **Only test what a browser alone can show:** pages load, overlays are transparent, routes resolve. Logic belongs in Vitest.
- **Guide:** `obs-producer/docs/guides/testing.md`.
