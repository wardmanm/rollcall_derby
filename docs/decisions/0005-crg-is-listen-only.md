---
title: CRG is listen-only
status: accepted
date: 2026-09-28
---
# 0005. CRG is listen-only

## Context

Officials use the [CRG Scoreboard](https://github.com/rollerderby/scoreboard) to run the official score and clocks of a game. Anything that changes CRG's state can corrupt a live game's official record. CRG's WebSocket API accepts writes (`Set`, command keys such as `StartJam`, `StartNewGame`), and **new devices get write access by default**. A single wrong message from our app could therefore stop a jam or change a score.

CRG also has its own scoreboard overlay, and we don't want to compete with it. Our value is in rosters and custom game-data displays.

## Decision

We only ever read from CRG, and the allowed traffic is an explicit allow-list.

**Hard rules:**
- **CRG is listen-only.** Outbound WebSocket messages to CRG are exactly `Register` and `Ping`, sent through the single CRG send wrapper. The only HTTP request allowed is `GET /SaveJSON/`. Never send `Set`, `StartNewGame` or command keys. Never call `/Load/*` or `/Media/*`.
- **No scoring, no score displays.** CRG owns scoring, clocks and its own scoreboard overlay. We build rosters and custom game-data displays.

How this is enforced:
1. **One send wrapper.** All CRG WebSocket traffic goes through one function. It throws on any message whose `action` isn't `Register` or `Ping`. A unit test proves that it rejects everything else.
2. **Review.** Any change to the CRG client gets its diff checked against this ADR.
3. **Second guard at the venue.** Operators are told to turn off write access for new devices in CRG, so that CRG itself rejects writes from our app ([CRG integration](../architecture/integrations/crg-scoreboard.md#connecting)).

## Consequences

- There is no risk of corrupting an official game record from our side.
- Features that would need CRG writes, such as "start the next game in CRG", are out of scope for good.
- Clock and score keys may be read as **triggers** (e.g. jam running), but they are never displayed.
- Importing teams from CRG is possible, read-only, through `GET /SaveJSON/`.
