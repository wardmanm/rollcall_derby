---
title: Theme Builder
status: planned
summary: Define reusable visual styles (colors, fonts, borders, corner radius) that restyle every overlay.
---
# Theme Builder

The Theme Builder defines how overlays look, so a single [theme](../product/glossary.md) can restyle every screen consistently. Themes become CSS custom properties, which every overlay component uses for its styling ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)).

## Users and roles

Admins create and edit themes. Producers use existing themes. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Create, edit, duplicate and delete named themes.
- **R2.** A theme defines tokens for at least:
  - colors
  - font (family, weights, sizes)
  - border radius
  - border thickness
- **R3.** A theme compiles to CSS custom properties, e.g. `--theme-color-primary`. Overlay components style themselves **only** through these properties. They never hard-code colors or fonts.
- **R4.** While editing, a theme is previewed live on sample overlay components.
- **R5.** Fonts work offline. Font files are uploaded or bundled and served by our server, never loaded from a font CDN ([ADR-0004](../decisions/0004-server-is-the-hub.md)).
- **R6.** Themes can be exported and imported as JSON, including their font files ([import / export](import-export.md)).

## Behavior

Not built yet.

## Related

- [ADR-0006: one overlay renderer, CSS-variable theming](../decisions/0006-one-overlay-renderer-css-variable-theming.md)
- [Screen Builder](screen-builder.md), where a theme is applied to a screen

## Open questions

- Is the token set fixed (a known list the builder shows as a form), or can users add their own tokens?
- Where does a theme apply: per screen, overridden per component, or both?
- Should overlays be able to use team colors dynamically, e.g. `--team-home-primary` taken from the game's teams, alongside theme tokens?
- Which font formats do we accept for upload (woff2, ttf, otf)? What guidance do we give about font licensing?
- Are show/hide animations and transitions part of a theme or part of each component?
