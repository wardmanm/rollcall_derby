# Theme Builder and font library: design

**Date:** 2026-10-24 · **Status:** approved in sections, written spec under review · **Issues:** #19 (font library, rcl-core, milestone `rcl-core v0.2.0`) and #20 (Theme Builder, rcl-producer, milestone `rcl-producer v0.3.0`)

## Goal

Admins define how overlays look. A [theme](../../docs/product/glossary.md) is a named set of tokens: colors, fonts, sizes, corner radius and border width. It compiles to CSS custom properties, which every overlay component uses for its styling ([ADR-0006](../../docs/decisions/0006-one-overlay-renderer-css-variable-theming.md)).

One theme is the **default**, and the OBS overlay uses it. Changes reach a running overlay without a refresh.

Fonts come from a **font library** in rcl-core: open-licence families that ship with Rollcall, plus fonts Admins upload. Nothing is ever loaded from the internet.

**Success:** an Admin makes a theme for an event, picks its colors and fonts while watching a live preview, makes it the default, and sees the overlay in OBS change to match.

## Decisions (made with Mike)

| Topic | Decision |
|---|---|
| Fonts | **Both bundled and uploaded fonts** |
| Tokens | **A fixed set, plus named extra colors.** Overlay components rely only on the fixed tokens |
| Applying a theme before screens exist | **One default theme.** The OBS overlay uses it and updates live. Screens choose their own theme later, falling back to the default |
| Where fonts live | **A font library in rcl-core,** shared data like team logos. Themes in rcl-producer pick families from it. Apps read core's fonts through a read-only `AppContext` service (ADR-0023) |
| Who does what | Admins manage themes and fonts. Producers view themes, and the font list. This follows the role matrix: "Create or edit themes: Admin; Producer uses existing" |

## Scope

**In scope:**
- **rcl-core:**
  - the bundled fonts;
  - font uploads, stored in the media store;
  - `/fonts/<file>`;
  - the font routes and the Fonts page;
  - `AppContext.fonts`;
  - `core:fonts.read` and `core:fonts.manage`.
- **rcl-producer:**
  - its first table, `producer_themes`, with its own migrations;
  - the theme routes and contract, including the shared theme-to-CSS function;
  - the default theme and its live delivery to the overlay;
  - the Themes list and theme editor with a live preview;
  - new overlay sample pieces;
  - `producer:themes.read` and `producer:themes.manage`.
- **Tests,** including e2e, stories and docs, with ADR-0023.

**Out of scope (later pieces):**
- a theme per screen, and overrides per component (Screen Builder);
- game team colors as theme variables (Live Mode);
- show/hide animations;
- JSON import/export (R6, with the Import/Export feature);
- reading a family's name, weight and style from the font file;
- subsetting fonts down to the characters used;
- noticing font changes in rcl-core on a running overlay. They arrive with the next theme change, or the next time the overlay loads.

## Font library (rcl-core)

**Bundled families:**
- Inter, Roboto Condensed, Barlow Condensed, Oswald, Bebas Neue and Anton, all under the SIL Open Font License.
- **Files:**
  - committed to `rcl-core/server/fonts/`, each family with its licence file;
  - WOFF2 where the official source offers it, otherwise TTF;
  - a variable font where one exists, so one file covers every weight;
  - the plan fixes the exact files and versions.
- **Served** at `/fonts/<file>`, to anyone, with the right type, `X-Content-Type-Options: nosniff` and `Cache-Control: public, max-age=31536000, immutable`. A file name that isn't one of the bundled files gets `404`.
- **`fonts` is a reserved app id,** like `media`.
- **Each bundled face has a fixed id,** such as `bundled-oswald`, and can't be removed.

**Uploaded faces:**
- A new table, `font_faces`:
  - `id`;
  - `family`: 1–64 characters of letters, digits, spaces, `-` and `_`, so a name can never break out of the CSS it goes into;
  - `weight_min` and `weight_max`: 100–900, equal for a static face, a range for a variable one;
  - `style`: `normal` or `italic`;
  - `media_id`;
  - `created_at`.
- **Each family has one face per weight range and style:** a second upload of the same face is refused.
- **Formats:**
  - WOFF2 (`wOF2`), WOFF (`wOFF`), TTF (`00 01 00 00` or `true`) or OTF (`OTTO`), recognized by the file's first bytes and stored as that type;
  - up to 5 MB.

  The media store accepts these font types for font uploads, alongside the image types for image uploads. Each upload route accepts only its own kind.
