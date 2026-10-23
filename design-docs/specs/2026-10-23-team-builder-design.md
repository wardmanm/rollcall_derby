# Team Builder: design

**Date:** 2026-10-23 · **Status:** approved in sections, written spec under review · **Issue:** #17 · **Milestone:** `rcl-core v0.2.0`

## Goal

Admins and Producers set up teams in rcl-core's admin app. A team has its identity and its members: skaters and bench staff, with numbers, pronouns, roles and photos. Announcers can look teams up. Overlay components such as rosters and skater spotlights will draw on this data later, in rcl-producer.

This is the first slice of the [Team Builder](../../docs/features/team-builder.md): the editor itself, R1–R5. Getting teams from CRG or from a file are later specs. R6 (import/export) comes with the [Import/Export](../../docs/features/import-export.md) feature.

**Success:** an Admin or Producer can set up a home team and a visiting team, with about 20 skaters each, quickly enough to do on the day of an event.

## Decisions (made with Mike)

| Topic | Decision |
|---|---|
| Where team data comes from | It varies by event: CRG, typed by hand, or a file. **This spec covers the editor only.** CRG import and file import are later specs |
| Team fields | Name, plus league name, short name, logo and team colors |
| Member roles | **A fixed list plus custom roles.** Skaters: Captain, Alt captain. Bench staff: Bench coach, Bench manager, Bench alt captain. Each member can also have custom roles |
| Pronouns | **Yes:** optional free text per member, as CRG has |
| Images | **Stored as uploaded:** PNG, JPEG or WebP up to 5 MB. No cropping or resizing; overlays fit images with CSS |
| Announcers | **View only** |
| Architecture | **A small media store in rcl-core,** used by teams now and by themes and screens later. Images are served publicly at unguessable addresses, so OBS overlays can load them without signing in |

## Scope

**In scope:**
- the `teams`, `team_members` and `media` tables;
- the media store: uploads, files, the public `/media/<id>` route and the startup sweep;
- the `core:teams.read` and `core:teams.manage` permissions;
- the teams routes and contracts, including the API explorer;
- the Teams list and Team pages in rcl-core's web app;
- tests, including e2e, and docs, including ADR-0022.

**Out of scope (later specs or features):**
- importing a team from CRG (read-only, `GET /SaveJSON/`) or from a spreadsheet;
- JSON import/export (R6);
- game rosters (a subset of a team for one game), and matching our members to CRG's skaters during a game;
- cropping or resizing images;
- manual member ordering;
- live updates of team data to overlays;
- edit locking. Two people saving the same team means the last save wins.

## Data

Three new core tables, in one new Drizzle migration (`db:generate --name teams`). IDs come from `crypto.randomUUID()`, except media IDs (see below). Times are ISO text, as elsewhere.

**`teams`:**
- `name`: 1–64 characters after trimming. **Not unique,** because two leagues can both have "All Stars".
- `league_name`: up to 64 characters, or null.
- `short_name`: 1–8 characters, or null. For example `RCR`.
- `primary_color` and `secondary_color`: `#rrggbb`, stored lowercase, or null.
- `logo_media_id`: a media ID, or null.
- `created_at` and `updated_at`. Any change to the team, its members or its images updates `updated_at`.

An empty string for an optional text field is stored as null.

**`team_members`** (deleted with their team: `on delete cascade`):
- `team_id`.
- `kind`: `skater` or `bench`.
- `name`: 1–64 characters after trimming.
- `number`: **text**, 1–4 letters or digits (`^[0-9A-Za-z]{1,4}$`).
  - Skaters must have one, and bench staff must not.
  - Numbers are unique among a team's skaters, as an exact match after trimming. `00`, `07` and `7` are three different numbers.
- `pronouns`: 1–32 characters, or null.
- `roles`: a JSON array of fixed role keys. Each key must fit the member's kind:
  - skaters: `captain`, `alt-captain`;
  - bench staff: `bench-coach`, `bench-manager`, `bench-alt-captain`.

  A team has at most one `captain` and at most one `alt-captain`.
