---
title: Glossary
---
# Glossary

This page defines the terms used across the wiki, the UI and the code. Use them exactly. Several words mean different things in derby, in OBS and in this app, so the tables below keep them apart. When you introduce a new term, add it here in the same change.

## Roller derby

| Term | Meaning |
|---|---|
| <a id="game"></a>**Game** | A single roller derby game between two teams, played in two periods. Also called a **bout**; we say *game*. |
| **Period** | One of the two halves of a game. |
| **Jam** | The unit of play in which points are scored. It ends when time runs out or the lead jammer calls it off. |
| **Lineup** | The short break between jams when teams send skaters onto the track. |
| **Jammer** | The skater who scores points. Wears the star helmet cover. |
| **Pivot** | A blocker wearing the striped helmet cover, who can become the jammer through a star pass. |
| **Blocker** | A skater who plays offense and defense in the pack. The pivot is one of a team's blockers. |
| **Lead jammer** | The first jammer to legally break through the pack. Can call off the jam. |
| **Star pass** | The jammer hands the star helmet cover to the pivot, who becomes the jammer. |
| **Timeout** | A stoppage called by a team or by the officials. |
| **Official review** | A team's challenge of an officiating call. |
| **Intermission** | The break before a game or between periods. |
| **Skater** | A player on a team. |
| **Bench staff** | Non-skating team staff, such as the bench coach or bench manager. |
| **Captain / Alt captain** | Skaters who speak for the team with officials. |
| **Roster** | The list of a team's skaters and bench staff for a game. |
| **Referee / NSO** | Skating officials and non-skating officials. |
| <a id="track"></a>**Track** | The physical track where games are played. At tournaments, several tracks run games at the same time. In this app each Track runs its own sequence of games and has its own CRG instance. |
| **Double header** | Two games played back to back at one event. |

## CRG scoreboard

| Term | Meaning |
|---|---|
| **CRG** | The [CRG Scoreboard](https://github.com/rollerderby/scoreboard), open-source scoring software used by officials. We only ever listen to it ([ADR-0005](../decisions/0005-crg-is-listen-only.md)). |
| **State key** | A flat path to one value in CRG's state, e.g. `ScoreBoard.CurrentGame.Team(1).Name`. See [CRG integration](../architecture/integrations/crg-scoreboard.md). |
| **Register / Ping** | The only two WebSocket messages we may send to CRG: subscribe to state keys, and keep the connection alive. |
| **PreparedTeam** | A team saved in CRG (`ScoreBoard.PreparedTeam(<id>)`). |
| **Skater flags** | CRG's roster codes: none for a skater, `C` captain, `A` alt captain, `ALT` not skating, `BA` bench alt captain, `B` bench staff. |

## OBS

| Term | Meaning |
|---|---|
| **OBS** | [OBS Studio](https://obsproject.com/), the software that composes and streams the broadcast. |
| **Scene** | An OBS composition of sources. **Not the same as our Screen.** |
| **Source / Browser source** | An input inside an OBS scene. A browser source renders a web page, and that's how our [outputs](#output) get into OBS. |
| **Program / Preview** | What is on air, and what is staged next in OBS Studio Mode. |
| **Hotkey** | An OBS keyboard shortcut that can also be triggered remotely. |
| **obs-websocket** | OBS's built-in remote-control API (protocol v5). See [OBS integration](../architecture/integrations/obs-websocket.md). |

## This app

| Term | Meaning |
|---|---|
| **Screen** | An overlay canvas designed in the [Screen Builder](../features/screen-builder.md). It has a size, a theme, and placed overlay components. **Not an OBS Scene.** |
| **Overlay Component** | A pre-made, configurable building block placed on a screen, such as a team roster. **Not the same as a React component**; in code, prefer names like `OverlayComponent…` to keep them apart. See [overlay components](../features/overlay-components.md). |
| **Component options** | The settings of one placed overlay component, e.g. which team or how many rows. |
| **Theme** | A named set of visual tokens (colors, fonts, borders, radius) applied to screens as CSS custom properties. See [Theme Builder](../features/theme-builder.md). |
| **Event** | A day of derby: one or more games across one or more tracks. See [Live Mode](../features/live-mode.md). |
| <a id="output"></a>**Output** | A URL that renders one screen for one track. It is added to OBS as a browser source. |
| **Live Mode** | The part of the app where events, games and tracks are set up and run. |
| **Dashboard** | A producer dashboard: a Live Mode page showing a live preview of a screen and controls for its components. |
| **Automation** | A rule that reacts to CRG state changes, such as a jam starting, by changing components or triggering OBS actions. See [CRG automation](../features/crg-automation.md). |

## Roles

The role names are capitalized. They are different from a person's job at the event. Permissions are in [users and access](../features/users-and-access.md#role-matrix).

| Term | Meaning |
|---|---|
| <a id="admin"></a>**Admin** | Full control, including users, themes, screens and integration settings. |
| <a id="producer-role"></a>**Producer** (role) | Sets up games, uses existing screens, components and themes, and creates and edits teams. |
| **producer** (person) | The crew member running the stream. They might hold the Admin or the Producer role. |
| <a id="announcer"></a>**Announcer** | Views the screens assigned to them, possibly with a few simple controls. |
