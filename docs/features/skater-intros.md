---
title: Skater intros
app: rcl-producer
status: shipped
summary: Introduce each team and its people on stream before a game, with a title card then a card per person, run live from a laptop or phone.
---
# Skater intros

Before a game, the announcer introduces each team and its people. Skater intros put that on the stream: a team's **title card** first, then a card for each person as they're called, showing photo, number, name, roles and pronouns. A producer at the laptop, or someone on a phone, starts a team, presses **Next** as each person is called (or lets a timer do it) and clears it at the end. Each intro is loaded into OBS as a browser source through one URL.

This is the first real overlay in Phase 2. It builds the overlay renderer ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)) and the first [overlay component](overlay-components.md), the team roster. Until the [Screen Builder](screen-builder.md) exists, a small setup page stands in for it.

## Users and roles

Admins and Producers set up and run intros. Announcers get controls in Phase 5. The canonical permissions live in [users and access](users-and-access.md#role-matrix); the two this feature adds are `producer:intros.manage` (create, edit and delete intros) and `producer:intros.run` (open the control page and press Start, Next and Clear).

## Requirements

- **R1.** An intro is a saved setup with a name: team A and team B (picked from core's teams, never the same team twice), a theme (any theme, or the default theme as it changes), how many people show at once (1 to 20, or the whole team), how it moves on (when Next is pressed, or every 2 to 60 seconds), whether cards show pronouns (on by default), the entrance (pop, slide up, fade or wipe) and the position (one of nine spots plus a distance from the edge).
- **R2.** A setup page creates, edits and deletes intros, gives each one's OBS URL (a browser source sized 1920×1080) with a copy button, and previews the entrance and position with team A's first few people, using the same renderer as OBS.
- **R3.** A control page, built for a phone first, has **Start** for each team, **Next** and **Clear**, and lists the running team's people in order, marking who is on screen and who is next. Every open control page shows the same state, live, and disables its buttons while disconnected.
- **R4.** Start brings in the team's title card (a banner with logo, team name and league) and ends anything already on air. Next brings in the next person; when the row holds the set number, the row leaves together and the next person starts a new row. Clear removes whatever is up and keeps the team's place. The last card stays up until Clear or the other team's Start.
- **R5.** On the timer, each step (the title card counts as one) comes after the set time, and Next still works. The timer stops after the last person and does not clear.
- **R6.** Cards show photo (or the team logo, or the team colour alone), the number badge (not for bench staff), name, and a line of roles and pronouns. The people are in team page order: skaters by number, then bench staff by name. The whole team shows for now; active rosters come with Live Mode in Phase 3.
- **R7.** Cards in a row never overlap and never run off the screen; they shrink to fit the number across, up to a largest size. The row stays anchored to the chosen spot and cards already up slide aside for each new one.
- **R8.** Nothing comes in until its photo and fonts have loaded, and a failed load shows the fallback instead of stalling the run.
- **R9.** The server holds each running intro's state and pushes it to the overlay and control pages. Reloading OBS, or a phone that drops off the wifi, comes back to the same cards without replaying entrances.
- **R10.** A Next that names a step the state has already moved past is ignored, so two people pressing at once, or a retry after a reconnect, advance one step, not two.
- **R11.** The theme changes on air at once, including a new default theme. Every other setting takes effect at the next Start.
- **R12.** The OBS page is sent only what is on air plus the next person, never the whole team. A team deleted mid-run ends its run.
- **R13.** Nothing at runtime needs the internet, and the feature shows no score or clock.

## Behavior

### Setting up

- **The Intros page** (`/producer/intros`) lists saved intros by name. Admins and Producers create one by name, which opens its setup page, and delete one.
- **An intro's setup page** (`/producer/intros/<id>`) has the name, team A and team B (picked from core's teams, never the same twice), the theme (any theme, or "Default theme"), how many at once, how it moves on, the entrance, a "Show pronouns" switch and the position. A new intro starts with 1 at once, Next, pop, pronouns shown and bottom centre, 48 px from the edge. Like every setting but the theme, "Show pronouns" takes effect at the next Start, and with it off the OBS page is never sent anyone's pronouns, not even for the next person.
- **The OBS URL** is `/producer/overlay/intros/<id>`, with a copy button and a line on adding it to OBS as a browser source sized 1920×1080.
- **The preview** plays the chosen entrance and position with team A's first few people, using the overlay's own components and theme scope, so it matches OBS.
- **A team deleted from core** leaves its slot empty. The setup page asks for a new team, and the control page disables that slot's Start.
- A theme change reaches the intro's overlay at once: editing the theme in use, a new default for an intro on "Default theme", picking another theme on the setup page, or an [import](import-export.md) that saves a theme. Every other setting takes effect at the next Start, so the row on air never jumps.

### Running it

- **The control page** (`/producer/intros/<id>/run`) is built for a phone first. It has **Start <team>** for each team, a big **Next**, a smaller **Clear** set apart, and below them the running team's people in order, marked **On screen** or **Next**, with a line when the title card is up. On a timer it counts down to the next step.
- **Every open control page shows the same state, live.** While the connection is down the page says so and disables its buttons. It fetches the state again when the tab regains focus, so a phone that slept catches up. If the intro is deleted while the page is open, it says "This intro was deleted."
- **The countdown** counts from the moment the state arrived on that page, never from the server's clock, so a phone with the wrong time still counts right.
- **Start** ends anything on air and brings in the team's title card. Starting the same team again starts it over. **Next** from the title card brings in the first person, then the next, joining the row; a full row leaves together and the next person starts a new one. After the last person, Next does nothing and the button reads "Team done". **Clear** takes everything off air, stops the timer and keeps the team's place; the next Next carries on in a fresh row.
- **On a timer,** the server takes the same steps as Next after the set time, starting at Start (the title card is one step). A press of Next goes straight to the next step and restarts the countdown. The timer stops after the last person and doesn't clear. An error in a timer step is caught and logged, and the run stays where it was.

### What the server holds

- **Runs are in memory,** so a server restart leaves nothing on air and the producer presses Start again. Each run has a revision that counts up from the server's start time, so revisions keep growing across restarts.
- **Pages take the first state after a connect or reconnect unconditionally, and after that only newer ones.** So a restarted server's states are accepted, and a late one from before a change is dropped.
- **Who is in a run, and their order, is fixed at Start.** Their details (name, number, roles, pronouns, photo) are read fresh from core at each step, so a corrected photo shows and a deleted photo's address is never held. Core doesn't announce changes ([ADR-0023](../decisions/0023-core-data-services-for-apps.md)), so a member removed mid-run (skipped from then on), or a deleted team (which ends the run), is noticed at the next step, timer tick, reload or read. Someone added mid-run is in the next Start.
- **A Next carries the revision it was pressed on.** The server ignores one that isn't the run's current revision, so two people pressing at once, or a retry after a reconnect, advance one step.
- **Live state goes out over Socket.IO.** An intro's OBS page joins that intro's room in the public `/producer/overlay` namespace. Its control pages join the same-named room in `/producer/intros`, which needs `producer:intros.run`. Each gets the full state when it connects and after every change.
- **The public OBS page is sent only the cards on air plus who's next,** so the next photo can load early, never the whole team.

### On the OBS page

- The page is a 1920×1080 canvas on a transparent background, scaled to fit the browser source. It shows nothing until the server has sent the intro's state.
- **The title card** is a wide bar in the team's primary colour with the logo in a circle, the team name, the league and an underline in the secondary colour. With no logo it has no circle; with no league, only the name. It sits in the roster's spot and uses the same entrance as the cards. The same team's title sent again (after a reconnect, say) doesn't leave and replay.
- **A person card** has a 4:3 photo (the team logo on the team colour when there is none, or the colour alone), a number badge on the team's primary colour (none for bench staff), the name in the theme's heading font (a long name shrinks to fit one line, then wraps to two, and ends in an ellipsis past that), and a line of roles, custom roles and pronouns (unless the intro hides them) joined with " · " (one line if it fits, a second if not, then an ellipsis; the text doesn't shrink). The name and role line have fixed heights, the role line two lines tall, so every card in a row is the same height whatever it says: a one-line role line is centered in its area, and an empty one keeps it. Team colours reach the cards as `--team-primary`, `--team-secondary` and `--team-on-primary` (black or white, whichever reads better); a team without colours uses the theme's accent, text-on-accent and border. This answers [Theme Builder's](theme-builder.md) question about team colours.
- **The row** never overlaps and never runs off the screen. Card width is the box (the canvas inside the edge distance) divided by how many at once, minus the gaps, up to 420 px, and is the same for the whole team. Centre spots grow from the middle, left spots rightwards and right spots leftwards.
- **Readiness.** A card or banner comes in only once its picture is ready: its photo, or the fallback logo after a failed photo, or at once when it has neither. A failed load never stalls the run. The roster also waits for the theme's fonts on first load, and a theme change keeps the old look until the new fonts have loaded.
- **Opening.** A new card's place opens first, with the cards already up sliding aside, and then it enters. A row's first card has nothing to slide aside, so it comes straight in. Cards come in in row order: one whose picture is ready first waits for every card before it. A card whose place is still opening when the row leaves stays hidden.
- **Exits** are the entrance reversed, with the whole row together.
- **On an OBS reload** what's on air reappears without entrances, each piece once its picture is ready.

### Permissions

`producer:intros.manage` creates, edits and deletes intros. `producer:intros.run` opens the control page and presses Start, Next and Clear. Admins and Producers hold both, and API keys may ([users and access](users-and-access.md#permissions)). The setup page lists teams, so it also needs `core:teams.read`, which Producers hold.

## Related

- [Overlay components](overlay-components.md), [Screen Builder](screen-builder.md), [Team Builder](team-builder.md) and [Theme Builder](theme-builder.md)
- [ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md): one overlay renderer, CSS-variable theming
- [ADR-0023](../decisions/0023-core-data-services-for-apps.md): core's teams reach the Producer app through `ctx.teams`
- Design: [skater intros design](../../design-docs/specs/2026-11-05-skater-intros-design.md)

## Open questions

- None yet.