- **`media_id` is added to `MEDIA_REFERENCES`,** so the startup sweep keeps font files.
- **Removing a face** deletes its row and its media.
- A theme that names a removed family falls back to the system font in its CSS.

**What fonts look like to everyone else:** a family is `{ name, bundled, faces: [{ id, weightMin, weightMax, style, format, url }] }`. Bundled faces' addresses are `/fonts/<file>`, and uploaded faces' are `/media/<id>`.

## Themes (rcl-producer)

**Table `producer_themes`**, in the Producer app's first migration, run with its own migrations table:
- `id`;
- `name`: 1–64 characters after trimming, unique, exact match after trimming;
- `tokens`: JSON, checked by the contract;
- `is_default`: at most one theme is the default;
- `created_at` and `updated_at`.

**Tokens:** every field is required in a stored theme.

| Token | CSS variable | Rule |
|---|---|---|
| `colors.text`, `colors.textMuted` | `--theme-color-text`, `--theme-color-text-muted` | `#rrggbb` or `#rrggbbaa`, stored lowercase |
| `colors.surface`, `colors.surfaceAlt` | `--theme-color-surface`, `--theme-color-surface-alt` | same |
| `colors.accent`, `colors.onAccent` | `--theme-color-accent`, `--theme-color-on-accent` | same |
| `colors.border` | `--theme-color-border` | same |
| `fonts.heading.family`, `fonts.body.family` | `--theme-font-heading`, `--theme-font-body` | a family name, as for font faces. The variable is `"<family>", system-ui, sans-serif` |
| `fonts.heading.weight`, `fonts.body.weight` | `--theme-font-heading-weight`, `--theme-font-body-weight` | 100–900, in steps of 100 |
| `fonts.size` | `--theme-font-size` | 12–96 (pixels) |
| `fonts.headingCase` | `--theme-heading-transform` | `none` or `uppercase` |
| `shape.radius` | `--theme-radius` | 0–64 (pixels) |
| `shape.borderWidth` | `--theme-border-width` | 0–16 (pixels) |
| `extras` | `--theme-extra-<name>` | up to 10 `{ name, color }`. A name is `^[a-z][a-z0-9-]{0,23}$` and unique within the theme |

**The built-in look:**
- `DEFAULT_TOKENS` holds the built-in tokens, with today's `theme-defaults.css` values and the font family "Inter".
- A new theme starts from them.
- With no default theme, the overlay uses them.

**`themeToCss(tokens, families)`** is in the Producer app's contract. It returns:
- `variables`, a map of variable names to values;
- `fontFaces`, the `@font-face` rules for the heading and body families only, using each face's address, weights and style.

The editor's preview and the OBS overlay both call it, so they never differ. The family-name rule means names can't break out of a quoted CSS string.

**Renamed variables:** today's overlay variables move to the new names (`--theme-font-family` becomes `--theme-font-body`). The placeholder card, `theme-defaults.css` and the sample Storybook themes change with them.

## Permissions

| Permission | Allows | Admin | Producer | Announcer | API keys |
|---|---|---|---|---|---|
| `core:fonts.read` | List fonts | ✅ | ✅ | ✅ | ✅ if given |
| `core:fonts.manage` | Upload and remove fonts | ✅ | — | — | ✅ if given |
| `producer:themes.read` | View themes | ✅ | ✅ | — | ✅ if given |
| `producer:themes.manage` | Create, edit, duplicate and delete themes, and choose the default | ✅ | — | — | ✅ if given |

None is people-only (ADR-0020). The role matrix gains a "View themes" row and a "Manage fonts" row.

## API

**rcl-core, below `/api/core`, tag `core/fonts`:**

| Route | Needs | Behavior |
|---|---|---|
| `GET /fonts` | fonts.read | Every family, bundled first, then by name, each with its faces |
| `POST /fonts/faces?family=…&weight=…&style=…` | fonts.manage | The raw font file is the body. `weight` is `400` or `100-900`. Replies `201` with the family |
| `DELETE /fonts/faces/:id` | fonts.manage | `204`. A bundled id or an unknown one gets `404` |

**Upload errors:**
- `400 validation_failed`: a bad family, weight or style;
- `409 face_taken`: "Rollerball already has a 700 normal face";
- `413 too_large`;
- `415 unsupported_font`: "Use a WOFF2, WOFF, TTF or OTF font".

