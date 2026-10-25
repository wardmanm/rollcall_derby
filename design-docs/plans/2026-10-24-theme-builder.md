# Theme Builder and font library (#19, #20) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins make themes for the OBS overlay in the Producer app: colors, fonts from a font library in rcl-core, sizes, corners and borders, with a live preview. The default theme restyles every open overlay at once. Fonts come with Rollcall or are uploaded, and are never loaded from the internet.

**Architecture:**
- **rcl-core's font library (#19):**
  - six open-licence families committed to `rcl-core/server/fonts/` and served at `/fonts/<family>/<file>`;
  - uploaded faces in a new `font_faces` table, their files in the media store (ADR-0022);
  - `GET /fonts`, `POST /fonts/faces` and `DELETE /fonts/faces/:id`, with `core:fonts.read` and `core:fonts.manage`;
  - a Fonts page in rcl-core's admin app.
- **Fonts for apps (ADR-0023):** `AppContext.fonts.list()`, rcl-core's first read-only data service. Core now gives each app one context, so an app's routes and namespaces can share state through it.
- **The Producer app's contract:** the token schema, `DEFAULT_TOKENS` (the built-in look), `themeToCss` and `familiesUsedBy`, and the overlay's `theme:changed` event.
- **The Producer app's server:**
  - its first table, `producer_themes`, with its own migrations;
  - the theme routes, with `producer:themes.read` and `producer:themes.manage`;
  - `/producer/overlay`, which sends each overlay the default theme when it connects and whenever that theme changes.
- **The Producer app's web:**
  - the overlay applies the theme through `ThemeScope`;
  - a Themes list, and an editor whose live preview uses the same `ThemeScope` and overlay components as the overlay.
- **The web SDK:** the form helpers move in from rcl-core, and `/fonts` joins the dev proxy.

**Tech Stack:** Fastify 5, Drizzle 0.45 (one migration in rcl-core, the Producer app's first), Zod 4, Socket.IO 4, React 19 with Mantine 9 and RTK Query, Vitest, Storybook and Playwright. **No new third-party packages:** the Producer app's server and contract add workspace dependencies on packages rcl-core already uses, at the same versions.

**Spec:** [`design-docs/specs/2026-10-24-theme-builder-design.md`](../specs/2026-10-24-theme-builder-design.md) (approved). Issues **#19** (font library, milestone `rcl-core v0.2.0`) and **#20** (Theme Builder, milestone `rcl-producer v0.3.0`).

**How this plan was checked:** the work was built on a throwaway branch, one commit per task.
- Every commit passed `yarn check`.
- The last commit also passed `yarn build`, the 29 story tests and the 12 e2e tests.
- App tests go from 379 to 484.
- Each task's tests were run against the previous task's code and failed as its "Expected: FAIL" says.
- Every code block below is copied from those commits. Every "Replace … with" instruction was checked mechanically: applied to the previous task's files, it gives this task's files exactly.

## Global Constraints

- **From the spec:**
  - **Offline:** fonts "are never loaded from the internet"; the bundled ones are "committed to `rcl-core/server/fonts/`, each family with its licence file".
  - **Bundled families:** "Inter, Roboto Condensed, Barlow Condensed, Oswald, Bebas Neue and Anton, all under the SIL Open Font License." Each bundled face has "a fixed id, such as `bundled-oswald`, and can't be removed".
  - **Bundled files are served** "to anyone, with the right type, `X-Content-Type-Options: nosniff` and `Cache-Control: public, max-age=31536000, immutable`. A file name that isn't one of the bundled files gets `404`." `fonts` is a reserved app id.
  - **Uploaded faces:** family "1–64 characters of letters, digits, spaces, `-` and `_`"; weights "100–900, equal for a static face, a range for a variable one"; style `normal` or `italic`; "one face per weight range and style"; WOFF2, WOFF, TTF or OTF "recognized by the file's first bytes and stored as that type", "up to 5 MB".
  - **Upload errors:** `400 validation_failed`; `409 face_taken` ("Rollerball already has a 700 normal face"); `413 too_large`; `415 unsupported_font` ("Use a WOFF2, WOFF, TTF or OTF font").
  - **Themes:** name "1–64 characters after trimming, unique, exact match after trimming"; "at most one theme is the default"; "every field is required in a stored theme". Theme errors: `400 validation_failed`, with plain messages such as "Use a color like #1a2b3c"; `404 not_found`; `409 name_taken` ("That name is already taken").
  - **Tokens:** colors `#rrggbb` or `#rrggbbaa`, stored lowercase; weights 100–900 in steps of 100; size 12–96; radius 0–64; border width 0–16; up to 10 extras named `^[a-z][a-z0-9-]{0,23}$`, unique within the theme. Font variables are `"<family>", system-ui, sans-serif`.
  - **Permissions:** `core:fonts.read` (every role), `core:fonts.manage` (Admins), `producer:themes.read` (Admins and Producers), `producer:themes.manage` (Admins). "None is people-only."
  - **The overlay** "still loads no Mantine".
- **Hard rules:**
  - Rule 3: browsers never connect to OBS or CRG; the overlay gets its theme from the server.
  - Rule 4: works offline, so nothing loads from the internet.
  - Rule 5: authorization happens on the server; the web apps hide controls only for convenience.
  - Rule 6: server data lives only in RTK Query; overlay components get their data through props.
- **Boundaries:** the Producer app's server depends only on `@rollcall/app-sdk` and contracts among the workspaces (`scripts/check-boundaries.test.mjs`).
- **Database:** never edit an existing migration's SQL. New tables come from `db:generate`.
- **TypeScript and lint:** no `as` casts in source outside tests, and one new `oxlint-disable` (Task 8, with its reason).
- **Every commit passes `yarn format && yarn check`.** Tasks 6 and 8 also pass `yarn test:stories`, and Task 9 `yarn test:e2e`.
- **Commits:**
  - Conventional Commits with scope `rcl-core`, `rcl-producer`, `sdk` or `repo`;
  - each body ends with `Refs #19` or `Refs #20`, except Task 9's, which says `Closes #19` and `Closes #20`;
  - then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Nothing is pushed** without Mike's explicit OK.

## Review Focus

1. **A family name that could break out of CSS,** such as `Inter"; } body { color: red`. Family names go into `@font-face` rules and font stacks, so the contract must refuse them, for uploads and for theme tokens. Tests: Task 1, "refuses anything that could break out of the CSS a name goes into", and Task 4, "refuses a family name that could break out of the CSS".
2. **A font file whose browser type is blank,** as it often is for `.woff2`. The upload must still go out as the right type. Test in Task 7: "uploads a font as the file itself, suggesting its family, weight and style from the file name" (the file's type is `''`).
3. **A refused change must not reach the overlay:** a rename to a taken name, or an unknown theme as the default, sends nothing. Test in Task 6: "sends nothing when a change is refused".
4. **Duplicating a theme whose name is already 64 characters.** The copy's name must still fit, so it can be saved again. Test in Task 5: "shortens a long name so the copy’s name still fits in 64 characters".
5. **A cleared number field in the editor.** Saving must say "Use 12 to 96 pixels", not Zod's "expected number, received NaN". Tests in Task 8: the `NaN` cases in "keeps sizes, corners and borders within their limits, in whole pixels", and "refuses what the contract refuses, in its own words, sending nothing".

## Decisions this plan makes

The spec leaves these open, or the build showed they were needed. Each is decided here so implementers and reviewers don't have to guess.

**Font library:**
- **The bundled files are TTF,** pinned to google/fonts commit `e7db6ca603fd4862010383ff17ffd6cc4ffac1c0` and checked by SHA-256 (Task 1). The official source offers no WOFF2. Inter, Oswald and Roboto Condensed are variable fonts; Barlow Condensed comes as 400, 600 and 700.
- **Each family has its own folder,** with its `OFL.txt`, so files are served at `/fonts/<family>/<file>` rather than the spec's `/fonts/<file>`. Only the listed files are served: any other path never reaches the file system.
- **Family names match regardless of case,** as browsers match them: an upload joins an existing family under that family's spelling, and a bundled family's name is refused for uploads (`409 family_bundled`, "Oswald comes with Rollcall. Upload yours under another family name.").
- **An upload's family, weight and style go in the query string;** the body is the raw file. `weight` is `400` or `100-900`.
- **Font and image uploads share `registerUploads`** (`src/routes/uploads.ts`): one plugin per upload kind, with its raw-body parsers, limit and error codes. The team image routes move onto it.
- **`saveMedia` takes the check for its kind:** `imageTypeOf` by default, `fontTypeOf` for fonts. The media table's type list covers both kinds; each route accepts only its own.
- **The test for removing a bundled or unknown face** already passes before Task 2, since the route doesn't exist yet. It keeps a bundled face from being removed once the route does.

**Fonts for apps:**
- **ADR-0023** records that core shares data with apps through read-only services, fonts first.
- **Core makes each app's context once.** The Producer app keys the overlay namespace on its context (a `WeakMap`), so its theme routes can reach the namespace its `realtime()` opened.
- **The Producer app's contract depends on `@rollcall/core-contract`,** for the family-name rule and `fontFaceRules`. The spec says the contract has "no runtime dependencies beyond Zod"; core's contract has none but Zod either, and copying the rule would give it two homes. The contract rule says so.

**Themes:**
- **The built-in look** (`DEFAULT_TOKENS`) keeps today's overlay values: text `#ffffff`, surface `#141821d9` (today's `rgb(20 24 33 / 0.85)`), accent `#228be6`, radius 8, border 2. New tokens: muted text `#ffffffcc` (the card subtitle's 0.8 opacity), alternate surface `#252b38d9`, text on accent `#ffffff`, border `#228be6` (the card's border was the accent), base size 16 (the browser's), heading weight 700, body weight 400, headings as typed.
- **Theme names** are unique as an exact match, so "Finals" and "finals" can both exist. Lists sort ignoring case, with numbers in order ("Bout 9" before "Bout 10").
- **A duplicate's name is shortened** to fit 64 characters: "<name> copy", then "<name> copy 2" and so on.
- **A partial unique index** (`producer_themes_one_default`) backs "at most one default".
- **What reaches the overlay:** choosing or clearing the default, saving the default theme, and deleting it. Nothing else, and nothing when a change is refused.
- **The Producer app's route tests** host its module with `testProducer()`: an in-memory database, its migrations and a context. Access isn't checked there; core's route inventory sweeps the Producer app's routes with every kind of caller. Validation replies there are Fastify's own, so route tests check the status and that the message contains the contract's words.
- **`ThemeScope`** sets the variables with `style.setProperty` in a layout effect, because React's style types don't take custom properties without a cast.
- **`theme-defaults.css`** stays as the built-in look in plain CSS, for the overlay before a theme arrives and for overlay stories. A test keeps it in step with `DEFAULT_TOKENS`. It also declares the bundled Inter, at `/fonts/inter/inter.ttf`. In Storybook there's no server, so Storybook logs a harmless proxy error for that file.
- **The overlay tests wait** (`vi.waitFor`) rather than `act`, because RTK delays store updates to the next animation frame.

**Web:**
- **Fonts are sent as a copy typed by their extension** (`new Blob([file], { type })`). `fetchBaseQuery` deletes a `Content-Type` header on a file body, and browsers often leave a font's type blank. The same deletion means the team image routes' header was never sent; images work because browsers type PNG, JPEG and WebP files. That's left as it is.
- **File names suggest a face:** weight words (Thin to Black/Heavy) and Italic/Oblique are taken out, bracketed parts such as `[wght]` are dropped, and characters a family name can't hold are removed.
- **The form helpers** (`fieldErrors`, `problemWith`) move from rcl-core's web app to the web SDK, for the Producer app's pages, with a new `pathErrors` for nested fields such as `tokens.colors.accent`.
- **The test fixtures** `ADMIN`, `PRODUCER` and `ANNOUNCER` hold the fonts and themes permissions their roles hold on the server.
- **The editor has a Name field.** The spec lists the form's sections without one, but the API renames, and the page is the only place to do it.
- **Number fields:** a cleared field is `NaN`, which the contract refuses with the same plain message as other bad values. That contract change comes in Task 8, with its test.
- **A new extra color** is named `color-1` (or the next free number) and is white. Rows are keyed by index, because a row's name changes as it's typed: that's the one `oxlint-disable`.
- **The theme sample's accent bar** uses large, bold text: white on the built-in accent is 3.7:1, which passes the stories' contrast check only as large text.
- **Producers** see a theme's name, its Default badge and the preview, with no form.

**Docs:**
- **The feature page** goes to `shipped`, with a Behavior section, the token table, and the open questions it settles moved into the page.
- **The glossary** gains "Font library" and "Default theme", and Media now covers fonts.
- **Changelogs:** rcl-core gets an Added line ending in (#19); rcl-producer gets Added lines and a Changed line for the renamed variables, ending in (#20).

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `rcl-core/server/fonts/**`, `rcl-core/contract/src/fonts.ts`, `src/fonts/{bundled,fonts}.ts`, `src/routes/fonts.ts`, permissions | Bundled fonts, `/fonts/…`, `GET /fonts`, the two font permissions | 1 |
| `src/media.ts`, `src/db/schema.ts`, migration `0004_fonts`, `src/routes/{uploads,fonts,team-images}.ts` | Font uploads and removal | 2 |
| `packages/app-sdk/src/index.ts`, `src/apps.ts`, ADR-0023 | `AppContext.fonts`, one context per app | 3 |
| `rcl-producer/contract/src/themes.ts` | Tokens, the built-in look, `themeToCss` | 4 |
| `rcl-producer/server/{drizzle,src/db,src/themes,src/routes,src/testing.ts}` | The themes table and routes | 5 |
| `rcl-producer/server/src/overlay.ts`, `rcl-producer/web/src/overlay/**`, `packages/web-sdk/src/vite.ts` | The default theme on the overlay | 6 |
| `rcl-core/web/src/pages/{FontsPage,FontSample,font-files}.*`, `rcl-core/web/src/api.ts` | The Fonts page | 7 |
| `rcl-producer/web/src/{api.ts,pages/Theme*}`, `ThemeSample`, `packages/web-sdk/src/forms.ts` | The Themes pages | 8 |
| `e2e/tests/accounts.spec.ts`, `docs/**`, `README.md`, changelogs | End to end, and the docs | 9 |

`src/` means `rcl-core/server/src/` in Tasks 1–3. All other paths are relative to the repo root.

---

### Task 1: Bundled fonts, `/fonts/…`, the font list and the font permissions

**Files:**
- Create: `rcl-core/server/fonts/**` (downloaded), `rcl-core/contract/src/fonts.ts`, `rcl-core/server/src/fonts/bundled.ts`, `rcl-core/server/src/fonts/fonts.ts`, `rcl-core/server/src/routes/fonts.ts`
- Modify: `rcl-core/contract/src/index.ts`, `rcl-core/server/src/core-app.ts`, `rcl-core/server/src/app.ts`, `rcl-core/server/src/apps.ts`, `rcl-core/server/src/auth/permissions.ts`, `rcl-core/server/src/openapi.ts`, `docs/features/users-and-access.md`, `docs/features/theme-builder.md` (status)
- Test: `rcl-core/contract/src/fonts.test.ts` and `rcl-core/server/src/fonts/bundled.test.ts` (new), `rcl-core/server/src/apps.test.ts`, `rcl-core/server/src/auth/route-inventory.test.ts`, `rcl-core/server/src/routes/api-keys.test.ts`, `rcl-core/server/src/routes/auth.test.ts`

**Interfaces:**
- Produces, from `@rollcall/core-contract`:
  - `FONT_TYPES` (`font/woff2`, `font/woff`, `font/ttf`, `font/otf`), `FontTypeSchema`, `FontType`, `MAX_FONT_BYTES` (5 242 880);
  - `FONT_STYLES`, `FontStyleSchema`, `FontStyle`;
  - `FontFamilyNameSchema` (trimmed, `^[A-Za-z0-9 _-]{1,64}$`, "Use 1–64 letters, digits, spaces, dashes or underscores");
  - `FontFaceSchema` `{ id, weightMin, weightMax, style, format, url }`, `FontFamilySchema` `{ name, bundled, faces }` and their types;
  - `fontFaceRules(families): string`, one `@font-face` rule per face.
- Produces, in rcl-core's server:
  - `BUNDLED_FONTS_DIR`, `BUNDLED_FAMILIES: readonly FontFamily[]` and `serveBundledFonts(app, dir?)` (`fonts/bundled.ts`);
  - `listFonts(db): FontFamily[]` (`fonts/fonts.ts`), bundled families only for now;
  - `registerFontRoutes(fastify, { db })` with `GET /fonts`;
  - `core:fonts.read` (`roles: ['producer', 'announcer']`) and `core:fonts.manage` (`roles: []`) in `CORE_PERMISSIONS`;
  - `fonts` joins `media` as a reserved app id.

- [ ] **Step 0: Branch, and commit the spec and this plan.**

```bash
git switch -c feat/theme-builder
git add design-docs/specs/2026-10-24-theme-builder-design.md design-docs/plans/2026-10-24-theme-builder.md
git commit -F - <<'EOF'
docs(repo): spec and plan for the Theme Builder and font library

Themes for the OBS overlay in the Producer app, and a font library in
rcl-core that themes pick their fonts from.

Refs #19
Refs #20

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Remind Mike, in one line, to move #19 to "In progress" on board #6 and #20 on board #8.

- [ ] **Step 1: Download the bundled fonts, and check them.**

Each family's file and licence, from one fixed commit of google/fonts:

```bash
SHA=e7db6ca603fd4862010383ff17ffd6cc4ffac1c0
F=rcl-core/server/fonts
dl() { mkdir -p "$F/$1" && curl -sfL "https://raw.githubusercontent.com/google/fonts/$SHA/ofl/$2" -o "$F/$1/$3"; }
dl inter 'inter/Inter%5Bopsz,wght%5D.ttf' inter.ttf && dl inter inter/OFL.txt OFL.txt
dl roboto-condensed 'robotocondensed/RobotoCondensed%5Bwght%5D.ttf' roboto-condensed.ttf
dl roboto-condensed robotocondensed/OFL.txt OFL.txt
dl barlow-condensed barlowcondensed/BarlowCondensed-Regular.ttf barlow-condensed-400.ttf
dl barlow-condensed barlowcondensed/BarlowCondensed-SemiBold.ttf barlow-condensed-600.ttf
dl barlow-condensed barlowcondensed/BarlowCondensed-Bold.ttf barlow-condensed-700.ttf
dl barlow-condensed barlowcondensed/OFL.txt OFL.txt
dl oswald 'oswald/Oswald%5Bwght%5D.ttf' oswald.ttf && dl oswald oswald/OFL.txt OFL.txt
dl bebas-neue bebasneue/BebasNeue-Regular.ttf bebas-neue.ttf && dl bebas-neue bebasneue/OFL.txt OFL.txt
dl anton anton/Anton-Regular.ttf anton.ttf && dl anton anton/OFL.txt OFL.txt
(cd rcl-core/server && shasum -a 256 -c - <<'EOF'
ee67e6ee22790b7929f1a3769ca2801d565c64b5a9096942c1adf5596de9c9e4  fonts/anton/OFL.txt
a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab  fonts/anton/anton.ttf
186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f  fonts/barlow-condensed/OFL.txt
583cec5da3b84bc4dc7c9c72e2a565c94d34e431518b19d7e250b7830ad5f996  fonts/barlow-condensed/barlow-condensed-400.ttf
7b619d14bc2327509a9ef32b0890f709626f7ecc9ff61191c2a4314c5499d2d9  fonts/barlow-condensed/barlow-condensed-600.ttf
e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65  fonts/barlow-condensed/barlow-condensed-700.ttf
72082f6cb4d04be2ecf7cc7d9e1e7d73787f0af8a5a278a47cade70c16b78341  fonts/bebas-neue/OFL.txt
08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73  fonts/bebas-neue/bebas-neue.ttf
5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57  fonts/inter/OFL.txt
29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031  fonts/inter/inter.ttf
0fd731a904b729a4e02eaf5e8ebd06783edd9abe400e8882760160230675b652  fonts/oswald/OFL.txt
5b38c246e255a12f5712d640d56bcced0472466fc68983d2d0410ec0457c2817  fonts/oswald/oswald.ttf
0e4cc6ece88573545be2ed25835363662a6182ba4a4c1b5c8feda52add30e8a6  fonts/roboto-condensed/OFL.txt
dace262afcee68a5276f200d8026c57221735c0118ab5fda8c2c0d3dc409a8d0  fonts/roboto-condensed/roboto-condensed.ttf
EOF
)
```

Expected: every line ends `OK`, and `find rcl-core/server/fonts -type f | wc -l` says 14.

- [ ] **Step 2: Write the failing tests.**

Create `rcl-core/contract/src/fonts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FontFamilyNameSchema, FontFamilySchema, fontFaceRules, MAX_FONT_BYTES, type FontFamily } from './fonts.ts';

const OSWALD: FontFamily = {
  name: 'Oswald',
  bundled: true,
  faces: [
    {
      id: 'bundled-oswald',
      weightMin: 200,
      weightMax: 700,
      style: 'normal',
      format: 'font/ttf',
      url: '/fonts/oswald/oswald.ttf',
    },
  ],
};
const ROLLERBALL: FontFamily = {
  name: 'Rollerball',
  bundled: false,
  faces: [
    {
      id: 'f1',
      weightMin: 400,
      weightMax: 400,
      style: 'normal',
      format: 'font/woff2',
      url: '/media/0123456789abcdef0123456789abcdef',
    },
    {
      id: 'f2',
      weightMin: 700,
      weightMax: 700,
      style: 'italic',
      format: 'font/otf',
      url: '/media/fedcba9876543210fedcba9876543210',
    },
  ],
};

describe('FontFamilyNameSchema', () => {
  it('accepts names made of letters, digits, spaces, dashes and underscores, trimmed', () => {
    expect(FontFamilyNameSchema.parse('  Barlow Condensed ')).toBe('Barlow Condensed');
    expect(FontFamilyNameSchema.parse('Rollerball_2-Pro')).toBe('Rollerball_2-Pro');
  });

  it('refuses anything that could break out of the CSS a name goes into', () => {
    for (const name of [
      '',
      '   ',
      'x'.repeat(65),
      'Evil"; } body { color: red',
      "O'Brien",
      'a;b',
      'a{b}',
      'two\nlines',
      'url(x)',
    ]) {
      expect(FontFamilyNameSchema.safeParse(name).success, JSON.stringify(name)).toBe(false);
    }
  });
});

describe('FontFamilySchema', () => {
  it('accepts a family as the server lists it', () => {
    expect(FontFamilySchema.parse(ROLLERBALL)).toEqual(ROLLERBALL);
    expect(FontFamilySchema.safeParse({ ...OSWALD, faces: [{ ...OSWALD.faces[0], format: 'font/svg' }] }).success).toBe(
      false,
    );
  });
});

describe('fontFaceRules', () => {
  it('writes one @font-face per face, with its weights, style and the format browsers expect', () => {
    expect(fontFaceRules([OSWALD, ROLLERBALL])).toBe(
      [
        '@font-face {',
        '  font-family: "Oswald";',
        '  src: url("/fonts/oswald/oswald.ttf") format("truetype");',
        '  font-weight: 200 700;',
        '  font-style: normal;',
        '  font-display: swap;',
        '}',
        '@font-face {',
        '  font-family: "Rollerball";',
        '  src: url("/media/0123456789abcdef0123456789abcdef") format("woff2");',
        '  font-weight: 400;',
        '  font-style: normal;',
        '  font-display: swap;',
        '}',
        '@font-face {',
        '  font-family: "Rollerball";',
        '  src: url("/media/fedcba9876543210fedcba9876543210") format("opentype");',
        '  font-weight: 700;',
        '  font-style: italic;',
        '  font-display: swap;',
        '}',
      ].join('\n'),
    );
    expect(fontFaceRules([])).toBe('');
  });
});

describe('MAX_FONT_BYTES', () => {
  it('is 5 MB', () => {
    expect(MAX_FONT_BYTES).toBe(5_242_880);
  });
});
```

Create `rcl-core/server/src/fonts/bundled.test.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FontFamilySchema } from '@rollcall/core-contract';
import { addUser, testApp } from '../testing.ts';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { BUNDLED_FAMILIES, BUNDLED_FONTS_DIR } from './bundled.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
function fresh() {
  const made = testApp();
  opened.push(made.app);
  return made;
}

describe('the bundled fonts', () => {
  it('are the six families, each face a file that is really there, with its licence beside it', () => {
    expect(BUNDLED_FAMILIES.map((f) => f.name)).toEqual([
      'Anton',
      'Barlow Condensed',
      'Bebas Neue',
      'Inter',
      'Oswald',
      'Roboto Condensed',
    ]);
    for (const family of BUNDLED_FAMILIES) {
      expect(FontFamilySchema.parse(family)).toEqual(family);
      for (const face of family.faces) {
        const file = join(BUNDLED_FONTS_DIR, face.url.replace('/fonts/', ''));
        expect(readFileSync(file).subarray(0, 4).toString('hex'), face.url).toBe('00010000');
      }
    }
    for (const folder of readdirSync(BUNDLED_FONTS_DIR)) {
      expect(existsSync(join(BUNDLED_FONTS_DIR, folder, 'OFL.txt')), folder).toBe(true);
    }
  });
});

describe('GET /fonts/:folder/:file', () => {
  it('serves each bundled face to anyone, cached for good', async () => {
    const { app } = fresh();
    for (const face of BUNDLED_FAMILIES.flatMap((family) => family.faces)) {
      const res = await app.inject({ method: 'GET', url: face.url });
      expect(res.statusCode, face.url).toBe(200);
      expect(res.headers).toMatchObject({
        'content-type': 'font/ttf',
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      expect(res.rawPayload.subarray(0, 4).toString('hex'), face.url).toBe('00010000');
    }
  });

  it('answers 404 for anything that is not a bundled face, even a file that is there', async () => {
    const { app } = fresh();
    for (const url of [
      '/fonts/inter/OFL.txt',
      '/fonts/inter/nope.ttf',
      '/fonts/..%2Fpackage.json/x',
      '/fonts/inter',
      '/fonts/',
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
  });
});

describe('GET /api/core/fonts', () => {
  it('lists the bundled families for anyone who may read fonts', async () => {
    const { app, db } = fresh();
    for (const role of ['admin', 'producer', 'announcer'] as const) {
      const user = await addUser(db, `${role}1`, 'correct horse', role);
      const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
      const res = await app.inject({ method: 'GET', url: '/api/core/fonts', cookies });
      expect(res.statusCode, role).toBe(200);
      expect(FontFamilySchema.array().parse(res.json()), role).toEqual(BUNDLED_FAMILIES);
    }
  });
});
```

`fonts` is a reserved app id:

In `rcl-core/server/src/apps.test.ts`:

Replace:

```ts
      [app({ id: 'media' }), 'its id "media" is a path the server uses itself'],
```
with:

```ts
      [app({ id: 'media' }), 'its id "media" is a path the server uses itself'],
      [app({ id: 'fonts' }), 'its id "fonts" is a path the server uses itself'],
```


Every role may now read fonts, an Admin may manage them, and API keys can be given either:

In `rcl-core/server/src/routes/auth.test.ts`:

Replace:

```ts
    ]);
    expect(await permissionsOf('producer1')).toEqual(['core:teams.read', 'core:teams.manage']);
```
with:

```ts
      'core:fonts.read',
      'core:fonts.manage',
    ]);
    expect(await permissionsOf('producer1')).toEqual(['core:teams.read', 'core:teams.manage', 'core:fonts.read']);
```


In `rcl-core/server/src/routes/api-keys.test.ts`:

Replace:

```ts
      { key: 'core:teams.manage', summary: 'Create, edit and delete teams, members, logos and photos' },
```
with:

```ts
      { key: 'core:teams.manage', summary: 'Create, edit and delete teams, members, logos and photos' },
      { key: 'core:fonts.read', summary: 'List the fonts in the font library' },
      { key: 'core:fonts.manage', summary: 'Upload and remove fonts' },
```


In `rcl-core/server/src/auth/route-inventory.test.ts`:

Replace:

```ts
      'DELETE /api/core/teams/:id/members/:memberId/photo',
```
with:

```ts
      'DELETE /api/core/teams/:id/members/:memberId/photo',
      'GET /api/core/fonts',
```


- [ ] **Step 3: Run them and see them fail.**

Run: `yarn vitest run rcl-core/contract/src/fonts.test.ts rcl-core/server/src/fonts/bundled.test.ts rcl-core/server/src/apps.test.ts rcl-core/server/src/auth/route-inventory.test.ts rcl-core/server/src/routes/api-keys.test.ts rcl-core/server/src/routes/auth.test.ts`
Expected: FAIL, 6 files.
- `fonts.test.ts` and `bundled.test.ts` don't load: `Cannot find module './fonts.ts'` and `'./bundled.ts'`.
- One failure in each of the others: `fonts` is still a valid app id, the permission lists lack the font permissions, and `GET /api/core/fonts` isn't among the routes a key may call.

- [ ] **Step 4: Write the contract.**

Create `rcl-core/contract/src/fonts.ts`:

```ts
import { z } from 'zod';

// The font library (docs/features/theme-builder.md): families that ship with Rollcall, plus faces Admins upload.
// Themes and the OBS overlay use them by family name, never from the internet (hard rule 4, ADR-0023).

/** The font types an upload may be. The server checks a file's bytes, not just its stated type. */
export const FONT_TYPES = ['font/woff2', 'font/woff', 'font/ttf', 'font/otf'] as const;
export const FontTypeSchema = z.enum(FONT_TYPES);
export type FontType = z.infer<typeof FontTypeSchema>;

/** The largest font file the server accepts: 5 MB. */
export const MAX_FONT_BYTES = 5 * 1024 * 1024;

export const FONT_STYLES = ['normal', 'italic'] as const;
export const FontStyleSchema = z.enum(FONT_STYLES);
export type FontStyle = z.infer<typeof FontStyleSchema>;

/** A family's name: letters, digits, spaces, dashes and underscores only, so it can never break out of the CSS. */
export const FontFamilyNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9 _-]{1,64}$/, 'Use 1–64 letters, digits, spaces, dashes or underscores');

export const FontFaceSchema = z.strictObject({
  id: z.string(),
  weightMin: z.number().int().min(100).max(900),
  weightMax: z.number().int().min(100).max(900),
  style: FontStyleSchema,
  format: FontTypeSchema,
  /** Where the file is: /fonts/<file> for a bundled face, /media/<id> for an uploaded one. */
  url: z.string(),
});
export type FontFace = z.infer<typeof FontFaceSchema>;

export const FontFamilySchema = z.strictObject({
  name: z.string(),
  bundled: z.boolean(),
  faces: z.array(FontFaceSchema),
});
export type FontFamily = z.infer<typeof FontFamilySchema>;

// How a browser names each font type in `src: url(…) format(…)`.
const CSS_FORMATS: Record<FontType, string> = {
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'truetype',
  'font/otf': 'opentype',
};

/**
 * The `@font-face` rules for every face of `families`. Names and addresses come from the font library, whose names
 * can't contain quotes or semicolons, so the rules can't be broken out of.
 */
export function fontFaceRules(families: readonly FontFamily[]): string {
  return families
    .flatMap((family) =>
      family.faces.map((face) => {
        const weight = face.weightMin === face.weightMax ? `${face.weightMin}` : `${face.weightMin} ${face.weightMax}`;
        return [
          '@font-face {',
          `  font-family: "${family.name}";`,
          `  src: url("${face.url}") format("${CSS_FORMATS[face.format]}");`,
          `  font-weight: ${weight};`,
          `  font-style: ${face.style};`,
          '  font-display: swap;',
          '}',
        ].join('\n');
      }),
    )
    .join('\n');
}
```

Replace `rcl-core/contract/src/index.ts` with:

```ts
// rcl-core's contract (ADR-0019): Zod schemas for /api/core, shared by its server, its web app and the web SDK.
// Types come from z.infer. Naming: `FooSchema` for the schema, `Foo` for its type.
export const APP_NAME = 'Rollcall';

export * from './api-keys.ts';
export * from './apps.ts';
export * from './health.ts';
export * from './auth.ts';
export * from './fonts.ts';
export * from './teams.ts';
```

- [ ] **Step 5: Serve the bundled fonts, list them, and add the permissions.**

Create `rcl-core/server/src/fonts/bundled.ts`:

```ts
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { FontFamily, FontStyle } from '@rollcall/core-contract';

// The font families that ship with Rollcall (docs/features/theme-builder.md): open-licence (SIL OFL) fonts from Google
// Fonts, each in its own folder with its licence. They're served at /fonts/<folder>/<file> to anyone, so OBS overlays
// can use them, and never come from the internet (hard rule 4).

/** Where the bundled font files are: rcl-core/server/fonts/. */
export const BUNDLED_FONTS_DIR = fileURLToPath(new URL('../../fonts', import.meta.url));

interface BundledFace {
  id: string;
  /** Its path below BUNDLED_FONTS_DIR, and below /fonts/. */
  file: string;
  weightMin: number;
  weightMax: number;
  style: FontStyle;
}

const face = (id: string, file: string, weightMin: number, weightMax = weightMin, style: FontStyle = 'normal') => ({
  id,
  file,
  weightMin,
  weightMax,
  style,
});

