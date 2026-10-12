---
paths:
  - "rcl-producer/web/**"
---
# rcl-producer web app (`rcl-producer/web/`)

- **Served at `/producer/`** (ADR-0019). `src/base.ts` holds that path for Vite, the router and the overlay address; the Producer app's module (`producerApp.web` in `rcl-producer/server/src/index.ts`) tells rcl-core's server where the build and its pages are.
- **Every page is behind `SignInGate`**, which sends people who aren't signed in to rcl-core's sign-in page and back. The OBS overlay is a separate entry and stays public.
- **The shell, the sign-in gate, the account menu, the server badge, the store and the base API come from `@rollcall/web-sdk`.** Add endpoints to the base API with `api.injectEndpoints` rather than creating a second API.
- **Server data lives only in RTK Query**, never copied into slices (hard rule 6, ADR-0003). Validate responses with the shared Zod schemas in `transformResponse` (ADR-0019).
- **Overlay code** under `src/overlay/` has its own, stricter rule (`rcl-producer-overlay.md`).
- **Testing:** React Testing Library in jsdom; see `docs/guides/testing.md`. The Producer app's own components get a dashboard Storybook with their first story (split spec).
- **Feature pages:** `theme-builder`, `screen-builder`, `overlay-components`, `live-mode`, `obs-control` and `crg-automation` in `docs/features/`. Update the page in the same change as the behavior.
