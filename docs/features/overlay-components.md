---
title: Overlay Components
status: planned
summary: Pre-made, configurable building blocks placed on screens, such as rosters, game info and skater spotlights.
---
# Overlay Components

Overlay components are the pre-made building blocks placed on [screens](screen-builder.md). Each component type knows:
- what it displays;
- which options it accepts;
- which data it needs;
- which live controls it offers to [dashboards](live-mode.md#producer-dashboards).

They are **not** the same as React components; see the [glossary](../product/glossary.md).

## Users and roles

Admins place and configure components in the Screen Builder. Producers, and Announcers where allowed, use a component's live controls from dashboards. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Each component type declares:
  - its **options schema** (a Zod schema, [ADR-0007](../decisions/0007-shared-zod-contract.md)), which the builder uses to render the options form and validate input;
  - its **data needs**, such as a team, a game or CRG state;
  - its **live controls**, such as show/hide or "next page".
- **R2.** Components are presentational. They receive options, data and theme through props and CSS variables, and never read the admin store or talk to the server themselves ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)).
- **R3.** Components are styled only with theme CSS custom properties ([Theme Builder](theme-builder.md) R3).
- **R4.** No score or clock displays. CRG owns those ([ADR-0005](../decisions/0005-crg-is-listen-only.md)).

## Candidate catalog

This is a starting list, not a commitment. Each entry becomes real once its requirements are written up here.

| Component | Shows | Data source |
|---|---|---|
| Team roster | Skaters (numbers, names, photos) and bench staff | [Team](team-builder.md), plus the game roster |
| Skater spotlight / lower third | One skater with photo and details | Team member |
| Game info card | Teams, date, location, event name | [Live Mode](live-mode.md) game and event |
| Matchup / intro card | Both teams with logos | Game |
| Current lineup | Who is jamming and pivoting right now, with photos | CRG positions plus our team photos ([CRG automation](crg-automation.md)) |
| Custom text / image | Free text or an image, e.g. a sponsor | Component options |

## Behavior

Not built yet.

## Open questions

- Which components ship first? The roadmap suggests the team roster (Phase 2).
- Do we generate options forms automatically from Zod schemas, or hand-build them per component?
- Long rosters: page through them automatically on a timer, or on a manual "next page" control?
- Do we need a plugin model so new component types can be added without touching core code, or is a registry in `apps/web` enough?