const BUNDLED: readonly { name: string; faces: readonly BundledFace[] }[] = [
  { name: 'Anton', faces: [face('bundled-anton', 'anton/anton.ttf', 400)] },
  {
    name: 'Barlow Condensed',
    faces: [
      face('bundled-barlow-condensed-400', 'barlow-condensed/barlow-condensed-400.ttf', 400),
      face('bundled-barlow-condensed-600', 'barlow-condensed/barlow-condensed-600.ttf', 600),
      face('bundled-barlow-condensed-700', 'barlow-condensed/barlow-condensed-700.ttf', 700),
    ],
  },
  { name: 'Bebas Neue', faces: [face('bundled-bebas-neue', 'bebas-neue/bebas-neue.ttf', 400)] },
  { name: 'Inter', faces: [face('bundled-inter', 'inter/inter.ttf', 100, 900)] },
  { name: 'Oswald', faces: [face('bundled-oswald', 'oswald/oswald.ttf', 200, 700)] },
  {
    name: 'Roboto Condensed',
    faces: [face('bundled-roboto-condensed', 'roboto-condensed/roboto-condensed.ttf', 100, 900)],
  },
];

/** The bundled families, as the font library lists them. */
export const BUNDLED_FAMILIES: readonly FontFamily[] = BUNDLED.map((family) => ({
  name: family.name,
  bundled: true,
  faces: family.faces.map(({ id, file, weightMin, weightMax, style }) => ({
    id,
    weightMin,
    weightMax,
    style,
    format: 'font/ttf' as const,
    url: `/fonts/${file}`,
  })),
}));

const FILES = new Set(BUNDLED.flatMap((family) => family.faces.map((f) => f.file)));

// Serves each bundled font file at /fonts/<folder>/<file>, to anyone. Only the files listed above are served: any other
// path never reaches the file system.
export function serveBundledFonts(app: FastifyInstance, dir = BUNDLED_FONTS_DIR): void {
  app.get<{ Params: { folder: string; file: string } }>('/fonts/:folder/:file', async (request, reply) => {
    const file = `${request.params.folder}/${request.params.file}`;
    if (!FILES.has(file)) return reply.code(404).send({ error: 'not_found' });
    const path = join(dir, file);
    return reply
      .type('font/ttf')
      .header('content-length', statSync(path).size)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(path));
  });
}
```

Create `rcl-core/server/src/fonts/fonts.ts`:

```ts
import type { FontFamily } from '@rollcall/core-contract';
import type { Queryable } from '../db.ts';
import { BUNDLED_FAMILIES } from './bundled.ts';

// The font library: the bundled families now; uploaded faces join them in their own families.

/** Every family, bundled first. */
export function listFonts(_db: Queryable): FontFamily[] {
  return [...BUNDLED_FAMILIES];
}
```

Create `rcl-core/server/src/routes/fonts.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { FontFamilySchema } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import type { Access } from '../auth/access.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { listFonts } from '../fonts/fonts.ts';

const READ: { config: { access: Access } } = { config: { access: { permission: 'core:fonts.read' } } };
const TAGS = ['core/fonts'];

// The font library (docs/features/theme-builder.md): every family, bundled and uploaded, with its faces' addresses.
export function registerFontRoutes(fastify: FastifyInstance, { db }: { db: AppDatabase }) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/fonts',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'List font families, bundled first, each with its faces',
        response: { 200: FontFamilySchema.array(), ...ERROR_RESPONSES },
      },
    },
    async () => listFonts(db),
  );
}
```

In `rcl-core/server/src/core-app.ts`:

Replace:

```ts
import { registerApiKeyRoutes } from './routes/api-keys.ts';
```
with:

```ts
import { registerApiKeyRoutes } from './routes/api-keys.ts';
import { registerFontRoutes } from './routes/fonts.ts';
```


Replace:

```ts
      registerTeamImageRoutes(fastify, { db, mediaDir });
```
with:

```ts
      registerTeamImageRoutes(fastify, { db, mediaDir });
      registerFontRoutes(fastify, { db });
```


In `rcl-core/server/src/app.ts`:

Replace:

```ts
import { installAuth } from './auth/guard.ts';
```
with:

```ts
import { installAuth } from './auth/guard.ts';
import { serveBundledFonts } from './fonts/bundled.ts';
```


Replace:

```ts
  serveMedia(app, { db, dir: mediaDir });
```
with:

```ts
  serveMedia(app, { db, dir: mediaDir });
  serveBundledFonts(app);
```


In `rcl-core/server/src/apps.ts`:

Replace:

```ts
const RESERVED_IDS = new Set(['media']);
```
with:

```ts
const RESERVED_IDS = new Set(['media', 'fonts']);
```


In `rcl-core/server/src/auth/permissions.ts`:

Replace:

```ts
  },
];
```
with:

```ts
  },
  {
    key: 'core:fonts.read',
    summary: 'List the fonts in the font library',
    roles: ['producer', 'announcer'],
  },
  {
    key: 'core:fonts.manage',
    summary: 'Upload and remove fonts',
    roles: [],
  },
];
```


In `rcl-core/server/src/openapi.ts`:

Replace:

```ts
        { name: 'core/teams', description: 'Teams, their skaters and bench staff, logos and photos' },
```
with:

```ts
        { name: 'core/teams', description: 'Teams, their skaters and bench staff, logos and photos' },
        { name: 'core/fonts', description: 'The font library: bundled and uploaded fonts' },
```


The feature page's permission table must match the code (a test checks it). Add a "Manage fonts" row to the role matrix too:

In `docs/features/users-and-access.md`:

Replace:

```markdown
| Create or edit themes | ✅ | — (uses existing) | — |
```
with:

```markdown
| Create or edit themes | ✅ | — (uses existing) | — |
| Manage fonts | ✅ | — | — |
```


Replace:

```markdown
| `core:teams.manage` | Create, edit and delete teams, members, logos and photos | ✅ | ✅ | — | ✅ |
```
with:

```markdown
| `core:teams.manage` | Create, edit and delete teams, members, logos and photos | ✅ | ✅ | — | ✅ |
| `core:fonts.read` | List the fonts in the font library | ✅ | ✅ | ✅ | ✅ |
| `core:fonts.manage` | Upload and remove fonts | ✅ | — | — | ✅ |
```


Work starts, so in `docs/features/theme-builder.md`:

Replace:

```markdown
app: rcl-producer
status: planned
```
with:

```markdown
app: both
status: in-progress
```


Then run `node scripts/check-docs.mjs --fix`, which updates the features table in `docs/features/README.md`.

- [ ] **Step 6: Run them and see them pass.**

Run: the command from Step 3, plus `rcl-core/server/src/auth/permissions.test.ts`.
Expected: PASS. The six files from Step 3 pass 48 tests, and `yarn test` passes 388.

- [ ] **Step 7: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core docs/features
git commit -F - <<'EOF'
feat(rcl-core): bundled fonts, and the font list

Six open-licence fonts (SIL OFL) come with Rollcall, with their
licences, served at /fonts/<family>/<file> to anyone so OBS overlays can
use them, and never loaded from the internet. GET /api/core/fonts lists
the font library. core:fonts.read is every role's, and core:fonts.manage
is for Admins. fonts is a reserved app id.

Refs #19

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Font uploads and removal

**Files:**
- Create: `rcl-core/server/src/routes/uploads.ts`, migration `rcl-core/server/drizzle/0004_fonts.sql` (generated)
- Modify: `rcl-core/contract/src/fonts.ts`, `rcl-core/server/src/media.ts`, `rcl-core/server/src/db/schema.ts`, `rcl-core/server/src/fonts/fonts.ts`, `rcl-core/server/src/routes/fonts.ts`, `rcl-core/server/src/routes/team-images.ts`, `rcl-core/server/src/core-app.ts`, `.claude/rules/rcl-core-server.md`, `docs/architecture/data-model.md`
- Test: `rcl-core/server/src/routes/fonts.test.ts` (new), `rcl-core/contract/src/fonts.test.ts`, `rcl-core/server/src/media.test.ts`, `rcl-core/server/src/auth/route-inventory.test.ts`, `rcl-core/server/src/testing.ts` (font bytes)

**Interfaces:**
- Consumes from Task 1: `FONT_TYPES`, `FontType`, `FontStyle`, `FontFamily`, `MAX_FONT_BYTES`, `FontFamilyNameSchema`, `BUNDLED_FAMILIES`, `listFonts`.
- Produces:
  - `UploadFontFaceQuerySchema` (contract): input `{ family, weight: '400' | '100-900', style? }`, output `{ family, weightMin, weightMax, style }`; `UploadFontFaceQuery` is its input type;
  - `fontTypeOf(bytes): FontType | undefined` and `saveMedia(db, dir, bytes, typeOf = imageTypeOf)` (`media.ts`);
  - table `font_faces` (`fontFaces`), whose `media_id` is in `MEDIA_REFERENCES`;
  - in `fonts/fonts.ts`: `listFonts(db)` with uploaded families after the bundled ones, `bundledFamilyNamed(name)`, `familyName(db, name)`, `fontFaceTaken(db, face)`, `addFontFace(db, face): FontFamily` and `deleteFontFace(db, id): string | undefined` (the media id);
  - `registerUploads(fastify, kind, routes)` (`routes/uploads.ts`);
  - `POST /fonts/faces` and `DELETE /fonts/faces/:id`; `registerFontRoutes(fastify, { db, mediaDir })`;
  - `FONTS` in `testing.ts`: `woff2`, `woff`, `ttf`, `appleTtf` and `otf` first bytes.

- [ ] **Step 1: Write the failing tests.**

Create `rcl-core/server/src/routes/fonts.test.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { type FontFamily, FontFamilySchema, MAX_FONT_BYTES, type Role } from '@rollcall/core-contract';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { BUNDLED_FAMILIES } from '../fonts/bundled.ts';
import { addUser, FONTS, IMAGES, testApp } from '../testing.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// An app with `role` signed in, and ways to upload, remove and list fonts as them.
async function as(role: Role = 'admin') {
  const { app, db, mediaDir } = testApp();
  opened.push(app);
  const user = await addUser(db, `${role}1`, 'correct horse', role);
  const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
  const upload = (query: string, body: Buffer | string, contentType = 'font/woff2') =>
    app.inject({
      method: 'POST',
      url: `/api/core/fonts/faces?${query}`,
      cookies,
      headers: { 'content-type': contentType },
      payload: body,
    });
  const remove = (id: string) => app.inject({ method: 'DELETE', url: `/api/core/fonts/faces/${id}`, cookies });
  const list = async () =>
    FontFamilySchema.array().parse((await app.inject({ method: 'GET', url: '/api/core/fonts', cookies })).json());
  return { app, mediaDir, upload, remove, list };
}

const uploaded = (families: FontFamily[]) => families.filter((family) => !family.bundled);
const padded = (size: number) => Buffer.concat([FONTS.woff2, Buffer.alloc(size - FONTS.woff2.length)]);

describe('uploading a font face', () => {
  it('adds it to its family, served at its media address, after the bundled families', async () => {
    const { app, upload, list } = await as();
    const res = await upload('family=Rollerball&weight=700', FONTS.woff2);
    expect(res.statusCode).toBe(201);
    const family = FontFamilySchema.parse(res.json());
    expect(family).toEqual({
      name: 'Rollerball',
      bundled: false,
      faces: [
        {
          id: expect.any(String),
          weightMin: 700,
          weightMax: 700,
          style: 'normal',
          format: 'font/woff2',
          url: expect.stringMatching(/^\/media\/[0-9a-f]{32}$/),
        },
      ],
    });
    const served = await app.inject({ method: 'GET', url: family.faces[0]!.url });
    expect(served.headers['content-type']).toBe('font/woff2');
    expect((await list()).slice(0, BUNDLED_FAMILIES.length)).toEqual(BUNDLED_FAMILIES);
    expect(uploaded(await list())).toEqual([family]);
  });

  it('accepts each font type by its bytes, a weight range for a variable font, and italics', async () => {
    const { upload, list } = await as();
    expect((await upload('family=Rollerball&weight=400', FONTS.woff, 'font/woff')).statusCode).toBe(201);
    expect((await upload('family=Rollerball&weight=400&style=italic', FONTS.otf, 'font/otf')).statusCode).toBe(201);
    expect((await upload('family=Jammer Sans&weight=100-900', FONTS.ttf, 'font/ttf')).statusCode).toBe(201);
    expect((await upload('family=Apple Old&weight=400', FONTS.appleTtf, 'font/ttf')).statusCode).toBe(201);
    const families = uploaded(await list());
    expect(families.map((f) => f.name)).toEqual(['Apple Old', 'Jammer Sans', 'Rollerball']);
    expect(families[1]!.faces[0]).toMatchObject({ weightMin: 100, weightMax: 900, format: 'font/ttf' });
    expect(families[2]!.faces.map((f) => [f.weightMin, f.style, f.format])).toEqual([
      [400, 'italic', 'font/otf'],
      [400, 'normal', 'font/woff'],
    ]);
  });

  it('keeps the first spelling of a family whose name differs only in case', async () => {
    const { upload, list } = await as();
    await upload('family=Rollerball&weight=400', FONTS.woff2);
    const bold = await upload('family=ROLLERBALL&weight=700', FONTS.woff2);
    expect(FontFamilySchema.parse(bold.json()).name).toBe('Rollerball');
    expect(uploaded(await list()).map((f) => [f.name, f.faces.length])).toEqual([['Rollerball', 2]]);
  });

  it('refuses a face its family already has, and a bundled family’s name', async () => {
    const { upload } = await as();
    await upload('family=Rollerball&weight=700', FONTS.woff2);
    const again = await upload('family=rollerball&weight=700', FONTS.otf, 'font/otf');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'face_taken', message: 'Rollerball already has a 700 normal face' });
    const bundled = await upload('family=oswald&weight=900', FONTS.woff2);
    expect(bundled.statusCode).toBe(409);
    expect(bundled.json()).toEqual({
      error: 'family_bundled',
      message: 'Oswald comes with Rollcall. Upload yours under another family name.',
    });
  });

  it('refuses anything that is not a font, by its bytes or its type, saving nothing', async () => {
    const { upload, mediaDir } = await as();
    for (const [body, type] of [
      [IMAGES.png, 'font/woff2'],
      ['<svg/>', 'font/ttf'],
      [FONTS.woff2, 'image/png'],
      [FONTS.woff2, 'application/octet-stream'],
      ['{}', 'application/json'],
    ] as const) {
      const res = await upload('family=Rollerball&weight=400', body, type);
      expect(res.statusCode, type).toBe(415);
      expect(res.json(), type).toEqual({ error: 'unsupported_font', message: 'Use a WOFF2, WOFF, TTF or OTF font' });
    }
    expect(existsSync(mediaDir)).toBe(false);
  });

  it('accepts a font of exactly 5 MB and refuses one a byte over', async () => {
    const { upload } = await as();
    expect((await upload('family=Big&weight=400', padded(MAX_FONT_BYTES))).statusCode).toBe(201);
    const tooBig = await upload('family=Bigger&weight=400', padded(MAX_FONT_BYTES + 1));
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json()).toEqual({ error: 'too_large', message: 'That font is over 5 MB' });
  });

  it('refuses a bad family, weight or style, in plain words', async () => {
    const { upload } = await as();
    const res = await upload('family=Bad;Name&weight=400', FONTS.woff2);
    expect(res.json()).toEqual({
      error: 'validation_failed',
      message: 'Use 1–64 letters, digits, spaces, dashes or underscores',
    });
    expect((await upload('family=R&weight=900-100', FONTS.woff2)).json()).toMatchObject({ error: 'validation_failed' });
  });
});

describe('removing a font face', () => {
  it('deletes it with its file, and its family goes once it has no faces', async () => {
    const { upload, remove, list, mediaDir } = await as();
    const family = FontFamilySchema.parse((await upload('family=Rollerball&weight=700', FONTS.woff2)).json());
    expect((await remove(family.faces[0]!.id)).statusCode).toBe(204);
    expect(uploaded(await list())).toEqual([]);
    expect(readdirSync(mediaDir)).toEqual([]);
  });

  it('answers 404 for a bundled face or one that does not exist', async () => {
    const { remove } = await as();
    expect((await remove('bundled-oswald')).statusCode).toBe(404);
    expect((await remove('no-such-face')).json()).toEqual({ error: 'not_found' });
  });
});

describe('who may do what', () => {
  it('lets Producers and Announcers list fonts, and refuses them every change before reading the upload', async () => {
    for (const role of ['producer', 'announcer'] as const) {
      const { upload, remove, list } = await as(role);
      expect((await list()).length, role).toBe(BUNDLED_FAMILIES.length);
      expect((await upload('family=Mine&weight=400', padded(MAX_FONT_BYTES + 1))).json(), role).toEqual({
        error: 'forbidden',
      });
      expect((await remove('anything')).json(), role).toEqual({ error: 'forbidden' });
    }
  });
});
```

In `rcl-core/contract/src/fonts.test.ts`:

Replace:

```ts
import { FontFamilyNameSchema, FontFamilySchema, fontFaceRules, MAX_FONT_BYTES, type FontFamily } from './fonts.ts';
```
with:

```ts
import {
  FontFamilyNameSchema,
  FontFamilySchema,
  fontFaceRules,
  MAX_FONT_BYTES,
  UploadFontFaceQuerySchema,
  type FontFamily,
} from './fonts.ts';
```


Replace:

```ts
});

describe('MAX_FONT_BYTES', () => {
```
with:

```ts
});

describe('UploadFontFaceQuerySchema', () => {
  it('reads a single weight or a range, and defaults the style to normal', () => {
    expect(UploadFontFaceQuerySchema.parse({ family: ' Rollerball ', weight: '700' })).toEqual({
      family: 'Rollerball',
      weightMin: 700,
      weightMax: 700,
      style: 'normal',
    });
    expect(UploadFontFaceQuerySchema.parse({ family: 'Rollerball', weight: '100-900', style: 'italic' })).toEqual({
      family: 'Rollerball',
      weightMin: 100,
      weightMax: 900,
      style: 'italic',
    });
  });

  it('refuses a weight outside 100–900, a range the wrong way round, and a bad family or style', () => {
    for (const query of [
      { family: 'R', weight: '50' },
      { family: 'R', weight: '950' },
      { family: 'R', weight: '900-100' },
      { family: 'R', weight: 'bold' },
      { family: 'R', weight: '400', style: 'oblique' },
      { family: 'R;', weight: '400' },
      { family: 'R', weight: '400', extra: 'x' },
    ]) {
      expect(UploadFontFaceQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });
});

describe('MAX_FONT_BYTES', () => {
```


In `rcl-core/server/src/media.test.ts`:

Replace:

```ts
import { imageTypeOf, mediaUrl, removeMedia, saveMedia, sweepMedia } from './media.ts';
import { IMAGES, testApp } from './testing.ts';
```
with:

```ts
import { fontTypeOf, imageTypeOf, mediaUrl, removeMedia, saveMedia, sweepMedia } from './media.ts';
import { FONTS, IMAGES, testApp } from './testing.ts';
```


Replace:

```ts
      expect(imageTypeOf(bytes), bytes.toString('latin1')).toBeUndefined();
    }
  });
```
with:

```ts
      expect(imageTypeOf(bytes), bytes.toString('latin1')).toBeUndefined();
    }
  });
});

describe('fontTypeOf', () => {
  it('knows WOFF2, WOFF, TTF and OTF by their first bytes', () => {
    expect(fontTypeOf(FONTS.woff2)).toBe('font/woff2');
    expect(fontTypeOf(FONTS.woff)).toBe('font/woff');
    expect(fontTypeOf(FONTS.ttf)).toBe('font/ttf');
    expect(fontTypeOf(FONTS.appleTtf)).toBe('font/ttf');
    expect(fontTypeOf(FONTS.otf)).toBe('font/otf');
  });

  it('refuses anything else, images included', () => {
    for (const bytes of [IMAGES.png, IMAGES.jpeg, Buffer.from('<svg/>'), Buffer.from('wOF'), Buffer.alloc(0)]) {
      expect(fontTypeOf(bytes), bytes.toString('latin1')).toBeUndefined();
    }
  });

  it('keeps fonts out of image uploads, and images out of font uploads', () => {
    const { db, mediaDir } = fresh();
    expect(saveMedia(db, mediaDir, FONTS.woff2)).toBeNull();
    expect(saveMedia(db, mediaDir, IMAGES.png, fontTypeOf)).toBeNull();
    const font = saveMedia(db, mediaDir, FONTS.otf, fontTypeOf);
    expect(db.select().from(media).all()).toEqual([
      { id: font, contentType: 'font/otf', size: FONTS.otf.length, createdAt: expect.any(String) },
    ]);
  });
```


In `rcl-core/server/src/auth/route-inventory.test.ts`:

Replace:

```ts
    expect(keysOf(callable)).toEqual([
```
with:

```ts
    expect(keysOf(callable)).toEqual([
      'DELETE /api/core/fonts/faces/:id',
```


Replace:

```ts
      'PATCH /api/core/teams/:id/members/:memberId',
```
with:

```ts
      'PATCH /api/core/teams/:id/members/:memberId',
      'POST /api/core/fonts/faces',
```


The test helpers provide font bytes:

In `rcl-core/server/src/testing.ts`:

Replace:

```ts
};

export async function addUser(
```
with:

```ts
};

/** The first bytes of each font type: enough for the server, which checks a font's bytes, not its glyphs. */
export const FONTS = {
  woff2: Buffer.concat([Buffer.from('wOF2'), Buffer.from([0, 1, 0, 0, 0, 0, 4, 0])]),
  woff: Buffer.concat([Buffer.from('wOFF'), Buffer.from([0, 1, 0, 0, 0, 0, 4, 0])]),
  ttf: Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x80, 0x00, 0x03, 0x00, 0x40]),
  appleTtf: Buffer.concat([Buffer.from('true'), Buffer.from([0x00, 0x0c, 0x00, 0x80])]),
  otf: Buffer.concat([Buffer.from('OTTO'), Buffer.from([0x00, 0x0c, 0x00, 0x80])]),
};

export async function addUser(
```


- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/contract/src/fonts.test.ts rcl-core/server/src/media.test.ts rcl-core/server/src/routes/fonts.test.ts rcl-core/server/src/auth/route-inventory.test.ts`
Expected: FAIL, 15 tests.
- Contract: the two `UploadFontFaceQuerySchema` tests (it doesn't exist).
- `media.test.ts`: the three `fontTypeOf` tests.
- `routes/fonts.test.ts`: 9 of 10. "answers 404 for a bundled face or one that does not exist" already passes, since there's no such route yet.
- Route inventory: the key sweep lacks the two new routes.

- [ ] **Step 3: The upload query, and fonts in the media store.**

In `rcl-core/contract/src/fonts.ts`:

Replace:

```ts
  .regex(/^[A-Za-z0-9 _-]{1,64}$/, 'Use 1–64 letters, digits, spaces, dashes or underscores');
```
with:

```ts
  .regex(/^[A-Za-z0-9 _-]{1,64}$/, 'Use 1–64 letters, digits, spaces, dashes or underscores');

const WEIGHTS = /^(\d{3})(?:-(\d{3}))?$/;

/** An upload's family, weight (`400`, or `100-900` for a variable font) and style, sent in its query string. */
export const UploadFontFaceQuerySchema = z
  .strictObject({
    family: FontFamilyNameSchema,
    weight: z.string().regex(WEIGHTS, 'Use a weight such as 400, or a range such as 100-900'),
    style: FontStyleSchema.default('normal'),
  })
  .transform(({ family, weight, style }, context) => {
    const [, min = '', max = min] = WEIGHTS.exec(weight) ?? [];
    const weightMin = Number(min);
    const weightMax = Number(max);
    if (weightMin < 100 || weightMax > 900 || weightMin > weightMax) {
      context.addIssue({ code: 'custom', path: ['weight'], message: 'Use weights from 100 to 900, lowest first' });
      return z.NEVER;
    }
    return { family, weightMin, weightMax, style };
  });
export type UploadFontFaceQuery = z.input<typeof UploadFontFaceQuerySchema>;
```


In `rcl-core/server/src/media.ts`:

Replace:

```ts
import type { ImageType } from '@rollcall/core-contract';
```
with:

```ts
import type { FontType, ImageType } from '@rollcall/core-contract';
```


Replace:

```ts
// Uploaded images (ADR-0022): team logos and member photos now, theme and screen images later. Each is a file in the
// media folder named by its id, with a row saying its type. Images are public at /media/<id> so OBS overlays, which
```
with:

```ts
// Uploaded images and fonts (ADR-0022): team logos, member photos and fonts now, screen images later. Each is a file
// in the media folder named by its id, with a row saying its type. They're public at /media/<id> so OBS overlays, which
```


Replace:

```ts
/** Where an image is served. */
```
with:

```ts
/** The types media may be: an image or a font. */
export type MediaType = ImageType | FontType;

/** Where an image or font is served. */
```


Replace:

```ts
/**
 * Saves an upload as a new image: its file, then its row. Returns its id, or null when the bytes aren't a PNG, JPEG
 * or WebP, saving nothing. The caller then points a logo or photo at it.
 */
export function saveMedia(db: Queryable, dir: string, bytes: Uint8Array): string | null {
  const contentType = imageTypeOf(bytes);
```
with:

```ts
/** The type a font's first bytes show it to be, or undefined when they aren't a WOFF2, WOFF, TTF or OTF. */
export function fontTypeOf(bytes: Uint8Array): FontType | undefined {
  if (startsWith(bytes, ascii('wOF2'))) return 'font/woff2';
  if (startsWith(bytes, ascii('wOFF'))) return 'font/woff';
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || startsWith(bytes, ascii('true'))) return 'font/ttf';
  if (startsWith(bytes, ascii('OTTO'))) return 'font/otf';
  return undefined;
}

/**
 * Saves an upload: its file, then its row. Returns its id, or null when `typeOf` doesn't recognize the bytes (by
 * default, when they aren't a PNG, JPEG or WebP), saving nothing. The caller then points a logo, photo or font at it.
 */
export function saveMedia(
  db: Queryable,
  dir: string,
  bytes: Uint8Array,
  typeOf: (bytes: Uint8Array) => MediaType | undefined = imageTypeOf,
): string | null {
  const contentType = typeOf(bytes);
```


- [ ] **Step 4: The table, and generate the migration.**

In `rcl-core/server/src/db/schema.ts`:

Replace:

```ts
import { IMAGE_TYPES, MEMBER_KINDS, type MemberRole } from '@rollcall/core-contract';
```
with:

```ts
import { FONT_STYLES, FONT_TYPES, IMAGE_TYPES, MEMBER_KINDS, type MemberRole } from '@rollcall/core-contract';
```


Replace:

```ts
// Uploaded images, such as team logos and member photos (ADR-0022). Each is a file named by its id in the data
```
with:

```ts
// Uploaded images and fonts, such as team logos, member photos and font faces (ADR-0022). Each is a file named by its id in the data
```


Replace:

```ts
  contentType: text('content_type', { enum: IMAGE_TYPES }).notNull(),
```
with:

```ts
  contentType: text('content_type', { enum: [...IMAGE_TYPES, ...FONT_TYPES] }).notNull(),
```


Replace:

```ts
);

// Every column that refers to media. The startup sweep keeps only media that one of them refers to: add new ones here.
```
with:

```ts
);

// Fonts Admins upload, one row per face of a family (docs/features/theme-builder.md). The bundled families aren't here:
// they ship with the server (src/fonts/bundled.ts). A family has one face per weight range and style.
export const fontFaces = sqliteTable(
  'font_faces',
  {
    id: text('id').primaryKey(),
    family: text('family').notNull(),
    weightMin: integer('weight_min').notNull(),
    weightMax: integer('weight_max').notNull(),
    style: text('style', { enum: FONT_STYLES }).notNull(),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('font_faces_face_idx').on(table.family, table.weightMin, table.weightMax, table.style)],
);

// Every column that refers to media. The startup sweep keeps only media that one of them refers to: add new ones here.
```


Replace:

```ts
  { table: teamMembers, column: teamMembers.photoMediaId },
```
with:

```ts
  { table: teamMembers, column: teamMembers.photoMediaId },
  { table: fontFaces, column: fontFaces.mediaId },
```


Then run:

```bash
yarn workspace @rollcall/core-server db:generate --name fonts
```

Expected: it writes `rcl-core/server/drizzle/0004_fonts.sql`, plus its snapshot and journal entry. The SQL should read:

```sql
CREATE TABLE `font_faces` (
	`id` text PRIMARY KEY NOT NULL,
	`family` text NOT NULL,
	`weight_min` integer NOT NULL,
	`weight_max` integer NOT NULL,
	`style` text NOT NULL,
	`media_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `font_faces_face_idx` ON `font_faces` (`family`,`weight_min`,`weight_max`,`style`);
```

- [ ] **Step 5: The library, the upload helper and the routes.**

Replace `rcl-core/server/src/fonts/fonts.ts` with:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { FONT_TYPES, type FontFamily, type FontStyle, type FontType } from '@rollcall/core-contract';
import type { Queryable } from '../db.ts';
import { fontFaces, media } from '../db/schema.ts';
import { BUNDLED_FAMILIES } from './bundled.ts';

// The font library (docs/features/theme-builder.md): the bundled families, then the uploaded ones, each uploaded face
// a row in font_faces pointing at its file in the media store (ADR-0022).

export interface NewFontFace {
  family: string;
  weightMin: number;
  weightMax: number;
  style: FontStyle;
  mediaId: string;
}

const NAMES = new Intl.Collator('en', { sensitivity: 'base' });
const fontTypeIn = (type: string): FontType | undefined => FONT_TYPES.find((font) => font === type);
// Browsers match family names regardless of case, so the library does too.
const sameName = (a: string, b: string) => NAMES.compare(a, b) === 0;
const byWeight = (a: FontFamily['faces'][number], b: FontFamily['faces'][number]) =>
  a.weightMin - b.weightMin || a.weightMax - b.weightMax || a.style.localeCompare(b.style);

/** Every family, bundled first, then uploaded ones by name, their faces by weight then style. */
export function listFonts(db: Queryable): FontFamily[] {
  const rows = db
    .select({ face: fontFaces, contentType: media.contentType })
    .from(fontFaces)
    .innerJoin(media, eq(fontFaces.mediaId, media.id))
    .all();
  const uploaded = new Map<string, FontFamily>();
  for (const { face, contentType } of rows) {
    const format = fontTypeIn(contentType);
    if (!format) continue;
    const family = uploaded.get(face.family) ?? { name: face.family, bundled: false, faces: [] };
    family.faces.push({
      id: face.id,
      weightMin: face.weightMin,
      weightMax: face.weightMax,
      style: face.style,
      format,
      url: `/media/${face.mediaId}`,
    });
    uploaded.set(face.family, family);
  }
  for (const family of uploaded.values()) family.faces.sort(byWeight);
  const families = [...uploaded.values()].toSorted((a, b) => NAMES.compare(a.name, b.name));
  return [...BUNDLED_FAMILIES, ...families];
}

/** The bundled family with this name, ignoring case, if there is one: uploads may not use a bundled family's name. */
export const bundledFamilyNamed = (name: string) => BUNDLED_FAMILIES.find((family) => sameName(family.name, name));

/** The name an upload's family is stored under: an existing family's spelling when the names differ only in case. */
export function familyName(db: Queryable, name: string): string {
  const existing = db.selectDistinct({ family: fontFaces.family }).from(fontFaces).all();
  return existing.find(({ family }) => sameName(family, name))?.family ?? name;
}

/** Whether `family` already has a face with these weights and style. */
export function fontFaceTaken(db: Queryable, face: Omit<NewFontFace, 'mediaId'>): boolean {
  return db
    .select({
      id: fontFaces.id,
      family: fontFaces.family,
      weightMin: fontFaces.weightMin,
      weightMax: fontFaces.weightMax,
      style: fontFaces.style,
    })
    .from(fontFaces)
    .all()
    .some(
      (row) =>
        sameName(row.family, face.family) &&
        row.weightMin === face.weightMin &&
        row.weightMax === face.weightMax &&
        row.style === face.style,
    );
}

/** Adds an uploaded face, and returns its family as the library lists it. */
export function addFontFace(db: Queryable, face: NewFontFace): FontFamily {
  db.insert(fontFaces)
    .values({ id: randomUUID(), ...face, createdAt: new Date().toISOString() })
    .run();
  const family = listFonts(db).find((f) => !f.bundled && f.name === face.family);
  if (!family) throw new Error(`Font family ${face.family} vanished while adding a face`);
  return family;
}

/** Deletes an uploaded face. Returns its media id for the caller to remove, or undefined when there's no such face. */
export function deleteFontFace(db: Queryable, id: string): string | undefined {
  const row = db.select().from(fontFaces).where(eq(fontFaces.id, id)).get();
  if (!row) return undefined;
  db.delete(fontFaces).where(eq(fontFaces.id, id)).run();
  return row.mediaId;
}
```

Uploads of every kind share one helper. The team image routes move onto it:

Create `rcl-core/server/src/routes/uploads.ts`:

```ts
import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiError } from '@rollcall/core-contract';
import { sendApiError } from '../http.ts';

/** What one kind of upload accepts, and what it says when a body is too big or of the wrong type. */
export interface UploadKind {
  types: readonly string[];
  maxBytes: number;
  tooLarge: ApiError;
  unsupported: ApiError;
}

// Upload routes take the raw file as their body, with its type as the Content-Type (ADR-0022). They live in a plugin
// of their own, so only they accept those bodies, up to the kind's limit, and say too_large or unsupported_… when a
// body is too big or of the wrong type. The access check runs before any body is read, so a refused caller never
// sends one. JSON bodies still parse here, and a route refuses one the way it refuses any non-file body.
export function registerUploads(
  fastify: FastifyInstance,
  kind: UploadKind,
  routes: (uploads: FastifyInstance) => void,
): void {
  void fastify.register(async (uploads) => {
    uploads.addContentTypeParser(
      [...kind.types],
      { parseAs: 'buffer', bodyLimit: kind.maxBytes },
      (_request, body, done) => done(null, body),
    );
    uploads.setErrorHandler<FastifyError>((error, request, reply) => {
      if (error.statusCode === 413) return reply.code(413).send(kind.tooLarge);
      if (error.statusCode === 415) return reply.code(415).send(kind.unsupported);
      return sendApiError(error, request, reply);
    });
    routes(uploads);
  });
}
```

In `rcl-core/server/src/routes/team-images.ts`:

Replace:

```ts
import type { FastifyError, FastifyInstance } from 'fastify';
```
with:

```ts
import type { FastifyInstance } from 'fastify';
```


Replace:

```ts
import { ERROR_RESPONSES, sendApiError } from '../http.ts';
import { removeMedia, saveMedia } from '../media.ts';
import { findMember, findTeamRow, updateMember, updateTeam } from '../teams/teams.ts';
```
with:

```ts
import { ERROR_RESPONSES } from '../http.ts';
import { removeMedia, saveMedia } from '../media.ts';
import { findMember, findTeamRow, updateMember, updateTeam } from '../teams/teams.ts';
import { registerUploads } from './uploads.ts';
```


Replace:

```ts
// keeps it only if its bytes are a PNG, JPEG or WebP, then deletes the image it replaces. Like every route, the body is
// read before the access check, so the 5 MB limit also caps what a refused caller can send.
export function registerTeamImageRoutes(fastify: FastifyInstance, deps: { db: AppDatabase; mediaDir: string }) {
  // A plugin of their own, so only these routes accept image bodies and say too_large or unsupported_image.
  void fastify.register(async (uploads) => {
    uploads.addContentTypeParser(
      [...IMAGE_TYPES],
      { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES },
      (_request, body, done) => done(null, body),
    );
    uploads.setErrorHandler<FastifyError>((error, request, reply) => {
      if (error.statusCode === 413) return reply.code(413).send(TOO_LARGE);
      if (error.statusCode === 415) return reply.code(415).send(UNSUPPORTED);
      return sendApiError(error, request, reply);
    });
    imageRoutes(uploads, deps);
  });
```
with:

```ts
// keeps it only if its bytes are a PNG, JPEG or WebP, then deletes the image it replaces.
export function registerTeamImageRoutes(fastify: FastifyInstance, deps: { db: AppDatabase; mediaDir: string }) {
  registerUploads(
    fastify,
    { types: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES, tooLarge: TOO_LARGE, unsupported: UNSUPPORTED },
    (uploads) => imageRoutes(uploads, deps),
  );
```


Replace `rcl-core/server/src/routes/fonts.ts` with:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { FONT_TYPES, FontFamilySchema, MAX_FONT_BYTES, UploadFontFaceQuerySchema } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import type { Access } from '../auth/access.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { fontTypeOf, removeMedia, saveMedia } from '../media.ts';
import {
  addFontFace,
  bundledFamilyNamed,
  deleteFontFace,
  familyName,
  fontFaceTaken,
  listFonts,
} from '../fonts/fonts.ts';
import { registerUploads } from './uploads.ts';

const READ: { config: { access: Access } } = { config: { access: { permission: 'core:fonts.read' } } };
const MANAGE: { config: { access: Access } } = { config: { access: { permission: 'core:fonts.manage' } } };
const FaceParamsSchema = z.strictObject({ id: z.string() });
const UNSUPPORTED = { error: 'unsupported_font', message: 'Use a WOFF2, WOFF, TTF or OTF font' };
const TOO_LARGE = { error: 'too_large', message: 'That font is over 5 MB' };
const TAGS = ['core/fonts'];

const weightLabel = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

// The font library (docs/features/theme-builder.md): every family, bundled and uploaded, with its faces' addresses.
// Admins upload a face as the raw font file, with its family, weight and style in the query string, and remove it.
// The checks run with no `await` before their write, so two uploads can't both take a face.
export function registerFontRoutes(fastify: FastifyInstance, { db, mediaDir }: { db: AppDatabase; mediaDir: string }) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/fonts',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'List font families, bundled first, each with its faces',
        response: { 200: FontFamilySchema.array(), ...ERROR_RESPONSES },
      },
    },
    async () => listFonts(db),
  );

  api.delete(
    '/fonts/faces/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Remove an uploaded font face, with its file',
        params: FaceParamsSchema,
        response: { 204: z.undefined(), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const mediaId = deleteFontFace(db, request.params.id);
      if (mediaId === undefined) return reply.code(404).send({ error: 'not_found' });
      removeMedia(db, mediaDir, [mediaId]);
      return reply.code(204).send();
    },
  );

  registerUploads(
    fastify,
    { types: FONT_TYPES, maxBytes: MAX_FONT_BYTES, tooLarge: TOO_LARGE, unsupported: UNSUPPORTED },
    (uploads) => {
      uploads.withTypeProvider<ZodTypeProvider>().post(
        '/fonts/faces',
        {
          ...MANAGE,
          bodyLimit: MAX_FONT_BYTES,
          schema: {
            tags: TAGS,
            summary: 'Upload a font face: the body is the file (WOFF2, WOFF, TTF or OTF, up to 5 MB)',
            consumes: [...FONT_TYPES],
            querystring: UploadFontFaceQuerySchema,
            response: { 201: FontFamilySchema, ...ERROR_RESPONSES },
          },
        },
        async (request, reply) => {
          const { weightMin, weightMax, style } = request.query;
          const bundled = bundledFamilyNamed(request.query.family);
          if (bundled) {
            return reply.code(409).send({
              error: 'family_bundled',
              message: `${bundled.name} comes with Rollcall. Upload yours under another family name.`,
            });
          }
          const family = familyName(db, request.query.family);
          const face = { family, weightMin, weightMax, style };
          if (fontFaceTaken(db, face)) {
            return reply.code(409).send({
              error: 'face_taken',
              message: `${family} already has a ${weightLabel(weightMin, weightMax)} ${style} face`,
            });
          }
          const mediaId = Buffer.isBuffer(request.body) ? saveMedia(db, mediaDir, request.body, fontTypeOf) : null;
          if (!mediaId) return reply.code(415).send(UNSUPPORTED);
          return reply.code(201).send(addFontFace(db, { ...face, mediaId }));
        },
      );
    },
  );
}
```

In `rcl-core/server/src/core-app.ts`:

Replace:

```ts
      registerFontRoutes(fastify, { db });
```
with:

```ts
      registerFontRoutes(fastify, { db, mediaDir });
```


- [ ] **Step 6: The server rule and the data model.**

In `.claude/rules/rcl-core-server.md`:

Replace:

```markdown
- **Uploaded images** go through `src/media.ts` (ADR-0022): `saveMedia` keeps only real PNG, JPEG or WebP bytes, and `removeMedia` deletes the row and file once nothing points at them.
  - A new column that refers to media goes in `MEDIA_REFERENCES` (`src/db/schema.ts`), or the startup sweep deletes its images.
  - `/media/<id>` is public, outside `/api`, and `media` is a reserved app id.
  - Upload routes take the raw image body in a plugin of their own, with the image content types and a 5 MB `bodyLimit` (`src/routes/team-images.ts`).
```
with:

```markdown
- **Uploaded images and fonts** go through `src/media.ts` (ADR-0022): `saveMedia` keeps only real PNG, JPEG or WebP bytes, or with `fontTypeOf` real WOFF2, WOFF, TTF or OTF bytes, and `removeMedia` deletes the row and file once nothing points at them.
  - A new column that refers to media goes in `MEDIA_REFERENCES` (`src/db/schema.ts`), or the startup sweep deletes its files.
  - `/media/<id>` is public, outside `/api`, and `media` is a reserved app id.
  - Upload routes take the raw body in a plugin of their own, with their content types and a 5 MB `bodyLimit`, through `registerUploads` (`src/routes/uploads.ts`).
- **Bundled fonts** are in `fonts/`, listed in `src/fonts/bundled.ts` and served at `/fonts/<folder>/<file>` to anyone, so `fonts` is a reserved app id too.
```


In `docs/architecture/data-model.md`:

Replace:

```markdown
| Media | An uploaded image, such as a team logo or a member photo: a file in the data folder's `media/`, with its type ([ADR-0022](../decisions/0022-public-media.md)) | [Team Builder](../features/team-builder.md) |
```
with:

```markdown
| Media | An uploaded file, such as a team logo, a member photo or a font: a file in the data folder's `media/`, with its type ([ADR-0022](../decisions/0022-public-media.md)) | [Team Builder](../features/team-builder.md) |
| Font face | One uploaded font file in the font library: its family, weights and style, and its media | [Theme Builder](../features/theme-builder.md) |
```


- [ ] **Step 7: Run them and see them pass.**

Run: the command from Step 2, plus `rcl-core/server/src/routes/team-images.test.ts`.
Expected: PASS. The four files from Step 2 pass 38 tests, and `yarn test` passes 403.

- [ ] **Step 8: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core .claude/rules docs/architecture
git commit -F - <<'EOF'
feat(rcl-core): upload and remove fonts

Admins upload WOFF2, WOFF, TTF or OTF faces of up to 5 MB into the font
library, by family, weight (or a range for a variable font) and style.
The server keeps a file only if its bytes are a font, in the media store.
Family names match regardless of case, a bundled family's name can't be
used, and a family has one face per weights and style. Removing a face
deletes its file. Font and image uploads share one upload helper.

Refs #19

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Fonts for apps, through `AppContext`

**Files:**
- Create: `docs/decisions/0023-core-data-services-for-apps.md`
- Modify: `packages/app-sdk/src/index.ts`, `rcl-core/server/src/apps.ts`, `.claude/rules/sdk.md`, `docs/architecture/README.md`, `docs/decisions/README.md` (generated)
- Test: `rcl-core/server/src/apps.test.ts`, `rcl-core/server/src/routes/fonts.test.ts`

**Interfaces:**
- Consumes from Task 2: `listFonts(db)`.
- Produces:
  - `FontsService { list(): FontFamily[] }` and `AppContext.fonts: FontsService` (`@rollcall/app-sdk`);
  - `hostApps(…).contextFor(module)` returns the same `AppContext` each time for one app.

- [ ] **Step 1: Write the failing tests.**

In `rcl-core/server/src/apps.test.ts`:

Replace:

```ts
});