Font uploads use the same arrangement as image uploads: a plugin of their own, raw bodies, and the access check before the body is read (ADR-0022).

**rcl-producer, below `/api/producer`, tag `producer/themes`:**

| Route | Needs | Behavior |
|---|---|---|
| `GET /themes` | themes.read | Every theme, by name |
| `GET /themes/:id` | themes.read | One theme |
| `POST /themes` | themes.manage | `{ name, tokens? }`. The tokens default to the built-in look. Replies `201` |
| `PATCH /themes/:id` | themes.manage | `{ name?, tokens? }`. Tokens are replaced whole. Replies `200` |
| `POST /themes/:id/duplicate` | themes.manage | Copies the theme as "<name> copy", or "<name> copy 2" and so on if that's taken. The copy isn't the default. Replies `201` |
| `DELETE /themes/:id` | themes.manage | `204`. Deleting the default leaves no default |
| `PUT /default-theme` | themes.manage | `{ themeId: string \| null }`. Replies `200 { themeId }` |

**Theme errors:**
- `400 validation_failed`, with plain messages such as "Use a color like #1a2b3c";
- `404 not_found`;
- `409 name_taken`: "That name is already taken".

**A theme:** `{ id, name, tokens, isDefault, createdAt, updatedAt }`.

## Fonts for apps (`AppContext.fonts`, ADR-0023)

- `@rollcall/app-sdk`'s `AppContext` gains `fonts: { list(): FontFamily[] }`. This is the first of the core data services the SDK has planned since ADR-0019.
- The service is read-only. `FontFamily` is the shape above, from `@rollcall/core-contract`.
- The Producer app uses it to send the overlay the right fonts.

## The overlay

- The `/producer/overlay` namespace keeps its access: public until output tokens arrive.
- **On connect,** the server sends `theme:changed` with `OverlayTheme | null`, which is `{ tokens, families }`. `families` holds only the families the theme uses. With no default theme, it's `null`.
- **Changes reach running overlays:** when the default theme is saved, another becomes the default, the default is cleared, or the default is deleted, every connected overlay gets a new `theme:changed`.
- **The overlay applies it:**
  - it calls `themeToCss`, sets the variables on its root element, and adds the `@font-face` rules in a `<style>` element of its own;
  - `null` returns it to the built-in look;
  - like the server hello, the theme is kept in the overlay's live-state cache (ADR-0003).
- **The overlay still loads no Mantine.** `themeToCss` comes from the Producer app's contract, which has no runtime dependencies beyond Zod.

## Web: Fonts page (rcl-core)

- **The page:** `/core/fonts`, with a header link "Fonts" shown with `core:fonts.read`.
- **The list:**
  - each family's name;
  - a sample line in that font: "Jam 3 · Rollcall 128–96". The page adds the `@font-face` rules for it;
  - its faces (weight and style);
  - a **Bundled** badge, or **Remove** on each uploaded face, after a confirmation.
- **Uploading (Admins):** choose a font file; the family name is suggested from the file name, minus any weight word ("Rollerball-Bold.woff2" suggests "Rollerball" and 700). Correct the family, weight and style, then **Upload**.
  - The browser checks the extension and the 5 MB limit first.
  - A note says: "Upload only fonts you're licensed to use in a broadcast."
- **Producers and Announcers** see the list without the upload form or Remove.

## Web: Theme Builder (rcl-producer)

- **The list:** `/producer/themes`, with a header link "Themes" shown with `producer:themes.read`.
  - Each theme shows its name, a **Default** badge, and surface and accent swatches.
  - Admins get **New theme** (by name, which opens it) and a row menu: **Duplicate**, **Make default** or **Stop using as default**, and **Delete**.
  - Delete confirms first, and says when it's the default: "The overlay goes back to the built-in look."
