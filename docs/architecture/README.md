---
title: Architecture overview
---
# Architecture overview

How Rollcall fits together. This page describes the **intended** architecture, set out in the [ADRs](../decisions/README.md). Once code exists, update this page to match the code, and record any change of direction in a new ADR.

## System at a glance

Everything runs on the venue network and nothing needs the internet ([ADR-0004](../decisions/0004-server-is-the-hub.md)).

```mermaid
flowchart LR
  subgraph browsers["Browsers on the LAN"]
    ui["Admin & producer UI"]
    dash["Dashboards<br/>(producer / announcer)"]
  end
  subgraph obs["OBS Studio (one or more)"]
    out["Outputs<br/>(browser sources)"]
  end
  subgraph server["rcl-core server (Node)"]
    api["REST API<br/>(Fastify)"]
    hub["Real-time hub<br/>(Socket.IO)"]
    store[("SQLite +<br/>media files")]
    obsc["OBS client<br/>(one per OBS)"]
    crgc["CRG listener<br/>(one per track)"]
  end
  crg["CRG Scoreboard<br/>(one per track)"]

  ui -->|HTTP| api
  ui <-->|live updates| hub
  dash <-->|live updates| hub
  out <-->|live updates| hub
  api --> store
  hub --- obsc
  hub --- crgc
  obsc -->|obs-websocket v5| obs
  crg -->|"state updates<br/>(listen-only)"| crgc
```

## Pieces

These workspaces are planned in [ADR-0017](../decisions/0017-rcl-app-workspace-layout.md).

| Workspace | Responsibility |
|---|---|
| `rcl-core/server` | REST API, Socket.IO hub, authentication and role checks, SQLite, media storage, one connection per OBS and CRG instance, automation engine, live state |
| `rcl-core/web` | React SPA for rcl-core's admin GUI: setup, sign-in, users and the data editors, served at `/core/` |
| `rcl-core/contract` | Zod schemas and TypeScript types used by both server and web: API, socket messages, import/export formats |
| `rcl-producer/web` | React SPA for the builders, Live Mode and dashboards, served at `/producer/`. A separate lightweight **overlay entry** at `/producer/overlay` renders outputs for OBS |
| `packages/web-sdk` | Code every app's Mantine GUI shares: the app shell, the server badge, the RTK Query base API and store, and the dev proxy. Overlay entries never use it |

## How data flows

**Setup time.** The admin UI reads and writes teams, themes and screens through the REST API. In the browser, that data lives in the RTK Query cache ([ADR-0003](../decisions/0003-client-state-with-redux-toolkit.md)).

**Live.** The server is the single authority for live state ([ADR-0004](../decisions/0004-server-is-the-hub.md)).

1. When CRG pushes a state update to the server's listener for that track:
   1. The listener diffs the update against the previous state and detects game events ([CRG integration](integrations/crg-scoreboard.md#detecting-game-events)).
   2. The server evaluates [automation](../features/crg-automation.md) rules and updates live state.
   3. The server broadcasts the change to the right Socket.IO rooms: per track, per output, per dashboard.
2. When a producer acts on a dashboard:
   1. A socket event goes to the server.
   2. The server checks the caller's access ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)).
   3. The server updates live state or sends an OBS request.
   4. The server broadcasts the result.
3. Outputs, dashboard previews and the builder canvas all render with the same presentational overlay components, so every view matches what's on air ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)).
4. When an output reloads, whether OBS restarted it or it was hidden and shown again, it rebuilds its entire state from the server.

**Socket.IO namespaces.** Each namespace declares who may join, as each API route does ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)). `/overlay` is public, so OBS outputs need no login until output token URLs arrive. Signed-in namespaces, such as Live Mode's dashboards, check the session cookie when a client connects. The bare `/` namespace refuses everyone.

## Key decisions

Summaries only. The ADRs are canonical.

- [ADR-0003](../decisions/0003-client-state-with-redux-toolkit.md): Redux Toolkit; server data only in RTK Query.
- [ADR-0004](../decisions/0004-server-is-the-hub.md): The server owns live state and all external connections, and the app works offline.
- [ADR-0005](../decisions/0005-crg-is-listen-only.md): CRG is listen-only, and there are no score displays.
- [ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md): One overlay renderer; themes as CSS custom properties.
- [ADR-0007](../decisions/0007-shared-zod-contract.md): Shared Zod contract; versioned import/export.
- [ADR-0018](../decisions/0018-declared-access-and-permissions.md): Server-side sessions; every route and namespace declares its access, checked by permission; a public overlay until output token URLs arrive.

## More

- [Data model](data-model.md): domain entities and how they relate
- [CRG scoreboard integration](integrations/crg-scoreboard.md)
- [OBS WebSocket integration](integrations/obs-websocket.md)
