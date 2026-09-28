---
title: Live Mode
status: planned
summary: Set up and run events with several games and concurrent tracks, from producer dashboards with live previews.
---
# Live Mode

Live Mode is where game day happens. Producers set up an [event](../product/glossary.md) with its games and [tracks](../product/glossary.md#track), move between games as the day goes on, and run each screen from a producer dashboard that shows a live preview of what's on air.

## Users and roles

Admins and Producers set up events and run dashboards. Announcers see only the dashboards assigned to them, with limited controls if any. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Set up games: the two teams, date, location, and other game details.
- **R2.** An event can hold several games (a double header, a tournament), and producers can move between them.
- **R3.** Several tracks can run at the same time. Each track runs its own sequence of games, and producers can control all tracks at once.
- **R4.** Each track listens to its own CRG instance ([CRG automation](crg-automation.md)).
- **R5.** Each screen used on a track has an [output](../product/glossary.md#output) URL that is added to OBS as a browser source.
- **R6.** A change made on one dashboard appears on every other dashboard and output straight away. The server holds the live state ([ADR-0004](../decisions/0004-server-is-the-hub.md)).

## Producer dashboards

From Live Mode, producers open a dashboard for each screen.

- **R7.** A dashboard shows a live preview of the screen exactly as OBS renders it, using the same renderer ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)).
- **R8.** A dashboard controls which screens are active and what their components show. Examples: show or hide a component, pick a skater to spotlight, page through a roster.
- **R9.** Dashboards also offer [OBS controls](obs-control.md).

## Behavior

Not built yet.

## Related

- [Data model](../architecture/data-model.md): Event, Track, Game, Output
- [Screen Builder](screen-builder.md), [Overlay components](overlay-components.md), [OBS control](obs-control.md)

## Open questions

- What makes a screen "active"? Is it an app-level on/off switch, or is it worked out from which OBS scene is on air?
- Is an output always one screen on one track? Can the same screen run on two tracks at once, each with its own output?
- Does each track have its own OBS instance, or does one OBS serve several tracks?
- Are tracks set up per event, or once for the venue and reused?
- Which game fields do we need beyond teams, date and location? CRG's `EventInfo` has venue, city, state, tournament, host league, game number, date and start time. Should we mirror those, or read them from CRG?
- Should a track follow CRG's current game automatically, or does a producer switch games by hand?
- Are game rosters (the subset of a team playing a given game) set here? See [Team Builder](team-builder.md).
- Which dashboards and controls do Announcers get? See [users and access](users-and-access.md).
