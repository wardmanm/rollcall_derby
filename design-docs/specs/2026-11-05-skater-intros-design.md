# Skater intros: design

**Date:** 2026-11-05 · **Status:** approved by Mike 2026-11-05 · **Plan:** [2026-11-05-skater-intros.md](../plans/2026-11-05-skater-intros.md) · **Issues:** to be filed with the plan (rcl-producer, plus rcl-core for the teams service) · **Mockups:** [2026-11-05-skater-intros-mockups/](2026-11-05-skater-intros-mockups/) (Mike chose card C, row A and banner B; they're HTML fragments from the brainstorm's browser companion, so open them for their sizes and animations rather than their page frame)

## Goal

Before a game, the announcer introduces each team and its people. Rollcall puts that on the stream: a team's **title card** first, then a card for each person as they're called. The cards show photo, number, name, roles and pronouns. A producer at the laptop, or someone on a phone, runs it live: they start a team, press **Next** as each person is called (or let a timer do it), and clear it at the end.

This is the first real overlay in Phase 2 (Screens). It builds the overlay renderer ([ADR-0006](../../docs/decisions/0006-one-overlay-renderer-css-variable-theming.md)) and the first [overlay component](../../docs/features/overlay-components.md), the team roster. The [Screen Builder](../../docs/features/screen-builder.md) comes after, in its own design. Until then a small setup page stands in for it.

**Success:** a producer sets up the intros for tonight's two teams, pastes one URL into an OBS browser source, and runs both teams' intros from a phone, in time with the announcer. Nothing overlaps, nothing shows half-loaded, and reloading OBS or the phone mid-intro doesn't lose the place.

## Decisions (made with Mike, 2026-11-04 and 2026-11-05)

| Topic | Decision |
|---|---|
| When it's used | Before the game, during the announcements |
| Who runs it | The producer at the laptop, or someone on a phone |
| Person card | **Style C, the photo card:** photo on top, the number as a badge in its corner, then the name, then a line with roles and pronouns. With no photo, the team logo shows in its place. Team colours are the accents; the theme gives fonts and the rest |
| How many at once | **A setting.** One row; cards never overlap. Each step adds one card. Once the row holds the set number, the next step clears the row and starts a new row with the next person. 1 means one at a time; "the whole team" means all of them |
| How it moves on | **A timer or Next.** On the timer, each step comes after a set time; Next still works |
| The row | **Stays centred** (mockup A): each new card makes room for itself, and the cards already up slide aside. A short last group is centred too |
| Clearing | The row leaves together, with the exit animation, before the next row's first card comes in |
| Card size | Cards shrink to fit the number across, up to a largest size |
| Entrances | Pick from **pop, slide up, fade, wipe.** Cards leave with the same animation, reversed |
| Position | One of **nine spots** (top, middle, bottom × left, centre, right) plus a distance from the edge. **Bottom centre** by default |
| Title card | **The banner** (mockup B): a wide bar in the team colour with the logo, team name and league. It comes in when the team is started, sits in the roster's spot (not the screen's centre), and leaves when the first person comes in |
| Starting each team | **By hand,** each team separately, so team B can wait as long as needed after team A. Whoever runs it picks which team goes first |
| Order | Team page order: skaters by number, then bench staff by name |
| End of a team | The last card stays up until someone presses Clear or starts the other team. The timer doesn't clear it |
| Bench staff | Included. Their card has no number badge, and their role (such as Bench coach) is on the role line |
| Who's shown | **The whole team** for now. **Active rosters** (picking who's actually playing, set when an event starts, bench staff included) come with Live Mode in Phase 3 |
| The control page | Comes in this work. **Start** for each team, **Next** and **Clear.** Works on a phone. Lists the team's people in order, marking who's on screen and who's next |
| Setting it up | A setup page for now: the two teams, a theme, how many at once, timer or Next, the entrance and the position. It gives the URL for an OBS browser source. The Screen Builder replaces it later |
| Who can | Admins and Producers set up and run intros. Announcers get controls in Phase 5 |
| Reloads | The server remembers where the intros are up to. Reloading OBS, or a phone that drops off the wifi, comes back to the same cards |
| Stream Deck | Not in this work |

## Scope

