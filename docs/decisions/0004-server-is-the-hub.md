---
title: Server is the hub
status: accepted
date: 2026-09-28
---
# 0004. Server is the hub

## Context

The app talks to several parties:
- many browsers: admin UI, dashboards, and outputs running inside OBS;
- one or more OBS instances;
- one CRG instance per track.

If browsers connected to OBS or CRG directly:
- the OBS password would be spread across every dashboard;
- each browser would see a slightly different state;
- access control couldn't be enforced;
- reconnect logic would be duplicated everywhere.

Venues often have poor or no internet, so anything loaded from the internet can fail mid-game.

## Decision

The Node server is the single hub:

- **It owns live state.** The current game on each track, component visibility, live selections and the latest CRG and OBS state all live on the server. Clients render what the server broadcasts.
- **It owns every external connection.** It keeps exactly one connection per configured OBS instance and one per CRG instance (per track), reconnecting on its own.
- **It relays through Socket.IO rooms.** There are rooms per track, per output and per dashboard, so each client gets only what it needs.
- **It serves everything from one port.** The REST API, Socket.IO, the built SPA, the overlay entry and all media and fonts come from one port, bound to `0.0.0.0` so the LAN can reach it.

**Hard rules:**
- **The server is the hub.** Browsers (dashboards, overlays) never connect to OBS or CRG directly. Secrets such as the OBS password never reach a browser.
- **Works offline at the venue.** Nothing at runtime depends on the internet: no CDNs, no hosted fonts, no cloud APIs. The server serves every asset.

## Consequences

- OBS sees one client per instance, and every dashboard gets a single, consistent event stream.
- Role checks and action logging happen in one place ([ADR-0008](0008-auth-rbac-and-overlay-access.md)).
- The server is a single point of failure during an event. Outputs must therefore rebuild their full state from the server whenever they reconnect or reload.
- Theme fonts must be uploaded or bundled; they can't be linked from a font service ([Theme Builder](../features/theme-builder.md)).
