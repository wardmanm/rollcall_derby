---
title: Import / Export
app: both
status: shipped
summary: Move teams and themes, with their logos, photos and fonts, between installs as versioned export files.
---
# Import / Export

Teams, themes, screens and other saved data can be exported to JSON files and imported again. This supports backups, sharing between leagues, and moving setups from one venue laptop to another.

## Users and roles

Admins can import and export everything. Producers can import and export teams. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Teams, themes and screens can be exported and imported. Other entities may be added later.
- **R2.** Every file carries a versioned envelope that identifies its format, its kind (team, theme, screen) and its format version. The schemas are shared Zod schemas ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)).
- **R3.** Imports are validated before anything is saved. A file that fails validation changes nothing, and the error says what's wrong and where.
- **R4.** Files in older formats are migrated when imported, so an export always stays importable by later versions.
- **R5.** Media that belongs to exported data (team photos and logos, theme fonts) travels with the export.

## Behavior

R1–R5 are built for teams and themes. Screens join with the [Screen Builder](screen-builder.md), as a new kind of item ([ADR-0024](../decisions/0024-import-export-kinds.md)).

**The [export file](../product/glossary.md#export-file)** is a `.zip`:
- `rollcall-export.json`, the manifest, says it's a Rollcall export (`formatVersion` 1) and lists its items. Each item names its kind (`core:team`, `core:font-face`, `producer:theme`), the version of that kind's data, and the data, with no ids or times.
- `media/` holds each logo, photo and uploaded font file the items use, as stored, named by the SHA-256 of its bytes.
- A theme brings the uploaded faces of the font families it uses. Bundled families never travel, since every install has them, and uploaded fonts no theme uses don't travel at all.
- A file is at most 200 MB, and unzips to at most 400 MB; each media file is at most 5 MB, and must be what its item says by its bytes.

**Exporting:**
- **The Import / export page** (`/core/transfer`, "Import / export" in rcl-core's header) has a tick box for each kind you may export, with how many there are, then **Export**, which downloads one file.
- **Where you work:** **Export all** on the Teams and Themes pages, **Export team** on a team's page, and **Export** in a theme's row menu.

**Importing** happens in a dialog, opened by **Import…** on the Import / export, Teams and Themes pages:
1. **Choose a file.** It's checked through: a file that isn't an export, is from a newer Rollcall, or has an item or media file that breaks the rules, is refused with what's wrong and where, such as "Item 3 (team “All Stars”): Number 07 is used by two skaters", and nothing is saved.
2. **See what's in it.** Nothing is saved yet.
   - **Conflicts** come first: an item with the same name as one here (teams regardless of case, themes exactly). Each shows the item in the file next to the one here, with the differences highlighted, and **Replace**, **Keep both** (the first choice) or **Skip**.
     - **Replace** keeps the item here, with its place in screens and games: a team takes the file's details, members, logo and photos; a theme takes the file's tokens, and stays the default if it was. When several teams here have the name, you choose which.
     - **Keep both** adds the file's item as "<name> copy", "copy 2" and so on: the first name free once the file's other items are saved. If nothing here has its name by the time you import, it keeps that name.
   - **New** items, each with a tick box. A font face identical to one here is reused instead; one named after a bundled family isn't imported, and themes use the bundled family.
   - **Can't import**, each with why: a kind this server doesn't know yet, a newer version, a kind your account may not import, or a second theme or font face with the name of another in the file.
   - **The default theme never changes on its own.** Each theme being imported has a **Make default** switch, off to start with; turning one on turns the others off. A theme that was the default where it was exported says so.
3. **Import** saves everything chosen in one go, or nothing. The dialog says what it did: "Imported 5: 3 new, 1 replaced, 1 kept as a copy (“All Stars copy”)." If something here changed since the file was checked, it's checked again for you to choose afresh.

**Who:** Admins import and export everything. Producers import and export teams, and export themes. Announcers do neither. See the [role matrix](users-and-access.md#role-matrix).

**Versions:** each kind's data has a version. An older one is brought up to date when it's imported, so an export always stays importable; a released version never changes (R4).

## Open questions

- Should importing a CRG team export (`crg-team-*.json` from CRG's read-only `GET /SaveJSON/`) be supported directly?
- Do events and games need export, e.g. to prepare a tournament on one machine and run it on another?
- Should API keys be able to export, for scripted backups?