describe("an app's tables", () => {
```
with:

```ts
});

describe("an app's context", () => {
  it('is one object per app, so its register() and realtime() can share state through it', () => {
    const demo = app();
    const { hosted } = host([demo]);
    expect(hosted.contextFor(demo)).toBe(hosted.contextFor(demo));
    expect(hosted.contextFor(demo)).not.toBe(hosted.contextFor(core));
  });
});

describe("an app's tables", () => {
```


In `rcl-core/server/src/routes/fonts.test.ts`:

Replace:

```ts
import { afterEach, describe, expect, it } from 'vitest';
```
with:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { AppContext, AppModule } from '@rollcall/app-sdk';
```


Replace:

```ts
async function as(role: Role = 'admin') {
  const { app, db, mediaDir } = testApp();
```
with:

```ts
async function as(role: Role = 'admin', options: Parameters<typeof testApp>[0] = {}) {
  const { app, db, mediaDir } = testApp(options);
```


Replace:

```ts
    }
  });
});
```
with:

```ts
    }
  });
});

describe('fonts for apps', () => {
  it('gives an app module the same list as GET /fonts, as it is now', async () => {
    let fonts: AppContext['fonts'] | undefined;
    const demo: AppModule = {
      id: 'demo',
      title: 'Demo',
      version: '1.0.0',
      requiresCore: '*',
      permissions: [],
      register: (_api, ctx) => {
        fonts = ctx.fonts;
      },
    };
    const { upload, list } = await as('admin', { apps: [demo] });
    await upload('family=Rollerball&weight=700', FONTS.woff2);
    expect(uploaded(fonts?.list() ?? [])).toHaveLength(1);
    expect(fonts?.list()).toEqual(await list());
  });
});
```


- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server/src/apps.test.ts rcl-core/server/src/routes/fonts.test.ts`
Expected: FAIL, 2 tests.
- "is one object per app…": each call makes a new context.
- "gives an app module the same list as GET /fonts…": `ctx.fonts` is undefined, so the list is empty.

- [ ] **Step 3: Add the service, and make one context per app.**

In `packages/app-sdk/src/index.ts`:

Replace:

```ts
import type { Role } from '@rollcall/core-contract';
```
with:

```ts
import type { FontFamily, Role } from '@rollcall/core-contract';
```


Replace:

```ts
/** What core gives each app while hosting it. Core data services (teams, players, logos), CRG and OBS come later. */
```
with:

```ts
/** The font library (docs/features/theme-builder.md). Read-only: fonts change through core's own routes. */
export interface FontsService {
  /** Every family as it is now, bundled first, then uploaded ones by name: the same list as `GET /api/core/fonts`. */
  list(): FontFamily[];
}

/**
 * What core gives each app while hosting it: one object per app, passed to both `register()` and `realtime()`, so an
 * app can share state between them through it. Core's data comes through read-only services, fonts first (ADR-0023).
 * Teams, CRG and OBS come later.
 */
```


Replace:

```ts
  db<S extends Record<string, unknown>>(schema: S): BetterSQLite3Database<S>;
```
with:

```ts
  db<S extends Record<string, unknown>>(schema: S): BetterSQLite3Database<S>;
  fonts: FontsService;
```


In `rcl-core/server/src/apps.ts`:

Replace:

```ts
import type { AppDatabase } from './db.ts';
```
with:

```ts
import type { AppDatabase } from './db.ts';
import { listFonts } from './fonts/fonts.ts';
```


Replace:

```ts
  }
  return {
```
with:

```ts
  }
  // One context per app, made the first time it's asked for, so its register() and realtime() get the same object.
  const contexts = new Map<string, AppContext>();
  const newContext = (module: AppModule): AppContext => ({
    log: log.child({ app: module.id }),
    coreVersion,
    db: (schema) => drizzle(db.$client, { schema }),
    fonts: { list: () => listFonts(db) },
  });
  return {
```


Replace:

```ts
    contextFor: (module) => ({
      log: log.child({ app: module.id }),
      coreVersion,
      db: (schema) => drizzle(db.$client, { schema }),
    }),
```
with:

```ts
    contextFor: (module) => {
      const ctx = contexts.get(module.id) ?? newContext(module);
      contexts.set(module.id, ctx);
      return ctx;
    },
```


- [ ] **Step 4: Record the decision.**

Create `docs/decisions/0023-core-data-services-for-apps.md`:

```markdown
---
title: rcl-core shares data with apps through read-only services
status: accepted
date: 2026-10-24
---
# 0023. rcl-core shares data with apps through read-only services

## Context

[ADR-0019](0019-rcl-apps-as-modules.md) keeps apps out of rcl-core's internals: core's data must be added to `AppContext` on purpose, one service at a time. The [Theme Builder](../features/theme-builder.md) needs the first one. Themes live in rcl-producer, but the fonts they use are in rcl-core's font library, shared data like team logos. The Producer app must read that library to send the OBS overlay the right fonts.

Options considered:
- **Apps read core's tables,** passing core's schema to `ctx.db()`. Rejected: every core migration could break an app without a compile error, and the boundary test already keeps apps away from core's server code.
- **Apps call core's HTTP API** over the loopback. Rejected: the server would need credentials for itself, and each call would pay for HTTP and an access check it doesn't need.
- **Each app keeps its own copy** of the data it needs. Rejected: copies drift, and the data is shared on purpose.

## Decision

- **rcl-core shares its data with apps through read-only services on `AppContext`,** added one at a time. Each returns data in a shape from `@rollcall/core-contract`, the same one core's routes reply with.
- **Fonts are the first:** `ctx.fonts.list()` returns the font library as `GET /api/core/fonts` lists it.
- **Apps read core data only through these services,** never through core's tables or code.
- **The services are read-only.** Core's data changes only through core's own routes, which check the caller's access (hard rule 5). A service that writes needs an ADR of its own.
- **A service returns the data as it is when called.** It doesn't announce changes; an app reads again when it needs to.
- **Each app gets one `AppContext`,** passed to both `register()` and `realtime()`, so an app can share state between its routes and its namespaces through it.

## Consequences

- Core's tables can change without breaking apps, as long as each service keeps its shape. Changing a shape is a breaking change to `@rollcall/core-contract` and needs a new `requiresCore` range in every app that uses it.
- An app can't notice core's changes as they happen. A font uploaded while an overlay is open reaches it with the next theme change, or the next time it loads. Announcing changes is left until an app needs it.
- Teams, CRG and OBS will follow as services, each added when an app first needs it.
```

Then run `node scripts/check-docs.mjs --fix`, which adds it to `docs/decisions/README.md`.

In `docs/architecture/README.md`:

Replace:

```markdown
| `packages/app-sdk` | The types an app module is written against: `AppModule`, `AppContext`, `Access` and permissions |
```
with:

```markdown
| `packages/app-sdk` | The types an app module is written against: `AppModule`, `AppContext` with core's read-only data services ([ADR-0023](../decisions/0023-core-data-services-for-apps.md)), `Access` and permissions |
```


Replace:

```markdown
- [ADR-0022](../decisions/0022-public-media.md): Uploaded images are files in the data folder, served to anyone at unguessable `/media/<id>` addresses, so OBS overlays can show them.
```
with:

```markdown
- [ADR-0022](../decisions/0022-public-media.md): Uploaded images are files in the data folder, served to anyone at unguessable `/media/<id>` addresses, so OBS overlays can show them.
- [ADR-0023](../decisions/0023-core-data-services-for-apps.md): rcl-core shares its data with apps through read-only services on `AppContext`, fonts first; apps never read core's tables.
```


In `.claude/rules/sdk.md`:

Replace:

```markdown
- **`@rollcall/app-sdk`** (`packages/app-sdk/`) is what an rcl app's server module is written against (ADR-0019): `AppModule`, `AppContext`, `Realtime`, and the `Access`, `Permission` and `PermissionDef` types. `PermissionDef.peopleOnly` keeps a permission off API keys (ADR-0020). Types only: rcl-core's server does the hosting.
```
with:

```markdown
- **`@rollcall/app-sdk`** (`packages/app-sdk/`) is what an rcl app's server module is written against (ADR-0019): `AppModule`, `AppContext`, `Realtime`, and the `Access`, `Permission` and `PermissionDef` types. `PermissionDef.peopleOnly` keeps a permission off API keys (ADR-0020). Types only: rcl-core's server does the hosting.
  - `AppContext` is one object per app, passed to both `register()` and `realtime()`. Core's data reaches apps only through its read-only services, such as `fonts.list()` (ADR-0023), never through core's tables.
```


- [ ] **Step 5: Run them and see them pass.**

Run: the command from Step 2.
Expected: PASS, 19 tests. `yarn test` passes 405.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add packages/app-sdk rcl-core/server .claude/rules docs
git commit -F - <<'EOF'
feat(sdk): AppContext.fonts, core's first data service for apps

Apps read rcl-core's font library through ctx.fonts.list(), the same
list as GET /api/core/fonts, never through core's tables (ADR-0023).
Core now makes each app's context once, so an app's routes and its
namespaces can share state through it.

Refs #19

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: The theme contract

**Files:**
- Create: `rcl-producer/contract/src/themes.ts`
- Modify: `rcl-producer/contract/src/index.ts`, `rcl-producer/contract/package.json`, `.claude/rules/rcl-producer-contract.md`
- Test: `rcl-producer/contract/src/themes.test.ts` (new)

**Interfaces:**
- Consumes from Task 1: `FontFamilyNameSchema`, `FontFamilySchema`, `FontFamily` and `fontFaceRules` from `@rollcall/core-contract`.
- Produces, from `@rollcall/producer-contract`:
  - `ThemeTokensSchema` and `ThemeTokens`: `colors` (`text`, `textMuted`, `surface`, `surfaceAlt`, `accent`, `onAccent`, `border`), `fonts` (`heading` and `body` as `{ family, weight }`, `size`, `headingCase`), `shape` (`radius`, `borderWidth`) and `extras` (`{ name, color }[]`);
  - `HEADING_CASES`, `MAX_EXTRA_COLORS` (10) and `DEFAULT_TOKENS`, the built-in look;
  - `ThemeSchema` `{ id, name, tokens, isDefault, createdAt, updatedAt }` and `Theme`;
  - `CreateThemeRequestSchema` `{ name, tokens? }`, `UpdateThemeRequestSchema` `{ name?, tokens? }`, `SetDefaultThemeRequestSchema` `{ themeId: string | null }`, and their types;
  - `OverlayThemeSchema` `{ tokens, families }` and `OverlayTheme`;
  - `ThemeCss { variables: Record<string, string>; fontFaces: string }` and `themeToCss(tokens, families): ThemeCss`.

- [ ] **Step 1: Write the failing tests.**

Create `rcl-producer/contract/src/themes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fontFaceRules, type FontFamily } from '@rollcall/core-contract';
import {
  CreateThemeRequestSchema,
  DEFAULT_TOKENS,
  OverlayThemeSchema,
  SetDefaultThemeRequestSchema,
  ThemeSchema,
  ThemeTokensSchema,
  themeToCss,
  UpdateThemeRequestSchema,
  type ThemeTokens,
} from './themes.ts';

// DEFAULT_TOKENS with `change` made to a copy of them (parsing makes the copy).
function tokens(change?: (draft: ThemeTokens) => void): ThemeTokens {
  const draft = ThemeTokensSchema.parse(DEFAULT_TOKENS);
  change?.(draft);
  return draft;
}

// The built-in look with gold extra colors of these names.
const extras = (names: string[]) =>
  tokens((draft) => (draft.extras = names.map((name) => ({ name, color: '#ffd700' }))));

// The first message the token schema gives for `draft`, or undefined when it's accepted.
const problem = (draft: unknown) => ThemeTokensSchema.safeParse(draft).error?.issues[0]?.message;

const family = (name: string, faces: [number, number, 'normal' | 'italic'][]): FontFamily => ({
  name,
  bundled: false,
  faces: faces.map(([weightMin, weightMax, style], index) => ({
    id: `${name}-${index}`,
    weightMin,
    weightMax,
    style,
    format: 'font/woff2',
    url: `/media/${name}-${index}`,
  })),
});
const INTER = family('Inter', [[100, 900, 'normal']]);
const OSWALD = family('Oswald', [[200, 700, 'normal']]);
const ROLLERBALL = family('Rollerball', [
  [400, 400, 'normal'],
  [700, 700, 'italic'],
]);
const LIBRARY = [INTER, OSWALD, ROLLERBALL];

describe('ThemeTokensSchema', () => {
  it('accepts the built-in look, whose fonts are Inter', () => {
    expect(ThemeTokensSchema.parse(DEFAULT_TOKENS)).toEqual(DEFAULT_TOKENS);
    expect([DEFAULT_TOKENS.fonts.heading.family, DEFAULT_TOKENS.fonts.body.family]).toEqual(['Inter', 'Inter']);
  });

  it('accepts #rrggbb and #rrggbbaa colors, and stores them lowercase', () => {
    const parsed = ThemeTokensSchema.parse(
      tokens((draft) => {
        draft.colors.text = ' #AABBCC ';
        draft.colors.surface = '#11223344';
      }),
    );
    expect([parsed.colors.text, parsed.colors.surface]).toEqual(['#aabbcc', '#11223344']);
  });

  it('refuses any other color, in plain words', () => {
    for (const color of ['red', '#abc', '#1234567', 'rgb(0 0 0)', '']) {
      expect(problem(tokens((draft) => void (draft.colors.accent = color))), color).toBe('Use a color like #1a2b3c');
    }
  });

  it('needs every token, and nothing else', () => {
    const { border: _border, ...colors } = DEFAULT_TOKENS.colors;
    expect(problem({ ...DEFAULT_TOKENS, colors })).toBeDefined();
    expect(problem({ ...DEFAULT_TOKENS, motion: 'fade' })).toBeDefined();
  });

  it('takes weights from 100 to 900 in steps of 100', () => {
    for (const weight of [100, 500, 900]) {
      expect(problem(tokens((draft) => void (draft.fonts.body.weight = weight))), `${weight}`).toBeUndefined();
    }
    for (const weight of [0, 450, 1000]) {
      expect(problem(tokens((draft) => void (draft.fonts.heading.weight = weight))), `${weight}`).toBe(
        'Use a weight from 100 to 900, in steps of 100',
      );
    }
  });

  it('keeps sizes, corners and borders within their limits, in whole pixels', () => {
    const cases: [(draft: ThemeTokens, value: number) => void, number[], number[], string][] = [
      [(draft, value) => void (draft.fonts.size = value), [12, 96], [11, 97, 16.5], 'Use 12 to 96 pixels'],
      [(draft, value) => void (draft.shape.radius = value), [0, 64], [-1, 65, 1.5], 'Use 0 to 64 pixels'],
      [(draft, value) => void (draft.shape.borderWidth = value), [0, 16], [-1, 17], 'Use 0 to 16 pixels'],
    ];
    for (const [set, good, bad, message] of cases) {
      for (const value of good) expect(problem(tokens((draft) => set(draft, value))), `${value}`).toBeUndefined();
      for (const value of bad) expect(problem(tokens((draft) => set(draft, value))), `${value}`).toBe(message);
    }
  });

  it('cases headings as they are or in capitals, and nothing else', () => {
    expect(problem(tokens((draft) => void (draft.fonts.headingCase = 'uppercase')))).toBeUndefined();
    expect(problem({ ...DEFAULT_TOKENS, fonts: { ...DEFAULT_TOKENS.fonts, headingCase: 'lowercase' } })).toBeDefined();
  });

  it('refuses a family name that could break out of the CSS', () => {
    for (const name of ['Inter"; } body { color: red', "Inter'", 'Inter;']) {
      expect(problem(tokens((draft) => void (draft.fonts.heading.family = name))), name).toBe(
        'Use 1–64 letters, digits, spaces, dashes or underscores',
      );
    }
  });

  it('takes up to 10 extra colors, each with its own lowercase name', () => {
    expect(problem(extras(['gold', 'team-2', `a${'b'.repeat(23)}`]))).toBeUndefined();
    expect(problem(extras(Array.from({ length: 11 }, (_, index) => `extra-${index}`)))).toBe(
      'Use at most 10 extra colors',
    );
    for (const name of ['Gold', '2nd', '-gold', 'gold!', `a${'b'.repeat(24)}`, '']) {
      expect(problem(extras([name])), name).toBe('Use lowercase letters, digits and dashes, starting with a letter');
    }
    expect(problem(extras(['gold', 'gold']))).toBe('Give each extra color its own name');
  });
});

describe('theme requests and replies', () => {
  it('trims a new theme’s name and leaves its tokens to the server when none are sent', () => {
    expect(CreateThemeRequestSchema.parse({ name: '  Derby Night ' })).toEqual({ name: 'Derby Night' });
    expect(CreateThemeRequestSchema.parse({ name: 'Derby Night', tokens: DEFAULT_TOKENS }).tokens).toEqual(
      DEFAULT_TOKENS,
    );
  });

  it('refuses a blank or overlong name', () => {
    expect(CreateThemeRequestSchema.safeParse({ name: '   ' }).error?.issues[0]?.message).toBe('Give the theme a name');
    expect(UpdateThemeRequestSchema.safeParse({ name: 'x'.repeat(65) }).error?.issues[0]?.message).toBe(
      'Use at most 64 characters',
    );
  });

  it('changes only what an update sends', () => {
    expect(UpdateThemeRequestSchema.parse({})).toEqual({});
    expect(UpdateThemeRequestSchema.parse({ tokens: DEFAULT_TOKENS })).toEqual({ tokens: DEFAULT_TOKENS });
  });

  it('sets or clears the default theme', () => {
    expect(SetDefaultThemeRequestSchema.parse({ themeId: 't1' })).toEqual({ themeId: 't1' });
    expect(SetDefaultThemeRequestSchema.parse({ themeId: null })).toEqual({ themeId: null });
    expect(SetDefaultThemeRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a theme as the server sends it, and the overlay’s theme', () => {
    const theme = {
      id: 't1',
      name: 'Derby Night',
      tokens: DEFAULT_TOKENS,
      isDefault: true,
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T11:00:00.000Z',
    };
    expect(ThemeSchema.parse(theme)).toEqual(theme);
    expect(OverlayThemeSchema.parse({ tokens: DEFAULT_TOKENS, families: [INTER] })).toEqual({
      tokens: DEFAULT_TOKENS,
      families: [INTER],
    });
  });
});

describe('themeToCss', () => {
  it('sets every variable from the tokens, with font stacks that fall back to the system font', () => {
    const { variables } = themeToCss(
      tokens((draft) => {
        draft.fonts.heading = { family: 'Oswald', weight: 700 };
        draft.fonts.headingCase = 'uppercase';
        draft.extras = [{ name: 'gold', color: '#ffd700' }];
      }),
      LIBRARY,
    );
    expect(variables).toEqual({
      '--theme-color-text': DEFAULT_TOKENS.colors.text,
      '--theme-color-text-muted': DEFAULT_TOKENS.colors.textMuted,
      '--theme-color-surface': DEFAULT_TOKENS.colors.surface,
      '--theme-color-surface-alt': DEFAULT_TOKENS.colors.surfaceAlt,
      '--theme-color-accent': DEFAULT_TOKENS.colors.accent,
      '--theme-color-on-accent': DEFAULT_TOKENS.colors.onAccent,
      '--theme-color-border': DEFAULT_TOKENS.colors.border,
      '--theme-font-heading': '"Oswald", system-ui, sans-serif',
      '--theme-font-heading-weight': '700',
      '--theme-font-body': '"Inter", system-ui, sans-serif',
      '--theme-font-body-weight': `${DEFAULT_TOKENS.fonts.body.weight}`,
      '--theme-font-size': `${DEFAULT_TOKENS.fonts.size}px`,
      '--theme-heading-transform': 'uppercase',
      '--theme-radius': `${DEFAULT_TOKENS.shape.radius}px`,
      '--theme-border-width': `${DEFAULT_TOKENS.shape.borderWidth}px`,
      '--theme-extra-gold': '#ffd700',
    });
  });

  it('declares only the heading and body families, each once, with every face’s weights and style', () => {
    const { fontFaces } = themeToCss(
      tokens((draft) => {
        draft.fonts.heading.family = 'Rollerball';
        draft.fonts.body.family = 'Oswald';
      }),
      LIBRARY,
    );
    expect(fontFaces).toBe(fontFaceRules([OSWALD, ROLLERBALL]));
    expect(fontFaces).toContain('font-weight: 200 700;');
    expect(fontFaces).toContain('font-style: italic;');
    expect(themeToCss(DEFAULT_TOKENS, LIBRARY).fontFaces).toBe(fontFaceRules([INTER]));
  });

  it('matches family names regardless of case, as browsers do', () => {
    const { fontFaces } = themeToCss(
      tokens((draft) => void (draft.fonts.body.family = 'oswald')),
      LIBRARY,
    );
    expect(fontFaces).toBe(fontFaceRules([INTER, OSWALD]));
  });

  it('declares nothing for a family missing from the library', () => {
    const missing = tokens((draft) => {
      draft.fonts.heading.family = 'Gone';
      draft.fonts.body.family = 'Gone';
    });
    expect(themeToCss(missing, LIBRARY).fontFaces).toBe('');
    expect(themeToCss(missing, LIBRARY).variables['--theme-font-body']).toBe('"Gone", system-ui, sans-serif');
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-producer/contract/src/themes.test.ts`
Expected: FAIL. The file doesn't load: `Cannot find module './themes.ts'`.

- [ ] **Step 3: Add the dependency on core's contract.**

Replace `rcl-producer/contract/package.json` with:

```json
{
  "name": "@rollcall/producer-contract",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@rollcall/core-contract": "workspace:^",
    "zod": "^4.6.5"
  }
}
```

Run `yarn install`. Expected: it links the workspace and reports no new packages.

- [ ] **Step 4: Write the contract.**

Create `rcl-producer/contract/src/themes.ts`:

```ts
import { z } from 'zod';
import { FontFamilyNameSchema, FontFamilySchema, fontFaceRules, type FontFamily } from '@rollcall/core-contract';

// Themes (docs/features/theme-builder.md): named sets of tokens that compile to the CSS custom properties every overlay
// component styles itself with (ADR-0006). The editor's preview and the OBS overlay both use themeToCss, so they match.

/** `#rrggbb`, or `#rrggbbaa` with transparency, stored lowercase. */
const ColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/, 'Use a color like #1a2b3c');

const pixels = (min: number, max: number) =>
  z
    .number()
    .int(`Use ${min} to ${max} pixels`)
    .min(min, `Use ${min} to ${max} pixels`)
    .max(max, `Use ${min} to ${max} pixels`);

const WEIGHT_RULE = 'Use a weight from 100 to 900, in steps of 100';
const FontTokenSchema = z.strictObject({
  family: FontFamilyNameSchema,
  weight: z.number().min(100, WEIGHT_RULE).max(900, WEIGHT_RULE).multipleOf(100, WEIGHT_RULE),
});

export const HEADING_CASES = ['none', 'uppercase'] as const;
export const MAX_EXTRA_COLORS = 10;

const ExtraColorSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,23}$/, 'Use lowercase letters, digits and dashes, starting with a letter'),
  color: ColorSchema,
});