**In this work:**
- The overlay renderer: the OBS page that hosts overlay components at a fixed canvas size, scaled to the browser source.
- One overlay component, the **team roster**: a row of person cards, opened for each team by its **title card**. The title card is part of the roster, not a component placed on its own *(Claude's call: it takes the roster's entrance and sits in the roster's spot)*.
- **Intros:** saved setups with a setup page, an OBS URL each, and a control page.
- Server-held live state for a running intro, pushed to its overlay and control pages.
- A read-only **teams service** on `AppContext`, so the Producer app can read core's teams ([ADR-0023](../../docs/decisions/0023-core-data-services-for-apps.md), [ADR-0019](../../docs/decisions/0019-rcl-apps-as-modules.md): "Core's data … must be added to `AppContext` on purpose, one service at a time").

**Not in this work:**
- Active rosters, events and games (Live Mode, Phase 3).
- The Screen Builder (its own design, next).
- Stream Deck / Bitfocus Companion setup.
- A **Back** button *(Claude's call: Mike asked for Start, Next and Clear)*.
- Other overlay components (skater spotlight, matchup card, current lineup).
- Announcer controls (Phase 5).
- Output token URLs (Live Mode).
- Exporting and importing intros.
- A live preview on the control page.

**Anti-goals** (failure even if it technically works):
- A card on air with a blank photo, missing font or broken layout. Nothing comes in until its photo and fonts have loaded.
- Cards that overlap, or a row that runs off the screen.
- A press of Next that's lost, or that skips a person, because two people pressed it or a phone reconnected.
- Anything that needs the internet (hard rule 4).
- Any score or clock (hard rule 2).

## What people see

### Setting up (Producer app, `/producer/intros`)

- **The Intros page** lists saved intros by name. Admins and Producers create one by name, which opens its setup page. They can also delete one *(Claude's call: several named intros, like screens will be, so a double header can be set up ahead and each OBS source keeps its URL)*.
- **An intro's setup page** has:
  - **Teams:** team A and team B, each picked from core's teams. The same team can't be picked twice.
  - **Theme:** any theme, or "Default theme", which follows the [default theme](../../docs/product/glossary.md#default-theme) as it changes. This follows the Theme Builder's decision that screens pick a theme and fall back to the default.
  - **How many at once:** 1–20, or "Whole team".
  - **Moves on:** "When I press Next", or "Every N seconds" (2–60).
  - **Entrance:** pop, slide up, fade or wipe.
  - **Position:** one of nine spots, plus the distance from the edge, in pixels of the 1920×1080 canvas.
  - **The OBS URL,** with a copy button and a line on how to add it: a browser source sized 1920×1080.
  - **A preview** that plays the chosen entrance and position with team A's first few people, using the same renderer as OBS *(Claude's call: entrance and position are hard to pick without seeing them; ADR-0006 already says previews use the one renderer)*.
- **Defaults** *(Claude's call)*: 1 at once, Next, pop, bottom centre, 48 px from the edge.
- **Settings changed while an intro is running** *(Claude's call)*:
  - **The theme changes on air at once.** That covers editing the theme in use, a new default theme for an intro on "Default theme", or picking another theme here. This keeps the Theme Builder's promise that every open overlay changes at once. The overlay loads any new fonts before it switches, so text never shows in a stand-in font (anti-goal 1).
  - **Everything else takes effect at the next Start,** so the row on air never jumps. That's the teams, how many at once, how it moves on, the entrance and the position.

### Running it (Producer app, `/producer/intros/<id>/run`)

The control page is built for a phone first, with large buttons, and works the same on the laptop.

- **Start <team A>** and **Start <team B>**, one button each, named for the teams.
- **Next** is the big button.
- **Clear** is smaller and set apart, so it isn't hit by mistake.
- **Below the buttons,** the running team's people in order:
  - a mark on the ones on screen;
  - a mark on the one coming next;
  - a mark when the title card is up.
- **On the timer,** the page shows the seconds until the next step.
- **Every open control page shows the same state, live.** Two people can run it together.
- **When the connection drops,** the page says so and disables the buttons until it's back.

### What each button does

- **Start <team>:**
  - If anything is on air, it leaves first.
  - The team's title card comes in.
  - On the timer, the countdown starts.
  - Starting the same team again starts it over.
- **Next:**
  - From the title card: the title card leaves, then the first person comes in.
  - From a person: the next person comes in, joining the row. If the row is full, the row leaves first and the next person starts a new one.
  - After the last person: nothing happens, and the button says the team is done.
  - On the timer, Next goes straight to the next step and restarts the countdown.
- **Clear:** whatever is up leaves. The timer stops.
  - **Pressed in the middle of a team,** Clear keeps the team's place. The next Next carries on with the next person in a fresh row, and on the timer the countdown starts again with it *(Claude's call: so a Clear pressed by mistake, or for a pause in the announcements, costs only the row on air)*.
  - The control page still marks who's next.
  - Start begins a team from its title card again.

The timer takes the same steps as Next: the title card counts as one step, then each person is one. It stops after the last person, and the last row stays up.

A team with no members shows its title card only. A team with no skaters still shows its bench staff, and the reverse.

## The overlay

### The OBS page

- The URL is `/producer/overlay/intros/<id>`. It's served by the existing overlay entry, with no Mantine or admin code (ADR-0006).
- The overlay is a **1920×1080 canvas**, scaled to fit the browser source and centred. Its background is transparent. The edge distance and card sizes are in canvas pixels, so the same setup looks the same at 720p or 1080p *(Claude's call)*.
- It shows nothing until the server has sent the intro's state. With no intro running, it shows nothing.
- **On a reload,** it rebuilds from the server and shows what's on air, without replaying entrances (ADR-0006: "Stateless reloads").
- **The overlay namespace stays public** until Live Mode's output tokens (users-and-access R5). For that reason, an overlay is sent only what's on air, plus the next person so their photo can load early, never the whole team *(Claude's call)*.

### The row

- **Anchored to its spot:**
  - centre spots grow from the middle (row A in the mockups);
  - left spots grow rightwards from the left edge;
  - right spots grow leftwards from the right edge.

  Cards already up slide aside smoothly to make room.
- **The roster's box:** the roster lays itself out inside a box.
  - For an intro, the box is the canvas inside the edge distance, and the spot says where in the box the row is anchored.
  - In the Screen Builder, the box will be wherever the roster is placed and sized on the canvas (Screen Builder R3).
- **Card width** is the box's width, divided by how many at once (the set number, or the team's size for "Whole team"), minus the gaps. It's capped at a largest size, about the single card in the mockups: 420 px wide on the canvas. Every card in a row is the same size, and the size is fixed for the whole team, so cards never resize while it runs *(Claude's call)*.
- **No overlap:** the row can never be wider than its box.

### The person card (style C)

- **Photo area:** 4:3, cropped to fill.
  - With no photo, the team logo on the team colour.
  - With neither, the team colour alone.
- **Number badge:** top right, on the team's primary colour. Bench staff have none.
- **Name:** in the theme's heading font and case. A long name shrinks to fit one line, down to a smallest size, then wraps to two.
- **Role line:**
  - the member's roles as the team page names them (Captain, Alt captain, Bench coach and so on), then their custom roles, then their pronouns, joined with " · ";
  - in the team's secondary colour;
  - an empty role line still keeps its height, so the cards in a row line up.

### The title card (banner B)

- A wide bar in the team's primary colour, with:
  - the logo in a circle on the left;
  - the team name;
  - the league below it;
  - an underline in the secondary colour.
- No logo: the bar without the circle. No league: just the name.
- It's drawn by the team roster component, as the opening of each team's run.
- It sits in the roster's box, anchored to the same spot as the row.
- It uses the same entrance as the cards.

### Colours and theme

- **Team colours** become CSS variables on each team's cards, such as `--team-primary`, `--team-secondary` and `--team-on-primary`. Components still style themselves only with variables (ADR-0006, overlay-components R3).
  - A team with no colours falls back to the theme's `accent`, `onAccent` and `border`.
  - `--team-on-primary` is black or white, whichever reads better on the primary colour *(Claude's call)*.
- **The theme** gives the fonts, text colours, the card surface, the corner radius and the border width.
- This answers the Theme Builder's open question about team colours in overlays.

### Entrances

- **Pop, slide up, fade and wipe,** each about 400 ms, as in the mockups.
- **Exits** are the entrance reversed, with the whole row together.
- A card waits to enter until its photo has loaded (anti-goal 1). If loading fails, the fallback shows instead, and the run never stalls.

## The server

### Live state

- **The server holds each running intro's state** (hard rule 3):
  - which team is up;
  - the step;
  - who's on screen;
  - the timer's deadline.

  The timer runs on the server, so every page agrees.
- **The state is kept in memory** *(Claude's call)*. A server restart clears every intro to "nothing on air", which is safe: the producer presses Start again.
- **Actions are API routes,** checked like every other route (hard rule 5):
  - `POST /api/producer/intros/:id/start` with the team;
  - `POST /api/producer/intros/:id/next`;
  - `POST /api/producer/intros/:id/clear`.

  Each one returns the new state.
- **A Next names the step it was pressed on.** The server ignores it if the state has already moved past that step. Two people pressing Next at once, or a phone retrying after a reconnect, advance one step, not two (anti-goal 3).
- **Live state goes out over Socket.IO:**
  - the overlay gets its room in the public `/producer/overlay` namespace;
  - control pages get a signed-in namespace, such as `/producer/intros`, that checks `producer:intros.run`.

  Each sends the full state on connect and after every change.
- **Who's in a run, and in what order, is fixed at Start** *(Claude's call)*.
  - Each person's details are read fresh from `ctx.teams` when their card comes in, and again on a reload. That covers name, number, roles, pronouns and photo. ADR-0022 deletes a replaced photo's file straight away, so a run must never hold on to an old photo's address. Fixing a wrong photo mid-run shows the new one.
  - Someone removed from the team mid-run is skipped.
  - Someone added mid-run is in the next Start.
- **When a team is deleted:**
  - A run of that team ends, and whatever is up leaves.
  - Its intros keep the slot empty. The setup page asks for a new team, and the control page disables that team's Start.

### Stored data

- An intro is stored in a table of the Producer app's own, `producer_intros`, with three parts kept apart, the way a screen will keep them *(Claude's call)*:
  - **What it shows and how it looks:** id, name, team A id, team B id, and theme id (or null for the default). On a screen, the theme belongs to the screen (Screen Builder R5).
  - **Placement:** the spot and the edge distance. On a screen, the component's placed box replaces these (Screen Builder R3, and the data model's "position, size and options").
  - **The roster's options:** how many at once, how it moves on (Next, or every N seconds) and the entrance.
- **The roster's options are its options schema** (overlay-components R1), a Zod schema in `@rollcall/producer-contract`, holding only those three. When the Screen Builder places a roster on a screen, it uses the same schema, and its placement and theme come from the screen.
- **Start, Next and Clear are the roster's live controls** (overlay-components R1), not options.

### Teams for apps (rcl-core)

- `AppContext.teams` is read-only, like `fonts` ([ADR-0023](../../docs/decisions/0023-core-data-services-for-apps.md)):
  - `list()` gives the team summaries, as `GET /api/core/teams` returns them;
  - `get(id)` gives a team with its members, as `GET /api/core/teams/:id` returns it, or undefined.
- The types come from `@rollcall/core-contract`.
- This needs an rcl-core release that the Producer app's `requiresCore` range then requires.

### Permissions

| Permission | Allows | Admin | Producer | Announcer | API keys |
|---|---|---|---|---|---|
| `producer:intros.manage` | Create, edit and delete intros | ✅ | ✅ | — | ✅ |
| `producer:intros.run` | Open the control page and press Start, Next and Clear | ✅ | ✅ | — | ✅ |

- Picking teams on the setup page needs to see them. Producers already hold `core:teams.read`.
- **API keys may hold both** *(Claude's call)*, like the themes permissions. That leaves the door open for a Stream Deck later, but nothing in this work sets one up.

## Left to the builder

- The exact canvas pixel sizes, gaps and smallest name size, starting from the mockups.
- Animation easing and timings within "about 400 ms".
- Socket event names and payload shapes, in the producer contract.
- How the setup page's form is laid out, and whether the preview loops.
- Whether the live-state design becomes an ADR. Live Mode's dashboards will build on it (server-held state, actions as routes, a stale-step check, state pushed on connect). If the plan settles it, record it as one.
- What happens to the existing placeholder at `/producer/overlay`.

## Docs to update in the same change

- **New feature page** `docs/features/skater-intros.md` (rcl-producer). It covers the setup page, the control page, the OBS URL, behaviour and requirements, and links the roster and title card.
- `docs/features/overlay-components.md`: requirements for the **Team roster**, its title card, its options and its live controls. Also the answer to "long rosters: timer or next page": both, as how many at once and timer or Next.
- `docs/features/screen-builder.md`: intros' setup page stands in until the Screen Builder exists, and the roster's options schema carries over. Also the answer to the canvas-scaling open question (1920×1080, scaled to fit).
- `docs/features/live-mode.md`: active rosters, picked from the team when an event starts, bench staff included, and used by the intros. This answers its game-roster question.
- `docs/features/team-builder.md`: the game-roster open question points to Live Mode's active rosters.
- `docs/features/theme-builder.md`: the team-colours open question is answered.
- `docs/features/users-and-access.md`: the two permissions in the table.
- `docs/product/glossary.md`: **Intro** (a saved skater-intros setup), **Title card**, **Active roster** (planned, Live Mode).
- `docs/product/roadmap.md`: Phase 2 lists skater intros first.
- No new ADR for the teams service: ADR-0023 already says "Teams, CRG and OBS will follow as services". Where `AppContext` is documented (the architecture README's "How apps are hosted"), `teams` joins `fonts`.
- `docs/architecture/data-model.md`: the intros table.
- Changelogs: rcl-producer (skater intros), and rcl-core only if the teams service is user-visible (it isn't, so likely none).
