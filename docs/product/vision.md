---
title: Vision
---
# Vision

Why OBS Producer exists, who it's for, and just as importantly, what it will never do.

## Why

Streaming a roller derby [game](glossary.md#game) takes more than a scoreboard. Viewers want to see rosters, matchups, skater spotlights and event information. The CRG scoreboard already handles scoring and its own scoreboard overlay. Everything else tends to be built by hand in OBS, event by event.

OBS Producer makes those custom overlays:
- **reusable:** teams, themes and screens are built once and saved;
- **themeable:** one theme restyles every overlay;
- **data-driven:** CRG events and game setup feed the overlays;
- **controllable live:** a small crew runs them from producer dashboards, including events where several [tracks](glossary.md#track) run at once.

## Who uses it

| Role | On game day they… |
|---|---|
| [Admin](glossary.md#admin) | Set up the system beforehand: themes, screens, users and connections to OBS and CRG |
| [Producer](glossary.md#producer-role) | Set up games and teams, then run the show from dashboards |
| [Announcer](glossary.md#announcer) | Watch the screens assigned to them, possibly with a few simple controls |

Exact permissions are in [users and access](../features/users-and-access.md#role-matrix).

## Goals

1. **Build once, reuse everywhere.** Teams, themes and screens are saved, and can be exported and imported as JSON.
2. **Design visually.** Overlay screens are built by dragging and dropping pre-made components. No code or OBS source editing is needed.
3. **Run any event shape.** A single game, a double header, or a tournament with several tracks running at once, each with its own dashboards and live preview.
4. **React to the game.** CRG state changes show and hide components and feed live game data into overlays.
5. **One control surface.** OBS actions such as switching scenes and firing hotkeys are available from the same dashboards.
6. **Safe on a shared network.** Accounts and roles decide who can change what.

## Non-goals

- **No scoring and no score displays.** CRG owns scores, clocks and its own scoreboard overlay. We build roster and custom game-data displays. ([ADR-0005](../decisions/0005-crg-is-listen-only.md))
- **Never write to CRG.** We only listen. ([ADR-0005](../decisions/0005-crg-is-listen-only.md))
- **No internet hosting and no cloud dependencies.** It runs on a machine on the venue network and must work with no internet connection. ([ADR-0004](../decisions/0004-server-is-the-hub.md))
- **Not a replacement for OBS.** OBS still does capture, mixing, encoding and streaming. We supply browser sources and send OBS commands.

## What success looks like

On game day, a producer:
1. sets up the day's games from saved teams, themes and screens;
2. adds each screen's [output](glossary.md#output) to OBS once;
3. runs the whole event from dashboards, without editing OBS sources or touching CRG.
