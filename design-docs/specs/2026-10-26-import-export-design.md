# Import / export: design

**Date:** 2026-10-26 · **Status:** approved in sections, written spec under review · **Issues:** #22 (the framework, teams and fonts, rcl-core, milestone `rcl-core v0.3.0`) and #23 (themes, rcl-producer, milestone `rcl-producer v0.4.0`)

## Goal

Teams and themes move between Rollcall installs as files: to share a roster or a theme with another league, to keep a backup, or to prepare a setup on one laptop and run it on another ([import / export](../../docs/features/import-export.md)).

**Success:** an Admin exports everything on a home laptop, imports the file at the venue, sees what's in it and what conflicts with what's already there, chooses what happens to each, and gets the teams, their photos, the themes and their fonts, with nothing half-done if anything goes wrong.

## Decisions (made with Mike)

| Topic | Decision |
|---|---|
| What a file holds | **A list of items:** one team or theme to share, or everything at once to back up or move |
| Media | **A `.zip`** holding a JSON manifest and the media files as they are |
| Name clashes | **Choose per item,** in a preview, before anything is saved: Replace, Keep both or Skip |
| Producers and themes | **Export only.** Importing creates themes, so it stays with Admins |
| CRG team files | **Later,** with the CRG integration (Phase 4) |
| Architecture | **Core hosts import and export; each app owns its kinds** through the app SDK (ADR-0024) |
| Import screen | **A dialog,** opened from wherever you are |
| Conflicts | **Their own section,** each pairing the item in the file with the one here, differences highlighted |
| Default theme | **Never set automatically.** Each theme in the dialog has a "Make default" switch, off until you turn it on |

## Scope

**In scope:**
- **The export file:** format, versions and migrations, limits.
- **rcl-core:**
  - the transfer routes, the kinds `core:team` and `core:font-face`;
  - the Import / export page, Export buttons on the Teams and Team pages.
- **The app SDK:** how an app declares the kinds it owns.
- **The web SDK:** the Import dialog, shared by both apps.
- **rcl-producer:** the kind `producer:theme`; Export, Export all and Import… on the Themes page.
- **Tests,** including e2e and stories, and docs with ADR-0024.

**Out of scope (later pieces):**
- screens, which become a new kind with the Screen Builder;
- events and games, which don't exist yet;
- CRG team files (`crg-team-*.json`);
- import and export with API keys, such as scripted backups;
- merging a team member by member: Replace swaps the whole team;
- uploaded fonts that no theme uses: they don't travel, and are uploaded again where needed.

## The export file

A `.zip` named like `rollcall-teams-2026-10-26.zip`, holding:
- **`rollcall-export.json`,** the manifest;
- **`media/<sha256>.<ext>`:** each logo, photo and uploaded font file, exactly as stored, named by the SHA-256 of its bytes. A file used twice is stored once, and an install's media addresses never leave it.

**The manifest:**

```json
{
  "format": "rollcall-export",
  "formatVersion": 1,
  "exportedAt": "2026-10-26T12:00:00.000Z",
  "apps": { "core": "0.3.0", "producer": "0.4.0" },
  "items": [
    { "kind": "core:team", "version": 1, "data": { … } },
    { "kind": "core:font-face", "version": 1, "data": { … } },
    { "kind": "producer:theme", "version": 1, "data": { … } }
  ]
}
```

- **`format` and `formatVersion`** identify the file and the zip's layout. A newer `formatVersion` is refused.
- **`apps`** records each installed app's version when the file was made, for people reading it. Import doesn't use it.
- **Each item** has a `kind`, named `<app id>:<thing>`, a `version` for that kind's data, and the `data`.
- **No ids or timestamps** travel. An import always makes new records, or replaces existing ones you choose.

**Item data, version 1:**

| Kind | Data |
|---|---|
| `core:team` | `name`, `leagueName`, `shortName`, `primaryColor`, `secondaryColor`, `logo` (a `media/…` path or null), and `members`: each `kind`, `name`, `number`, `pronouns`, `roles`, `customRoles` and `photo` (a path or null). The same rules as the Team pages: numbers unique among a team's skaters, at most one captain and one alt-captain |
| `core:font-face` | `family`, `weight` (`400` or `100-900`), `style`, and `file` (a `media/…` path) |
| `producer:theme` | `name`, `tokens`, and `default`: whether it was the default theme where it was exported. That's only shown as a hint |

