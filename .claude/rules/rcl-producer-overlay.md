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
- **Live state** comes only from Socket.IO, the `/producer/overlay` namespace, into the RTK Query cache in `live.ts` (hard rule 6), and is validated with schemas from `@rollcall/producer-contract`.
  - A reload rebuilds state from the server.
  - A disconnect keeps the last state.
  - Render nothing until the server has spoken.
- **`html` and `body` stay transparent.**
- **The page is served at `/producer/overlay`** and everything below it, where output URLs will live (`rcl-core/server/src/web-apps.ts`).
- **Docs:**
  - component catalog and options: `docs/features/overlay-components.md`
  - renderer and theming: `docs/decisions/0006-one-overlay-renderer-css-variable-theming.md`
