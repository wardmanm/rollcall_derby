---
title: CRG Automation
status: planned
summary: Use CRG scoreboard state (read-only) to show and hide components and to display live game data.
---
# CRG Automation

Overlays react to the game as it happens. The server listens to each track's CRG scoreboard. When CRG's state changes, for example a jam starts, the server shows or hides components and passes live game data (team names, current jammers) to overlays. We **only listen**: nothing is ever written to CRG ([ADR-0005](../decisions/0005-crg-is-listen-only.md)).

## Users and roles

Admins configure CRG connections and automation rules. Producers watch and override automations live. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Each track can connect to one CRG instance. The connection is read-only: it sends only `Register` and `Ping` ([ADR-0005](../decisions/0005-crg-is-listen-only.md)).
- **R2.** CRG state changes can trigger component actions, such as showing a component or hiding it.
- **R3.** Components can display live game data read from CRG. The one exception is scores and clocks, which CRG displays itself.
- **R4.** Producers can pause automations or override them from the dashboard. A manual change is not undone by the next automation.
- **R5.** Losing the CRG connection is survivable:
  - overlays keep their last state;
  - dashboards show that the connection is down;
  - the server reconnects on its own and registers again.

## Available triggers

These game events are worked out by diffing CRG state. The exact key conditions are in the [CRG integration](../architecture/integrations/crg-scoreboard.md#detecting-game-events).

| Trigger | Example use |
|---|---|
| Jam starts / ends | Hide the lineup card when a jam starts |
| Lineup starts | Show the current lineup with photos |
| Timeout starts (team or official) / official review | Show a team or info card |
| Period ends / intermission starts | Show a roster or sponsor screen |
| Game ends | Show a final matchup card (no scores) |
| Lead jammer / star pass | Highlight the skater now jamming |

## Behavior

Not built yet.

## Open questions

- Where do automation rules live: on a screen, on a track, or on an event? Who may edit them?
- Do we need timed rules, e.g. show a card for 10 seconds after a jam ends?
- Do jam and period numbers count as "score displays" (excluded) or as game data we may show?
- How do we match CRG skaters to our team members to show photos: by roster number, or by an explicit mapping?
- When an automation and a manual change conflict, how long does the manual change win? Until the next trigger, or until the producer releases it?