- `custom_roles`: a JSON array of up to 3 strings, each 1–32 characters after trimming, with no duplicates.
- `photo_media_id`: a media ID, or null.
- `created_at` and `updated_at`.

**Order:**
- Skaters are listed by number, using `Intl.Collator('en', { numeric: true })` with ties broken by plain string order: `0`, `00`, `07`, `7`, `9`, `12`, `12A`, `100`, `A1`.
- Bench staff are listed by name.
- The server returns members in this order.

**`media`:**
- `id`: 16 random bytes as 32 lowercase hex characters (128 bits), so addresses can't be guessed.
- `content_type`: `image/png`, `image/jpeg` or `image/webp`.
- `size`: in bytes.
- `created_at`.

Each media row is referenced by exactly one team logo or member photo in this first version.

## Media store

A small module in rcl-core's server, `media.ts`. Teams use it now, and themes and screens can use it later.

- **Files** live in `<data folder>/media/<id>`, with no extension; the type is in the row.
- **Saving an upload:**
  1. Write it to a temporary file in that folder.
  2. Rename it to its ID.
  3. Insert the row.
  4. Point the team or member at it.
  5. Delete the image it replaces, if any: the row and the file.
- **What's accepted:** the server reads the first bytes, not just the stated type. A file is accepted only if it starts like one of these, and is stored as the type its bytes show:
  - PNG: `89 50 4E 47 0D 0A 1A 0A`;
  - JPEG: `FF D8 FF`;
  - WebP: `RIFF` … `WEBP`.

  Anything else, such as SVG, HTML or a renamed file, is refused. That way nothing but an image can ever be served from `/media`.
