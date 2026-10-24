---
title: Team Builder
app: rcl-core
status: shipped
summary: Create teams with skaters and bench staff, including names, numbers, roles and photos.
---
# Team Builder

The Team Builder is where teams are set up: their skaters and bench staff, with numbers, roles and photos. Overlay components such as rosters and skater spotlights draw on this data.

## Users and roles

Admins and Producers create and edit teams (`core:teams.manage`). Announcers can view them (`core:teams.read`). API keys can be given either permission, for example so Bitfocus Companion can read rosters. See the [permissions](users-and-access.md#permissions).

## Requirements

- **R1.** Create, edit and delete teams.
- **R2.** A team has members of two kinds:
  - **skaters** (players);
  - **bench staff** (coaches and other non-skating staff).
- **R3.** Each member has:
  - a name;
  - a number (skaters). Numbers are stored as **text**, not integers, so that numbers such as `00` and `07` keep their leading zeros;
  - optional pronouns.
- **R4.** Each member can have one or more roles: the fixed ones for their kind (Captain and Alt captain for skaters; Bench coach, Bench manager and Bench alt captain for bench staff), plus custom roles of their own.
- **R5.** Each member can have a photo. Photos are uploaded to the server and served from the local network, because nothing can depend on the internet ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)).
- **R6.** Teams can be exported and imported as JSON ([import / export](import-export.md)).
- **R7.** A team has a name, and optionally a league name, a short name, a primary and a secondary color, and a logo.

## Behavior

R1–R5 and R7 are built. R6 comes with the [Import / Export](import-export.md) feature.

- **The Teams page** (`/core/teams`, "Teams" in the header) lists each team with its logo, league, short name, colors, and how many skaters and bench staff it has. Admins and Producers create a team there by name, which then opens it.
- **A team's page** has its details and logo, then its skaters, then its bench staff.
  - Skaters are listed by number, numbers compared as people read them: `0`, `00`, `07`, `7`, `9`, `12`, `12A`, `100`. Bench staff are listed by name.
  - **Add skater** and **Add bench staff** open a form with **Save and add another**, so a whole roster can be typed without leaving it.
  - Each member's menu has **Edit** and **Remove**. Removing a member, and deleting a team, ask first; deleting a team says what goes with it.
  - Announcers see the same pages with no editing controls.
- **The rules,** checked in the browser and again on the server:
  - names are 1–64 characters; a league name up to 64; a short name up to 8; colors `#rrggbb`;
  - two teams may have the same name, so the list shows their leagues;
  - a skater's number is 1–4 letters or digits, and no two skaters on a team share one ("Another skater already has number 12"); bench staff have none;
  - a team has at most one Captain and one Alt captain ("This team already has a Captain"); each fixed role is for one kind of member;
  - up to 3 custom roles per member, each up to 32 characters; pronouns up to 32.
- **Logos and photos** are PNG, JPEG or WebP, up to 5 MB, stored as uploaded: overlays fit them to their space.
  - The server checks an image's bytes, not just its stated type, so nothing else can be served as one.
  - They're served at `/media/<id>` to anyone, so OBS overlays can show them, at addresses that can't be guessed ([ADR-0022](../decisions/0022-public-media.md)). They aren't secret: don't upload anything that must stay private.
  - A new member's photo is uploaded when the member is saved; until then it can be changed or removed. An existing member's photo, and a logo, change as soon as one is picked.
  - Replacing or removing an image deletes the old one. Deleting a team deletes its logo and every photo.
- **Two people editing the same team:** **Save details** sends only the fields you changed, so a colleague's change to another field isn't overwritten, and shows up in your form. When you both change the same thing, the last save wins.
- **The API** is below `/api/core/teams`; every change replies with the whole team. See [trying the API](../guides/local-development.md#trying-the-api).

## Related

- CRG's own saved teams (`PreparedTeam`) and its skater flags: [CRG integration: teams and rosters](../architecture/integrations/crg-scoreboard.md#teams-and-rosters)
- [Data model](../architecture/data-model.md)

## Open questions

- Game rosters: does each game pick a subset of the team's members, or use the whole team? Where is that done: here or in [Live Mode](live-mode.md)?
- Should we offer a read-only import of a team from a CRG `PreparedTeam` (via `GET /SaveJSON/`) so rosters don't have to be retyped? Importing from a spreadsheet is a candidate too.
- How do we match our members to CRG's skaters during a game so overlays can show photos? By roster number?
- Should team colors feed theme tokens? See [Theme Builder](theme-builder.md).
