---
paths:
  - "obs-producer/apps/web/**"
---
# obs-producer web app (`obs-producer/apps/web/`)

- **Server data lives only in RTK Query** (`src/store/api.ts`), never copied into slices (hard rule 6, ADR-0003).
  - Slices are for client-only state.
  - Use `useAppDispatch` and `useAppSelector`, never the untyped hooks.
- **Validate responses** with the shared Zod schemas in `transformResponse` (ADR-0007).
- **Admin UI:** Mantine 9 and React Router 8 (ADR-0012). Routes live in `src/routes.tsx`, and each area's behavior is specified in `obs-producer/docs/features/*.md`. Update that page in the same change.
- **Overlay code** under `src/overlay/` has its own, stricter rule (`obs-producer-overlay.md`).
- **Testing:** React Testing Library in jsdom; see `obs-producer/docs/guides/testing.md`.
- **Shared admin components** (anywhere under `src/` outside `src/overlay`, such as `src/components`) get a story next to them, in the admin Storybook (ADR-0015). See `obs-producer/docs/guides/testing.md#stories`.
