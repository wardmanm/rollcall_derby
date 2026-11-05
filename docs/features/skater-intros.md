---
title: Skater intros
app: rcl-producer
status: in-progress
summary: Introduce each team and its people on stream before a game, with a title card then a card per person, run live from a laptop or phone.
---
# Skater intros

Before a game, the announcer introduces each team and its people. Skater intros put that on the stream: a team's **title card** first, then a card for each person as they're called, showing photo, number, name, roles and pronouns. A producer at the laptop, or someone on a phone, starts a team, presses **Next** as each person is called (or lets a timer do it) and clears it at the end. Each intro is loaded into OBS as a browser source through one URL.

This is the first real overlay in Phase 2. It builds the overlay renderer ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)) and the first [overlay component](overlay-components.md), the team roster. Until the [Screen Builder](screen-builder.md) exists, a small setup page stands in for it.

## Users and roles

Admins and Producers set up and run intros. Announcers get controls in Phase 5. The canonical permissions live in [users and access](users-and-access.md#role-matrix); the two this feature adds are `producer:intros.manage` (create, edit and delete intros) and `producer:intros.run` (open the control page and press Start, Next and Clear).

## Requirements

- **R1.** An intro is a saved setup with a name: team A and team B (picked from core's teams, never the same team twice), a theme (any theme, or the default theme as it changes), how many people show at once (1 to 20, or the whole team), how it moves on (when Next is pressed, or every 2 to 60 seconds), the entrance (pop, slide up, fade or wipe) and the position (one of nine spots plus a distance from the edge).
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

Not written yet: this feature is in progress.

## Related

- [Overlay components](overlay-components.md), [Screen Builder](screen-builder.md), [Team Builder](team-builder.md) and [Theme Builder](theme-builder.md)
- [ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md): one overlay renderer, CSS-variable theming
- [ADR-0023](../decisions/0023-core-data-services-for-apps.md): core's teams reach the Producer app through `ctx.teams`
- Design: [skater intros design](../../design-docs/specs/2026-11-05-skater-intros-design.md)

## Open questions

- None yet.