- **The editor:** `/producer/themes/:id`.
  - **Left, the form:**
    - **Colors:** Mantine color inputs, with transparency.
    - **Fonts:** heading and body family (a select of the library's families), a weight for each, the base size and the heading case.
    - **Shape:** radius and border width.
    - **Extra colors:** rows of name and color, with **Add color** and remove buttons.
    - **Save theme** and **Discard changes** at the end.
    - Changes stay in the form until saved. Saving checks them against the contract first.
  - **Right, a live preview:**
    - it updates with every keystroke, before saving;
    - it shows the placeholder card and a new **theme sample**: a heading, body and muted text, a two-row table on surface and alternate surface, an accent bar with its text, a bordered panel, and swatches of the extra colors;
    - these are overlay components, plain CSS without Mantine, inside a preview element that gets the `themeToCss` variables and font faces;
    - a switch sets the preview's background to dark, light or a checkerboard, to judge transparency.
  - **A family missing from the library** shows as "<name> (missing)", with a note: "This font isn't in the font library, so the overlay uses a system font."
  - **The default theme** shows a note: "This is the default theme: saving changes the OBS overlay at once."
- **Producers** see the list and the editor's preview, read-only, with no editing controls.
- **Problems** show in an alert, as on the other pages.

## Tests (written first)

- **Contract (producer):**
  - each token rule, including the color formats, size limits, extra names and their count, and uniqueness;
  - `DEFAULT_TOKENS` passes its own schema;
  - `themeToCss`: every variable, the font stacks, extras, `@font-face` rules only for the families used and with each face's weights and style, and nothing for a missing family;
  - a family name with quotes or `;` is refused by the schema.
- **Media store:** each font type is recognized by its bytes; image uploads still refuse fonts, and font uploads refuse images.
- **Font routes:**
  - the list merges bundled and uploaded fonts;
  - uploads by type, `face_taken`, `413` and `415`;
  - removing a face deletes its media;
  - a bundled id can't be removed;
  - Producers and Announcers can read, and get `403` on changes.
- **Font files:** `/fonts/<file>` sends the right type and headers, and an unknown name gets `404`. `fonts` is a reserved app id.
- **`AppContext.fonts`:** an app module sees the same list as `GET /fonts`.
- **Theme routes:**
  - create, read, update, duplicate (with "copy 2") and delete;
  - `name_taken`, and tokens refused by the contract;
  - setting the default switches the old one off; clearing it; deleting the default leaves none;
  - Producers can read and get `403` on changes, and Announcers get `403` throughout.
- **The Producer app's migration** creates only `producer_themes`, in its own migrations table.
- **The overlay namespace:** a client gets `theme:changed` on connect, with `null` and then the default; it gets a new one after the default is saved, switched, cleared or deleted; and nothing when another theme changes.
- **Route inventory and permission table:** the new routes and permissions are covered.
- **Overlay web:**
  - the live store keeps the theme;
  - the overlay app applies the variables and font faces, and goes back to the built-in look on `null`.
- **Web pages:**
  - Fonts: the list, sample lines, uploading with the suggested family and weight, removing with confirmation, the read-only view, and the error messages;
  - Themes: the list with its badge, swatches and menu actions; the editor's form, live preview, Save, Discard, the missing-font note, the default note, the read-only view and the error messages.
- **Stories:**
  - the theme sample, in the overlay Storybook, under each sample theme;
  - the font sample line, in the admin Storybook.
- **End to end:**
  1. an Admin creates a theme, sets the accent color and the heading font Oswald, saves it and makes it the default;
  2. the OBS overlay page shows that accent and loads Oswald from `/fonts/…`;
  3. another save changes the open overlay without a reload.

## Docs

- **[ADR-0023](../../docs/decisions/) "rcl-core shares data with apps through read-only services"**, accepted:
  - fonts are the first, through `AppContext.fonts`;
  - apps read core data through the SDK, never core's tables or code;
  - changes go through core's own routes.
- **`docs/features/theme-builder.md`:**
  - `app: both`, and status `in-progress`, then `shipped`;
  - a Behavior section, with the font library;
  - the open questions it settles move into the page: the token set, where a theme applies for now, font formats and licensing;
  - game team colors, per-screen themes and animations stay open.
- **`docs/features/users-and-access.md`:** the four permissions, and the role matrix rows.
- **`docs/architecture/data-model.md`:** Font face (rcl-core), and Theme (rcl-producer) gaining `is_default`.
- **`docs/architecture/README.md`:** the font library, `/fonts/<file>`, and ADR-0023 under key decisions.
- **Glossary:** "Font library" and "Default theme".
- **Rules:**
  - `sdk.md`: `AppContext.fonts`;
  - `rcl-core-server.md`: fonts and the reserved `fonts` id;
  - `rcl-producer-server.md`: themes, migrations and the overlay event;
  - `rcl-producer-overlay.md`: the token variables and `themeToCss`.
- **Font licences:** in `rcl-core/server/fonts/`, and listed in the repo README.
- **Changelogs:**
  - rcl-core: Added, the font library (#19);
  - rcl-producer: Added, the Theme Builder and the default theme on the overlay (#20); Changed, the renamed theme variables.
