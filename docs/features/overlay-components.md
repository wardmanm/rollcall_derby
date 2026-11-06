---
title: Overlay Components
app: rcl-producer
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
  - its **options schema** (a Zod schema, [ADR-0019](../decisions/0019-rcl-apps-as-modules.md)), which the builder uses to render the options form and validate input;
  - its **data needs**, such as a team, a game or CRG state;
  - its **live controls**, such as show/hide or "next page".
- **R2.** Components are presentational. They receive options, data and theme through props and CSS variables, and never read the admin store or talk to the server themselves ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)).
- **R3.** Components are styled only with theme CSS custom properties ([Theme Builder](theme-builder.md) R3).
- **R4.** No score or clock displays. CRG owns those ([ADR-0005](../decisions/0005-crg-is-listen-only.md)).

### Team roster

The first component, built for [skater intros](skater-intros.md). That page is the home of what it shows and how it behaves.

- **R5.** It shows one team's people as a row of person cards, opened by a **title card** that is part of the roster, not a component of its own. What the cards and the title card show is in [skater intros](skater-intros.md#on-the-obs-page).
- **R6.** Its **options schema** (`RosterOptionsSchema`, in `@rollcall/producer-contract`) holds an intro's settings for how many people show at once, how it moves on, whether cards show pronouns and the entrance. Their choices and defaults are in [skater intros](skater-intros.md#requirements) (R1). Where it sits (a spot and a distance from the edge) is placement, not an option: an intro stores it beside the options, and a screen will take it from the component's placed box.
- **R7.** Its **data need** is a team, read fresh from core.
- **R8.** Its **live controls** are **Start** (for a team), **Next** and **Clear**. They are not options.

## Candidate catalog

This is a starting list, not a commitment. Each entry becomes real once its requirements are written up here.

| Component | Shows | Data source |
|---|---|---|
| Team roster | Skaters (numbers, names, photos) and bench staff | [Team](team-builder.md) |
| Skater spotlight / lower third | One skater with photo and details | Team member |
| Game info card | Teams, date, location, event name | [Live Mode](live-mode.md) game and event |
| Matchup / intro card | Both teams with logos | Game |
| Current lineup | Who is jamming and pivoting right now, with photos | CRG positions plus our team photos ([CRG automation](crg-automation.md)) |
| Custom text / image | Free text or an image, e.g. a sponsor | Component options |

## Behavior

Only the team roster is built. How it looks on air is in [skater intros](skater-intros.md#on-the-obs-page), and how a long roster goes through its rows is in [running it](skater-intros.md#running-it).

## Open questions

- Do we generate options forms automatically from Zod schemas, or hand-build them per component?
- Do we need a plugin model so new component types can be added without touching core code, or is a registry in `rcl-core/web` enough?
