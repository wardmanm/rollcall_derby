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
- **Validate responses** with the shared Zod schemas in `transformResponse` (ADR-0019).
- **Admin UI:** Mantine 9 and React Router 8 (ADR-0017). Routes live in `src/routes.tsx`, and each area's behavior is specified in `docs/features/*.md`. Update that page in the same change.
- **Testing:** React Testing Library in jsdom; see `docs/guides/testing.md`.
- **Shared admin components** get a story next to them, in the admin Storybook (ADR-0015). The first one also adds `'../../src/**/*.stories.tsx'` to `.storybook/admin/main.ts`. See `docs/guides/testing.md#stories`.
