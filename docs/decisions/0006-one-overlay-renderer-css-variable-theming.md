---
title: One overlay renderer, CSS-variable theming
status: accepted
date: 2026-09-28
---
# 0006. One overlay renderer, CSS-variable theming

## Context

An overlay screen appears in three places:
- the Screen Builder canvas;
- the producer dashboard preview;
- the OBS browser source, where it goes on air.

If these rendered through different code, the preview would drift from what's on air, which defeats its purpose. Outputs also run inside OBS's embedded browser for hours at a time, so they must be light, transparent and resilient to reloads. Themes must be able to restyle every component without code changes.

## Decision

- **One set of presentational overlay components**, used by all three views.
  - Components receive their options, data and live state through **props**, and never read the admin store or call the server.
  - Each host (builder canvas, dashboard preview, output) supplies those props.
- **A separate lightweight overlay entry.** Outputs are built from their own Vite entry, which:
  - doesn't include Mantine or any admin code;
  - has a lean Redux store fed by its Socket.IO room ([ADR-0003](0003-client-state-with-redux-toolkit.md)).
- **Themes are CSS custom properties.**
  - A theme compiles to variables such as `--theme-color-primary` and `--theme-radius`, set on the screen's root element.
  - Components style themselves only with these variables and never hard-code colors or fonts.
- **Transparent by default.** The overlay entry keeps `html` and `body` transparent, so outputs layer cleanly over video in OBS.
- **Stateless reloads.** An output rebuilds its full state from the server on every load. OBS may unload hidden sources or refresh them when their scene becomes active ([OBS integration](../architecture/integrations/obs-websocket.md#browser-sources-our-outputs)).

## Consequences

- The builder and dashboard previews match the on-air output.
- Overlay components are easy to test in isolation: give them props, check the render.
- Components can't use Mantine, so any shared visual primitives for overlays must be built on plain CSS.
- Theme editing previews for free: change the variables and every component updates.
