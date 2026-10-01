---
paths:
  - "obs-producer/apps/web/src/overlay/**"
  - "obs-producer/apps/web/overlay.html"
---
# obs-producer OBS overlay (`apps/web/src/overlay/`, ADR-0006)

- **Never import Mantine or admin-app code** (`src/store`, `src/layout`, `src/pages`, `src/components`). `src/overlay/bundle.test.ts` fails if any reaches the overlay bundle.
- **Overlay components** (`src/overlay/components/`) are presentational:
  - Data comes in through props.
  - Styling uses CSS modules and theme custom properties (`--theme-*`) only, never hard-coded colors or fonts.
  - Fonts are local only (hard rule 4).
- **Live state** comes only from Socket.IO, into the RTK Query cache in `live.ts` (hard rule 6), and is validated with shared schemas.
  - A reload rebuilds state from the server.
  - A disconnect keeps the last state.
  - Render nothing until the server has spoken.
- **`html` and `body` stay transparent.**
- **Docs:**
  - component catalog and options: `obs-producer/docs/features/overlay-components.md`
  - renderer and theming: `obs-producer/docs/decisions/0006-one-overlay-renderer-css-variable-theming.md`