**Versions and migrations (R4):**
- Each kind's owner has a migration from each older version to the next. An item is migrated up to the current version before it's checked.
- A kind version newer than this install knows is refused for that item: "Made by a newer Rollcall. Update Rollcall to import it."
- Released kind versions never change; a change is a new version with a migration (the contract rule for import/export formats).

**Limits:**
- The zip is at most 200 MB, and its unzipped total at most 400 MB, checked from each entry's stated size before it's unzipped, so a "zip bomb" can't fill the memory.
- The manifest is at most 10 MB, and a zip has at most 10 000 entries.
- Each media file is at most 5 MB and must be what its item says, checked by its bytes as uploads are (ADR-0022): a PNG, JPEG or WebP for logos and photos, a WOFF2, WOFF, TTF or OTF for fonts. Files nothing refers to are ignored.

**The library:** `fflate` (MIT, no dependencies) builds and reads the zip on rcl-core's server. Media files are stored without recompressing them.

## Kinds: how apps plug in (ADR-0024)

An app module declares the kinds it owns. `@rollcall/app-sdk` gains `AppModule.transfer?(ctx): TransferKind[]`, where each kind gives:
- **its name** (`<app id>:<thing>`), **its current version**, and **migrations** from older versions;
- **its labels,** such as "Team" and "teams";
- **the schema** of its current data, from the app's contract;
- **who may export it and who may import it,** as permissions;
- **what can be exported:** its items' ids and names, and each item's data, the media it uses and any other items it needs;
- **the facts shown in a conflict card,** for an item in a file and for one here, such as a team's league, number of skaters and bench staff, colors and logo;
- **its conflicts:** the items here an item in a file clashes with;
- **how to save an item:** new, as a copy with a free name, or replacing a chosen item. Saving is synchronous, so it can join core's transaction;
- **what to do after an import is committed,** such as sending the OBS overlay a changed default theme.

**Media:** a kind refers to media by core's media ids. Core writes them into the zip under `media/…` on export. On import, core saves each file through the media store and gives the kind the new ids. Apps never handle media files themselves.

**Needs:** an exported item can name other items it needs, by kind and key. A theme names its heading and body families; core's font kind turns a family into its uploaded faces. Bundled families need nothing, since every install has them. On import, items are saved after the items they need: fonts first, then teams, then themes.

**Core's kinds:** `core:team` and `core:font-face`. **The Producer app's kind:** `producer:theme`. Kinds go through the SDK because ADR-0023 still holds: apps never read or write core's tables, and core never writes an app's tables except through its kind.

## Export

`GET /api/core/transfer/export`, for signed-in people:
- **`?items=core:team:<id>,producer:theme:<id>`** exports chosen items; **`?kinds=core:team,producer:theme`** exports everything of those kinds.
- **Each kind asked for** is checked against its export permission, with the shared access check. A refusal is `403` and names the kind.
- **Needed items join the file:** a theme brings the uploaded faces of the families it uses, checked against `core:font-face`'s export permission.
- **The reply** is the zip (`application/zip`), as a download named `rollcall-<what>-<date>.zip`, such as `rollcall-team-all-stars-2026-10-26.zip`, `rollcall-themes-2026-10-26.zip` or `rollcall-export-2026-10-26.zip`.
- **An unknown id** is `404`. **No items** is `400`, and so is asking for font faces on their own: they only travel with the themes that use them.
- It's a GET, so pages download it with an ordinary link.

## Import

Importing has two steps, each sending the same zip as the raw body (`application/zip`, up to 200 MB). The server keeps nothing between them. Both routes are for signed-in people, in a plugin of their own with the upload arrangement (ADR-0022), so the access check runs before the body is read.

**1. `POST /api/core/transfer/import/preview`** reads and checks the whole file, saving nothing:
- unzips it within the limits and reads the manifest;
- for each item: finds its kind, migrates and checks its data, checks its media files, checks the import permission, and looks for conflicts;
- replies with the file's SHA-256 and, for each item in the file's order:
  - its index, kind, label and name;
  - its facts, for the dialog;
  - its status:
    - **new**;
    - **conflict**, with the items here it clashes with, each with its id, name and facts;
    - **can't import**, with the reason: "Themes need the Producer app", "Only Admins can import themes", "Made by a newer Rollcall", or "Screens aren't known here yet".
  - the items it needs, such as a theme's fonts.