/** Every token a theme sets. All are required, so a stored theme always styles every overlay component. */
export const ThemeTokensSchema = z.strictObject({
  colors: z.strictObject({
    text: ColorSchema,
    textMuted: ColorSchema,
    surface: ColorSchema,
    surfaceAlt: ColorSchema,
    accent: ColorSchema,
    onAccent: ColorSchema,
    border: ColorSchema,
  }),
  fonts: z.strictObject({
    heading: FontTokenSchema,
    body: FontTokenSchema,
    size: pixels(12, 96),
    headingCase: z.enum(HEADING_CASES),
  }),
  shape: z.strictObject({
    radius: pixels(0, 64),
    borderWidth: pixels(0, 16),
  }),
  /** Named extra colors, as `--theme-extra-<name>`. Overlay components rely only on the fixed tokens above. */
  extras: z
    .array(ExtraColorSchema)
    .max(MAX_EXTRA_COLORS, `Use at most ${MAX_EXTRA_COLORS} extra colors`)
    .refine(
      (extras) => new Set(extras.map((extra) => extra.name)).size === extras.length,
      'Give each extra color its own name',
    ),
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

/** The built-in look: what a new theme starts from, and what the overlay uses with no default theme. */
export const DEFAULT_TOKENS: ThemeTokens = {
  colors: {
    text: '#ffffff',
    textMuted: '#ffffffcc',
    surface: '#141821d9',
    surfaceAlt: '#252b38d9',
    accent: '#228be6',
    onAccent: '#ffffff',
    border: '#228be6',
  },
  fonts: {
    heading: { family: 'Inter', weight: 700 },
    body: { family: 'Inter', weight: 400 },
    size: 16,
    headingCase: 'none',
  },
  shape: { radius: 8, borderWidth: 2 },
  extras: [],
};

const ThemeNameSchema = z.string().trim().min(1, 'Give the theme a name').max(64, 'Use at most 64 characters');

export const ThemeSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  tokens: ThemeTokensSchema,
  /** Whether the OBS overlay uses it. At most one theme is the default. */
  isDefault: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Theme = z.infer<typeof ThemeSchema>;

/** A new theme. Without tokens, it starts from the built-in look. */
export const CreateThemeRequestSchema = z.strictObject({
  name: ThemeNameSchema,
  tokens: ThemeTokensSchema.optional(),
});
export type CreateThemeRequest = z.input<typeof CreateThemeRequestSchema>;

/** A missing field stays as it is. Tokens are replaced whole. */
export const UpdateThemeRequestSchema = z.strictObject({
  name: ThemeNameSchema.optional(),
  tokens: ThemeTokensSchema.optional(),
});
export type UpdateThemeRequest = z.input<typeof UpdateThemeRequestSchema>;

/** Makes a theme the default, or with null leaves no default. The reply is the same shape. */
export const SetDefaultThemeRequestSchema = z.strictObject({ themeId: z.string().nullable() });
export type SetDefaultThemeRequest = z.infer<typeof SetDefaultThemeRequestSchema>;

/** What the OBS overlay gets: the default theme's tokens, and only the font families they use. */
export const OverlayThemeSchema = z.strictObject({
  tokens: ThemeTokensSchema,
  families: z.array(FontFamilySchema),
});
export type OverlayTheme = z.infer<typeof OverlayThemeSchema>;

export interface ThemeCss {
  /** Each CSS custom property, such as `--theme-color-accent`, with its value. */
  variables: Record<string, string>;
  /** The `@font-face` rules for the heading and body families. Empty when neither is in the library. */
  fontFaces: string;
}

// A font stack that falls back to the system font, so a family missing from the library still shows text.
const fontStack = (family: string) => `"${family}", system-ui, sans-serif`;
// Browsers match family names regardless of case, so this does too. Names are ASCII letters, digits, spaces and dashes.
const sameFamily = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The CSS for a theme: its variables, and `@font-face` rules for the families it uses that are in `families`. */
export function themeToCss(tokens: ThemeTokens, families: readonly FontFamily[]): ThemeCss {
  const { colors, fonts, shape } = tokens;
  const variables: Record<string, string> = {
    '--theme-color-text': colors.text,
    '--theme-color-text-muted': colors.textMuted,
    '--theme-color-surface': colors.surface,
    '--theme-color-surface-alt': colors.surfaceAlt,
    '--theme-color-accent': colors.accent,
    '--theme-color-on-accent': colors.onAccent,
    '--theme-color-border': colors.border,
    '--theme-font-heading': fontStack(fonts.heading.family),
    '--theme-font-heading-weight': `${fonts.heading.weight}`,
    '--theme-font-body': fontStack(fonts.body.family),
    '--theme-font-body-weight': `${fonts.body.weight}`,
    '--theme-font-size': `${fonts.size}px`,
    '--theme-heading-transform': fonts.headingCase,
    '--theme-radius': `${shape.radius}px`,
    '--theme-border-width': `${shape.borderWidth}px`,
  };
  for (const extra of tokens.extras) variables[`--theme-extra-${extra.name}`] = extra.color;
  const used = families.filter((family) =>
    [fonts.heading.family, fonts.body.family].some((name) => sameFamily(name, family.name)),
  );
  return { variables, fontFaces: fontFaceRules(used) };
}
```

Replace `rcl-producer/contract/src/index.ts` with:

```ts
// The Producer app's contract (ADR-0019): Zod schemas for /api/producer and its Socket.IO namespaces, shared by its
// server and web app. Types come from z.infer. Naming: `FooSchema` for the schema, `Foo` for its type.
export * from './realtime.ts';
export * from './themes.ts';
```

The contract rule allowed only Zod as a runtime dependency:

Replace `.claude/rules/rcl-producer-contract.md` with:

```markdown
---
paths:
  - "rcl-producer/contract/**"
---
# rcl-producer contract (`rcl-producer/contract/`, ADR-0019)

- **The Producer app's Zod schemas:** `/api/producer`, its namespaces (such as the overlay's `server:hello`), and its import/export formats.
  - Types come from `z.infer`.
  - Name schemas `FooSchema` and their types `Foo`.
  - Prefer `z.strictObject`.
- **A schema change is a server *and* web change.** Update both, and their tests, in the same change.
- **Released import/export format versions never change.** Add a new version plus a migration instead (`docs/features/import-export.md`).
- **Keep it lean:** the Producer app's server, its web app and the overlay all use this package. No runtime dependencies beyond `zod` and `@rollcall/core-contract` (whose only one is `zod`), and no Node-only or DOM-only APIs.
- **Themes** (`src/themes.ts`): the token schema, `DEFAULT_TOKENS` (the built-in look) and `themeToCss`, which the editor's preview and the overlay both use. Token rules and variable names are in `docs/features/theme-builder.md`.
- **Tests:** every schema has tests for an accepted payload and for the rejected shapes that matter.
```

- [ ] **Step 5: Run them and see them pass.**

Run: `yarn vitest run rcl-producer/contract/src/themes.test.ts`
Expected: PASS, 18 tests. `yarn test` passes 423.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add rcl-producer/contract yarn.lock .claude/rules
git commit -F - <<'EOF'
feat(rcl-producer): theme tokens, the built-in look and themeToCss

The theme contract: every token a theme sets, with plain messages for
bad values, DEFAULT_TOKENS (the overlay's look today, in Inter), and
themeToCss, which turns tokens into the overlay's CSS variables and
@font-face rules for the families they use. The contract now uses core's
for the family-name rule and fontFaceRules.

Refs #20

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: The themes table and routes

**Files:**
- Create: `rcl-producer/server/drizzle.config.ts`, `rcl-producer/server/src/db/schema.ts`, migration `rcl-producer/server/drizzle/0000_themes.sql` (generated), `rcl-producer/server/src/themes/themes.ts`, `rcl-producer/server/src/routes/themes.ts`, `rcl-producer/server/src/testing.ts`
- Modify: `rcl-producer/server/package.json`, `rcl-producer/server/tsconfig.json`, `rcl-producer/server/src/index.ts`, `docs/features/users-and-access.md`, `docs/architecture/data-model.md`, `.claude/rules/rcl-producer-server.md`
- Test: `rcl-producer/server/src/routes/themes.test.ts` (new), `rcl-producer/server/src/index.test.ts`, `rcl-core/server/src/auth/route-inventory.test.ts`

**Interfaces:**
- Consumes from Task 4: `ThemeSchema`, `ThemeTokens`, `DEFAULT_TOKENS`, `CreateThemeRequestSchema`, `UpdateThemeRequestSchema`, `SetDefaultThemeRequestSchema`.
- Produces:
  - table `producer_themes` (`producerThemes`), and `producerApp.migrationsFolder`;
  - in `themes/themes.ts`: `ProducerDatabase`, `listThemes(db)`, `findTheme(db, id)`, `findDefaultTheme(db)`, `themeNameTaken(db, name, exceptId?)`, `createTheme(db, { name, tokens? })`, `updateTheme(db, id, change)`, `duplicateTheme(db, id)`, `deleteTheme(db, id)` (returns the deleted theme) and `setDefaultTheme(db, themeId | null): boolean`;
  - `registerThemeRoutes(fastify, { db })`: `GET /themes`, `GET /themes/:id`, `POST /themes`, `PATCH /themes/:id`, `POST /themes/:id/duplicate`, `DELETE /themes/:id` and `PUT /default-theme`;
  - `producer:themes.read` (`roles: ['producer']`) and `producer:themes.manage` (`roles: []`) in `producerApp.permissions`;
  - `testProducer({ fonts? }): { api, ctx, client }` and `tablesIn(client)` (`testing.ts`).

- [ ] **Step 1: Add the dependencies.**

The Producer app's server gets its own tables and typed routes. Every package here is one rcl-core's server already uses, at the same version; `@fastify/swagger` and `openapi-types` are peers of `fastify-type-provider-zod`.

Replace `rcl-producer/server/package.json` with:

```json
{
  "name": "@rollcall/producer-server",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "typecheck": "tsc -p tsconfig.json"
  },
  "rollcall": {
    "requiresCore": "^0.1.0"
  },
  "dependencies": {
    "@rollcall/app-sdk": "workspace:^",
    "@rollcall/core-contract": "workspace:^",
    "@rollcall/producer-contract": "workspace:^",
    "drizzle-orm": "^0.45.3",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@fastify/swagger": "^9.9.1",
    "@types/better-sqlite3": "^9.6.0",
    "@types/node": "^24",
    "better-sqlite3": "^13.0.3",
    "drizzle-kit": "^0.31.11",
    "fastify": "^5.12.5",
    "fastify-type-provider-zod": "^7.0.0",
    "openapi-types": "^12.1.3",
    "typescript": "^7.0.2"
  }
}
```

Replace `rcl-producer/server/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src", "drizzle.config.ts"]
}
```

Run `yarn install`. Expected: no `YN0002` warnings, and no new packages.

- [ ] **Step 2: Write the failing tests.**

A harness hosts the module as rcl-core does, without core's code:

Create `rcl-producer/server/src/testing.ts`:

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppContext } from '@rollcall/app-sdk';
import type { FontFamily } from '@rollcall/core-contract';
import { producerApp } from './index.ts';

// The Producer app hosted the way rcl-core hosts it, for its own tests: an in-memory database with its migrations
// run, a context with the fonts given, and its routes below /api/producer. Core's access checks aren't here: core's
// route inventory sweeps the Producer app's routes with every kind of caller.
export function testProducer({ fonts = [] }: { fonts?: FontFamily[] } = {}) {
  const client = new Database(':memory:');
  migrate(drizzle(client), {
    migrationsFolder: producerApp.migrationsFolder ?? '',
    migrationsTable: '__drizzle_migrations_producer',
  });
  const api = Fastify();
  api.setValidatorCompiler(validatorCompiler);
  api.setSerializerCompiler(serializerCompiler);
  const ctx: AppContext = {
    log: api.log,
    coreVersion: '0.1.0',
    db: (schema) => drizzle(client, { schema }),
    fonts: { list: () => fonts },
  };
  void api.register(async (scope) => producerApp.register?.(scope, ctx), { prefix: '/api/producer' });
  return { api, ctx, client };
}

/** The tables in `client`, apart from SQLite's own. */
export const tablesIn = (client: Database.Database) =>
  client
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
```

Create `rcl-producer/server/src/routes/themes.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TOKENS, ThemeSchema, type CreateThemeRequest, type ThemeTokens } from '@rollcall/producer-contract';
import { testProducer } from '../testing.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
});

const GOLD: ThemeTokens = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: '#ffd700' } };

// The Producer app with ways to call its theme routes.
function themes() {
  const { api } = testProducer();
  opened.push(api);
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    api.inject({ method, url: `/api/producer${url}`, ...(payload ? { payload } : {}) });
  const create = async (body: CreateThemeRequest) => ThemeSchema.parse((await call('POST', '/themes', body)).json());
  const list = async () => ThemeSchema.array().parse((await call('GET', '/themes')).json());
  const defaultName = async () => (await list()).filter((theme) => theme.isDefault).map((theme) => theme.name);
  return { call, create, list, defaultName };
}

describe('creating and reading themes', () => {
  it('starts a theme from the built-in look, with its name trimmed, not the default', async () => {
    const { call } = themes();
    const res = await call('POST', '/themes', { name: '  Derby Night ' });
    expect(res.statusCode).toBe(201);
    const theme = ThemeSchema.parse(res.json());
    expect(theme).toMatchObject({ name: 'Derby Night', tokens: DEFAULT_TOKENS, isDefault: false });
    expect(theme.updatedAt).toBe(theme.createdAt);
    expect(ThemeSchema.parse((await call('GET', `/themes/${theme.id}`)).json())).toEqual(theme);
  });

  it('keeps the tokens a new theme is sent', async () => {
    const { create } = themes();
    expect((await create({ name: 'Gold', tokens: GOLD })).tokens).toEqual(GOLD);
  });

  it('lists every theme by name, ignoring case', async () => {
    const { create, list } = themes();
    for (const name of ['league night', 'Bout 10', 'Bout 9', 'Default look']) await create({ name });
    expect((await list()).map((theme) => theme.name)).toEqual(['Bout 9', 'Bout 10', 'Default look', 'league night']);
  });

  it('answers 404 for a theme that does not exist', async () => {
    const { call } = themes();
    for (const [method, url, body] of [
      ['GET', '/themes/nope'],
      ['PATCH', '/themes/nope', { name: 'X' }],
      ['POST', '/themes/nope/duplicate'],
      ['DELETE', '/themes/nope'],
      ['PUT', '/default-theme', { themeId: 'nope' }],
    ] as const) {
      const res = await call(method, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json(), `${method} ${url}`).toEqual({ error: 'not_found' });
    }
  });

  it('refuses a name another theme has, exactly as trimmed', async () => {
    const { call, create } = themes();
    await create({ name: 'Derby Night' });
    const taken = await call('POST', '/themes', { name: ' Derby Night ' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'name_taken', message: 'That name is already taken' });
    expect((await call('POST', '/themes', { name: 'derby night' })).statusCode).toBe(201);
  });

  it('refuses tokens the contract refuses, saving nothing', async () => {
    const { call, list } = themes();
    const tokens = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: 'gold' } };
    const res = await call('POST', '/themes', { name: 'Gold', tokens });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ message: string }>().message).toContain('Use a color like #1a2b3c');
    expect(await list()).toEqual([]);
  });
});

describe('changing a theme', () => {
  it('renames it and replaces its tokens whole, leaving what is not sent', async () => {
    const { call, create } = themes();
    const theme = await create({ name: 'Derby Night' });
    const renamed = ThemeSchema.parse((await call('PATCH', `/themes/${theme.id}`, { name: 'Finals' })).json());
    expect(renamed).toMatchObject({ name: 'Finals', tokens: DEFAULT_TOKENS, createdAt: theme.createdAt });
    const recolored = ThemeSchema.parse((await call('PATCH', `/themes/${theme.id}`, { tokens: GOLD })).json());
    expect(recolored).toMatchObject({ name: 'Finals', tokens: GOLD });
    expect(recolored.updatedAt >= theme.updatedAt).toBe(true);
  });

  it('keeps its own name, but refuses another theme’s', async () => {
    const { call, create } = themes();
    const theme = await create({ name: 'Derby Night' });
    await create({ name: 'Finals' });
    expect((await call('PATCH', `/themes/${theme.id}`, { name: 'Derby Night' })).statusCode).toBe(200);
    expect((await call('PATCH', `/themes/${theme.id}`, { name: 'Finals' })).json()).toEqual({
      error: 'name_taken',
      message: 'That name is already taken',
    });
  });
});

describe('duplicating a theme', () => {
  it('copies it as "<name> copy", then "copy 2", never as the default', async () => {
    const { call, create } = themes();
    const theme = await create({ name: 'Derby Night', tokens: GOLD });
    await call('PUT', '/default-theme', { themeId: theme.id });
    const first = await call('POST', `/themes/${theme.id}/duplicate`);
    expect(first.statusCode).toBe(201);
    expect(ThemeSchema.parse(first.json())).toMatchObject({ name: 'Derby Night copy', tokens: GOLD, isDefault: false });
    const second = ThemeSchema.parse((await call('POST', `/themes/${theme.id}/duplicate`)).json());
    expect(second.name).toBe('Derby Night copy 2');
  });

  it('shortens a long name so the copy’s name still fits in 64 characters', async () => {
    const { call, create } = themes();
    const theme = await create({ name: 'x'.repeat(64) });
    const first = ThemeSchema.parse((await call('POST', `/themes/${theme.id}/duplicate`)).json());
    const second = ThemeSchema.parse((await call('POST', `/themes/${theme.id}/duplicate`)).json());
    expect(first.name).toBe(`${'x'.repeat(59)} copy`);
    expect(second.name).toBe(`${'x'.repeat(57)} copy 2`);
  });
});

describe('deleting a theme', () => {
  it('deletes it, and deleting the default leaves no default', async () => {
    const { call, create, list, defaultName } = themes();
    const theme = await create({ name: 'Derby Night' });
    await call('PUT', '/default-theme', { themeId: theme.id });
    expect((await call('DELETE', `/themes/${theme.id}`)).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect(await defaultName()).toEqual([]);
  });
});

describe('the default theme', () => {
  it('is at most one theme: choosing another switches the old one off, and null clears it', async () => {
    const { call, create, defaultName } = themes();
    const night = await create({ name: 'Derby Night' });
    const finals = await create({ name: 'Finals' });
    const chosen = await call('PUT', '/default-theme', { themeId: night.id });
    expect([chosen.statusCode, chosen.json()]).toEqual([200, { themeId: night.id }]);
    expect(await defaultName()).toEqual(['Derby Night']);
    await call('PUT', '/default-theme', { themeId: finals.id });
    expect(await defaultName()).toEqual(['Finals']);
    expect((await call('PUT', '/default-theme', { themeId: null })).json()).toEqual({ themeId: null });
    expect(await defaultName()).toEqual([]);
  });

  it('stays as it was when the theme asked for does not exist', async () => {
    const { call, create, defaultName } = themes();
    const night = await create({ name: 'Derby Night' });
    await call('PUT', '/default-theme', { themeId: night.id });
    expect((await call('PUT', '/default-theme', { themeId: 'nope' })).statusCode).toBe(404);
    expect(await defaultName()).toEqual(['Derby Night']);
  });
});
```

Replace `rcl-producer/server/src/index.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AppContext, Realtime } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import { SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/producer-contract';
import { producerApp } from './index.ts';
import { tablesIn, testProducer } from './testing.ts';

describe('the producer app module', () => {
  it('serves its web build with the OBS overlay page at /producer/overlay', () => {
    expect(producerApp.id).toBe('producer');
    expect(producerApp.web?.dir).toMatch(/rcl-producer\/web\/dist$/);
    expect(producerApp.web?.pages).toEqual({ overlay: 'overlay.html' });
  });

  it('creates only its themes table, in its own migrations table', async () => {
    const { api, client } = testProducer();
    await api.close();
    expect(tablesIn(client)).toEqual(['__drizzle_migrations_producer', 'producer_themes']);
  });

  it('greets every client of the public /producer/overlay namespace with the server it is talking to', () => {
    let onConnection: ((socket: { emit: (event: string, payload: unknown) => void }) => void) | undefined;
    const namespace = vi.fn<Realtime['namespace']>(
      () => ({ on: (_event: string, listener: typeof onConnection) => (onConnection = listener) }) as never,
    );
    producerApp.realtime?.({ namespace }, { coreVersion: '0.1.0' } as AppContext);

    expect(namespace).toHaveBeenCalledWith('/producer/overlay', {
      access: { public: expect.stringContaining('OBS browser sources') as string },
    });
    const emit = vi.fn<(event: string, payload: unknown) => void>();
    onConnection?.({ emit });
    expect(emit).toHaveBeenCalledWith(SERVER_HELLO_EVENT, { name: APP_NAME, version: '0.1.0' });
    expect(ServerHelloSchema.parse(emit.mock.calls[0]?.[1])).toEqual({ name: APP_NAME, version: '0.1.0' });
  });
});
```

Core's route inventory sweeps the Producer app's routes too, so the routes a key may call grow:

In `rcl-core/server/src/auth/route-inventory.test.ts`:

Replace:

```ts
      'DELETE /api/core/teams/:id/members/:memberId/photo',
```
with:

```ts
      'DELETE /api/core/teams/:id/members/:memberId/photo',
      'DELETE /api/producer/themes/:id',
```


Replace:

```ts
      'PATCH /api/core/teams/:id',
      'PATCH /api/core/teams/:id/members/:memberId',
```
with:

```ts
      'GET /api/producer/themes',
      'GET /api/producer/themes/:id',
      'PATCH /api/core/teams/:id',
      'PATCH /api/core/teams/:id/members/:memberId',
      'PATCH /api/producer/themes/:id',
```


Replace:

```ts
      'PUT /api/core/teams/:id/logo',
      'PUT /api/core/teams/:id/members/:memberId/photo',
```
with:

```ts
      'POST /api/producer/themes',
      'POST /api/producer/themes/:id/duplicate',
      'PUT /api/core/teams/:id/logo',
      'PUT /api/core/teams/:id/members/:memberId/photo',
      'PUT /api/producer/default-theme',
```


- [ ] **Step 3: Run them and see them fail.**

Run: `yarn vitest run rcl-producer/server/src/routes/themes.test.ts rcl-producer/server/src/index.test.ts rcl-core/server/src/auth/route-inventory.test.ts`
Expected: FAIL, 15 tests.
- All 13 in `routes/themes.test.ts`, and "creates only its themes table…": `Can't find meta/_journal.json file`, since there are no migrations yet.
- The route inventory's key sweep lacks the seven theme routes.

- [ ] **Step 4: The table, and generate the migration.**

Create `rcl-producer/server/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

// `yarn workspace @rollcall/producer-server db:generate --name <change>` writes a new migration to ./drizzle. rcl-core
// runs them at startup, in the Producer app's own migrations table (ADR-0019).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
```

Create `rcl-producer/server/src/db/schema.ts`:

```ts
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ThemeTokens } from '@rollcall/producer-contract';

// The Producer app's tables (docs/architecture/data-model.md), each named producer_… (ADR-0019).

// Themes (docs/features/theme-builder.md). Names are unique exactly as trimmed, and at most one theme is the default.
export const producerThemes = sqliteTable(
  'producer_themes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    tokens: text('tokens', { mode: 'json' }).$type<ThemeTokens>().notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('producer_themes_one_default')
      .on(table.isDefault)
      .where(sql`${table.isDefault} = 1`),
  ],
);
```

Then run:

```bash
yarn workspace @rollcall/producer-server db:generate --name themes
```

Expected: it writes `rcl-producer/server/drizzle/0000_themes.sql`, plus its snapshot and journal. The SQL should read:

```sql
CREATE TABLE `producer_themes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tokens` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `producer_themes_name_unique` ON `producer_themes` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `producer_themes_one_default` ON `producer_themes` (`is_default`) WHERE "producer_themes"."is_default" = 1;
```

- [ ] **Step 5: The themes, the routes and the permissions.**

Create `rcl-producer/server/src/themes/themes.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { DEFAULT_TOKENS, type Theme, type ThemeTokens } from '@rollcall/producer-contract';
import type * as schema from '../db/schema.ts';
import { producerThemes } from '../db/schema.ts';

// Themes (docs/features/theme-builder.md), in the Producer app's own table. Each function runs without awaiting, so a
// check and the write after it can't be split by another request.

export type ProducerDatabase = BetterSQLite3Database<typeof schema>;

const MAX_NAME = 64;
const NAMES = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const now = () => new Date().toISOString();

/** Every theme, by name. */
export const listThemes = (db: ProducerDatabase): Theme[] =>
  db
    .select()
    .from(producerThemes)
    .all()
    .toSorted((a, b) => NAMES.compare(a.name, b.name));

export const findTheme = (db: ProducerDatabase, id: string): Theme | undefined =>
  db.select().from(producerThemes).where(eq(producerThemes.id, id)).get();

/** The theme the OBS overlay uses, if one is chosen. */
export const findDefaultTheme = (db: ProducerDatabase): Theme | undefined =>
  db.select().from(producerThemes).where(eq(producerThemes.isDefault, true)).get();

/** Whether a theme other than `exceptId` has exactly this name. */
export const themeNameTaken = (db: ProducerDatabase, name: string, exceptId?: string): boolean =>
  db
    .select({ id: producerThemes.id })
    .from(producerThemes)
    .where(eq(producerThemes.name, name))
    .all()
    .some((row) => row.id !== exceptId);

export function createTheme(db: ProducerDatabase, { name, tokens }: { name: string; tokens?: ThemeTokens }): Theme {
  const at = now();
  return db
    .insert(producerThemes)
    .values({ id: randomUUID(), name, tokens: tokens ?? DEFAULT_TOKENS, createdAt: at, updatedAt: at })
    .returning()
    .get();
}

/** Changes what's given. Undefined when there's no such theme. */
export function updateTheme(
  db: ProducerDatabase,
  id: string,
  change: { name?: string; tokens?: ThemeTokens },
): Theme | undefined {
  return db
    .update(producerThemes)
    .set({ ...change, updatedAt: now() })
    .where(eq(producerThemes.id, id))
    .returning()
    .get();
}

// "<name> copy", or "<name> copy <n>", with the name shortened so the whole still fits in MAX_NAME characters.
function copyName(name: string, n: number): string {
  const suffix = n === 1 ? ' copy' : ` copy ${n}`;
  return `${name.slice(0, MAX_NAME - suffix.length).trimEnd()}${suffix}`;
}

/** A copy of the theme under the first free copy name, never the default. Undefined when there's no such theme. */
export function duplicateTheme(db: ProducerDatabase, id: string): Theme | undefined {
  const theme = findTheme(db, id);
  if (!theme) return undefined;
  let n = 1;
  while (themeNameTaken(db, copyName(theme.name, n))) n += 1;
  return createTheme(db, { name: copyName(theme.name, n), tokens: theme.tokens });
}

/** Deletes the theme, and returns it. Undefined when there's no such theme. */
export const deleteTheme = (db: ProducerDatabase, id: string): Theme | undefined =>
  db.delete(producerThemes).where(eq(producerThemes.id, id)).returning().get();

/** Makes the theme the default, switching the old one off, or with null leaves no default. False for an unknown id. */
export function setDefaultTheme(db: ProducerDatabase, themeId: string | null): boolean {
  if (themeId !== null && !findTheme(db, themeId)) return false;
  db.transaction((tx) => {
    tx.update(producerThemes).set({ isDefault: false }).where(eq(producerThemes.isDefault, true)).run();
    if (themeId === null) return;
    tx.update(producerThemes).set({ isDefault: true }).where(eq(producerThemes.id, themeId)).run();
  });
  return true;
}
```

Create `rcl-producer/server/src/routes/themes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Access } from '@rollcall/app-sdk';
import { ApiErrorSchema } from '@rollcall/core-contract';
import {
  CreateThemeRequestSchema,
  SetDefaultThemeRequestSchema,
  ThemeSchema,
  UpdateThemeRequestSchema,
} from '@rollcall/producer-contract';
import {
  createTheme,
  deleteTheme,
  duplicateTheme,
  findTheme,
  listThemes,
  setDefaultTheme,
  themeNameTaken,
  updateTheme,
  type ProducerDatabase,
} from '../themes/themes.ts';

const READ: { config: { access: Access } } = { config: { access: { permission: 'producer:themes.read' } } };
const MANAGE: { config: { access: Access } } = { config: { access: { permission: 'producer:themes.manage' } } };
// Lets a route send core's { error, message? } replies (ADR-0014).
const ERROR_RESPONSES = { '4xx': ApiErrorSchema };
const ThemeParamsSchema = z.strictObject({ id: z.string() });
const NOT_FOUND = { error: 'not_found' };
const NAME_TAKEN = { error: 'name_taken', message: 'That name is already taken' };
const TAGS = ['producer/themes'];

// Themes (docs/features/theme-builder.md): anyone holding producer:themes.read may look, and producer:themes.manage
// may change them and choose the default.
export function registerThemeRoutes(fastify: FastifyInstance, { db }: { db: ProducerDatabase }) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/themes',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'List themes, by name',
        response: { 200: ThemeSchema.array(), ...ERROR_RESPONSES },
      },
    },
    async () => listThemes(db),
  );

  api.get(
    '/themes/:id',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'A theme',
        params: ThemeParamsSchema,
        response: { 200: ThemeSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => findTheme(db, request.params.id) ?? reply.code(404).send(NOT_FOUND),
  );

  api.post(
    '/themes',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Create a theme. Without tokens, it starts from the built-in look',
        body: CreateThemeRequestSchema,
        response: { 201: ThemeSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      if (themeNameTaken(db, request.body.name)) return reply.code(409).send(NAME_TAKEN);
      return reply.code(201).send(createTheme(db, request.body));
    },
  );

  api.patch(
    '/themes/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: "Change a theme's name or tokens: a missing field stays as it is, and tokens are replaced whole",
        params: ThemeParamsSchema,
        body: UpdateThemeRequestSchema,
        response: { 200: ThemeSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body;
      if (!findTheme(db, id)) return reply.code(404).send(NOT_FOUND);
      if (name !== undefined && themeNameTaken(db, name, id)) return reply.code(409).send(NAME_TAKEN);
      return updateTheme(db, id, request.body) ?? reply.code(404).send(NOT_FOUND);
    },
  );

  api.post(
    '/themes/:id/duplicate',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Copy a theme as "<name> copy", or "<name> copy 2" and so on. The copy is not the default',
        params: ThemeParamsSchema,
        response: { 201: ThemeSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const copy = duplicateTheme(db, request.params.id);
      return copy ? reply.code(201).send(copy) : reply.code(404).send(NOT_FOUND);
    },
  );

  api.delete(
    '/themes/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Delete a theme. Deleting the default leaves no default',
        params: ThemeParamsSchema,
        response: { 204: z.undefined(), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      if (!deleteTheme(db, request.params.id)) return reply.code(404).send(NOT_FOUND);
      return reply.code(204).send();
    },
  );

  api.put(
    '/default-theme',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Choose the theme the OBS overlay uses, or with null leave none',
        body: SetDefaultThemeRequestSchema,
        response: { 200: SetDefaultThemeRequestSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { themeId } = request.body;
      if (!setDefaultTheme(db, themeId)) return reply.code(404).send(NOT_FOUND);
      return { themeId };
    },
  );
}
```

Replace `rcl-producer/server/src/index.ts` with:

```ts
import { fileURLToPath } from 'node:url';
import type { AppModule } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import { SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/producer-contract';
import pkg from '../package.json' with { type: 'json' };
import * as schema from './db/schema.ts';
import { registerThemeRoutes } from './routes/themes.ts';

// The Producer app's server side, hosted by rcl-core as app module `producer` (ADR-0019): its routes below
// /api/producer, its tables (producer_…), and the /producer/overlay namespace. rcl-core serves its web build at
// /producer/, with the OBS overlay at /producer/overlay.
export const producerApp: AppModule = {
  id: 'producer',
  title: `${APP_NAME} Producer`,
  version: pkg.version,
  requiresCore: pkg.rollcall.requiresCore,
  permissions: [
    { key: 'producer:themes.read', summary: 'View themes', roles: ['producer'] },
    {
      key: 'producer:themes.manage',
      summary: 'Create, edit, duplicate and delete themes, and choose the default',
      roles: [],
    },
  ],
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  web: {
    dir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
    pages: { overlay: 'overlay.html' },
  },
  register(api, ctx) {
    registerThemeRoutes(api, { db: ctx.db(schema) });
  },
  realtime(rt, ctx) {
    const hello = ServerHelloSchema.parse({ name: APP_NAME, version: ctx.coreVersion });
    rt.namespace('/producer/overlay', {
      access: { public: "OBS browser sources can't sign in; output token URLs replace this in Live Mode" },
    }).on('connection', (socket) => {
      socket.emit(SERVER_HELLO_EVENT, hello);
    });
  },
};
```