- **Limit:** 5 MB, enforced while the upload is still arriving (Fastify's per-route `bodyLimit`).
- **Removing an image:** removing a logo or photo, removing a member and deleting a team all delete the images involved, both rows and files.
- **The startup sweep** cleans up after anything a crash left behind. It deletes:
  - files in `media/` with no row, including temporary files;
  - rows whose file is missing;
  - rows that no team or member refers to.
- **`GET /media/<id>`** (HEAD too) is a plain route outside `/api`, open to everyone, like the web apps' own files.
  - An ID that isn't 32 hex characters, or isn't in the table, gets `404`. The ID never reaches the file system unchecked.
  - Replies carry:
    - the stored `Content-Type`;
    - `X-Content-Type-Options: nosniff`;
    - `Content-Security-Policy: default-src 'none'`;
    - `Cache-Control: public, max-age=31536000, immutable`, because an ID is never reused.
- **`media` is a reserved path.** The server refuses to start with an app whose id is `media`, since `/media/` would clash with that app's web build. The other reserved ids are #12.
- **Backups:** the data folder now holds `rollcall.db` and `media/`. Copy both.

## Permissions

| Permission | Allows | Admin | Producer | Announcer | API keys |
|---|---|---|---|---|---|
| `core:teams.read` | View teams and their members | ✅ | ✅ | ✅ | ✅ if given |
| `core:teams.manage` | Create, edit and delete teams, members, logos and photos | ✅ | ✅ | — | ✅ if given |

- **Neither permission is `peopleOnly`.** A leaked key holding `teams.manage` could deface a roster, but it couldn't take over accounts or make more keys, so ADR-0020 doesn't restrict it.
- **These are the first permissions an API key can hold.** The API keys page now lists them, instead of "Public routes only".

## API

All routes are below `/api/core` and tagged `core/teams`. JSON bodies are checked against the contract's schemas.

| Method and path | Needs | Behavior |
|---|---|---|
| `GET /teams` | read | Lists teams by name: `TeamSummary[]` |
| `GET /teams/:id` | read | `Team`, with its members in order. `404 not_found` |
| `POST /teams` | manage | Takes `CreateTeamRequest` and replies `201 Team` |
| `PATCH /teams/:id` | manage | Takes `UpdateTeamRequest` and replies `200 Team`. A missing field stays as it is; `null` clears it |
| `DELETE /teams/:id` | manage | Deletes the team, its members and their images. `204` |
| `POST /teams/:id/members` | manage | Takes `CreateMemberRequest` and replies `201 Team` |
| `PATCH /teams/:id/members/:memberId` | manage | Takes `UpdateMemberRequest` and replies `200 Team`. A member's kind may change, if the result is valid |
| `DELETE /teams/:id/members/:memberId` | manage | Deletes the member and their photo, and replies `200 Team` |
| `PUT /teams/:id/logo` | manage | The image is the raw body. Replies `200 Team` |
| `DELETE /teams/:id/logo` | manage | Replies `200 Team` |
| `PUT /teams/:id/members/:memberId/photo` | manage | The image is the raw body. Replies `200 Team` |
| `DELETE /teams/:id/members/:memberId/photo` | manage | Replies `200 Team` |

**Every change replies with the whole team,** so the editor shows the server's view, including member order, after each save.

**Uploads:**
- The body's `Content-Type` must be `image/png`, `image/jpeg` or `image/webp`. The server parses these types as raw buffers, only on the upload routes.
- The explorer lists the upload routes with the image types they accept.

**Errors:**
- `400 validation_failed`: the usual plain message. This includes roles that don't fit the kind, a number on bench staff, or a skater with no number.
- `404 not_found`: a team, member or media that doesn't exist, or a member of a different team.
- `409 number_taken`: another skater on the team has that number.
- `409 role_taken`: the team already has a Captain, or an Alt captain.
- `413 too_large`: over 5 MB.
- `415 unsupported_image`: not PNG, JPEG or WebP, by its type or its bytes.

## Contract (`@rollcall/core-contract`)

A new `teams.ts`:
- `MemberKindSchema`: `'skater' | 'bench'`.
- Role lists:
  - `SKATER_ROLES`: `['captain', 'alt-captain']`;
  - `BENCH_ROLES`: `['bench-coach', 'bench-manager', 'bench-alt-captain']`;
  - `MemberRoleSchema`.
- `TeamMemberSchema`: `{ id, kind, name, number: string | null, pronouns: string | null, roles, customRoles, photoUrl: string | null }`. `photoUrl` is `/media/<id>`.
- `TeamSummarySchema`: `{ id, name, leagueName, shortName, primaryColor, secondaryColor, logoUrl, skaterCount, benchCount, updatedAt }`.
- `TeamSchema`: the summary's fields, without the counts, plus `members: TeamMember[]` and `createdAt`.
- `CreateTeamRequestSchema` and `UpdateTeamRequestSchema`. Names are trimmed and colors are lowercased.
- `CreateMemberRequestSchema` and `UpdateMemberRequestSchema`. The schema checks the rules it can: the number's format, number versus kind, roles versus kind, and the custom-role limits. The server checks uniqueness.
- `ImageTypeSchema`: the three image types, and `MAX_IMAGE_BYTES = 5 * 1024 * 1024`, used by the server and the browser.

## Web app (rcl-core)

**Teams list** (`/core/teams`):
- **Header link:** "Teams", shown with `core:teams.read`.
- **The table:** logo, name, league, short name, color swatches, and skater and bench counts. Each row opens its team.
- **New team:** a button shown with `core:teams.manage`. It asks for a name, then opens the new team.

**Team page** (`/core/teams/:id`):
- **Details:** name, league, short name, primary and secondary colors (Mantine `ColorInput`), and the logo, with a preview, **Upload** and **Remove**.
- **Skaters and Bench staff:** two tables, each showing photo, number (skaters only), name, pronouns and role badges, with a row menu for **Edit** and **Remove**.
- **Adding members:** **Add skater** and **Add bench staff** open a form with name, number, pronouns, role checkboxes, custom roles (Mantine `TagsInput`) and photo. **Save and add another** saves, clears the form and keeps it open.
- **Confirmations:**
  - removing a member asks first;
  - deleting a team asks first and says what goes with it: "Deletes the team, its 23 members, its logo and photos. This cannot be undone."
- **Announcers** see the same pages with no editing controls.

**Uploads:**
- An image picker, a shared component with a story, uses Mantine's `FileButton`, so there's no new dependency.
- It checks the type and `MAX_IMAGE_BYTES` before sending, and says what's wrong.

**Problems** show in an alert, as on the other pages, with plain messages:
- "Another skater already has number 12";
- "This team already has a Captain";
- "Use a PNG, JPEG or WebP image";
- "That image is over 5 MB".

**Images** display from `/media/<id>` with `object-fit`, so any shape fits its box.

## Tests (written first)

- **Contract:** each schema's rules, including number versus kind, roles versus kind, custom-role limits, color format, trimming and empty-to-null.
- **Teams routes:**
  - create, read, update and delete teams and members;
  - `PATCH` leaves missing fields alone, and `null` clears;
  - `00`, `07` and `7` coexist;
  - `number_taken` and `role_taken` on create and on update, including changing a member's kind;
  - a member of another team gets `404`;
  - members come back in order;
  - `updated_at` moves on member changes.
- **Access:**
  - Announcers can read and get `403` on every change;
  - Producers can manage;
  - an API key holding only `teams.read` can read and gets `403` on changes;
  - with no session, `401`.
- **Media:**
  - each of the three types is accepted by its bytes;
  - SVG, HTML and plain text labelled `image/png` get `415`;
  - an undeclared or other `Content-Type` gets `415`;
  - over 5 MB gets `413`;
  - replacing, removing a photo, removing a member and deleting a team leave no files or rows behind;
  - `/media/<id>` sends the stored type and the three headers;
  - unknown and malformed IDs get `404`;
  - the startup sweep removes each kind of leftover;
  - an app with id `media` is refused at startup.
- **Route inventory:**
  - the new routes are picked up automatically;
  - the API key sweeps now include real routes a key may call (`teams.read`, `teams.manage`);
  - the public set is unchanged, because `/media` isn't below `/api`.
- **Permission table:** the users-and-access table matches `CORE_PERMISSIONS`, including the API keys column.
- **Web:**
  - the list;
  - the editor, with each field;
  - add, and **Save and add another**;
  - edit, and remove with confirmation;
  - deleting a team, with its warning;
  - the logo and photo picker's checks;
  - each error message;
  - the read-only view for Announcers;
  - the header link and page hidden without `teams.read`.
- **Stories:** the image picker, and the Team page in edit and read-only modes, each with accessibility checks.
- **End to end:**
  1. an Admin creates a team, sets a logo and adds a skater with a photo;
  2. the photo loads from `/media/<id>` in a fresh browser context with no session;
  3. an Announcer opens the team and sees no editing controls.

## Docs

- **[ADR-0022](../../docs/decisions/) "Uploaded images are public at unguessable addresses"**, accepted:
  - the OBS overlay has no session, and output tokens are not built yet;
  - images are served by a 128-bit random ID, with no listing;
  - the server checks bytes, sets `nosniff` and a CSP;
  - images aren't secret. Anyone on the venue network who has an image's address can load it;
  - when output tokens arrive, decide whether media should require one.
- **`docs/features/team-builder.md`:**
  - status `in-progress` when work starts, and `shipped` at the end;
  - a Behavior section;
  - the open questions this spec answers move into the body: team fields, pronouns, roles, photo rules, Announcers;
  - the rest stay open: game rosters, CRG import, matching to CRG;
  - a note that R6 comes with Import/Export.
- **`docs/features/users-and-access.md`:** the two permissions in the permission table, and a "View teams" row in the role matrix.
- **`docs/architecture/data-model.md`:** a Media entity, and Team and Team member pointing to it.
- **`docs/architecture/README.md`:** the media store and `/media/<id>`, and ADR-0022 under key decisions.
- **Glossary:** "Media": an uploaded image, such as a team logo or a member photo, stored by rcl-core and served at `/media/<id>`.
- **`docs/guides/local-development.md`:** back up `data/rollcall.db` and `data/media/` together.
- **Rules:**
  - `.claude/rules/rcl-core-server.md`: the media store, and `media` as a reserved path;
  - `.claude/rules/rcl-core-web.md`: the Teams pages, if anything they need differs from what the rules say.
- **`rcl-core/CHANGELOG.md`:** an Added line, ending with (#17).