- A file that can't be read at all, or an item that breaks its kind's rules, is refused with the reason. See [errors](#errors).

**2. `POST /api/core/transfer/import?choices=…`** saves:
- `choices` is JSON, checked by the contract:
  - the file's SHA-256 from the preview;
  - an action for each item: `add`, `replace` (with the id of the item here to replace), `keep-both` or `skip`;
  - optionally, the index of the theme to make the default.
- It checks everything again, then saves every chosen item in **one database transaction**. Every app shares one SQLite connection, so each kind's writes join it: all or nothing.
- **Media files** are saved before the transaction; if it fails, the files it saved are deleted (and the startup sweep catches anything left).
- **After the commit,** each kind's after-import step runs: the Producer app sends the overlay a changed default theme.
- It replies with how many items were added, replaced, kept as copies and skipped, with the copies' new names.

**Conflicts:**
- **Teams:** a team here with the same name, ignoring case. Two or more may match; Replace names the one to replace.
- **Themes:** the theme here with the same name, exactly as theme names are unique.
- **Font faces** never conflict. A face identical to one here (family regardless of case, weights and style) is reused. A face whose family is a bundled one isn't imported, and the theme uses the bundled family; the preview says so. A face whose family name a different face here already uses joins that family.

**Actions:**
- **Add:** a new item. Allowed only for items with no conflict.
- **Replace keeps the item here, with its id,** so screens and games can rely on it later:
  - a team takes the file's details and members, and its logo and photos; its old images are deleted;
  - a theme takes the file's tokens and stays the default if it was.
- **Keep both** adds the item under the first free "<name> copy", "<name> copy 2" and so on, shortened to fit 64 characters, as duplicating a theme does.
- **Skip** leaves it out. An item that can't be imported is always skipped. Skipping a font a theme needs makes that theme fall back to the system font for that family.

**The default theme:** only the theme named in `choices` becomes the default, replacing the current one. Nothing else changes the default. Replacing the current default theme keeps it the default.

**Changed since the preview:** the import refuses with `409 changed_since_preview` when a different file is sent, when an item chosen as `add` now has a conflict, or when a Replace target is gone or no longer has the same name. The dialog checks the file again.

## Permissions

| Kind | Export | Import |
|---|---|---|
| `core:team` | `core:teams.manage` | `core:teams.manage` |
| `core:font-face` | `core:fonts.read`, only as a theme's need | `core:fonts.manage` |
| `producer:theme` | `producer:themes.read` | `producer:themes.manage` |

- So Admins import and export everything; Producers import and export teams and export themes; Announcers do neither. That's the role matrix's two import/export rows, with Producers' theme row settled as export only.
- No new permissions. The routes are declared `{ signedIn: true }`, and each item's kind is checked with the shared access check (`deny`). API keys can't use them for now.

## Errors

Every refusal says what's wrong and where, and changes nothing:
- `400 bad_file`: not a zip, no manifest, not a Rollcall export, or broken JSON. "This isn't a Rollcall export file."
- `400 newer_format`: a newer `formatVersion`. "This file was made by a newer Rollcall. Update Rollcall to import it."
- `400 invalid_item`: the item's number, kind and name, and the contract's message for its first problem. "Item 3 (team “All Stars”): number 07 is used by two skaters."
- `400 bad_media`: a missing media file, or one whose bytes aren't what its item says. "Item 3 (team “All Stars”): the photo for Jammy Dodger isn't a PNG, JPEG or WebP image."
- `400 bad_choices`: choices that don't fit the file, such as Add for a conflict.
- `403 forbidden`: from export, naming a kind you may not export. In a preview, an item you may not import is shown as can't-import instead.
- `409 changed_since_preview`: "Something changed since you checked this file. Check it again."
- `413 too_large`: over 200 MB, or over the unzipped limits.
- `415`: a body that isn't `application/zip`.

## Web

**The Import dialog** is in the web SDK, so both apps open it in place. It talks to rcl-core's routes and tells the page behind it when it's done, so the page refreshes its lists.
1. **Choose a file:** a `.zip`. A file that can't be imported stops here, with the reason.
2. **What's in the file,** in three sections:
   - **Conflicts,** first: a numbered card for each.
     - **The pair:** the item in the file on the left and the one here on the right, linked by ⇄, with their facts. Values that differ are highlighted.
     - **The choice:** **Replace**, **Keep both** and **Skip**, with Keep both preselected, and a line saying what the choice will do. For example: "Keep both: the file's team is added as 'All Stars copy'". Or: "Replace would change the OBS overlay at once, since this is the default theme".
     - **Several matches:** when more than one team here matches, Replace asks which one, defaulting to the most recently changed.
   - **New:** each item with a tick box, ticked to start with, and a short summary, such as "14 skaters, 2 bench staff" or "used by Derby Night".
   - **Can't import:** each with its reason.
   - **Every theme being imported** (new, Keep both or Replace) has a **Make default** switch, off to start with. Turning one on turns any other off. The file's own default is shown as a hint, "was the default in the file". Unticking or skipping a theme turns its switch off.
   - **Import N items** saves; **Back** chooses another file.
3. **Done:** "Imported 5: 3 new, 1 replaced, 1 kept as a copy (“All Stars copy”)." **Done** closes the dialog.

If the import is refused as changed since the preview, step 2 says so and checks the file again.

**rcl-core's Import / export page** at `/core/transfer`, with a header link "Import / export" shown to anyone who may import or export something:
- **Export:** a tick box for each kind you may export, with counts, "Teams (12)" and "Themes (3), with their uploaded fonts", then **Export**.
- **Import:** **Import…** opens the dialog.

**Buttons where you work:**
- **Teams page:** **Import…** (the dialog) and **Export all**, for people with `core:teams.manage`.
- **Team page:** **Export team**.
- **Themes page (Producer app):**
  - **Export** in each theme's row menu, and **Export all**, for anyone who can see themes;
  - **Import…** for Admins.
- **Producers:** they see Export in a theme's row menu, but not the rest of the menu.

## Tests (written first)

- **Contracts:** the manifest and each kind's data, with an accepted file and the rejected shapes that matter; the choices.
- **Zip handling:** a round trip; the limits; a zip bomb; too many entries; a missing or unreferenced media file; image bytes posing as a font.
- **Kinds framework:** migrations, using a test kind with a v1-to-v2 migration; a newer version refused; an unknown kind; save order by needs.
- **Export route:** single items, whole kinds, a theme bringing its uploaded fonts but not bundled ones, the file name, `404` and `403` per kind.
- **Import routes:**
  - the round trip: export everything, delete it, import it, and it all comes back with its media;
  - every action: Add, Replace keeping the id and deleting old images, Keep both with "copy" names, Skip;
  - two teams with the clashing name, and Replace targeting the one chosen;
  - fonts: reused when identical, joining an existing family, and a bundled family's name;
  - the default theme: off unless chosen, chosen, and Replace of the current default;
  - permissions per kind, for Producers and Announcers;
  - each error;
  - all or nothing: a failure partway saves nothing and leaves no files;
  - `changed_since_preview` for each of its causes.
- **The Producer app's theme kind:** export with its needs, saving into its own table inside core's transaction, and the overlay told after the commit.
- **Web:**
  - the dialog's three steps, the conflict cards and their result lines, several matches, the tick boxes and the Make default switch;
  - the export buttons and who sees them, on both apps' pages;
  - the Import / export page.
- **Stories:** the conflict card and the item list, in the admin Storybook.
- **End to end:** an Admin exports a team and a theme with an uploaded font, deletes them, imports the file, and sees the team, the theme and the font back.

## Docs

- **[ADR-0024](../../docs/decisions/) "Import and export: core hosts them, apps own their kinds",** accepted.
- **`docs/features/import-export.md`:**
  - status `in-progress`, then `shipped`;
  - a Behavior section with the file format, the dialog, conflicts and the default theme;
  - the open questions it settles move into the page: media packaging and name clashes. CRG files and events stay open.
- **`docs/features/team-builder.md` and `theme-builder.md`:** R6 built.
- **`docs/features/users-and-access.md`:** the import/export rows, with Producers exporting themes, and its open question removed.
- **`docs/architecture/README.md`:** the transfer routes and ADR-0024 under key decisions.
- **Glossary:** "Export file".
- **Rules:**
  - `sdk.md`: `AppModule.transfer`;
  - `rcl-core-server.md` and `rcl-producer-server.md`: kinds, and the rule that released kind versions never change;
  - `rcl-core-contract.md` and `rcl-producer-contract.md`: where each kind's schema lives.
- **Changelogs:**
  - rcl-core: Added, import and export (#22);
  - rcl-producer: Added, themes in export files (#23). The Producer app needs rcl-core 0.3.0, so its `requiresCore` becomes `^0.3.0` when rcl-core 0.3.0 is released.