- [ ] **Step 6: The docs and the rule.**

In `docs/features/users-and-access.md`:

Replace:

```markdown
| Configure OBS and CRG connections | ✅ | — | — |
```
with:

```markdown
| Configure OBS and CRG connections | ✅ | — | — |
| View themes | ✅ | ✅ | — |
```


Replace:

```markdown
| `core:fonts.manage` | Upload and remove fonts | ✅ | — | — | ✅ |
```
with:

```markdown
| `core:fonts.manage` | Upload and remove fonts | ✅ | — | — | ✅ |
| `producer:themes.read` | View themes | ✅ | ✅ | — | ✅ |
| `producer:themes.manage` | Create, edit, duplicate and delete themes, and choose the default | ✅ | — | — | ✅ |
```


In `docs/architecture/data-model.md`:

Replace:

```markdown
| Font face | One uploaded font file in the font library: its family, weights and style, and its media | [Theme Builder](../features/theme-builder.md) |
| Theme | A named set of visual tokens | [Theme Builder](../features/theme-builder.md) |
```
with:

```markdown
| Font face | One uploaded font file in the font library: its family, weights and style, and its media (rcl-core) | [Theme Builder](../features/theme-builder.md) |
| Theme | A named set of visual tokens. At most one is the default, which the OBS overlay uses (rcl-producer) | [Theme Builder](../features/theme-builder.md) |
```


Replace `.claude/rules/rcl-producer-server.md` with:

```markdown
---
paths:
  - "rcl-producer/server/**"
---
# rcl-producer server (`rcl-producer/server/`, ADR-0019)

- **This is an app module, not a server.** `src/index.ts` exports `producerApp`, which rcl-core's server hosts. It never starts a process, opens a port or opens the database itself.
- **Depend only on `@rollcall/app-sdk` and contracts** (`@rollcall/producer-contract`, `@rollcall/core-contract`). Never on `@rollcall/core-server`: `scripts/check-boundaries.test.mjs` fails otherwise.
- **Hard rules 1–5** in `AGENTS.md` apply here, as on rcl-core's server.
- **Everything is named after the app:**
  - routes are relative to `/api/producer` (`/themes`, not `/api/producer/themes`), with tags `producer/<area>`;
  - namespaces are at or below `/producer`;
  - permissions are `producer:<action>`, listed in `permissions` with the roles that hold them, and in the table on `docs/features/users-and-access.md`;
  - tables are `producer_<name>`, in migrations under `migrationsFolder` (`rcl-core/server/src/installed-apps.test.ts` checks the names).
- **Every route and namespace declares its access** (hard rule 5, ADR-0018), and validates its input with schemas from `@rollcall/producer-contract` (ADR-0014).
- **Tables:** `src/db/schema.ts`, the first being `producer_themes`. After editing it, run `yarn workspace @rollcall/producer-server db:generate --name <change>` and commit the migration; rcl-core runs it at startup in `__drizzle_migrations_producer`. New entities also update `docs/architecture/data-model.md`.
- **Tests** host the module with `testProducer()` (`src/testing.ts`): an in-memory database with the migrations run, a context with the fonts given, and the routes below `/api/producer`. Access isn't checked there: core's route inventory sweeps these routes with every kind of caller, so add each new route to its pinned list.
- **`rollcall.requiresCore`** in `package.json` is the rcl-core range this app works with. Change it deliberately when core's version changes.
```

- [ ] **Step 7: Run them and see them pass.**

Run: the command from Step 3, plus `rcl-core/server/src/auth/permissions.test.ts rcl-core/server/src/installed-apps.test.ts`.
Expected: PASS. The three files from Step 3 pass 25 tests, and `yarn test` passes 437.

- [ ] **Step 8: Check and commit.**

```bash
yarn format && yarn check
git add rcl-producer/server rcl-core/server yarn.lock docs .claude/rules
git commit -F - <<'EOF'
feat(rcl-producer): themes, in the Producer app's first table

Admins create, rename, recolor, duplicate and delete themes, and choose
the default, which at most one theme is. Producers can view them. Themes
live in producer_themes, the Producer app's first table, with its own
migrations. Its route tests host the module the way rcl-core does.

Refs #20

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: The default theme on the OBS overlay

**Files:**
- Create: `rcl-producer/server/src/overlay.ts`, `rcl-producer/web/src/overlay/ThemeScope.tsx`
- Modify: `rcl-producer/contract/src/realtime.ts`, `rcl-producer/contract/src/themes.ts`, `rcl-producer/server/src/index.ts`, `rcl-producer/server/src/routes/themes.ts`, `rcl-producer/web/src/overlay/live.ts`, `rcl-producer/web/src/overlay/OverlayApp.tsx`, `rcl-producer/web/src/overlay/theme-defaults.css`, `rcl-producer/web/src/overlay/components/PlaceholderCard.module.css`, `rcl-producer/web/src/overlay/themes/sample-themes.css`, `packages/web-sdk/src/vite.ts`, `.claude/rules/rcl-producer-overlay.md`
- Test: `rcl-producer/server/src/overlay.test.ts`, `rcl-producer/web/src/overlay/ThemeScope.test.tsx`, `rcl-producer/web/src/overlay/OverlayApp.test.tsx`, `rcl-producer/web/src/overlay/theme-defaults.test.ts`, `rcl-producer/web/src/overlay/test-socket.ts` (all new), `rcl-producer/contract/src/realtime.test.ts`, `rcl-producer/contract/src/themes.test.ts`, `rcl-producer/server/src/index.test.ts`, `rcl-producer/web/src/overlay/live.test.ts`, `packages/web-sdk/src/vite.test.ts`

**Interfaces:**
- Consumes:
  - from Task 3: `AppContext.fonts` and one context per app;
  - from Task 4: `OverlayThemeSchema`, `themeToCss`, `ThemeCss`;
  - from Task 5: `findDefaultTheme(db)`, `registerThemeRoutes`.
- Produces:
  - `familiesUsedBy(tokens, library): FontFamily[]`, which `themeToCss` now uses (contract);
  - `THEME_CHANGED_EVENT` (`'theme:changed'`), `ThemeChangedSchema` (`OverlayThemeSchema.nullable()`) and `ThemeChanged` (contract);
  - `openOverlay(rt, ctx)` and `announceDefaultTheme(ctx)` (`overlay.ts`);
  - `registerThemeRoutes(fastify, { db, onDefaultChanged })`;
  - `LiveState.theme: ThemeChanged` (`live.ts`);
  - `ThemeScope({ css: ThemeCss | null, children })`, which renders `<div data-theme-scope>`;
  - `FakeSocket` (`test-socket.ts`), for overlay tests;
  - `serverProxy()` gains `/fonts`.

- [ ] **Step 1: Write the failing tests.**

Replace `rcl-producer/contract/src/realtime.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { ServerHelloSchema, SERVER_HELLO_EVENT, THEME_CHANGED_EVENT, ThemeChangedSchema } from './realtime.ts';
import { DEFAULT_TOKENS } from './themes.ts';

describe('ServerHelloSchema', () => {
  it('accepts the hello the server sends on connect', () => {
    expect(ServerHelloSchema.parse({ name: 'Rollcall', version: '0.1.0' })).toEqual({
      name: 'Rollcall',
      version: '0.1.0',
    });
  });

  it('rejects a hello without a version', () => {
    expect(ServerHelloSchema.safeParse({ name: 'Rollcall' }).success).toBe(false);
  });

  it('names the event', () => {
    expect(SERVER_HELLO_EVENT).toBe('server:hello');
  });
});

describe('ThemeChangedSchema', () => {
  it('accepts the default theme with its font families, or null for the built-in look', () => {
    const theme = { tokens: DEFAULT_TOKENS, families: [] };
    expect(ThemeChangedSchema.parse(theme)).toEqual(theme);
    expect(ThemeChangedSchema.parse(null)).toBeNull();
    expect(THEME_CHANGED_EVENT).toBe('theme:changed');
  });

  it('rejects a theme without its tokens', () => {
    expect(ThemeChangedSchema.safeParse({ families: [] }).success).toBe(false);
  });
});
```

In `rcl-producer/contract/src/themes.test.ts`:

Replace:

```ts
  DEFAULT_TOKENS,
  OverlayThemeSchema,
```
with:

```ts
  DEFAULT_TOKENS,
  familiesUsedBy,
  OverlayThemeSchema,
```


Replace:

```ts
});

describe('themeToCss', () => {
```
with:

```ts
});

describe('familiesUsedBy', () => {
  it('picks the heading and body families from the library, in its order, ignoring case', () => {
    const used = tokens((draft) => {
      draft.fonts.heading.family = 'rollerball';
      draft.fonts.body.family = 'Oswald';
    });
    expect(familiesUsedBy(used, LIBRARY)).toEqual([OSWALD, ROLLERBALL]);
    expect(familiesUsedBy(DEFAULT_TOKENS, LIBRARY)).toEqual([INTER]);
    expect(familiesUsedBy(DEFAULT_TOKENS, [])).toEqual([]);
  });
});

describe('themeToCss', () => {
```


The overlay's tests use a stand-in for Socket.IO. The greeting test moves from `index.test.ts` to `overlay.test.ts`, since the overlay now needs a full context:

Create `rcl-producer/server/src/overlay.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { Realtime } from '@rollcall/app-sdk';
import { APP_NAME, type FontFamily } from '@rollcall/core-contract';
import {
  DEFAULT_TOKENS,
  SERVER_HELLO_EVENT,
  THEME_CHANGED_EVENT,
  ThemeSchema,
  type ThemeTokens,
} from '@rollcall/producer-contract';
import { producerApp } from './index.ts';
import { testProducer } from './testing.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
});

const family = (name: string): FontFamily => ({
  name,
  bundled: true,
  faces: [{ id: name, weightMin: 400, weightMax: 400, style: 'normal', format: 'font/ttf', url: `/fonts/${name}.ttf` }],
});
const INTER = family('Inter');
const OSWALD = family('Oswald');
const ANTON = family('Anton');
const OSWALD_HEADINGS: ThemeTokens = {
  ...DEFAULT_TOKENS,
  fonts: { ...DEFAULT_TOKENS.fonts, heading: { family: 'Oswald', weight: 700 } },
};

type Sent = [event: string, payload: unknown];

// The Producer app with its /producer/overlay namespace open on a stand-in for Socket.IO: what the namespace sends to
// every client, and a way to connect one and see what it's sent.
function overlay() {
  const { api, ctx } = testProducer({ fonts: [ANTON, INTER, OSWALD] });
  opened.push(api);
  const broadcasts: Sent[] = [];
  let onConnection: ((socket: { emit: (...sent: Sent) => void }) => void) | undefined;
  const namespace = {
    emit: (...sent: Sent) => broadcasts.push(sent),
    on: (_event: 'connection', listener: typeof onConnection) => (onConnection = listener),
  };
  const opens: Parameters<Realtime['namespace']>[] = [];
  const rt: Realtime = {
    namespace: (...open) => {
      opens.push(open);
      return namespace as never;
    },
  };
  producerApp.realtime?.(rt, ctx);
  const connect = () => {
    const received: Sent[] = [];
    onConnection?.({ emit: (...sent) => received.push(sent) });
    return received;
  };
  const call = async (method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    api.inject({ method, url: `/api/producer${url}`, ...(payload ? { payload } : {}) });
  const create = async (name: string, tokens?: ThemeTokens) =>
    ThemeSchema.parse((await call('POST', '/themes', { name, tokens })).json());
  const themes = (sent: Sent[]) => sent.filter(([event]) => event === THEME_CHANGED_EVENT).map(([, theme]) => theme);
  return { opens, broadcasts, connect, call, create, themes };
}

describe('the overlay namespace', () => {
  it('is public, and greets each client with the server, then the built-in look while there is no default', () => {
    const { opens, connect } = overlay();
    expect(opens).toEqual([
      ['/producer/overlay', { access: { public: expect.stringContaining('OBS browser sources') as string } }],
    ]);
    expect(connect()).toEqual([
      [SERVER_HELLO_EVENT, { name: APP_NAME, version: '0.1.0' }],
      [THEME_CHANGED_EVENT, null],
    ]);
  });

  it('sends a new client the default theme, with only the font families it uses', async () => {
    const { connect, call, create, themes } = overlay();
    const theme = await create('Derby Night', OSWALD_HEADINGS);
    await call('PUT', '/default-theme', { themeId: theme.id });
    expect(themes(connect())).toEqual([{ tokens: OSWALD_HEADINGS, families: [INTER, OSWALD] }]);
  });

  it('sends every client the new theme when the default is saved, switched, cleared or deleted', async () => {
    const { broadcasts, call, create, themes } = overlay();
    const night = await create('Derby Night');
    const finals = await create('Finals', OSWALD_HEADINGS);
    await call('PUT', '/default-theme', { themeId: night.id });
    await call('PATCH', `/themes/${night.id}`, { tokens: OSWALD_HEADINGS });
    await call('PUT', '/default-theme', { themeId: finals.id });
    await call('PUT', '/default-theme', { themeId: null });
    await call('PUT', '/default-theme', { themeId: finals.id });
    await call('DELETE', `/themes/${finals.id}`);
    const withOswald = { tokens: OSWALD_HEADINGS, families: [INTER, OSWALD] };
    expect(themes(broadcasts)).toEqual([
      { tokens: DEFAULT_TOKENS, families: [INTER] },
      withOswald,
      withOswald,
      null,
      withOswald,
      null,
    ]);
  });

  it('sends nothing when a theme that is not the default changes', async () => {
    const { broadcasts, call, create } = overlay();
    const night = await create('Derby Night');
    await call('PATCH', `/themes/${night.id}`, { tokens: OSWALD_HEADINGS });
    await call('POST', `/themes/${night.id}/duplicate`);
    await call('DELETE', `/themes/${night.id}`);
    expect(broadcasts).toEqual([]);
  });

  it('sends nothing when a change is refused', async () => {
    const { broadcasts, call, create } = overlay();
    const night = await create('Derby Night');
    await create('Finals');
    await call('PUT', '/default-theme', { themeId: night.id });
    broadcasts.length = 0;
    await call('PATCH', `/themes/${night.id}`, { name: 'Finals' });
    await call('PUT', '/default-theme', { themeId: 'nope' });
    expect(broadcasts).toEqual([]);
  });
});
```

Replace `rcl-producer/server/src/index.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { producerApp } from './index.ts';
import { tablesIn, testProducer } from './testing.ts';

describe('the producer app module', () => {
  it('serves its web build with the OBS overlay page at /producer/overlay', () => {
    expect(producerApp.id).toBe('producer');
    expect(producerApp.web?.dir).toMatch(/rcl-producer\/web\/dist$/);
    expect(producerApp.web?.pages).toEqual({ overlay: 'overlay.html' });
  });

  it('creates only its themes table, in its own migrations table', async () => {
    const { api, client } = testProducer();
    await api.close();
    expect(tablesIn(client)).toEqual(['__drizzle_migrations_producer', 'producer_themes']);
  });
});
```

The overlay's fake socket moves into a file of its own, for its two tests:

Create `rcl-producer/web/src/overlay/test-socket.ts`:

```ts
import { vi } from 'vitest';
import type { LiveSocket } from './live.ts';

/** A stand-in for the overlay's Socket.IO client, for tests: `emit` plays what the server would send. */
export class FakeSocket implements LiveSocket {
  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  close = vi.fn<() => void>();
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
  get listening() {
    return this.handlers.size > 0;
  }
}
```

Replace `rcl-producer/web/src/overlay/live.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOKENS } from '@rollcall/producer-contract';
import { liveApi, makeOverlayStore } from './live.ts';
import { FakeSocket } from './test-socket.ts';

const hello = { name: 'Rollcall', version: '0.1.0' };

async function subscribe(socket: FakeSocket) {
  const store = makeOverlayStore(() => socket);
  const subscription = store.dispatch(liveApi.endpoints.getLiveState.initiate());
  await vi.waitFor(() => expect(socket.listening).toBe(true));
  const state = () => liveApi.endpoints.getLiveState.select()(store.getState()).data;
  return { state, subscription };
}

describe('overlay live state', () => {
  it('starts empty and fills in from the server hello', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    expect(state()).toEqual({ connected: false, server: null, theme: null });
    socket.emit('connect');
    socket.emit('server:hello', hello);
    expect(state()).toEqual({ connected: true, server: hello, theme: null });
  });

  it('keeps the last known state when the connection drops', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    socket.emit('connect');
    socket.emit('server:hello', hello);
    socket.emit('disconnect');
    expect(state()).toEqual({ connected: false, server: hello, theme: null });
  });

  it('keeps the default theme the server sends, and goes back to the built-in look on null', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    const theme = { tokens: DEFAULT_TOKENS, families: [] };
    socket.emit('theme:changed', theme);
    expect(state()?.theme).toEqual(theme);
    socket.emit('theme:changed', null);
    expect(state()?.theme).toBeNull();
  });

  it('ignores messages that break the shared contract', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    socket.emit('server:hello', { name: 'Rollcall' });
    socket.emit('theme:changed', { tokens: { colors: {} }, families: [] });
    expect(state()?.server).toBeNull();
    expect(state()?.theme).toBeNull();
  });

  it('rebuilds everything from the server after a reload', async () => {
    const first = new FakeSocket();
    await subscribe(first);
    first.emit('server:hello', hello);

    const afterReload = new FakeSocket();
    const { state } = await subscribe(afterReload);
    expect(state()?.server).toBeNull();
    afterReload.emit('server:hello', { ...hello, version: '0.1.1' });
    expect(state()?.server?.version).toBe('0.1.1');
  });

  it('closes the socket once nothing uses the live state', async () => {
    const socket = new FakeSocket();
    const { subscription } = await subscribe(socket);
    subscription.unsubscribe();
    await vi.waitFor(() => expect(socket.close).toHaveBeenCalled());
  });
});
```

Create `rcl-producer/web/src/overlay/ThemeScope.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FontFamily } from '@rollcall/core-contract';
import { DEFAULT_TOKENS, themeToCss } from '@rollcall/producer-contract';
import { ThemeScope } from './ThemeScope.tsx';

const INTER: FontFamily = {
  name: 'Inter',
  bundled: true,
  faces: [{ id: 'inter', weightMin: 100, weightMax: 900, style: 'normal', format: 'font/ttf', url: '/fonts/i.ttf' }],
};
const GOLD = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: '#ffd700' } };

const scopeOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-theme-scope]')!;

describe('ThemeScope', () => {
  it('gives what is inside it the theme’s variables and font faces', () => {
    const { container } = render(
      <ThemeScope css={themeToCss(GOLD, [INTER])}>
        <span>Jam 3</span>
      </ThemeScope>,
    );
    expect(screen.getByText('Jam 3')).toBeTruthy();
    expect(scopeOf(container).style.getPropertyValue('--theme-color-accent')).toBe('#ffd700');
    expect(scopeOf(container).style.getPropertyValue('--theme-font-body')).toBe('"Inter", system-ui, sans-serif');
    expect(container.querySelector('style')?.textContent).toContain('font-family: "Inter";');
  });

  it('follows a new theme, and with none lets the built-in look show through', () => {
    const { container, rerender } = render(<ThemeScope css={themeToCss(GOLD, [INTER])}>x</ThemeScope>);
    rerender(<ThemeScope css={themeToCss(DEFAULT_TOKENS, [])}>x</ThemeScope>);
    expect(scopeOf(container).style.getPropertyValue('--theme-color-accent')).toBe(DEFAULT_TOKENS.colors.accent);
    expect(container.querySelector('style')).toBeNull();
    rerender(<ThemeScope css={null}>x</ThemeScope>);
    expect(scopeOf(container).style.getPropertyValue('--theme-color-accent')).toBe('');
  });
});
```

Create `rcl-producer/web/src/overlay/OverlayApp.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { DEFAULT_TOKENS } from '@rollcall/producer-contract';
import { makeOverlayStore } from './live.ts';
import { OverlayApp } from './OverlayApp.tsx';
import { FakeSocket } from './test-socket.ts';

const GOLD = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: '#ffd700' } };

function overlay() {
  const socket = new FakeSocket();
  const { container } = render(
    <Provider store={makeOverlayStore(() => socket)}>
      <OverlayApp />
    </Provider>,
  );
  const accent = () =>
    container.querySelector<HTMLElement>('[data-theme-scope]')?.style.getPropertyValue('--theme-color-accent');
  return { socket, container, accent };
}

describe('OverlayApp', () => {
  it('shows nothing until the server has spoken', () => {
    const { container } = overlay();
    expect(container.innerHTML).toBe('');
  });

  it('applies the default theme the server sends, live, and the built-in look on null', async () => {
    const { socket, accent } = overlay();
    await vi.waitFor(() => expect(socket.listening).toBe(true));
    // RTK batches store updates to the next animation frame, so each change is waited for rather than acted on.
    socket.emit('server:hello', { name: 'Rollcall', version: '0.2.0' });
    socket.emit('theme:changed', { tokens: GOLD, families: [] });
    expect(await screen.findByText('Rollcall')).toBeTruthy();
    await vi.waitFor(() => expect(accent()).toBe('#ffd700'));
    socket.emit('theme:changed', null);
    await vi.waitFor(() => expect(accent()).toBe(''));
  });
});
```

Create `rcl-producer/web/src/overlay/theme-defaults.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TOKENS, themeToCss } from '@rollcall/producer-contract';

const css = readFileSync(new URL('./theme-defaults.css', import.meta.url), 'utf8');

