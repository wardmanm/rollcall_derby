---
title: CRG scoreboard integration
---
# CRG scoreboard integration

How we read game data from the [CRG Scoreboard](https://github.com/rollerderby/scoreboard), and the strict limits on what we send it. We **only listen**; the rule and its reasons are in [ADR-0005](../../decisions/0005-crg-is-listen-only.md).

> **Verified against:** CRG **v2027.1** (released 2026-09-22) and the `dev` branch source, on 2026-09-28. If you build against a newer CRG, re-check the facts you rely on and update this line.

## What we may send

| Allowed | Purpose |
|---|---|
| WebSocket `{"action":"Register","paths":[…]}` | Subscribe to state keys |
| WebSocket `{"action":"Ping"}` | Keep the connection alive |
| HTTP `GET /SaveJSON/?path=…` | Read-only export, e.g. a saved team |

Everything else is forbidden, including:
- `{"action":"Set", …}`, which writes a value (and setting a key to `null` deletes it);
- command keys set to `true`, such as `StartJam`, `StopJam`, `Timeout`, `ClockUndo`, `OfficialTimeout`, `Team(n).Timeout`, `Team(n).OfficialReview`, `Clock(x).Start`/`Stop`/`ResetTime`, `LoadOfficialsCrew`, `StoreOfficialsCrew` and `Export`;
- `{"action":"StartNewGame", …}`;
- HTTP `POST /Load/*` and uploads to `/Media/*`.

## Connecting

- CRG serves HTTP on port **8000** by default (`--port=<n>`, `--host=<h>`), on all interfaces. Its built-in overlay is at `/views/overlay/`.
- The WebSocket endpoint is **`ws://<host>:8000/WS/`**. The official client adds `?source=<page>&platform=<…>` to label itself on CRG's Devices screen. We should connect with `?source=obs-producer` so operators can identify us.
- There is no login. CRG tracks each device with a `CRG_SCOREBOARD` session cookie, and **new devices get write access by default**. As a second guard, operators should turn off write access for new devices in CRG's client settings (`NewDeviceWrite`, `AllLocalDevicesWrite`). *The exact setting key paths are unverified.*
- A client without the cookie becomes a new "device" on every connection. CRG clears out inactive devices hourly.

## Registering and receiving state

```json
{"action":"Register","paths":["ScoreBoard.CurrentGame.Team(*).Skater","ScoreBoard.CurrentGame.Clock(Jam).Number"]}
```

- Registrations add up over the life of a connection and can't be withdrawn. Registering a path also covers everything below it. `*` is a wildcard inside parentheses.
- After registering, CRG sends the current values straight away, then only changes:

```json
{"state":{"ScoreBoard.CurrentGame.Team(1).Score":12,"ScoreBoard.CurrentGame.Clock(Jam).Running":true}}
```

- Keys are flat full paths. **A `null` value means the key was deleted.** Times are in milliseconds.
- Heartbeat: send `{"action":"Ping"}` every 30 s; CRG replies `{"Pong":""}`. The official client reconnects after 1 s and **re-sends its registrations**. Ours must do the same.

## State keys we care about

All keys are under `ScoreBoard.CurrentGame.`

| Area | Keys |
|---|---|
| Game | `State` (`Prepared` · `Running` · `Finished`), `Name`, `InPeriod`, `InJam`, `InOvertime`, `CurrentPeriodNumber`, `OfficialScore`, `NoMoreJam`, `CurrentTimeout`, `TimeoutOwner` (`<gameId>_1`, `<gameId>_2`, `O` for officials, or empty), `OfficialReview` |
| Event info | `EventInfo(Venue\|City\|State\|Tournament\|HostLeague\|GameNo\|Date\|StartTime)` |
| Clocks | `Clock(Period\|Jam\|Lineup\|Timeout\|Intermission).Running\|Time\|Number\|Direction\|MaximumTime` |
| Team `Team(1\|2).` | `TeamName`, `LeagueName`, `FullName`, `Name`, `Initials`, `UniformColor`, `Logo` (a file under `images/teamlogo/`), `AlternateName(overlay\|scoreboard\|…)`, `Color(<type>.fg\|.bg\|.glow)`, `Position(Jammer\|Pivot\|Blocker1..3)`, `Lead`, `StarPass`, `Calloff`, `Injury`, `Timeouts`, `OfficialReviews`, `InTimeout`, `InOfficialReview`, `Captain`, `PreparedTeam` |
| Skater `Team(n).Skater(<id>).` | `Name`, `RosterNumber`, `Pronouns`, `Flags`, `Role`, `Position`, `PenaltyBox`, `Color` |
| Officials | `Nso(<id>)` / `Ref(<id>)` with `Name`, `Role`, `League`, `Cert` |

**Skater `Flags`** (from CRG's team editor): `""` skater, `C` captain, `A` alt captain, `ALT` not skating, `BA` bench alt captain, `B` bench staff.

Score and clock keys exist, but we never display them ([ADR-0005](../../decisions/0005-crg-is-listen-only.md)). Clock *running* states are fine to use as triggers.

## Detecting game events

CRG doesn't send events. It sends state changes, **batched and in no guaranteed order**. To detect an event, keep the previous value of each key and compare it with the new one.

| Event | Condition |
|---|---|
| Jam starts / ends | `InJam` (or `Clock(Jam).Running`) goes to `true` / `false`. `Clock(Jam).Number` increments each jam |
| Lineup starts | `Clock(Lineup).Running` → `true` |
| Timeout starts | `Clock(Timeout).Running` → `true`. `TimeoutOwner` says whose; `OfficialReview` flags an official review |
| Period ends | `InPeriod` → `false` (or `Clock(Period).Running` → `false` with `Time` 0) |
| Intermission starts | `Clock(Intermission).Running` → `true` |
| Game ends | `State` → `Finished` and/or `OfficialScore` → `true` |
| Lead / star pass | `Team(n).Lead` or `Team(n).StarPass` changes |

This mapping is our interpretation of the state keys, not something CRG documents as events. Test it against a real CRG before relying on it.

## Teams and rosters

- CRG's saved teams live at `ScoreBoard.PreparedTeam(<id>)`, with `TeamName`, `LeagueName`, `Logo`, `AlternateName(*)`, `Color(*)` and `Skater(<id>).Name|RosterNumber|Flags|Pronouns|Color`.
- To export one team read-only: `GET /SaveJSON/crg-team-X.json?path=ScoreBoard.PreparedTeam(<id>)`. It returns `{"state":{…}}` and does no permission check. This is the basis for a possible "import team from CRG" feature ([Team Builder](../../features/team-builder.md)).
- CRG's own importers (`/Load/JSON`, `/Load/xlsx`) are writes and are forbidden.

## Sources

- WebSocket commands: https://github.com/rollerderby/scoreboard/wiki/WebSocket-Commands
- WebSocket channels (state keys): https://github.com/rollerderby/scoreboard/wiki/WebSocket-Channels
- Client implementation: https://github.com/rollerderby/scoreboard/blob/dev/html/json/WS.js
- Server implementation: https://github.com/rollerderby/scoreboard/blob/dev/src/com/carolinarollergirls/scoreboard/jetty/WS.java
- Releases: https://github.com/rollerderby/scoreboard/releases

**Unverified:**
- the exact key paths of the device-write settings;
- the status of the separate `rollerderby/crg` repository, which describes a newer "CRG Scoreboard and Game System".

Check both before relying on them.
