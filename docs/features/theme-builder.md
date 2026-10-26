---
title: Theme Builder
app: both
status: shipped
summary: Define reusable visual styles (colors, fonts, borders, corner radius) that restyle every overlay.
---
# Theme Builder

The Theme Builder defines how overlays look, so a single [theme](../product/glossary.md) can restyle every screen consistently. Themes become CSS custom properties, which every overlay component uses for its styling ([ADR-0006](../decisions/0006-one-overlay-renderer-css-variable-theming.md)).

## Users and roles

Admins create and edit themes. Producers use existing themes. See the [role matrix](users-and-access.md#role-matrix).

## Requirements

- **R1.** Create, edit, duplicate and delete named themes.
- **R2.** A theme defines tokens for at least:
  - colors
  - font (family, weights, sizes)
  - border radius
  - border thickness
- **R3.** A theme compiles to CSS custom properties, e.g. `--theme-color-accent`. Overlay components style themselves **only** through these properties. They never hard-code colors or fonts.
- **R4.** While editing, a theme is previewed live on sample overlay components.
- **R5.** Fonts work offline. Font files are uploaded or bundled and served by our server, never loaded from a font CDN ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)).
- **R6.** Themes can be exported and imported as JSON, including their font files ([import / export](import-export.md)).

## Behavior

### Font library (rcl-core)

Fonts live in rcl-core's **[font library](../product/glossary.md#font-library)**, shared like team logos, so every rcl app can use them. Nothing is ever loaded from the internet (R5).

- **Bundled fonts:** Inter, Roboto Condensed, Barlow Condensed, Oswald, Bebas Neue and Anton come with Rollcall, under the SIL Open Font License. Their files and licences are in `rcl-core/server/fonts/`. They're served at `/fonts/<family>/<file>` to anyone, so OBS overlays can load them, and cached for good.
- **Uploaded fonts:** Admins upload WOFF2, WOFF, TTF or OTF files of up to 5 MB, one face at a time: a family name, a weight (`400`, or a range such as `100-900` for a variable font) and a style. The server keeps a file only if its bytes are a font, and stores it in the [media](../product/glossary.md#media) store at `/media/<id>`.
  - A family name uses letters, digits, spaces, dashes and underscores. Names that differ only in case are the same family.
  - A bundled family's name can't be used for an upload, and a family can't have two faces with the same weights and style.
  - Upload only fonts you're licensed to use in a broadcast.
- **The Fonts page** (`/core/fonts`) lists every family, bundled first, each with a sample line in its own font and its faces. Choosing a file suggests the family, weight and style from its name, such as "Rollerball-BoldItalic.woff2". Admins upload and remove faces; Producers and Announcers can look.
- **Apps read the library** through rcl-core's read-only fonts service ([ADR-0023](../decisions/0023-core-data-services-for-apps.md)).
- A theme that names a family that isn't in the library falls back to the system font.

### Themes (rcl-producer)

A theme is a name and a fixed set of **tokens**. Each becomes a CSS custom property, and overlay components style themselves only with these (R3):

| Token | CSS variable | Rule |
|---|---|---|
| Text, muted text | `--theme-color-text`, `--theme-color-text-muted` | `#rrggbb`, or `#rrggbbaa` with transparency |
| Surface, alternate surface | `--theme-color-surface`, `--theme-color-surface-alt` | same |
| Accent, text on accent | `--theme-color-accent`, `--theme-color-on-accent` | same |
| Border | `--theme-color-border` | same |
| Heading and body font | `--theme-font-heading`, `--theme-font-body` | a family from the font library, then the system font |
| Heading and body weight | `--theme-font-heading-weight`, `--theme-font-body-weight` | 100–900, in steps of 100 |
| Base size | `--theme-font-size` | 12–96 pixels |
| Heading case | `--theme-heading-transform` | as typed (`none`) or capitals (`uppercase`) |
| Corner radius | `--theme-radius` | 0–64 pixels |
| Border width | `--theme-border-width` | 0–16 pixels |
| Extra colors | `--theme-extra-<name>` | up to 10, each with its own lowercase name. Overlay components rely only on the tokens above |

- **The built-in look** is what a new theme starts from, and what the overlay shows with no default theme.
- **The [default theme](../product/glossary.md#default-theme)** styles the OBS overlay. At most one theme is the default. When it's saved, changed, cleared or deleted, every open overlay changes at once, with no reload. A new overlay gets it when it connects. Until the [Screen Builder](screen-builder.md) lets each screen choose a theme, this is the only way a theme reaches the overlay.
- **The Themes page** (`/producer/themes`) lists themes by name, with the default marked and their surface and accent colors. Admins create a theme by name, and from each row's menu duplicate it ("Derby Night copy", then "copy 2"), make it the default or stop using it, and delete it.
- **The theme editor** (`/producer/themes/<id>`) has the name and tokens on the left and a live preview on the right, which follows every change before it's saved, over a dark, light or checkerboard background. The preview uses the overlay's own components and the same CSS as the overlay, so they match. Changes are checked when you save; **Discard changes** goes back to the saved theme.
- **Two people editing the same theme:** **Save theme** puts your changes on the theme as it is then, so a colleague's change to a token you didn't touch isn't overwritten, and shows up in your form. When you both change the same token, the last save wins. The extra colors count as one token.
- **Producers** see the list and each theme's preview, without editing controls. Announcers don't see themes.

Themes travel in [export files](import-export.md), with the uploaded fonts they use (R6). Importing a theme never makes it the default on its own.

## Related

- [ADR-0006: one overlay renderer, CSS-variable theming](../decisions/0006-one-overlay-renderer-css-variable-theming.md)
- [ADR-0023: rcl-core shares data with apps through read-only services](../decisions/0023-core-data-services-for-apps.md)
- [Screen Builder](screen-builder.md), where a theme is applied to a screen

## Open questions

- Should a component be able to override its screen's theme, once screens choose their own?
- Should overlays be able to use team colors dynamically, e.g. `--team-home-primary` taken from the game's teams, alongside theme tokens?
- Are show/hide animations and transitions part of a theme or part of each component?