// theme-defaults.css is the built-in look as plain CSS, for the overlay before a theme arrives and for overlay stories.
describe('theme-defaults.css', () => {
  it('sets every variable DEFAULT_TOKENS gives, to the same value', () => {
    const declared = Object.fromEntries(
      [...css.matchAll(/(--theme-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value?.replaceAll("'", '"')]),
    );
    expect(declared).toEqual(themeToCss(DEFAULT_TOKENS, []).variables);
  });
});
```

In `packages/web-sdk/src/vite.test.ts`:

Replace:

```ts
  it('passes the API, the API explorer, uploaded images and Socket.IO to the server, keeping Host as it is', () => {
    const proxy = serverProxy('http://localhost:5580');
    expect(Object.keys(proxy)).toEqual(['/api', '/docs', '/media', '/socket.io']);
```
with:

```ts
  it('passes the API, the API explorer, uploaded files, bundled fonts and Socket.IO to the server, keeping Host', () => {
    const proxy = serverProxy('http://localhost:5580');
    expect(Object.keys(proxy)).toEqual(['/api', '/docs', '/media', '/fonts', '/socket.io']);
```


- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-producer/contract/src/realtime.test.ts rcl-producer/contract/src/themes.test.ts rcl-producer/server/src/index.test.ts rcl-producer/server/src/overlay.test.ts rcl-producer/web/src/overlay/OverlayApp.test.tsx rcl-producer/web/src/overlay/ThemeScope.test.tsx rcl-producer/web/src/overlay/live.test.ts rcl-producer/web/src/overlay/theme-defaults.test.ts packages/web-sdk/src/vite.test.ts`
Expected: FAIL, 13 tests in 8 files.
- `ThemeScope.test.tsx` doesn't load: `Failed to resolve import "./ThemeScope.tsx"`.
- Contract: the two `ThemeChangedSchema` tests and the `familiesUsedBy` test.
- `overlay.test.ts`: 3 of 5. The two "sends nothing" tests already pass, since nothing is sent yet.
- `live.test.ts`: 4, which expect `theme` in the live state. `OverlayApp.test.tsx`: the theme test. `theme-defaults.test.ts`: the old variables. `vite.test.ts`: no `/fonts`.

- [ ] **Step 3: The contract.**

Replace `rcl-producer/contract/src/realtime.ts` with:

```ts
import { z } from 'zod';
import { OverlayThemeSchema } from './themes.ts';

// Sent by the server to every client of the /producer/overlay namespace as soon as it connects.
export const SERVER_HELLO_EVENT = 'server:hello';
export const ServerHelloSchema = z.strictObject({
  name: z.string(),
  version: z.string(),
});
export type ServerHello = z.infer<typeof ServerHelloSchema>;

// Sent to every client of /producer/overlay as soon as it connects, and again whenever the default theme changes: its
// tokens and the font families they use, or null for the built-in look.
export const THEME_CHANGED_EVENT = 'theme:changed';
export const ThemeChangedSchema = OverlayThemeSchema.nullable();
export type ThemeChanged = z.infer<typeof ThemeChangedSchema>;
```

In `rcl-producer/contract/src/themes.ts`:

Replace:

```ts
const sameFamily = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The CSS for a theme: its variables, and `@font-face` rules for the families it uses that are in `families`. */
```
with:

```ts
const sameFamily = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The families of `library` that the theme's heading and body use, in the library's order. */
export function familiesUsedBy(tokens: ThemeTokens, library: readonly FontFamily[]): FontFamily[] {
  const names = [tokens.fonts.heading.family, tokens.fonts.body.family];
  return library.filter((family) => names.some((name) => sameFamily(name, family.name)));
}

/** The CSS for a theme: its variables, and `@font-face` rules for the families it uses that are in `families`. */
```


Replace:

```ts
  const used = families.filter((family) =>
    [fonts.heading.family, fonts.body.family].some((name) => sameFamily(name, family.name)),
  );
  return { variables, fontFaces: fontFaceRules(used) };
```
with:

```ts
  return { variables, fontFaces: fontFaceRules(familiesUsedBy(tokens, families)) };
```


- [ ] **Step 4: The server sends the default theme.**

Create `rcl-producer/server/src/overlay.ts`:

```ts
import type { AppContext, Realtime } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import {
  familiesUsedBy,
  SERVER_HELLO_EVENT,
  ServerHelloSchema,
  THEME_CHANGED_EVENT,
  type ThemeChanged,
} from '@rollcall/producer-contract';
import * as schema from './db/schema.ts';
import { findDefaultTheme } from './themes/themes.ts';

// The OBS overlay's live connection, /producer/overlay (docs/features/theme-builder.md). Core gives the app one context,
// to both register() and realtime() (ADR-0023), so the theme routes find the namespace realtime() opened through it.
const overlays = new WeakMap<AppContext, ReturnType<Realtime['namespace']>>();

// The default theme as the overlay gets it: its tokens and only the font families they use, or null with no default.
function overlayTheme(ctx: AppContext): ThemeChanged {
  const theme = findDefaultTheme(ctx.db(schema));
  return theme ? { tokens: theme.tokens, families: familiesUsedBy(theme.tokens, ctx.fonts.list()) } : null;
}

/** Opens /producer/overlay, which greets each client with the server and the default theme. */
export function openOverlay(rt: Realtime, ctx: AppContext): void {
  const hello = ServerHelloSchema.parse({ name: APP_NAME, version: ctx.coreVersion });
  const overlay = rt.namespace('/producer/overlay', {
    access: { public: "OBS browser sources can't sign in; output token URLs replace this in Live Mode" },
  });
  overlays.set(ctx, overlay);
  overlay.on('connection', (socket) => {
    socket.emit(SERVER_HELLO_EVENT, hello);
    socket.emit(THEME_CHANGED_EVENT, overlayTheme(ctx));
  });
}

/** Sends every connected overlay the default theme as it is now. */
export function announceDefaultTheme(ctx: AppContext): void {
  overlays.get(ctx)?.emit(THEME_CHANGED_EVENT, overlayTheme(ctx));
}
```

Replace `rcl-producer/server/src/index.ts` with:

```ts
import { fileURLToPath } from 'node:url';
import type { AppModule } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import pkg from '../package.json' with { type: 'json' };
import * as schema from './db/schema.ts';
import { announceDefaultTheme, openOverlay } from './overlay.ts';
import { registerThemeRoutes } from './routes/themes.ts';

// The Producer app's server side, hosted by rcl-core as app module `producer` (ADR-0019): its routes below
// /api/producer, its tables (producer_…), and the /producer/overlay namespace. rcl-core serves its web build at
// /producer/, with the OBS overlay at /producer/overlay.
export const producerApp: AppModule = {
  id: 'producer',
  title: `${APP_NAME} Producer`,
  version: pkg.version,
  requiresCore: pkg.rollcall.requiresCore,
  permissions: [
    { key: 'producer:themes.read', summary: 'View themes', roles: ['producer'] },
    {
      key: 'producer:themes.manage',
      summary: 'Create, edit, duplicate and delete themes, and choose the default',
      roles: [],
    },
  ],
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  web: {
    dir: fileURLToPath(new URL('../../web/dist', import.meta.url)),
    pages: { overlay: 'overlay.html' },
  },
  register(api, ctx) {
    registerThemeRoutes(api, { db: ctx.db(schema), onDefaultChanged: () => announceDefaultTheme(ctx) });
  },
  realtime(rt, ctx) {
    openOverlay(rt, ctx);
  },
};
```

In `rcl-producer/server/src/routes/themes.ts`:

Replace:

```ts
// may change them and choose the default.
export function registerThemeRoutes(fastify: FastifyInstance, { db }: { db: ProducerDatabase }) {
```
with:

```ts
// may change them and choose the default. `onDefaultChanged` runs after each change to what the default theme is or
// looks like, so the OBS overlay can follow it.
export function registerThemeRoutes(
  fastify: FastifyInstance,
  { db, onDefaultChanged }: { db: ProducerDatabase; onDefaultChanged: () => void },
) {
```


Replace:

```ts
      return updateTheme(db, id, request.body) ?? reply.code(404).send(NOT_FOUND);
```
with:

```ts
      const theme = updateTheme(db, id, request.body);
      if (!theme) return reply.code(404).send(NOT_FOUND);
      if (theme.isDefault) onDefaultChanged();
      return theme;
```


Replace:

```ts
      if (!deleteTheme(db, request.params.id)) return reply.code(404).send(NOT_FOUND);
```
with:

```ts
      const theme = deleteTheme(db, request.params.id);
      if (!theme) return reply.code(404).send(NOT_FOUND);
      if (theme.isDefault) onDefaultChanged();
```


Replace:

```ts
      if (!setDefaultTheme(db, themeId)) return reply.code(404).send(NOT_FOUND);
```
with:

```ts
      if (!setDefaultTheme(db, themeId)) return reply.code(404).send(NOT_FOUND);
      onDefaultChanged();
```


- [ ] **Step 5: The overlay applies it.**

Replace `rcl-producer/web/src/overlay/live.ts` with:

```ts
import { configureStore } from '@reduxjs/toolkit';
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { io } from 'socket.io-client';
import {
  SERVER_HELLO_EVENT,
  ServerHelloSchema,
  THEME_CHANGED_EVENT,
  ThemeChangedSchema,
  type ServerHello,
  type ThemeChanged,
} from '@rollcall/producer-contract';

// The overlay's live state comes only from the server over Socket.IO (ADR-0019), held in the RTK Query
// cache rather than a slice (hard rule 6, ADR-0003). A reload starts empty and rebuilds from what the
// server sends on connect; a dropped connection keeps the last known state on screen.

export interface LiveState {
  connected: boolean;
  server: ServerHello | null;
  /** The default theme, or null for the built-in look. */
  theme: ThemeChanged;
}

/** The part of a Socket.IO client the overlay uses; tests pass a fake. */
export interface LiveSocket {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  close(): unknown;
}
export type ConnectLive = () => LiveSocket;

interface LiveExtra {
  connect: ConnectLive;
}

export const liveApi = createApi({
  reducerPath: 'live',
  baseQuery: fakeBaseQuery(),
  endpoints: (build) => ({
    getLiveState: build.query<LiveState, void>({
      queryFn: () => ({ data: { connected: false, server: null, theme: null } }),
      keepUnusedDataFor: 0,
      async onCacheEntryAdded(_arg, lifecycle) {
        await lifecycle.cacheDataLoaded;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- makeOverlayStore always sets this
        const socket = (lifecycle.extra as LiveExtra).connect();
        socket.on('connect', () => lifecycle.updateCachedData((draft) => void (draft.connected = true)));
        socket.on('disconnect', () => lifecycle.updateCachedData((draft) => void (draft.connected = false)));
        socket.on(SERVER_HELLO_EVENT, (payload) => {
          const hello = ServerHelloSchema.safeParse(payload);
          if (hello.success) lifecycle.updateCachedData((draft) => void (draft.server = hello.data));
        });
        socket.on(THEME_CHANGED_EVENT, (payload) => {
          const theme = ThemeChangedSchema.safeParse(payload);
          if (theme.success) lifecycle.updateCachedData((draft) => void (draft.theme = theme.data));
        });
        await lifecycle.cacheEntryRemoved;
        socket.close();
      },
    }),
  }),
});

export const { useGetLiveStateQuery } = liveApi;

// The overlay's own lean store; it shares nothing with the admin store (ADR-0003, ADR-0006). It connects to the
// public /producer/overlay namespace, because OBS browser sources can't log in (ADR-0018).
export function makeOverlayStore(connect: ConnectLive = () => io('/producer/overlay')) {
  return configureStore({
    reducer: { [liveApi.reducerPath]: liveApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: { connect } satisfies LiveExtra } }).concat(liveApi.middleware),
  });
}
```

Create `rcl-producer/web/src/overlay/ThemeScope.tsx`:

```tsx
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ThemeCss } from '@rollcall/producer-contract';

// Gives everything inside it a theme's CSS variables and font faces (ADR-0006), as themeToCss makes them. The OBS
// overlay and the theme editor's preview both use it, so they look the same. With no theme, the built-in look from
// theme-defaults.css shows through.
export function ThemeScope({ css, children }: { css: ThemeCss | null; children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = scope.current;
    if (!element || !css) return undefined;
    const variables = Object.entries(css.variables);
    for (const [name, value] of variables) element.style.setProperty(name, value);
    return () => variables.forEach(([name]) => element.style.removeProperty(name));
  }, [css]);
  return (
    <div ref={scope} data-theme-scope>
      {css?.fontFaces ? <style>{css.fontFaces}</style> : null}
      {children}
    </div>
  );
}
```

Replace `rcl-producer/web/src/overlay/OverlayApp.tsx` with:

```tsx
import { useMemo } from 'react';
import { themeToCss } from '@rollcall/producer-contract';
import { PlaceholderCard } from './components/PlaceholderCard.tsx';
import { useGetLiveStateQuery } from './live.ts';
import { ThemeScope } from './ThemeScope.tsx';

// Hosts overlay components in the OBS output, feeding them props from live state, styled with the default theme.
// Shows nothing until the server has spoken, so a stream never shows an empty or broken card.
export function OverlayApp() {
  const { data } = useGetLiveStateQuery();
  const theme = data?.theme ?? null;
  const css = useMemo(() => (theme ? themeToCss(theme.tokens, theme.families) : null), [theme]);
  if (!data?.server) return null;
  return (
    <ThemeScope css={css}>
      <PlaceholderCard title={data.server.name} subtitle={`v${data.server.version}`} />
    </ThemeScope>
  );
}
```

The built-in look moves to the new variables, which the placeholder card and the sample themes use too:

Replace `rcl-producer/web/src/overlay/theme-defaults.css` with:

```
/* The built-in look: DEFAULT_TOKENS from @rollcall/producer-contract as plain CSS (theme-defaults.test.ts keeps the two
   in step). The overlay shows it until a default theme arrives, and overlay stories show it as the "Default" theme.
   Overlay components use only these variables. Fonts are local only: Inter is one of rcl-core's bundled fonts, never
   loaded from the internet (hard rule 4). */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter/inter.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

:root {
  --theme-color-text: #ffffff;
  --theme-color-text-muted: #ffffffcc;
  --theme-color-surface: #141821d9;
  --theme-color-surface-alt: #252b38d9;
  --theme-color-accent: #228be6;
  --theme-color-on-accent: #ffffff;
  --theme-color-border: #228be6;
  --theme-font-heading: 'Inter', system-ui, sans-serif;
  --theme-font-heading-weight: 700;
  --theme-font-body: 'Inter', system-ui, sans-serif;
  --theme-font-body-weight: 400;
  --theme-font-size: 16px;
  --theme-heading-transform: none;
  --theme-radius: 8px;
  --theme-border-width: 2px;
}
```

Replace `rcl-producer/web/src/overlay/components/PlaceholderCard.module.css` with:

```
/* Overlay components are styled only with theme custom properties (ADR-0006). */
.card {
  display: inline-block;
  padding: 0.75em 1.25em;
  font-family: var(--theme-font-body);
  font-size: var(--theme-font-size);
  font-weight: var(--theme-font-body-weight);
  color: var(--theme-color-text);
  background: var(--theme-color-surface);
  border: var(--theme-border-width) solid var(--theme-color-border);
  border-radius: var(--theme-radius);
}

.title {
  font-family: var(--theme-font-heading);
  font-size: 1.5em;
  font-weight: var(--theme-font-heading-weight);
  text-transform: var(--theme-heading-transform);
}

.subtitle {
  color: var(--theme-color-text-muted);
}
```

Replace `rcl-producer/web/src/overlay/themes/sample-themes.css` with:

```
/* Sample themes for the overlay Storybook (ADR-0015). They set the same --theme-* variables a real theme does, through
   themeToCss in @rollcall/producer-contract. "Default" sets nothing: theme-defaults.css applies. */
.sample-theme-light {
  --theme-color-text: #14171f;
  --theme-color-text-muted: #3d4350;
  --theme-color-surface: #fffffff0;
  --theme-color-surface-alt: #e9ecef;
  --theme-color-accent: #1864ab;
  --theme-color-on-accent: #ffffff;
  --theme-color-border: #1864ab;
}

.sample-theme-high-contrast {
  --theme-color-text: #ffe600;
  --theme-color-text-muted: #ffe600;
  --theme-color-surface: #000000;
  --theme-color-surface-alt: #000000;
  --theme-color-accent: #ffe600;
  --theme-color-on-accent: #000000;
  --theme-color-border: #ffe600;
  --theme-heading-transform: uppercase;
  --theme-radius: 0;
  --theme-border-width: 4px;
}
```

In development, `/fonts` goes to the server like `/media`:

In `packages/web-sdk/src/vite.ts`:

Replace:

```ts
// API explorer (/docs), uploaded image (/media, ADR-0022) and Socket.IO traffic to the Rollcall server. Object entries, never the string shorthand:
```
with:

```ts
// API explorer (/docs), uploaded file (/media, ADR-0022), bundled font (/fonts) and Socket.IO traffic to the Rollcall
// server. Object entries, never the string shorthand:
```


Replace:

```ts
    '/media': { target },
```
with:

```ts
    '/media': { target },
    '/fonts': { target },
```


Replace `.claude/rules/rcl-producer-overlay.md` with:

```markdown
---
paths:
  - "rcl-producer/web/src/overlay/**"
  - "rcl-producer/web/overlay.html"
---
# rcl-producer OBS overlay (`rcl-producer/web/src/overlay/`, ADR-0006)

- **Never import Mantine, `@rollcall/web-sdk` or the Producer app's own code** (`src/pages`, `src/routes.tsx`, `src/main.tsx`). `src/overlay/bundle.test.ts` fails if a Mantine or web SDK module reaches the overlay bundle.
- **Overlay components** (`src/overlay/components/`) are presentational:
  - Data comes in through props.
  - Styling uses CSS modules and theme custom properties (`--theme-*`) only, never hard-coded colors or fonts. The variables are the token table in `docs/features/theme-builder.md`; `theme-defaults.css` sets the built-in look (`DEFAULT_TOKENS`, kept in step by `theme-defaults.test.ts`).
  - Fonts are local only (hard rule 4).
  - Get a story next to them, in the overlay Storybook, which never loads Mantine (ADR-0015).
- **Live state** comes only from Socket.IO, the `/producer/overlay` namespace, into the RTK Query cache in `live.ts` (hard rule 6), and is validated with schemas from `@rollcall/producer-contract`.
  - A reload rebuilds state from the server.
  - A disconnect keeps the last state.
  - Render nothing until the server has spoken.
- **Themes:** the default theme arrives as `theme:changed`. `ThemeScope` applies `themeToCss` (from `@rollcall/producer-contract`) to what's inside it, in the overlay and in the theme editor's preview alike, so the two can't differ. With no theme, `theme-defaults.css` shows through.
- **`html` and `body` stay transparent.**
- **The page is served at `/producer/overlay`** and everything below it, where output URLs will live (`rcl-core/server/src/web-apps.ts`).
- **Docs:**
  - component catalog and options: `docs/features/overlay-components.md`
  - renderer and theming: `docs/decisions/0006-one-overlay-renderer-css-variable-theming.md`
```

- [ ] **Step 6: Run them and see them pass.**

Run: the command from Step 2.
Expected: PASS, 44 tests. `yarn test` passes 450.

Run: `yarn test:stories`
Expected: PASS, 22 tests. With no server running, the log shows `[vite] http proxy error: /fonts/inter/inter.ttf`: that's the built-in look asking for Inter, and it's harmless.

- [ ] **Step 7: Check and commit.**

```bash
yarn format && yarn check
git add rcl-producer packages/web-sdk .claude/rules
git commit -F - <<'EOF'
feat(rcl-producer): the default theme on the OBS overlay

/producer/overlay sends each overlay the default theme, with only the
font families it uses, as it connects and whenever the default is saved,
switched, cleared or deleted. The overlay applies it through ThemeScope,
and goes back to the built-in look with none. The overlay's variables
are renamed and extended to the token set, and /fonts joins the dev
proxy.

Refs #20

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: The Fonts page

**Files:**
- Create: `rcl-core/web/src/pages/FontsPage.tsx`, `rcl-core/web/src/pages/FontSample.tsx`, `rcl-core/web/src/pages/FontSample.stories.tsx`, `rcl-core/web/src/pages/font-files.ts`
- Modify: `rcl-core/web/src/api.ts`, `rcl-core/web/src/routes.tsx`, `packages/web-sdk/src/testing.ts`, `.claude/rules/rcl-core-web.md`
- Test: `rcl-core/web/src/pages/FontsPage.test.tsx`, `rcl-core/web/src/pages/font-files.test.ts` (new)

**Interfaces:**
- Consumes from Tasks 1–2: `FontFamilySchema`, `FontFamily`, `FontFace`, `FontStyle`, `FontType`, `fontFaceRules`, `MAX_FONT_BYTES`, `UploadFontFaceQuerySchema`, `UploadFontFaceQuery`, and the three font routes.
- Produces:
  - `useGetFontsQuery`, `useUploadFontFaceMutation` (`{ face, file, type }`) and `useRemoveFontFaceMutation` (`id`) in rcl-core's `api.ts`, with tag `Fonts`;
  - `fontTypeOf(fileName)`, `fontProblem(file)` and `suggestFace(fileName)` (`font-files.ts`);
  - `FontSample({ family, weight? })` and `SAMPLE_LINE` ("Jam 3 · Rollcall 128–96");
  - `FontsPage` at `/core/fonts`, and `faceLabel(face)` ("400", "100–900", "700 italic");
  - the fixtures `ADMIN`, `PRODUCER` and `ANNOUNCER` (`@rollcall/web-sdk/testing`) hold the fonts and themes permissions their roles hold.

- [ ] **Step 1: Write the failing tests.**

The test users hold what their roles hold on the server:

In `packages/web-sdk/src/testing.ts`:

Replace:

```ts
  permissions: ['core:users.manage', 'core:api-keys.manage', 'core:teams.read', 'core:teams.manage'],
```
with:

```ts
  permissions: [
    'core:users.manage',
    'core:api-keys.manage',
    'core:teams.read',
    'core:teams.manage',
    'core:fonts.read',
    'core:fonts.manage',
    'producer:themes.read',
    'producer:themes.manage',
  ],
```


Replace:

```ts
  permissions: ['core:teams.read', 'core:teams.manage'],
```
with:

```ts
  permissions: ['core:teams.read', 'core:teams.manage', 'core:fonts.read', 'producer:themes.read'],
```


Replace:

```ts
  permissions: ['core:teams.read'],
```
with:

```ts
  permissions: ['core:teams.read', 'core:fonts.read'],
```


Create `rcl-core/web/src/pages/font-files.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_FONT_BYTES } from '@rollcall/core-contract';
import { fontProblem, fontTypeOf, suggestFace } from './font-files.ts';

const file = (name: string, size = 4) => new File([new Uint8Array(size)], name);

describe('fontTypeOf', () => {
  it('knows a font by its extension, since browsers often leave its type blank', () => {
    expect(['a.woff2', 'a.WOFF', 'a.ttf', 'a.Otf', 'a.svg', 'woff2'].map(fontTypeOf)).toEqual([
      'font/woff2',
      'font/woff',
      'font/ttf',
      'font/otf',
      undefined,
      undefined,
    ]);
  });
});

describe('fontProblem', () => {
  it('refuses anything but a WOFF2, WOFF, TTF or OTF file of at most 5 MB', () => {
    expect(fontProblem(file('Rollerball.woff2'))).toBeNull();
    expect(fontProblem(file('Rollerball.woff2', MAX_FONT_BYTES))).toBeNull();
    expect(fontProblem(file('Rollerball.svg'))).toBe('Use a WOFF2, WOFF, TTF or OTF font');
    expect(fontProblem(file('Rollerball.woff2', MAX_FONT_BYTES + 1))).toBe('That font is over 5 MB');
  });
});

describe('suggestFace', () => {
  it('suggests the family, weight and style from the file name, minus any weight or style words', () => {
    expect(suggestFace('Rollerball-Bold.woff2')).toEqual({ family: 'Rollerball', weight: '700', style: 'normal' });
    expect(suggestFace('Rollerball-BoldItalic.ttf')).toEqual({ family: 'Rollerball', weight: '700', style: 'italic' });
    expect(suggestFace('Open_Sans-SemiBold.otf')).toEqual({ family: 'Open Sans', weight: '600', style: 'normal' });
    expect(suggestFace('Jammer Sans Light Italic.woff')).toEqual({
      family: 'Jammer Sans',
      weight: '300',
      style: 'italic',
    });
  });

  it('suggests 400 when the name has no weight, and drops what a family name cannot hold', () => {
    expect(suggestFace('Inter[wght].ttf')).toEqual({ family: 'Inter', weight: '400', style: 'normal' });
    expect(suggestFace('Derby™ Display.woff2')).toEqual({ family: 'Derby Display', weight: '400', style: 'normal' });
  });
});
```

Create `rcl-core/web/src/pages/FontsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { FontFamily } from '@rollcall/core-contract';
import { ADMIN, ANNOUNCER, json, noContent, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const INTER: FontFamily = {
  name: 'Inter',
  bundled: true,
  faces: [
    {
      id: 'bundled-inter',
      weightMin: 100,
      weightMax: 900,
      style: 'normal',
      format: 'font/ttf',
      url: '/fonts/inter/inter.ttf',
    },
  ],
};
const ROLLERBALL: FontFamily = {
  name: 'Rollerball',
  bundled: false,
  faces: [
    { id: 'f1', weightMin: 400, weightMax: 400, style: 'normal', format: 'font/woff2', url: '/media/aaa' },
    { id: 'f2', weightMin: 700, weightMax: 700, style: 'italic', format: 'font/woff2', url: '/media/bbb' },
  ],
};
const LIBRARY = [INTER, ROLLERBALL];
const SAMPLE = 'Jam 3 · Rollcall 128–96';

const rowOf = (name: string) => within(screen.getByRole('table')).getByText(name).closest('tr')!;
const fileInput = () => document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
const pickFile = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });
// A font file as a browser often gives it: its type left blank.
const woff2 = (name: string, size?: number) =>
  new File([size === undefined ? 'wOF2' : new Uint8Array(size)], name, { type: '' });

async function openFonts(user = ADMIN, more = {}) {
  const server = signedIn(user, { 'GET /api/core/fonts': json(LIBRARY), ...more });
  openCore('/core/fonts');
  await within(await screen.findByRole('table')).findByText('Rollerball');
  return server;
}

describe('the Fonts page', () => {
  it('lists each family with a sample line in its own font, its faces, and which come with Rollcall', async () => {
    await openFonts(PRODUCER);
    expect(within(rowOf('Inter')).getByText('Bundled')).toBeTruthy();
    expect(within(rowOf('Inter')).getByText('100–900')).toBeTruthy();
    expect(within(rowOf('Rollerball')).getByText('400')).toBeTruthy();
    expect(within(rowOf('Rollerball')).getByText('700 italic')).toBeTruthy();
    expect(within(rowOf('Rollerball')).queryByText('Bundled')).toBeNull();
    expect(within(rowOf('Rollerball')).getByText(SAMPLE).style.fontFamily).toContain('Rollerball');
    const rules = [...document.querySelectorAll('style')].map((style) => style.textContent).join('\n');
    expect(rules).toContain('font-family: "Rollerball";');
    expect(rules).toContain('src: url("/media/bbb") format("woff2");');
    expect(screen.getByRole('link', { name: 'Fonts' })).toBeTruthy();
  });

  it('is read-only for Producers and Announcers', async () => {
    for (const user of [PRODUCER, ANNOUNCER]) {
      await openFonts(user);
      expect(screen.queryByRole('button', { name: /Remove/ }), user.role).toBeNull();
      expect(screen.queryByRole('button', { name: 'Upload font' }), user.role).toBeNull();
      document.body.innerHTML = '';
    }
  });

  it('uploads a font as the file itself, suggesting its family, weight and style from the file name', async () => {
    let sent: URLSearchParams | undefined;
    const { requests } = await openFonts(ADMIN, {
      'POST /api/core/fonts/faces': (request: Request) => {
        sent = new URL(request.url).searchParams;
        return Response.json(ROLLERBALL, { status: 201 });
      },
    });
    expect(screen.getByText('Upload only fonts you’re licensed to use in a broadcast.')).toBeTruthy();
    pickFile(woff2('Jammer-BoldItalic.woff2'));
    expect(await screen.findByText('Jammer-BoldItalic.woff2')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Family').value).toBe('Jammer');
    expect(screen.getByLabelText<HTMLInputElement>('Weight').value).toBe('700');
    expect(screen.getByLabelText<HTMLSelectElement>('Style').value).toBe('italic');
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'Jammer Sans' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload font' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        method: 'POST',
        path: '/api/core/fonts/faces',
        body: 'wOF2',
        contentType: 'font/woff2',
      }),
    );
    expect(Object.fromEntries(sent ?? [])).toEqual({ family: 'Jammer Sans', weight: '700', style: 'italic' });
    await vi.waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Family').value).toBe(''));
  });

  it('refuses a file that is not a font, or is over 5 MB, before sending it', async () => {
    const { requests } = await openFonts();
    pickFile(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(await screen.findByText('Use a WOFF2, WOFF, TTF or OTF font')).toBeTruthy();
    pickFile(woff2('Huge.woff2', 5 * 1024 * 1024 + 1));
    expect(await screen.findByText('That font is over 5 MB')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Upload font' }).disabled).toBe(true);
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('checks the family and weight against the contract before sending', async () => {
    const { requests } = await openFonts();
    pickFile(woff2('Jammer.woff2'));
    fireEvent.change(await screen.findByLabelText('Family'), { target: { value: 'Bad;Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload font' }));
    expect(await screen.findByText('Use 1–64 letters, digits, spaces, dashes or underscores')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'Jammer' } });
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '900-100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload font' }));
    expect(await screen.findByText('Use weights from 100 to 900, lowest first')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it("shows the server's reason when it refuses an upload", async () => {
    await openFonts(ADMIN, {
      'POST /api/core/fonts/faces': json(
        { error: 'family_bundled', message: 'Inter comes with Rollcall. Upload yours under another family name.' },
        409,
      ),
    });
    pickFile(woff2('Inter-Bold.woff2'));
    fireEvent.click(await screen.findByRole('button', { name: 'Upload font' }));
    expect(await screen.findByText('Inter comes with Rollcall. Upload yours under another family name.')).toBeTruthy();
  });

  it('removes an uploaded face once you confirm, and never a bundled one', async () => {
    const { requests } = await openFonts(ADMIN, { 'DELETE /api/core/fonts/faces/f2': noContent });
    expect(within(rowOf('Inter')).queryByRole('button', { name: /Remove/ })).toBeNull();
    fireEvent.click(within(rowOf('Rollerball')).getByRole('button', { name: 'Remove Rollerball 700 italic' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove Rollerball 700 italic?' });
    expect(
      within(confirm).getByText('Themes that use it fall back to another face, or to a system font.'),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove font' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/core/fonts/faces/f2', body: undefined }),
    );
  });

  it('hides the page and its link from someone who may not view fonts', async () => {
    signedIn({ ...PRODUCER, permissions: ['core:teams.read'] });
    openCore('/core/fonts');
    expect(await screen.findByText("Your account can't view fonts.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Fonts' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run --project core-web rcl-core/web/src/pages/font-files.test.ts rcl-core/web/src/pages/FontsPage.test.tsx`
Expected: FAIL.
- `font-files.test.ts` doesn't load: `Failed to resolve import "./font-files.ts"`.
- All 8 in `FontsPage.test.tsx`: `Unable to find role="table"`, since there's no page.

- [ ] **Step 3: Checking and naming font files.**

Create `rcl-core/web/src/pages/font-files.ts`:

```ts
import { MAX_FONT_BYTES, type FontStyle, type FontType } from '@rollcall/core-contract';

// Checking and naming a font file before it's uploaded (docs/features/theme-builder.md). The server checks it again,
// by its bytes (ADR-0022).

// Browsers often leave a font file's type blank, so its extension says what it is.
const FONT_EXTENSIONS: Partial<Record<string, FontType>> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

/** The font type a file's name says it is, or undefined when it isn't a font. */
export const fontTypeOf = (fileName: string): FontType | undefined =>
  FONT_EXTENSIONS[/\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? ''];

/** Why a chosen file can't be uploaded, or null. */
export function fontProblem(file: File): string | null {
  if (!fontTypeOf(file.name)) return 'Use a WOFF2, WOFF, TTF or OTF font';
  if (file.size > MAX_FONT_BYTES) return 'That font is over 5 MB';
  return null;
}

// The words font files use for their weight.
const WEIGHTS: Partial<Record<string, number>> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};
// A word that is only a weight, a style or both, such as "Bold", "Italic" or "SemiBoldItalic".
const STYLE_WORD = /^([a-z]*?)(italic|oblique)?$/i;

/**
 * A guess at a font file's family, weight and style from its name: "Rollerball-BoldItalic.woff2" is Rollerball, 700,
 * italic. The family keeps only what a family name may hold. The person corrects it before uploading.
 */
export function suggestFace(fileName: string): { family: string; weight: string; style: FontStyle } {
  let weight = 400;
  let style: FontStyle = 'normal';
  const words: string[] = [];
  const name = fileName.replace(/\.[^.]*$/, '').replaceAll(/\[[^\]]*\]/g, ' ');
  for (const word of name.split(/[-_\s]+/).filter(Boolean)) {
    const match = STYLE_WORD.exec(word);
    const weightWord = match?.[1] ?? '';
    const italic = match?.[2];
    const weightValue = WEIGHTS[weightWord.toLowerCase()];
    const isStyle = match !== null && (weightWord === '' ? italic !== undefined : weightValue !== undefined);
    if (!isStyle) {
      words.push(word);
      continue;
    }
    if (weightValue !== undefined) weight = weightValue;
    if (italic !== undefined) style = 'italic';
  }
  const family = words
    .join(' ')
    .replaceAll(/[^A-Za-z0-9 _-]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
  return { family, weight: String(weight), style };
}
```

- [ ] **Step 4: The endpoints, the sample line and the page.**

In `rcl-core/web/src/api.ts`:

Replace:

```ts
  CreateApiKeyResponseSchema,
```
with:

```ts
  CreateApiKeyResponseSchema,
  FontFamilySchema,
```


Replace:

```ts
  type CreateUserResponse,
```
with:

```ts
  type CreateUserResponse,
  type FontFamily,
  type FontType,
```


Replace:

```ts
  type UpdateTeamRequest,
```
with:

```ts
  type UpdateTeamRequest,
  type UploadFontFaceQuery,
```


Replace:

```ts
const coreApi = api.enhanceEndpoints({ addTagTypes: ['Users', 'ApiKeys', 'Teams'] }).injectEndpoints({
```
with:

```ts
const coreApi = api.enhanceEndpoints({ addTagTypes: ['Users', 'ApiKeys', 'Teams', 'Fonts'] }).injectEndpoints({
```


Replace:

```ts
    }),
  }),
```
with:

```ts
    }),
    getFonts: build.query<FontFamily[], void>({
      query: () => 'core/fonts',
      transformResponse: (response: unknown) => FontFamilySchema.array().parse(response),
      providesTags: ['Fonts'],
    }),
    // A font is sent as it is, with its family, weights and style in the query string (ADR-0022). fetchBaseQuery
    // drops any Content-Type header on a file and lets the browser send the file's own type, which is often blank for
    // a font, so the file goes as a copy typed by its extension.
    uploadFontFace: build.mutation<FontFamily, { face: UploadFontFaceQuery; file: File; type: FontType }>({
      query: ({ face, file, type }) => ({
        url: 'core/fonts/faces',
        method: 'POST',
        params: face,
        body: new Blob([file], { type }),
      }),
      transformResponse: (response: unknown) => FontFamilySchema.parse(response),
      invalidatesTags: ['Fonts'],
    }),
    removeFontFace: build.mutation<void, string>({
      query: (id) => ({ url: `core/fonts/faces/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: ['Fonts'],
    }),
  }),
```


Replace:

```ts
  useRemovePhotoMutation,
```
with:

```ts
  useRemovePhotoMutation,
  useGetFontsQuery,
  useUploadFontFaceMutation,
  useRemoveFontFaceMutation,
```


Create `rcl-core/web/src/pages/FontSample.tsx`:

```tsx
import { Text } from '@mantine/core';

/** The line every font is shown with: letters, digits and the dashes and dots derby names and scores use. */
export const SAMPLE_LINE = 'Jam 3 · Rollcall 128–96';

// A sample line in one font family, falling back to the system font while it loads or when it's missing. The page
// showing it adds the family's @font-face rules.
export function FontSample({ family, weight = 400 }: { family: string; weight?: number }) {
  return (
    <Text size="xl" style={{ fontFamily: `"${family}", system-ui, sans-serif`, fontWeight: weight }}>
      {SAMPLE_LINE}
    </Text>
  );
}
```

Create `rcl-core/web/src/pages/FontSample.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FontSample } from './FontSample.tsx';

// Storybook has no Rollcall server, so the font itself doesn't load: the sample falls back to the system font, as it
// does on the Fonts page while a font loads.
const meta = {
  title: 'Fonts/FontSample',
  component: FontSample,
  args: { family: 'Inter' },
} satisfies Meta<typeof FontSample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Regular: Story = {};

export const Bold: Story = { args: { weight: 700 } };

export const MissingFamily: Story = { args: { family: 'Not In The Library' } };
```

Create `rcl-core/web/src/pages/FontsPage.tsx`:

```tsx
import { useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileButton,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  fontFaceRules,
  UploadFontFaceQuerySchema,
  type FontFace,
  type FontFamily,
  type FontStyle,
} from '@rollcall/core-contract';
import { useGetMeQuery } from '@rollcall/web-sdk';
import { useGetFontsQuery, useRemoveFontFaceMutation, useUploadFontFaceMutation } from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
import { fontProblem, fontTypeOf, suggestFace } from './font-files.ts';
import { FontSample } from './FontSample.tsx';

// The font library (docs/features/theme-builder.md): the families that come with Rollcall and those Admins upload,
// each shown in its own font. core:fonts.read may look, and core:fonts.manage may upload and remove faces. Hiding
// things is only for convenience: the server checks every request (hard rule 5).
export function FontsPage() {
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('core:fonts.read')) return <Alert color="gray">Your account can't view fonts.</Alert>;
  return <FontLibrary canManage={me.permissions.includes('core:fonts.manage')} />;
}

/** A face as people read it: "400", or "100–900" for a variable font, with "italic" after an italic one. */
export function faceLabel(face: FontFace): string {
  const weights = face.weightMin === face.weightMax ? `${face.weightMin}` : `${face.weightMin}–${face.weightMax}`;
  return face.style === 'italic' ? `${weights} italic` : weights;
}

interface Removing {
  family: FontFamily;
  face: FontFace;
}

function FontLibrary({ canManage }: { canManage: boolean }) {
  const fonts = useGetFontsQuery();
  const [removing, setRemoving] = useState<Removing | null>(null);
  // Every family's faces, so each sample line shows in its own font.
  const rules = useMemo(() => fontFaceRules(fonts.data ?? []), [fonts.data]);
  return (
    <Stack maw={980}>
      <Title order={2}>Fonts</Title>
      {canManage && <UploadFont />}
      {fonts.isError && <Alert color="red">{problemWith(fonts.error)}</Alert>}
      {rules && <style>{rules}</style>}
      {fonts.data && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Family</Table.Th>
              <Table.Th>Sample</Table.Th>
              <Table.Th>Faces</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {fonts.data.map((family) => (
              <FamilyRow
                key={family.name}
                family={family}
                onRemove={canManage ? (face) => setRemoving({ family, face }) : undefined}
              />
            ))}
          </Table.Tbody>
        </Table>
      )}
      {removing && <RemoveFace {...removing} onClose={() => setRemoving(null)} />}
    </Stack>
  );
}

// A family: its name, a sample line, and its faces. Uploaded faces get Remove when `onRemove` is given.
function FamilyRow({ family, onRemove }: { family: FontFamily; onRemove?: (face: FontFace) => void }) {
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Text fw={500}>{family.name}</Text>
          {family.bundled && (
            <Badge variant="light" color="gray">
              Bundled
            </Badge>
          )}
        </Group>
      </Table.Td>
      <Table.Td>
        <FontSample family={family.name} />
      </Table.Td>
      <Table.Td>
        <Stack gap={4}>
          {family.faces.map((face) => (
            <Group key={face.id} gap="xs">
              <Text size="sm">{faceLabel(face)}</Text>
              {onRemove && !family.bundled && (
                <Button
                  variant="subtle"
                  color="red"
                  size="compact-xs"
                  aria-label={`Remove ${family.name} ${faceLabel(face)}`}
                  onClick={() => onRemove(face)}
                >
                  Remove
                </Button>
              )}
            </Group>
          ))}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}

// Removes an uploaded face once the person confirms.
function RemoveFace({ family, face, onClose }: Removing & { onClose: () => void }) {
  const [removeFontFace, { isLoading }] = useRemoveFontFaceMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const name = `${family.name} ${faceLabel(face)}`;
  const confirm = async () => {
    const result = await removeFontFace(face.id);
    if (result.error) setProblem(problemWith(result.error, { not_found: 'That font was already removed.' }));
    else onClose();
  };
  return (
    <Modal opened onClose={onClose} title={`Remove ${name}?`}>
      <Stack>
        <Text>Themes that use it fall back to another face, or to a system font.</Text>
        {problem && <Alert color="red">{problem}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" loading={isLoading} onClick={() => void confirm()}>
            Remove font
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

const STYLES = [
  { value: 'normal', label: 'Normal' },
  { value: 'italic', label: 'Italic' },
];

// Uploads one face: choose a file, which is checked at once and suggests its family, weight and style, correct them,
// then Upload. The fields are checked against the contract before anything is sent.
function UploadFont() {
  const [uploadFontFace, { isLoading, error, reset }] = useUploadFontFaceMutation();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [family, setFamily] = useState('');
  const [weight, setWeight] = useState('400');
  const [style, setStyle] = useState<FontStyle>('normal');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const choose = (picked: File | null) => {
    if (!picked) return;
    reset();
    setErrors({});
    const found = fontProblem(picked);
    setProblem(found);
    setFile(found ? null : picked);
    if (found) return;
    const suggested = suggestFace(picked.name);
    setFamily(suggested.family);
    setWeight(suggested.weight);
    setStyle(suggested.style);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const type = file ? fontTypeOf(file.name) : undefined;
    if (!file || !type) return;
    const face = { family, weight, style };
    const checked = UploadFontFaceQuerySchema.safeParse(face);
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) return;
    const result = await uploadFontFace({ face, file, type });
    if (!result.data) return;
    setFile(null);
    setFamily('');
    setWeight('400');
    setStyle('normal');
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack gap="xs">
        <Title order={3}>Upload a font</Title>
        <Text size="sm">Upload only fonts you’re licensed to use in a broadcast.</Text>
        <Group>
          <FileButton onChange={choose} accept=".woff2,.woff,.ttf,.otf">
            {(props) => (
              <Button {...props} variant="default">
                Choose font file
              </Button>
            )}
          </FileButton>
          <Text size="sm">{file ? file.name : 'No file chosen.'}</Text>
        </Group>
        {problem && (
          <Text size="sm" c="red" role="alert">
            {problem}
          </Text>
        )}
        <Group align="start">
          <TextInput
            label="Family"
            value={family}
            onChange={(event) => setFamily(event.currentTarget.value)}
            error={errors.family}
            disabled={!file}
            w={260}
          />
          <TextInput
            label="Weight"
            description="400, or a range such as 100-900 for a variable font"
            value={weight}
            onChange={(event) => setWeight(event.currentTarget.value)}
            error={errors.weight}
            disabled={!file}
            w={240}
          />
          <NativeSelect
            label="Style"
            data={STYLES}
            value={style}
            onChange={(event) => setStyle(event.currentTarget.value === 'italic' ? 'italic' : 'normal')}
            disabled={!file}
          />
        </Group>
        <Group>
          <Button type="submit" loading={isLoading} disabled={!file}>
            Upload font
          </Button>
        </Group>
        {error && <Alert color="red">{problemWith(error)}</Alert>}
      </Stack>
    </form>
  );
}
```

Replace `rcl-core/web/src/routes.tsx` with:

```tsx
import type { RouteObject } from 'react-router';
import { APP_NAME } from '@rollcall/core-contract';
import { AppLayout, PageNotFound, SignInGate, type AppLink } from '@rollcall/web-sdk';
import { ApiKeysPage } from './pages/ApiKeysPage.tsx';
import { ChangePasswordPage } from './pages/ChangePasswordPage.tsx';
import { FontsPage } from './pages/FontsPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { SetupPage } from './pages/SetupPage.tsx';
import { TeamPage } from './pages/TeamPage.tsx';
import { TeamsPage } from './pages/TeamsPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';

// Pages behind the sign-in gate share the app's header. Setup, sign-in and choosing a password come before it, at
// the addresses every rcl app sends people to (CORE_PAGES in the web SDK).
// Each is shown only to people holding its permission; the server checks every request anyway (hard rule 5).
const LINKS: readonly AppLink[] = [
  { label: 'Teams', to: '/teams', permission: 'core:teams.read' },
  { label: 'Fonts', to: '/fonts', permission: 'core:fonts.read' },
  { label: 'Users', to: '/users', permission: 'core:users.manage' },
  { label: 'API keys', to: '/api-keys', permission: 'core:api-keys.manage' },
];

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <SignInGate>
        <AppLayout title={APP_NAME} links={LINKS} />
      </SignInGate>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'teams/:id', element: <TeamPage /> },
      { path: 'fonts', element: <FontsPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'api-keys', element: <ApiKeysPage /> },
      { path: '*', element: <PageNotFound /> },
    ],
  },
  { path: '/setup', element: <SetupPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/change-password', element: <ChangePasswordPage /> },
];
```

In `.claude/rules/rcl-core-web.md`:

Replace:

```markdown
- **Images** are sent as the raw file with its own type, never as JSON (`setLogo`, `setPhoto` in `src/api.ts`), and checked first with `imageProblem` (`src/pages/ImagePicker.tsx`). The server checks them again (ADR-0022).
```
with:

```markdown
- **Images** are sent as the raw file with its own type, never as JSON (`setLogo`, `setPhoto` in `src/api.ts`), and checked first with `imageProblem` (`src/pages/ImagePicker.tsx`). The server checks them again (ADR-0022).
- **Fonts** are checked first with `fontProblem` (`src/pages/font-files.ts`) and sent as a copy of the file typed by its extension (`uploadFontFace`): `fetchBaseQuery` drops a `Content-Type` header on a file body, and browsers often leave a font's type blank.
```


- [ ] **Step 5: Run them and see them pass.**

Run: the command from Step 2.
Expected: PASS, 12 tests. `yarn test` passes 462.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/web packages/web-sdk/src/testing.ts .claude/rules
git commit -F - <<'EOF'
feat(rcl-core): the Fonts page

Every family in the font library, each with a sample line in its own
font and its faces, bundled ones marked. Admins upload a face: choosing
a file suggests its family, weight and style from its name, and the file
is checked in the browser first. They remove uploaded faces after a
confirmation. Producers and Announcers can look.

Refs #19

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: The Themes list and editor

**Files:**
- Move: `rcl-core/web/src/forms.ts` to `packages/web-sdk/src/forms.ts`
- Create: `rcl-producer/web/src/api.ts`, `rcl-producer/web/src/pages/ThemesPage.tsx`, `rcl-producer/web/src/pages/ThemePage.tsx`, `rcl-producer/web/src/pages/ThemeEditor.tsx`, `rcl-producer/web/src/pages/ThemePreview.tsx`, `rcl-producer/web/src/pages/ThemePreview.module.css`, `rcl-producer/web/src/overlay/components/ThemeSample.tsx`, `rcl-producer/web/src/overlay/components/ThemeSample.module.css`, `rcl-producer/web/src/overlay/components/ThemeSample.stories.tsx`
- Modify: `packages/web-sdk/src/index.ts`, ten of rcl-core's pages (their imports), `rcl-producer/contract/src/themes.ts`, `rcl-producer/web/src/routes.tsx`, `.claude/rules/rcl-core-web.md`, `.claude/rules/rcl-producer-web.md`, `.claude/rules/sdk.md`
- Test: `packages/web-sdk/src/forms.test.ts`, `rcl-producer/web/src/overlay/components/ThemeSample.test.tsx`, `rcl-producer/web/src/pages/ThemesPage.test.tsx`, `rcl-producer/web/src/pages/ThemePage.test.tsx`, `rcl-producer/web/src/test/open-producer.tsx` (all new), `rcl-producer/contract/src/themes.test.ts`

**Interfaces:**
- Consumes:
  - from Task 4: `ThemeTokens`, `Theme`, `DEFAULT_TOKENS`, `MAX_EXTRA_COLORS`, the request schemas and `themeToCss`;
  - from Task 6: `ThemeScope`, and `PlaceholderCard` with the new variables;
  - from Task 7: the fixtures, and the font list at `GET /api/core/fonts`.
- Produces:
  - `fieldErrors`, `pathErrors` and `problemWith` from `@rollcall/web-sdk` (`pathErrors` keys each problem by its full path, such as `tokens.colors.accent`);
  - the Producer app's `api.ts`: `useGetFontsQuery`, `useGetThemesQuery`, `useGetThemeQuery`, `useCreateThemeMutation`, `useUpdateThemeMutation` (`{ id, changes }`), `useDuplicateThemeMutation` (`{ id }`), `useDeleteThemeMutation` (`{ id }`) and `useSetDefaultThemeMutation` (`{ themeId }`), with tags `Themes` and `Fonts`;
  - `ThemeSample({ extras? })`, an overlay component;
  - `ThemesPage` at `/producer/themes` and `ThemePage` at `/producer/themes/:id`, with `ThemeEditor` and `ThemePreview({ css, extras })`;
  - `openProducer(url)` and `whereIs(router)` for the Producer app's page tests;
  - the contract's pixel tokens refuse `NaN` with their plain message.

- [ ] **Step 1: Write the failing tests.**

Create `packages/web-sdk/src/forms.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fieldErrors, pathErrors } from './forms.ts';

// What a contract schema's failed check gives: each problem with its path.
const problems = {
  issues: [
    { path: ['name'], message: 'Give it a name' },
    { path: ['colors', 'accent'], message: 'Use a color' },
    { path: ['colors', 'accent'], message: 'A later problem' },
    { path: ['extras', 0, 'name'], message: 'Use lowercase letters' },
  ],
};

describe('fieldErrors', () => {
  it('keeps the first problem with each top-level field', () => {
    expect(fieldErrors(problems)).toEqual({
      name: 'Give it a name',
      colors: 'Use a color',
      extras: 'Use lowercase letters',
    });
  });
});

describe('pathErrors', () => {
  it('keeps the first problem at each full path, for nested fields', () => {
    expect(pathErrors(problems)).toEqual({
      name: 'Give it a name',
      'colors.accent': 'Use a color',
      'extras.0.name': 'Use lowercase letters',
    });
  });
});
```

A cleared number field gives `NaN`:

In `rcl-producer/contract/src/themes.test.ts`:

Replace:

```ts
  it('keeps sizes, corners and borders within their limits, in whole pixels', () => {
    const cases: [(draft: ThemeTokens, value: number) => void, number[], number[], string][] = [
      [(draft, value) => void (draft.fonts.size = value), [12, 96], [11, 97, 16.5], 'Use 12 to 96 pixels'],
      [(draft, value) => void (draft.shape.radius = value), [0, 64], [-1, 65, 1.5], 'Use 0 to 64 pixels'],
      [(draft, value) => void (draft.shape.borderWidth = value), [0, 16], [-1, 17], 'Use 0 to 16 pixels'],
```
with:

```ts
  // NaN is what a cleared number field gives.
  it('keeps sizes, corners and borders within their limits, in whole pixels', () => {
    const cases: [(draft: ThemeTokens, value: number) => void, number[], number[], string][] = [
      [(draft, value) => void (draft.fonts.size = value), [12, 96], [11, 97, 16.5, Number.NaN], 'Use 12 to 96 pixels'],
      [(draft, value) => void (draft.shape.radius = value), [0, 64], [-1, 65, 1.5, Number.NaN], 'Use 0 to 64 pixels'],
      [(draft, value) => void (draft.shape.borderWidth = value), [0, 16], [-1, 17, Number.NaN], 'Use 0 to 16 pixels'],
```


Create `rcl-producer/web/src/overlay/components/ThemeSample.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeSample } from './ThemeSample.tsx';

describe('ThemeSample', () => {
  it('shows each kind of text, a table, an accent bar and a bordered panel', () => {
    render(<ThemeSample />);
    expect(screen.getByText('Heading')).toBeTruthy();
    expect(screen.getByText('Body text: the jammer laps the pack.')).toBeTruthy();
    expect(screen.getByText('Muted text: Jam 3 · Period 1')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Accent bar')).toBeTruthy();
    expect(screen.getByText('Bordered panel')).toBeTruthy();
    expect(screen.queryByText('Extra colors')).toBeNull();
  });

  it('shows a swatch of each extra color, by its variable', () => {
    const { container } = render(<ThemeSample extras={['gold', 'team-2']} />);
    expect(screen.getByText('Extra colors')).toBeTruthy();
    const chips = [...container.querySelectorAll<HTMLElement>('[data-extra]')];
    expect(chips.map((chip) => chip.style.background)).toEqual([
      'var(--theme-extra-gold)',
      'var(--theme-extra-team-2)',
    ]);
    expect(screen.getByText('team-2')).toBeTruthy();
  });
});
```

Create `rcl-producer/web/src/test/open-producer.tsx`:

```tsx
import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App, makeStore } from '@rollcall/web-sdk';
import { PRODUCER_BASE } from '../base.ts';
import { routes } from '../routes.tsx';

/** The Producer app opened at `url` (such as `/producer/themes`), as a browser would. Returns its router. */
export function openProducer(url: string) {
  const router = createMemoryRouter(routes, { basename: PRODUCER_BASE, initialEntries: [url] });
  render(<App router={router} store={makeStore()} />);
  return router;
}

/** Where the app is now, such as `/producer/themes/t1`. */
export const whereIs = (router: ReturnType<typeof openProducer>) => router.state.location.pathname;
```

Create `rcl-producer/web/src/pages/ThemesPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { DEFAULT_TOKENS, type Theme } from '@rollcall/producer-contract';
import { ADMIN, ANNOUNCER, json, noContent, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openProducer, whereIs } from '../test/open-producer.tsx';

afterEach(() => vi.unstubAllGlobals());

const theme = (id: string, name: string, change: Partial<Theme> = {}): Theme => ({
  id,
  name,
  tokens: DEFAULT_TOKENS,
  isDefault: false,
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:00:00.000Z',
  ...change,
});
const NIGHT = theme('t1', 'Derby Night', {
  isDefault: true,
  tokens: { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: '#ffd700' } },
});
const FINALS = theme('t2', 'Finals');
const THEMES = [NIGHT, FINALS];

const rowOf = (name: string) => within(screen.getByRole('table')).getByText(name).closest('tr')!;

async function openThemes(user = ADMIN, more = {}) {
  const server = signedIn(user, { 'GET /api/producer/themes': json(THEMES), ...more });
  const router = openProducer('/producer/themes');
  await within(await screen.findByRole('table')).findByText('Derby Night');
  return { ...server, router };
}

// Opens a theme's row menu and picks `item`.
async function pick(name: string, item: string) {
  fireEvent.click(within(rowOf(name)).getByRole('button', { name: `Actions for ${name}` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
}

describe('the Themes page', () => {
  it('lists each theme with its default badge and its surface and accent colors, linking to it', async () => {
    await openThemes(PRODUCER);
    const night = within(rowOf('Derby Night'));
    expect(night.getByRole('link', { name: 'Derby Night' }).getAttribute('href')).toBe('/producer/themes/t1');
    expect(night.getByText('Default')).toBeTruthy();
    expect(night.getByText('Accent #ffd700')).toBeTruthy();
    expect(night.getByText(`Surface ${DEFAULT_TOKENS.colors.surface}`)).toBeTruthy();
    expect(within(rowOf('Finals')).queryByText('Default')).toBeNull();
    expect(screen.getByRole('link', { name: 'Themes' })).toBeTruthy();
  });

  it('creates a theme from its name, then opens it', async () => {
    const created = theme('t3', 'Playoffs');
    const { requests, router } = await openThemes(ADMIN, {
      'POST /api/producer/themes': json(created, 201),
      'GET /api/producer/themes/t3': json(created),
      'GET /api/core/fonts': json([]),
    });
    fireEvent.change(screen.getByLabelText('New theme'), { target: { value: ' Playoffs ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create theme' }));
    await vi.waitFor(() => expect(whereIs(router)).toBe('/producer/themes/t3'));
    expect(requests).toContainEqual({ method: 'POST', path: '/api/producer/themes', body: { name: 'Playoffs' } });
  });

  it('asks for a name before sending anything, and shows a name that is taken', async () => {
    const { requests } = await openThemes(ADMIN, {
      'POST /api/producer/themes': json({ error: 'name_taken', message: 'That name is already taken' }, 409),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create theme' }));
    expect(await screen.findByText('Give the theme a name')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
    fireEvent.change(screen.getByLabelText('New theme'), { target: { value: 'Finals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create theme' }));
    expect(await screen.findByText('That name is already taken')).toBeTruthy();
  });

  it('duplicates a theme from its menu', async () => {
    const { requests } = await openThemes(ADMIN, {
      'POST /api/producer/themes/t2/duplicate': json(theme('t4', 'Finals copy'), 201),
    });
    await pick('Finals', 'Duplicate');
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'POST', path: '/api/producer/themes/t2/duplicate', body: {} }),
    );
  });

  it('makes a theme the default, or stops using the default', async () => {
    const { requests } = await openThemes(ADMIN, {
      'PUT /api/producer/default-theme': async (request: Request) => Response.json(await request.json()),
    });
    await pick('Finals', 'Make default');
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'PUT', path: '/api/producer/default-theme', body: { themeId: 't2' } }),
    );
    await pick('Derby Night', 'Stop using as default');
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'PUT', path: '/api/producer/default-theme', body: { themeId: null } }),
    );
  });

  it('deletes a theme once you confirm, warning when it is the default', async () => {
    const { requests } = await openThemes(ADMIN, { 'DELETE /api/producer/themes/t1': noContent });
    await pick('Derby Night', 'Delete');
    const confirm = await screen.findByRole('dialog', { name: 'Delete Derby Night?' });
    expect(
      within(confirm).getByText('The overlay goes back to the built-in look. This cannot be undone.'),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete theme' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/producer/themes/t1', body: undefined }),
    );
  });

  it('is read-only for a Producer', async () => {
    await openThemes(PRODUCER);
    expect(screen.queryByRole('button', { name: 'Create theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull();
  });

  it('hides the page and its link from someone who may not view themes', async () => {
    signedIn(ANNOUNCER);
    openProducer('/producer/themes');
    expect(await screen.findByText("Your account can't view themes.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Themes' })).toBeNull();
  });
});
```

Create `rcl-producer/web/src/pages/ThemePage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { FontFamily } from '@rollcall/core-contract';
import { DEFAULT_TOKENS, type Theme, type ThemeTokens } from '@rollcall/producer-contract';
import { ADMIN, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openProducer } from '../test/open-producer.tsx';

afterEach(() => vi.unstubAllGlobals());

const family = (name: string): FontFamily => ({
  name,
  bundled: true,
  faces: [{ id: name, weightMin: 100, weightMax: 900, style: 'normal', format: 'font/ttf', url: `/fonts/${name}.ttf` }],
});
const LIBRARY = [family('Inter'), family('Oswald')];
const THEME: Theme = {
  id: 't1',
  name: 'Derby Night',
  tokens: DEFAULT_TOKENS,
  isDefault: false,
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:00:00.000Z',
};
const withTokens = (change: (tokens: ThemeTokens) => void): Theme => {
  const tokens = structuredClone(DEFAULT_TOKENS);
  change(tokens);
  return { ...THEME, tokens };
};

const scope = () => document.querySelector<HTMLElement>('[data-theme-scope]')!;
const variable = (name: string) => scope().style.getPropertyValue(name);
const patches = (requests: { method: string }[]) => requests.filter((r) => r.method === 'PATCH');

async function openTheme(user = ADMIN, theme = THEME, more = {}) {
  const server = signedIn(user, {
    'GET /api/producer/themes/t1': json(theme),
    'GET /api/core/fonts': json(LIBRARY),
    ...more,
  });
  openProducer('/producer/themes/t1');
  expect(await screen.findByRole('heading', { name: theme.name })).toBeTruthy();
  await vi.waitFor(() => expect(variable('--theme-color-accent')).toBe(theme.tokens.colors.accent));
  return server;
}

describe('the theme editor', () => {
  it('shows a live preview that follows every change before it is saved', async () => {
    const { requests } = await openTheme();
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#ffd700' } });
    await vi.waitFor(() => expect(variable('--theme-color-accent')).toBe('#ffd700'));
    fireEvent.change(screen.getByLabelText('Heading font'), { target: { value: 'Oswald' } });
    await vi.waitFor(() => expect(variable('--theme-font-heading')).toBe('"Oswald", system-ui, sans-serif'));
    expect(scope().querySelector('style')?.textContent).toContain('font-family: "Oswald";');
    expect(within(scope()).getByText('Accent bar')).toBeTruthy();
    expect(patches(requests)).toEqual([]);
  });

  it('saves the name and every token, checked against the contract first', async () => {
    const saved = withTokens((tokens) => {
      tokens.colors.accent = '#ffd700';
      tokens.shape.radius = 0;
    });
    const { requests } = await openTheme(ADMIN, THEME, { 'PATCH /api/producer/themes/t1': json(saved) });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Derby Night 2' } });
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#FFD700' } });
    fireEvent.change(screen.getByLabelText('Corner radius'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await vi.waitFor(() =>
      expect(patches(requests)).toEqual([
        {
          method: 'PATCH',
          path: '/api/producer/themes/t1',
          body: { name: 'Derby Night 2', tokens: saved.tokens },
        },
      ]),
    );
  });

  it('refuses what the contract refuses, in its own words, sending nothing', async () => {
    const { requests } = await openTheme();
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: 'gold' } });
    fireEvent.change(screen.getByLabelText('Base size'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    expect(await screen.findByText('Use a color like #1a2b3c')).toBeTruthy();
    expect(screen.getByText('Use 12 to 96 pixels')).toBeTruthy();
    expect(patches(requests)).toEqual([]);
  });

  it('shows the server’s reason when it refuses a save', async () => {
    await openTheme(ADMIN, THEME, {
      'PATCH /api/producer/themes/t1': json({ error: 'name_taken', message: 'That name is already taken' }, 409),
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Finals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    expect(await screen.findByText('That name is already taken')).toBeTruthy();
  });

  it('discards changes, back to the saved theme', async () => {
    await openTheme();
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#ffd700' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await vi.waitFor(() => expect(variable('--theme-color-accent')).toBe(DEFAULT_TOKENS.colors.accent));
    expect(screen.getByLabelText<HTMLInputElement>('Accent').value).toBe(DEFAULT_TOKENS.colors.accent);
  });

  it('adds, names and removes extra colors, up to 10', async () => {
    await openTheme();
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }));
    expect(screen.getByLabelText<HTMLInputElement>('Extra color 1 name').value).toBe('color-1');
    fireEvent.change(screen.getByLabelText('Extra color 1 name'), { target: { value: 'gold' } });
    fireEvent.change(screen.getByLabelText('Extra color 1'), { target: { value: '#ffd700' } });
    await vi.waitFor(() => expect(variable('--theme-extra-gold')).toBe('#ffd700'));
    expect(within(scope()).getByText('gold')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove extra color 1' }));
    expect(screen.queryByLabelText('Extra color 1 name')).toBeNull();
    for (let n = 0; n < 10; n += 1) fireEvent.click(screen.getByRole('button', { name: 'Add color' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add color' }).disabled).toBe(true);
  });

  it('marks a font that is not in the library, which the overlay shows in a system font', async () => {
    await openTheme(
      ADMIN,
      withTokens((tokens) => void (tokens.fonts.heading.family = 'Gone')),
    );
    expect(await screen.findByRole('option', { name: 'Gone (missing)' })).toBeTruthy();
    expect(screen.getByText('This font isn’t in the font library, so the overlay uses a system font.')).toBeTruthy();
  });

  it('says when saving changes the OBS overlay at once', async () => {
    await openTheme(ADMIN, { ...THEME, isDefault: true });
    expect(screen.getByText('This is the default theme: saving changes the OBS overlay at once.')).toBeTruthy();
  });

  it('is a read-only preview for a Producer', async () => {
    await openTheme(PRODUCER);
    expect(screen.queryByLabelText('Accent')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save theme' })).toBeNull();
    expect(within(scope()).getByText('Heading')).toBeTruthy();
  });

  it('says when the theme does not exist', async () => {
    signedIn(ADMIN, { 'GET /api/core/fonts': json(LIBRARY) });
    openProducer('/producer/themes/t1');
    expect(await screen.findByText('That theme doesn’t exist. It may have been deleted.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to themes' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run packages/web-sdk/src/forms.test.ts rcl-producer/contract/src/themes.test.ts rcl-producer/web/src/overlay/components/ThemeSample.test.tsx rcl-producer/web/src/pages/ThemesPage.test.tsx rcl-producer/web/src/pages/ThemePage.test.tsx`
Expected: FAIL, 19 tests in 5 files.
- `forms.test.ts` and `ThemeSample.test.tsx` don't load: `Failed to resolve import "./forms.ts"` and `"./ThemeSample.tsx"`.
- Contract: "keeps sizes, corners and borders…", on `NaN`: `Invalid input: expected number, received NaN`.
- All 8 in `ThemesPage.test.tsx` and all 10 in `ThemePage.test.tsx`: there are no such pages.

- [ ] **Step 3: Move the form helpers to the web SDK.**

Move `rcl-core/web/src/forms.ts` to `packages/web-sdk/src/forms.ts`:

```bash
git mv rcl-core/web/src/forms.ts packages/web-sdk/src/forms.ts
```

In `packages/web-sdk/src/forms.ts`:

Replace:

```ts
import { apiError } from '@rollcall/web-sdk';
```
with:

```ts
import { apiError } from './errors.ts';
```


Replace:

```ts
  for (const issue of problems.issues) errors[String(issue.path[0] ?? '')] ??= issue.message;
```
with:

```ts
  for (const issue of problems.issues) errors[String(issue.path[0] ?? '')] ??= issue.message;
  return errors;
}

/** The first problem at each full path, such as `tokens.colors.accent`, for forms with nested fields. */
export function pathErrors(problems: Problems): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of problems.issues) errors[issue.path.map(String).join('.')] ??= issue.message;
```


In `packages/web-sdk/src/index.ts`:

Replace:

```ts
export { apiError } from './errors.ts';
```
with:

```ts
export { apiError } from './errors.ts';
export { fieldErrors, pathErrors, problemWith } from './forms.ts';
```


Each of rcl-core's pages imports them from the web SDK now:

In `rcl-core/web/src/pages/ApiKeysPage.tsx`:

Replace:

```tsx
import { useGetMeQuery } from '@rollcall/web-sdk';
```
with:

```tsx
import { fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
```


Delete:

```tsx
import { fieldErrors, problemWith } from '../forms.ts';
```


In `rcl-core/web/src/pages/ChangePasswordPage.tsx`:

Replace:

```tsx
import { apiError, CORE_PAGES, safeNext, useGetMeQuery, useGoTo, useLogoutMutation, withNext } from '@rollcall/web-sdk';
import { useChangePasswordMutation } from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
```
with:

```tsx
import {
  apiError,
  CORE_PAGES,
  fieldErrors,
  problemWith,
  safeNext,
  useGetMeQuery,
  useGoTo,
  useLogoutMutation,
  withNext,
} from '@rollcall/web-sdk';
import { useChangePasswordMutation } from '../api.ts';
```


In `rcl-core/web/src/pages/FontsPage.tsx`:

Replace:

```tsx
import { useGetMeQuery } from '@rollcall/web-sdk';
import { useGetFontsQuery, useRemoveFontFaceMutation, useUploadFontFaceMutation } from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
```
with:

```tsx
import { fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import { useGetFontsQuery, useRemoveFontFaceMutation, useUploadFontFaceMutation } from '../api.ts';
```


In `rcl-core/web/src/pages/HomePage.tsx`:

Replace:

```tsx
import { useGetAppsQuery } from '../api.ts';
import { CORE_BASE } from '../base.ts';
import { problemWith } from '../forms.ts';
```
with:

```tsx
import { problemWith } from '@rollcall/web-sdk';
import { useGetAppsQuery } from '../api.ts';
import { CORE_BASE } from '../base.ts';
```


In `rcl-core/web/src/pages/LoginPage.tsx`:

Replace:

```tsx
import { CORE_PAGES, safeNext, useGetSetupStatusQuery, useGoTo } from '@rollcall/web-sdk';
import { useLoginMutation } from '../api.ts';
import { problemWith } from '../forms.ts';
```
with:

```tsx
import { CORE_PAGES, problemWith, safeNext, useGetSetupStatusQuery, useGoTo } from '@rollcall/web-sdk';
import { useLoginMutation } from '../api.ts';
```


In `rcl-core/web/src/pages/MemberForm.tsx`:

Replace:

```tsx
import { Alert, Button, Checkbox, Group, Modal, Stack, TagsInput, TextInput } from '@mantine/core';
```
with:

```tsx
import { Alert, Button, Checkbox, Group, Modal, Stack, TagsInput, TextInput } from '@mantine/core';
import { fieldErrors, problemWith } from '@rollcall/web-sdk';
```


Delete:

```tsx
import { fieldErrors, problemWith } from '../forms.ts';
```


In `rcl-core/web/src/pages/SetupPage.tsx`:

Replace:

```tsx
import { CORE_PAGES, useGetSetupStatusQuery, useGoTo } from '@rollcall/web-sdk';
import { useSetupMutation } from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
```
with:

```tsx
import { CORE_PAGES, fieldErrors, problemWith, useGetSetupStatusQuery, useGoTo } from '@rollcall/web-sdk';
import { useSetupMutation } from '../api.ts';
```


In `rcl-core/web/src/pages/TeamPage.tsx`:

Replace:

```tsx
import { apiError, useGetMeQuery } from '@rollcall/web-sdk';
```
with:

```tsx
import { apiError, fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
```


Delete:

```tsx
import { fieldErrors, problemWith } from '../forms.ts';
```


In `rcl-core/web/src/pages/TeamsPage.tsx`:

Replace:

```tsx
import { useGetMeQuery } from '@rollcall/web-sdk';
import { useCreateTeamMutation, useGetTeamsQuery } from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
```
with:

```tsx
import { fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import { useCreateTeamMutation, useGetTeamsQuery } from '../api.ts';
```


In `rcl-core/web/src/pages/UsersPage.tsx`:

Replace:

```tsx
import { ROLE_NAMES, useGetMeQuery } from '@rollcall/web-sdk';
```
with:

```tsx
import { fieldErrors, problemWith, ROLE_NAMES, useGetMeQuery } from '@rollcall/web-sdk';
```


Delete:

```tsx
import { fieldErrors, problemWith } from '../forms.ts';
```


Run: `yarn vitest run --project core-web --project web-sdk`
Expected: PASS. rcl-core's pages work as before.

- [ ] **Step 4: Plain messages for cleared number fields.**

In `rcl-producer/contract/src/themes.ts`:

Replace:

```ts
const pixels = (min: number, max: number) =>
  z
    .number()
    .int(`Use ${min} to ${max} pixels`)
    .min(min, `Use ${min} to ${max} pixels`)
    .max(max, `Use ${min} to ${max} pixels`);
```
with:

```ts
// A whole number of pixels. Anything else, even a cleared field's NaN, gets the same plain message.
function pixels(min: number, max: number) {
  const rule = `Use ${min} to ${max} pixels`;
  return z.number({ error: rule }).int(rule).min(min, rule).max(max, rule);
}
```


- [ ] **Step 5: The theme sample, an overlay component.**

Create `rcl-producer/web/src/overlay/components/ThemeSample.tsx`:

```tsx
import classes from './ThemeSample.module.css';

export interface ThemeSampleProps {
  /** The names of the theme's extra colors, each shown as a swatch of `--theme-extra-<name>`. */
  extras?: readonly string[];
}

const NO_EXTRAS: readonly string[] = [];

// Every theme token at once, for the theme editor's preview and the overlay Storybook (docs/features/theme-builder.md).
// Presentational: styled only with theme variables (ADR-0006).
export function ThemeSample({ extras = NO_EXTRAS }: ThemeSampleProps) {
  return (
    <div className={classes.sample}>
      <div className={classes.heading}>Heading</div>
      <div className={classes.body}>Body text: the jammer laps the pack.</div>
      <div className={classes.muted}>Muted text: Jam 3 · Period 1</div>
      <table className={classes.table}>
        <tbody>
          <tr className={classes.row}>
            <td>07</td>
            <td>Jammy Dodger</td>
          </tr>
          <tr className={classes.rowAlt}>
            <td>00</td>
            <td>Zero Cool</td>
          </tr>
        </tbody>
      </table>
      <div className={classes.accentBar}>Accent bar</div>
      <div className={classes.panel}>Bordered panel</div>
      {extras.length > 0 && (
        <div className={classes.extras}>
          <div className={classes.muted}>Extra colors</div>
          {extras.map((name) => (
            <span key={name} className={classes.extra}>
              <span data-extra className={classes.chip} style={{ background: `var(--theme-extra-${name})` }} />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `rcl-producer/web/src/overlay/components/ThemeSample.module.css`:

```
/* Overlay components are styled only with theme custom properties (ADR-0006). */
.sample {
  display: inline-flex;
  flex-direction: column;
  gap: 0.75em;
  padding: 1em;
  font-family: var(--theme-font-body);
  font-size: var(--theme-font-size);
  font-weight: var(--theme-font-body-weight);
  color: var(--theme-color-text);
  background: var(--theme-color-surface);
  border-radius: var(--theme-radius);
}

.heading {
  font-family: var(--theme-font-heading);
  font-size: 1.5em;
  font-weight: var(--theme-font-heading-weight);
  text-transform: var(--theme-heading-transform);
}

.muted {
  color: var(--theme-color-text-muted);
}

.table {
  border-collapse: collapse;
}

.table td {
  padding: 0.25em 0.75em;
}

.row {
  background: var(--theme-color-surface);
}

.rowAlt {
  background: var(--theme-color-surface-alt);
}

/* Large, bold text, so it stays readable on the accent color. */
.accentBar {
  padding: 0.25em 0.75em;
  font-size: 1.25em;
  font-weight: 700;
  color: var(--theme-color-on-accent);
  background: var(--theme-color-accent);
  border-radius: var(--theme-radius);
}

.panel {
  padding: 0.5em 0.75em;
  border: var(--theme-border-width) solid var(--theme-color-border);
  border-radius: var(--theme-radius);
}

.extras {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5em;
}

.extra {
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
}

.chip {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 1px solid var(--theme-color-border);
  border-radius: var(--theme-radius);
}
```

Create `rcl-producer/web/src/overlay/components/ThemeSample.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ThemeSample } from './ThemeSample.tsx';

const meta = {
  title: 'Components/ThemeSample',
  component: ThemeSample,
} satisfies Meta<typeof ThemeSample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithExtraColors: Story = { args: { extras: ['gold', 'team-2'] } };

// Pinned to each sample theme, so the accessibility check covers them in CI as well.
export const LightTheme: Story = { globals: { overlayTheme: 'light' } };

export const HighContrastTheme: Story = { globals: { overlayTheme: 'high-contrast' } };
```

- [ ] **Step 6: The endpoints and the pages.**

Create `rcl-producer/web/src/api.ts`:

```ts
import { FontFamilySchema, type FontFamily } from '@rollcall/core-contract';
import {
  SetDefaultThemeRequestSchema,
  ThemeSchema,
  type CreateThemeRequest,
  type SetDefaultThemeRequest,
  type Theme,
  type UpdateThemeRequest,
} from '@rollcall/producer-contract';
import { api } from '@rollcall/web-sdk';

const themeUrl = (id: string) => `producer/themes/${encodeURIComponent(id)}`;
// A change to one theme: that theme, and the list that shows it.
const themeChanged = (_theme: unknown, _error: unknown, { id }: { id: string }) => [
  { type: 'Themes' as const, id },
  { type: 'Themes' as const, id: 'LIST' },
];

// The Producer app's endpoints, added to the shared base API. Each reply is checked against the contract (ADR-0019).
// Body-less POSTs send `{}`: the server refuses an empty body labelled as JSON.
const producerApi = api.enhanceEndpoints({ addTagTypes: ['Themes', 'Fonts'] }).injectEndpoints({
  endpoints: (build) => ({
    // rcl-core's font library, which theme fonts are picked from.
    getFonts: build.query<FontFamily[], void>({
      query: () => 'core/fonts',
      transformResponse: (response: unknown) => FontFamilySchema.array().parse(response),
      providesTags: ['Fonts'],
    }),
    getThemes: build.query<Theme[], void>({
      query: () => 'producer/themes',
      transformResponse: (response: unknown) => ThemeSchema.array().parse(response),
      providesTags: [{ type: 'Themes', id: 'LIST' }],
    }),
    getTheme: build.query<Theme, string>({
      query: (id) => themeUrl(id),
      transformResponse: (response: unknown) => ThemeSchema.parse(response),
      providesTags: (_theme, _error, id) => [{ type: 'Themes', id }],
    }),
    createTheme: build.mutation<Theme, CreateThemeRequest>({
      query: (body) => ({ url: 'producer/themes', method: 'POST', body }),
      transformResponse: (response: unknown) => ThemeSchema.parse(response),
      invalidatesTags: [{ type: 'Themes', id: 'LIST' }],
    }),
    updateTheme: build.mutation<Theme, { id: string; changes: UpdateThemeRequest }>({
      query: ({ id, changes }) => ({ url: themeUrl(id), method: 'PATCH', body: changes }),
      transformResponse: (response: unknown) => ThemeSchema.parse(response),
      invalidatesTags: themeChanged,
    }),
    duplicateTheme: build.mutation<Theme, { id: string }>({
      query: ({ id }) => ({ url: `${themeUrl(id)}/duplicate`, method: 'POST', body: {} }),
      transformResponse: (response: unknown) => ThemeSchema.parse(response),
      invalidatesTags: [{ type: 'Themes', id: 'LIST' }],
    }),
    deleteTheme: build.mutation<void, { id: string }>({
      query: ({ id }) => ({ url: themeUrl(id), method: 'DELETE' }),
      invalidatesTags: themeChanged,
    }),
    // Choosing the default changes two themes at once, so every theme is asked for again.
    setDefaultTheme: build.mutation<SetDefaultThemeRequest, SetDefaultThemeRequest>({
      query: (body) => ({ url: 'producer/default-theme', method: 'PUT', body }),
      transformResponse: (response: unknown) => SetDefaultThemeRequestSchema.parse(response),
      invalidatesTags: ['Themes'],
    }),
  }),
});

export const {
  useGetFontsQuery,
  useGetThemesQuery,
  useGetThemeQuery,
  useCreateThemeMutation,
  useUpdateThemeMutation,
  useDuplicateThemeMutation,
  useDeleteThemeMutation,
  useSetDefaultThemeMutation,
} = producerApi;
```

Create `rcl-producer/web/src/pages/ThemesPage.tsx`:

```tsx
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  ColorSwatch,
  Group,
  Menu,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { CreateThemeRequestSchema, type Theme } from '@rollcall/producer-contract';
import { fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import {
  useCreateThemeMutation,
  useDeleteThemeMutation,
  useDuplicateThemeMutation,
  useGetThemesQuery,
  useSetDefaultThemeMutation,
} from '../api.ts';

// The themes (docs/features/theme-builder.md). Anyone holding producer:themes.read sees the list;
// producer:themes.manage can create, duplicate and delete themes and choose the default. Hiding things is only for
// convenience: the server checks every request (hard rule 5).
export function ThemesPage() {
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('producer:themes.read')) {
    return <Alert color="gray">Your account can't view themes.</Alert>;
  }
  return <ThemeList canManage={me.permissions.includes('producer:themes.manage')} />;
}

function ThemeList({ canManage }: { canManage: boolean }) {
  const themes = useGetThemesQuery();
  const [deleting, setDeleting] = useState<Theme | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Stack maw={980}>
      <Title order={2}>Themes</Title>
      <Text size="sm">The default theme styles the OBS overlay. With none, the overlay uses the built-in look.</Text>
      {canManage && <NewTheme />}
      {themes.isError && <Alert color="red">{problemWith(themes.error)}</Alert>}
      {problem && <Alert color="red">{problem}</Alert>}
      {themes.data?.length === 0 && <Text>No themes yet.</Text>}
      {themes.data && themes.data.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Colors</Table.Th>
              {canManage && (
                <Table.Th>
                  <VisuallyHidden>Actions</VisuallyHidden>
                </Table.Th>
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {themes.data.map((theme) => (
              <ThemeRow
                key={theme.id}
                theme={theme}
                actions={canManage ? <ThemeMenu theme={theme} onDelete={setDeleting} onProblem={setProblem} /> : null}
              />
            ))}
          </Table.Tbody>
        </Table>
      )}
      {deleting && <DeleteTheme theme={deleting} onClose={() => setDeleting(null)} />}
    </Stack>
  );
}

function ThemeRow({ theme, actions }: { theme: Theme; actions: ReactNode }) {
  const { surface, accent } = theme.tokens.colors;
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Anchor component={Link} to={`/themes/${encodeURIComponent(theme.id)}`}>
            {theme.name}
          </Anchor>
          {theme.isDefault && <Badge variant="light">Default</Badge>}
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          <ColorSwatch color={surface} size={18}>
            <VisuallyHidden>Surface {surface}</VisuallyHidden>
          </ColorSwatch>
          <ColorSwatch color={accent} size={18}>
            <VisuallyHidden>Accent {accent}</VisuallyHidden>
          </ColorSwatch>
        </Group>
      </Table.Td>
      {actions && <Table.Td>{actions}</Table.Td>}
    </Table.Tr>
  );
}

// A theme's row menu: Duplicate, Make default or Stop using as default, and Delete (which confirms first).
function ThemeMenu({
  theme,
  onDelete,
  onProblem,
}: {
  theme: Theme;
  onDelete: (theme: Theme) => void;
  onProblem: (problem: string | null) => void;
}) {
  const [duplicateTheme] = useDuplicateThemeMutation();
  const [setDefaultTheme] = useSetDefaultThemeMutation();
  const run = async (request: Promise<{ error?: unknown }>) => {
    const result = await request;
    onProblem(result.error ? problemWith(result.error) : null);
  };
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" aria-label={`Actions for ${theme.name}`}>
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => void run(duplicateTheme({ id: theme.id }))}>Duplicate</Menu.Item>
        {theme.isDefault ? (
          <Menu.Item onClick={() => void run(setDefaultTheme({ themeId: null }))}>Stop using as default</Menu.Item>
        ) : (
          <Menu.Item onClick={() => void run(setDefaultTheme({ themeId: theme.id }))}>Make default</Menu.Item>
        )}
        <Menu.Item color="red" onClick={() => onDelete(theme)}>
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

// Deletes a theme once the person confirms, saying when the overlay loses it.
function DeleteTheme({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const [deleteTheme, { isLoading }] = useDeleteThemeMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = async () => {
    const result = await deleteTheme({ id: theme.id });
    if (result.error) setProblem(problemWith(result.error, { not_found: 'That theme was already deleted.' }));
    else onClose();
  };
  return (
    <Modal opened onClose={onClose} title={`Delete ${theme.name}?`}>
      <Stack>
        <Text>
          {theme.isDefault
            ? 'The overlay goes back to the built-in look. This cannot be undone.'
            : 'This cannot be undone.'}
        </Text>
        {problem && <Alert color="red">{problem}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" loading={isLoading} onClick={() => void confirm()}>
            Delete theme
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Creates a theme from its name, starting from the built-in look, then opens it to edit.
function NewTheme() {
  const [createTheme, { isLoading, error }] = useCreateThemeMutation();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = CreateThemeRequestSchema.safeParse({ name });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) return;
    const result = await createTheme(checked.data);
    if (result.data) void navigate(`/themes/${encodeURIComponent(result.data.id)}`);
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Group align="end">
        <TextInput
          label="New theme"
          placeholder="Theme name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          error={errors.name}
          w={320}
        />
        <Button type="submit" loading={isLoading}>
          Create theme
        </Button>
      </Group>
      {error && (
        <Alert color="red" mt="sm">
          {problemWith(error)}
        </Alert>
      )}
    </form>
  );
}
```

Create `rcl-producer/web/src/pages/ThemePreview.module.css`:

```
/* The preview's backgrounds, to judge how a theme looks over game footage, a bright arena, or transparency. */
.stage {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  padding: 24px;
  border-radius: 8px;
}

.dark {
  background: #1a1b1e;
}

.light {
  background: #f1f3f5;
}

.checkerboard {
  background: repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 24px 24px;
}
```

Create `rcl-producer/web/src/pages/ThemePreview.tsx`:

```tsx
import { useState } from 'react';
import { SegmentedControl, Stack, Text } from '@mantine/core';
import type { ThemeCss } from '@rollcall/producer-contract';
import { PlaceholderCard } from '../overlay/components/PlaceholderCard.tsx';
import { ThemeSample } from '../overlay/components/ThemeSample.tsx';
import { ThemeScope } from '../overlay/ThemeScope.tsx';
import classes from './ThemePreview.module.css';

const BACKDROPS = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'checkerboard', label: 'Checkerboard' },
] as const;
type Backdrop = (typeof BACKDROPS)[number]['value'];
const isBackdrop = (value: string): value is Backdrop => BACKDROPS.some((backdrop) => backdrop.value === value);

// A theme on overlay components, as the OBS overlay shows it: the same ThemeScope and components, plain CSS without
// Mantine, over a background the person chooses.
export function ThemePreview({ css, extras }: { css: ThemeCss; extras: readonly string[] }) {
  const [backdrop, setBackdrop] = useState<Backdrop>('dark');
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500} id="preview-background">
        Preview background
      </Text>
      <SegmentedControl
        aria-labelledby="preview-background"
        data={[...BACKDROPS]}
        value={backdrop}
        onChange={(value) => isBackdrop(value) && setBackdrop(value)}
      />
      <div className={`${classes.stage} ${classes[backdrop]}`}>
        <ThemeScope css={css}>
          <div className={classes.stage}>
            <PlaceholderCard title="Rollcall" subtitle="Theme preview" />
            <ThemeSample extras={extras} />
          </div>
        </ThemeScope>
      </div>
    </Stack>
  );
}
```

Create `rcl-producer/web/src/pages/ThemeEditor.tsx`:

```tsx
import { useMemo, useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  ColorInput,
  Group,
  NativeSelect,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { FontFamily } from '@rollcall/core-contract';
import {
  MAX_EXTRA_COLORS,
  themeToCss,
  UpdateThemeRequestSchema,
  type Theme,
  type ThemeTokens,
} from '@rollcall/producer-contract';
import { pathErrors, problemWith } from '@rollcall/web-sdk';
import { useUpdateThemeMutation } from '../api.ts';
import { ThemePreview } from './ThemePreview.tsx';

type Colors = ThemeTokens['colors'];
const COLORS: readonly { key: keyof Colors; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Muted text' },
  { key: 'surface', label: 'Surface' },
  { key: 'surfaceAlt', label: 'Alternate surface' },
  { key: 'accent', label: 'Accent' },
  { key: 'onAccent', label: 'Text on accent' },
  { key: 'border', label: 'Border' },
];
const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
const HEADING_CASES = [
  { value: 'none', label: 'As typed' },
  { value: 'uppercase', label: 'Capitals' },
];
const MISSING_FONT = 'This font isn’t in the font library, so the overlay uses a system font.';

// A number field's value as a token: a cleared field is NaN, which the contract refuses in plain words.
const numberOf = (value: string | number) => (typeof value === 'number' ? value : Number.NaN);
const sameFamily = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// The first extra color name not already used: color-1, color-2 and so on.
function newExtraName(extras: ThemeTokens['extras']): string {
  let n = 1;
  while (extras.some((extra) => extra.name === `color-${n}`)) n += 1;
  return `color-${n}`;
}

// Editing a theme (docs/features/theme-builder.md): the form on the left, and on the right a live preview of every
// change. Changes stay here until Save, which checks them against the contract first; Discard goes back to the saved
// theme. The server checks again, and only holders of producer:themes.manage get this far.
export function ThemeEditor({ theme, families }: { theme: Theme; families: readonly FontFamily[] | undefined }) {
  const [updateTheme, { isLoading, error }] = useUpdateThemeMutation();
  const [name, setName] = useState(theme.name);
  const [tokens, setTokens] = useState<ThemeTokens>(theme.tokens);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const css = useMemo(() => themeToCss(tokens, families ?? []), [tokens, families]);

  // Changes a copy of the tokens, so the preview and form follow at once.
  const change = (edit: (draft: ThemeTokens) => void) =>
    setTokens((current) => {
      const draft = structuredClone(current);
      edit(draft);
      return draft;
    });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const checked = UpdateThemeRequestSchema.safeParse({ name, tokens });
    setErrors(checked.success ? {} : pathErrors(checked.error));
    if (!checked.success) return;
    const result = await updateTheme({ id: theme.id, changes: checked.data });
    if (!result.data) return;
    setName(result.data.name);
    setTokens(result.data.tokens);
  };

  const discard = () => {
    setName(theme.name);
    setTokens(theme.tokens);
    setErrors({});
  };

  // The library's families, plus the theme's own when it's missing from the library (once the library has loaded).
  const familyField = (role: 'heading' | 'body', label: string) => {
    const current = tokens.fonts[role].family;
    const missing = families !== undefined && !families.some((family) => sameFamily(family.name, current));
    const options = (families ?? []).map((family) => ({ value: family.name, label: family.name }));
    if (missing || families === undefined)
      options.unshift({ value: current, label: missing ? `${current} (missing)` : current });
    return (
      <NativeSelect
        label={label}
        data={options}
        value={current}
        description={missing ? MISSING_FONT : undefined}
        error={errors[`tokens.fonts.${role}.family`]}
        onChange={(event) => {
          const family = event.currentTarget.value;
          change((draft) => void (draft.fonts[role].family = family));
        }}
      />
    );
  };

  const weightField = (role: 'heading' | 'body', label: string) => (
    <NativeSelect
      label={label}
      data={WEIGHTS}
      value={String(tokens.fonts[role].weight)}
      error={errors[`tokens.fonts.${role}.weight`]}
      onChange={(event) => {
        const weight = Number(event.currentTarget.value);
        change((draft) => void (draft.fonts[role].weight = weight));
      }}
    />
  );

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
      <form onSubmit={(event) => void save(event)} noValidate>
        <Stack>
          {theme.isDefault && (
            <Alert color="blue">This is the default theme: saving changes the OBS overlay at once.</Alert>
          )}
          <TextInput
            label="Name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={errors.name}
          />

          <Title order={3}>Colors</Title>
          <SimpleGrid cols={2}>
            {COLORS.map(({ key, label }) => (
              <ColorInput
                key={key}
                label={label}
                format="hexa"
                value={tokens.colors[key]}
                error={errors[`tokens.colors.${key}`]}
                onChange={(color) => change((draft) => void (draft.colors[key] = color))}
              />
            ))}
          </SimpleGrid>

          <Title order={3}>Fonts</Title>
          <SimpleGrid cols={2}>
            {familyField('heading', 'Heading font')}
            {weightField('heading', 'Heading weight')}
            {familyField('body', 'Body font')}
            {weightField('body', 'Body weight')}
            <NumberInput
              label="Base size"
              suffix=" px"
              allowDecimal={false}
              value={Number.isNaN(tokens.fonts.size) ? '' : tokens.fonts.size}
              error={errors['tokens.fonts.size']}
              onChange={(value) => change((draft) => void (draft.fonts.size = numberOf(value)))}
            />
            <NativeSelect
              label="Heading case"
              data={HEADING_CASES}
              value={tokens.fonts.headingCase}
              onChange={(event) => {
                const headingCase = event.currentTarget.value === 'uppercase' ? 'uppercase' : 'none';
                change((draft) => void (draft.fonts.headingCase = headingCase));
              }}
            />
          </SimpleGrid>

          <Title order={3}>Shape</Title>
          <SimpleGrid cols={2}>
            <NumberInput
              label="Corner radius"
              suffix=" px"
              allowDecimal={false}
              value={Number.isNaN(tokens.shape.radius) ? '' : tokens.shape.radius}
              error={errors['tokens.shape.radius']}
              onChange={(value) => change((draft) => void (draft.shape.radius = numberOf(value)))}
            />
            <NumberInput
              label="Border width"
              suffix=" px"
              allowDecimal={false}
              value={Number.isNaN(tokens.shape.borderWidth) ? '' : tokens.shape.borderWidth}
              error={errors['tokens.shape.borderWidth']}
              onChange={(value) => change((draft) => void (draft.shape.borderWidth = numberOf(value)))}
            />
          </SimpleGrid>

          <Title order={3}>Extra colors</Title>
          <Text size="sm">Named colors for later overlay components, as --theme-extra-name.</Text>
          {tokens.extras.map((extra, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- a row's name changes as it's typed, so it can't be the key
            <Group key={index} align="start">
              <TextInput
                label={`Extra color ${index + 1} name`}
                value={extra.name}
                error={errors[`tokens.extras.${index}.name`]}
                onChange={(event) => {
                  const extraName = event.currentTarget.value;
                  change((draft) => void (draft.extras[index]!.name = extraName));
                }}
              />
              <ColorInput
                label={`Extra color ${index + 1}`}
                format="hexa"
                value={extra.color}
                error={errors[`tokens.extras.${index}.color`]}
                onChange={(color) => change((draft) => void (draft.extras[index]!.color = color))}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                mt={28}
                aria-label={`Remove extra color ${index + 1}`}
                onClick={() => change((draft) => void draft.extras.splice(index, 1))}
              >
                ✕
              </ActionIcon>
            </Group>
          ))}
          {errors['tokens.extras'] && (
            <Text size="sm" c="red">
              {errors['tokens.extras']}
            </Text>
          )}
          <Group>
            <Button
              variant="default"
              disabled={tokens.extras.length >= MAX_EXTRA_COLORS}
              onClick={() =>
                change((draft) => void draft.extras.push({ name: newExtraName(draft.extras), color: '#ffffff' }))
              }
            >
              Add color
            </Button>
          </Group>

          {error && <Alert color="red">{problemWith(error)}</Alert>}
          <Group>
            <Button type="submit" loading={isLoading}>
              Save theme
            </Button>
            <Button variant="default" onClick={discard}>
              Discard changes
            </Button>
          </Group>
        </Stack>
      </form>
      <ThemePreview css={css} extras={tokens.extras.map((extra) => extra.name)} />
    </SimpleGrid>
  );
}
```

Create `rcl-producer/web/src/pages/ThemePage.tsx`:

```tsx
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, Anchor, Badge, Group, Loader, Stack, Title } from '@mantine/core';
import { themeToCss, type Theme } from '@rollcall/producer-contract';
import { problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import { useGetFontsQuery, useGetThemeQuery } from '../api.ts';
import { ThemeEditor } from './ThemeEditor.tsx';
import { ThemePreview } from './ThemePreview.tsx';

// One theme (docs/features/theme-builder.md). With producer:themes.manage it's the editor; with only
// producer:themes.read it's a read-only preview. The server checks every change anyway (hard rule 5).
export function ThemePage() {
  const { id = '' } = useParams();
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('producer:themes.read')) {
    return <Alert color="gray">Your account can't view themes.</Alert>;
  }
  return <ThemeView id={id} canManage={me.permissions.includes('producer:themes.manage')} />;
}

function ThemeView({ id, canManage }: { id: string; canManage: boolean }) {
  const theme = useGetThemeQuery(id);
  const fonts = useGetFontsQuery();
  if (theme.isError) {
    return (
      <Stack maw={980} align="start">
        <Alert color="red">
          {problemWith(theme.error, { not_found: 'That theme doesn’t exist. It may have been deleted.' })}
        </Alert>
        <Anchor component={Link} to="/themes">
          Back to themes
        </Anchor>
      </Stack>
    );
  }
  if (!theme.data) return <Loader />;
  return (
    <Stack>
      <Group gap="xs">
        <Title order={2}>{theme.data.name}</Title>
        {theme.data.isDefault && <Badge variant="light">Default</Badge>}
      </Group>
      {canManage ? (
        <ThemeEditor key={theme.data.id} theme={theme.data} families={fonts.data} />
      ) : (
        <ReadOnlyPreview theme={theme.data} families={fonts.data} />
      )}
    </Stack>
  );
}

function ReadOnlyPreview({
  theme,
  families,
}: {
  theme: Theme;
  families: Parameters<typeof themeToCss>[1] | undefined;
}) {
  const css = useMemo(() => themeToCss(theme.tokens, families ?? []), [theme.tokens, families]);
  return <ThemePreview css={css} extras={theme.tokens.extras.map((extra) => extra.name)} />;
}
```

Replace `rcl-producer/web/src/routes.tsx` with:

```tsx
import type { RouteObject } from 'react-router';
import { APP_NAME } from '@rollcall/core-contract';
import { AppLayout, PageNotFound, SignInGate, type AppLink } from '@rollcall/web-sdk';
import { HomePage } from './pages/HomePage.tsx';
import { ThemePage } from './pages/ThemePage.tsx';
import { ThemesPage } from './pages/ThemesPage.tsx';

// Every page is behind the sign-in gate, which sends people to rcl-core's sign-in page and back. The OBS overlay is a
// separate entry (overlay.html), so it stays public. Screen Builder and Live Mode are added here.
// Each link is shown only to people holding its permission; the server checks every request anyway (hard rule 5).
const LINKS: readonly AppLink[] = [{ label: 'Themes', to: '/themes', permission: 'producer:themes.read' }];

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <SignInGate>
        <AppLayout title={`${APP_NAME} Producer`} links={LINKS} />
      </SignInGate>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'themes', element: <ThemesPage /> },
      { path: 'themes/:id', element: <ThemePage /> },
      { path: '*', element: <PageNotFound /> },
    ],
  },
];
```

- [ ] **Step 7: The rules.**

In `.claude/rules/rcl-core-web.md`:

Replace:

```markdown
  - Forms check their input with the contract's schemas before sending (`fieldErrors` in `src/forms.ts`), and show a failed request with `problemWith`, which turns the server's error codes into sentences.
```
with:

```markdown
  - Forms check their input with the contract's schemas before sending (`fieldErrors`, or `pathErrors` for nested fields, from the web SDK), and show a failed request with `problemWith`, which turns the server's error codes into sentences.
```


Replace `.claude/rules/rcl-producer-web.md` with:

```markdown
---
paths:
  - "rcl-producer/web/**"
---
# rcl-producer web app (`rcl-producer/web/`)

- **Served at `/producer/`** (ADR-0019). `src/base.ts` holds that path for Vite, the router and the overlay address; the Producer app's module (`producerApp.web` in `rcl-producer/server/src/index.ts`) tells rcl-core's server where the build and its pages are.
- **Every page is behind `SignInGate`**, which sends people who aren't signed in to rcl-core's sign-in page and back. The OBS overlay is a separate entry and stays public.
- **The shell, the sign-in gate, the account menu, the server badge, the store and the base API come from `@rollcall/web-sdk`.** Add endpoints to the base API with `api.injectEndpoints` rather than creating a second API.
- **Server data lives only in RTK Query**, never copied into slices (hard rule 6, ADR-0003). Validate responses with the shared Zod schemas in `transformResponse` (ADR-0019). The Producer app's endpoints are in `src/api.ts`, including core's font list, which theme fonts are picked from.
- **Forms** check their input with the contract's schemas before sending (`fieldErrors` or `pathErrors` from the web SDK) and show a failed request with `problemWith`, as rcl-core's pages do.
- **Themes** (`src/pages/Theme*.tsx`): the list, and the editor, whose preview puts the overlay's own `ThemeScope` and components on the page, so it matches the OBS overlay.
- **Overlay code** under `src/overlay/` has its own, stricter rule (`rcl-producer-overlay.md`).
- **Testing:** React Testing Library in jsdom, with `openProducer` (`src/test/open-producer.tsx`) and the fake server from `@rollcall/web-sdk/testing`; see `docs/guides/testing.md`. The Producer app's own components get a dashboard Storybook with their first story (split spec).
- **Feature pages:** `theme-builder`, `screen-builder`, `overlay-components`, `live-mode`, `obs-control` and `crg-automation` in `docs/features/`. Update the page in the same change as the behavior.
```

In `.claude/rules/sdk.md`:

Replace:

```markdown
  - the RTK Query base API (health, setup status, who's signed in, logout) and store, and `ROLE_NAMES` for showing roles;
```
with:

```markdown
  - the RTK Query base API (health, setup status, who's signed in, logout) and store, and `ROLE_NAMES` for showing roles;
  - the form helpers `fieldErrors`, `pathErrors` and `problemWith`;
```


- [ ] **Step 8: Run them and see them pass.**

Run: the command from Step 2.
Expected: PASS, 41 tests. `yarn test` passes 484.

Run: `yarn test:stories`
Expected: PASS, 29 tests, with no accessibility violations.

- [ ] **Step 9: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/web rcl-producer packages/web-sdk .claude/rules
git commit -F - <<'EOF'
feat(rcl-producer): the Themes list and editor

A Themes page lists themes with the default marked and their colors.
Admins create, duplicate and delete them, and choose the default, from
each row's menu. The editor has every token, with fonts from rcl-core's
library, and a live preview of every change on the overlay's own
components, over a dark, light or checkerboard background. Producers
see the previews. The form helpers move into the web SDK for both apps.

Refs #20

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: End to end, and the docs

**Files:**
- Modify: `e2e/tests/accounts.spec.ts`, `docs/features/theme-builder.md`, `docs/product/glossary.md`, `docs/architecture/README.md`, `README.md`, `rcl-core/CHANGELOG.md`, `rcl-producer/CHANGELOG.md`, and the generated `docs/features/README.md`

**Interfaces:**
- Consumes everything above.

- [ ] **Step 1: Add the theme steps to the end-to-end flow.**

They go at the end of the ordered accounts flow, on the Admin made at its start:
1. with the OBS overlay open, an Admin creates a theme, sets the accent color and the heading font Oswald, saves it and makes it the default;
2. the open overlay shows that accent and loads Oswald from `/fonts/…`;
3. another save changes the open overlay without a reload.

In `e2e/tests/accounts.spec.ts`:

Replace:

```ts
  }
});
```
with:

```ts
  }
});

// Themes (theme-builder R1–R5), on the accounts made above.
test('an Admin makes a theme the default, and the open OBS overlay follows each save with fonts from the server', async ({
  page,
  context,
}) => {
  const overlay = await context.newPage();
  await overlay.goto('/producer/overlay');
  await expect(overlay.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  const accent = () =>
    overlay
      .locator('[data-theme-scope]')
      .evaluate((scope) => getComputedStyle(scope).getPropertyValue('--theme-color-accent').trim());
  const oswaldLoads = overlay.waitForResponse((response) => response.url().endsWith('/fonts/oswald/oswald.ttf'));

  await page.goto('/producer/themes');
  await signIn(page, ADMIN);
  await page.getByLabel('New theme').fill('Derby Night');
  await page.getByRole('button', { name: 'Create theme' }).click();
  await expect(page.getByRole('heading', { name: 'Derby Night' })).toBeVisible();
  await page.getByLabel('Accent', { exact: true }).fill('#ffd700');
  await page.getByLabel('Heading font').selectOption('Oswald');
  const saved = page.waitForResponse((response) => response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Save theme' }).click();
  expect((await saved).status()).toBe(200);

  await page.getByRole('link', { name: 'Themes' }).click();
  await page.getByRole('button', { name: 'Actions for Derby Night' }).click();
  await page.getByRole('menuitem', { name: 'Make default' }).click();
  await expect(page.getByRole('row', { name: /Derby Night/ })).toContainText('Default');
  await expect.poll(accent).toBe('#ffd700');
  const font = await oswaldLoads;
  expect([font.status(), font.headers()['content-type']]).toEqual([200, 'font/ttf']);

  await page.getByRole('link', { name: 'Derby Night' }).click();
  await page.getByLabel('Accent', { exact: true }).fill('#00c853');
  await page.getByRole('button', { name: 'Save theme' }).click();
  await expect.poll(accent).toBe('#00c853');
});
```


Run: `yarn test:e2e`
Expected: PASS, 12 tests. The theme steps pass at once, because Tasks 1–8 built what they check.

- [ ] **Step 2: Update the wiki, the README and the changelogs.**

Replace `docs/features/theme-builder.md` with:

```markdown
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
- **Producers** see the list and each theme's preview, without editing controls. Announcers don't see themes.

Not built yet: exporting and importing themes (R6).

## Related

- [ADR-0006: one overlay renderer, CSS-variable theming](../decisions/0006-one-overlay-renderer-css-variable-theming.md)
- [ADR-0023: rcl-core shares data with apps through read-only services](../decisions/0023-core-data-services-for-apps.md)
- [Screen Builder](screen-builder.md), where a theme is applied to a screen

## Open questions

- Should a component be able to override its screen's theme, once screens choose their own?
- Should overlays be able to use team colors dynamically, e.g. `--team-home-primary` taken from the game's teams, alongside theme tokens?
- Are show/hide animations and transitions part of a theme or part of each component?
```

In `docs/product/glossary.md`:

Replace:

```markdown
| <a id="media"></a>**Media** | An uploaded image, such as a team logo or a member photo. rcl-core keeps it in the data folder and serves it at `/media/<id>` to anyone, so OBS overlays can show it ([ADR-0022](../decisions/0022-public-media.md)). |
```
with:

```markdown
| <a id="media"></a>**Media** | An uploaded file, such as a team logo, a member photo or a font. rcl-core keeps it in the data folder and serves it at `/media/<id>` to anyone, so OBS overlays can show it ([ADR-0022](../decisions/0022-public-media.md)). |
```


Replace:

```markdown
| **Theme** | A named set of visual tokens (colors, fonts, borders, radius) applied to screens as CSS custom properties. See [Theme Builder](../features/theme-builder.md). |
```
with:

```markdown
| **Theme** | A named set of visual tokens (colors, fonts, borders, radius) applied to screens as CSS custom properties. See [Theme Builder](../features/theme-builder.md). |
| <a id="default-theme"></a>**Default theme** | The one theme the OBS overlay uses, chosen on the Themes page. With none, the overlay uses the built-in look. See [Theme Builder](../features/theme-builder.md#themes-rcl-producer). |
| <a id="font-library"></a>**Font library** | rcl-core's fonts: families that come with Rollcall, plus faces Admins upload. Themes pick their fonts from it, and they're never loaded from the internet. See [Theme Builder](../features/theme-builder.md#font-library-rcl-core). |
```


In `docs/architecture/README.md`:

Replace:

```markdown
| `rcl-core/server` | The one server process: hosts every rcl app as a module ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)), plus core's own REST API, Socket.IO hub, accounts and access checks, SQLite, media storage, one connection per OBS and CRG instance, automation engine and live state |
```
with:

```markdown
| `rcl-core/server` | The one server process: hosts every rcl app as a module ([ADR-0019](../decisions/0019-rcl-apps-as-modules.md)), plus core's own REST API, Socket.IO hub, accounts and access checks, SQLite, media storage, the font library (bundled fonts at `/fonts/<family>/<file>`), one connection per OBS and CRG instance, automation engine and live state |
```


Replace:

```markdown
**Socket.IO namespaces.** Each rcl app has its own namespaces, at or below `/<id>`, and each one declares who may join, as each API route does ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)). The OBS overlay's `/producer/overlay` is public, so OBS outputs need no login until output token URLs arrive. Signed-in namespaces, such as Live Mode's dashboards, check the session cookie when a client connects. The bare `/` namespace refuses everyone.
```
with:

```markdown
**Socket.IO namespaces.** Each rcl app has its own namespaces, at or below `/<id>`, and each one declares who may join, as each API route does ([ADR-0018](../decisions/0018-declared-access-and-permissions.md)). The OBS overlay's `/producer/overlay` is public, so OBS outputs need no login until output token URLs arrive. It sends each overlay the [default theme](../product/glossary.md#default-theme) when it connects, and again whenever that theme changes. Signed-in namespaces, such as Live Mode's dashboards, check the session cookie when a client connects. The bare `/` namespace refuses everyone.
```


In `README.md`:

Replace:

```markdown
MIT. See [LICENSE](LICENSE).
```
with:

```markdown
MIT. See [LICENSE](LICENSE).

The fonts bundled in `rcl-core/server/fonts/` (Inter, Roboto Condensed, Barlow Condensed, Oswald, Bebas Neue and Anton) are under the SIL Open Font License 1.1, which is next to each one.
```


In `rcl-core/CHANGELOG.md`:

Replace:

```markdown
- Team Builder: Admins and Producers create teams with a league, short name, colors and logo, and their skaters and bench staff, with numbers (`00` keeps its zeros), pronouns, roles and photos. **Save and add another** makes typing in a roster quick. Announcers can view teams, and API keys can be given access to them. Logos and photos are stored on the server and shown to OBS overlays without signing in, so don't upload anything private (#17)
```
with:

```markdown
- Team Builder: Admins and Producers create teams with a league, short name, colors and logo, and their skaters and bench staff, with numbers (`00` keeps its zeros), pronouns, roles and photos. **Save and add another** makes typing in a roster quick. Announcers can view teams, and API keys can be given access to them. Logos and photos are stored on the server and shown to OBS overlays without signing in, so don't upload anything private (#17)
- A font library: six open-licence fonts come with Rollcall, and Admins upload their own (WOFF2, WOFF, TTF or OTF) on the new Fonts page, where each family shows in its own font. Fonts are served by the server for OBS overlays, never from the internet. Upload only fonts you're licensed to use in a broadcast (#19)
```


In `rcl-producer/CHANGELOG.md`:

Replace:

```markdown
## [Unreleased]
```
with:

```markdown
## [Unreleased]

### Added

- Theme Builder: Admins create themes with colors, fonts from rcl-core's font library, sizes, corner radius, border width and extra colors, with a live preview of every change. Producers can view themes (#20)
- The default theme styles the OBS overlay, which changes at once, with no reload, whenever the default theme is saved or another is chosen (#20)

### Changed

- The overlay's theme variables are renamed and extended, for example `--theme-font-family` is now `--theme-font-body` (#20)
```


Then run `node scripts/check-docs.mjs --fix`. It updates the features table (Theme Builder: shipped).

- [ ] **Step 3: Check and commit.**

```bash
yarn format && yarn check
git add e2e docs README.md rcl-core/CHANGELOG.md rcl-producer/CHANGELOG.md
git commit -F - <<'EOF'
docs(repo): the Theme Builder and font library shipped

The Theme Builder page describes what's built: the font library, the
token table and the default theme. The glossary gains Font library and
Default theme, the README lists the bundled fonts' licence, and both
changelogs have their lines. The end-to-end flow makes a theme the
default and watches the open overlay follow each save, with Oswald
loaded from the server.

Closes #19
Closes #20

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```
