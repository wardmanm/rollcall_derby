---
title: Team Builder
status: planned
summary: Create teams with skaters and bench staff, including names, numbers, roles and photos.
---
# Team Builder

The Team Builder is where teams are set up: their skaters and bench staff, with numbers, roles and photos. Overlay components such as rosters and skater spotlights draw on this data.

## Users and roles

Admins and Producers can create and edit teams. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Create, edit and delete teams.
- **R2.** A team has members of two kinds:
  - **skaters** (players);
  - **bench staff** (coaches and other non-skating staff).
- **R3.** Each member has:
  - a name;
  - a number (skaters). Numbers are stored as **text**, not integers, so that numbers such as `00` and `07` keep their leading zeros.
- **R4.** Each member can have one or more roles, such as captain, alt captain or bench coach.
- **R5.** Each member can have a photo. Photos are uploaded to the server and served from the local network, because nothing can depend on the internet ([ADR-0004](../decisions/0004-server-is-the-hub.md)).
- **R6.** Teams can be exported and imported as JSON ([import / export](import-export.md)).

## Behavior

Not built yet.

## Related

- CRG's own saved teams (`PreparedTeam`) and its skater flags: [CRG integration: teams and rosters](../architecture/integrations/crg-scoreboard.md#teams-and-rosters)
- [Data model](../architecture/data-model.md)

## Open questions

- Which team-level fields do we need? Candidates:
  - league name
  - short name or initials
  - logo
  - team colors (these could feed theme tokens; see [Theme Builder](theme-builder.md))
- Should members have pronouns? CRG stores them per skater.
- Is the list of roles fixed (matching CRG's captain, alt captain and bench staff flags) or user-defined?
- Game rosters: does each game pick a subset of the team's members, or use the whole team? Where is that done: here or in [Live Mode](live-mode.md)?
- Should we offer a read-only import of a team from a CRG `PreparedTeam` (via `GET /SaveJSON/`) so rosters don't have to be retyped?
- How do we match our members to CRG's skaters during a game so overlays can show photos? By roster number?
- Photo rules: maximum size, aspect ratio, and whether we crop.
- Can Announcers view teams?
