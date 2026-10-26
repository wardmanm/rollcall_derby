# Import / export (#22, #23) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teams and themes move between Rollcall installs as export files. An Admin exports everything on one laptop and imports the file on another. Before anything is saved they see what's in it and what conflicts with what's already there, and choose what happens to each item. They get back the teams with their photos and the themes with their fonts, with nothing half-done if anything goes wrong.

**Architecture:**
- **The export file (rcl-core's contract):**
  - a `.zip` holding the manifest `rollcall-export.json` (`format`, `formatVersion` 1, `exportedAt`, `apps`, and items of `{ kind, version, data }`), plus `media/<sha256>.<ext>` files;
  - schemas for core's kinds of item, the import choices, the preview and the result.
- **Kinds (ADR-0024):**
  - `@rollcall/app-sdk` gains `TransferKind` and `AppModule.transfer?(ctx)`.
  - Each app owns the kinds it stores: core's `core:team` and `core:font-face`, and the Producer app's `producer:theme`.
  - A kind sees media only as paths and ids, never as bytes. Its `save` is synchronous, so it joins core's transaction.
- **rcl-core's server:**
  - `src/transfer/zip.ts` packs and reads files with fflate, within the limits, judging each entry's stated size before unzipping;
  - `src/transfer/export.ts` builds a file from chosen items or whole kinds, plus the items they need;
  - `src/transfer/import.ts` plans an import, applies the choices in one transaction, and removes media that replaced items no longer use. Planning reads every item, migrates it, checks it and matches it with what's here.
  - `src/routes/transfer.ts` has `GET /transfer/kinds`, `GET /transfer/export`, `POST /transfer/import/preview` and `POST /transfer/import`. They're for signed-in people, and each item is checked against its kind's permission.
- **The web SDK:** the Import dialog, shared by both apps, and `exportUrl` for download links.
- **Pages:**
  - rcl-core: the Import / export page, and the export buttons on the Teams and Team pages;
  - the Producer app: Export, Export all and Import… on the Themes page.

**Tech Stack:** Fastify 5, Drizzle 0.45 (no migrations), Zod 4, fflate 0.8, React 19 with Mantine 9 and RTK Query, Vitest, Storybook and Playwright.
- **One new package:** `fflate` `^0.8.3` (MIT, no dependencies) in rcl-core's server. It's the latest version, and already in the lockfile through Vitest's UI.

**Spec:** [`design-docs/specs/2026-10-26-import-export-design.md`](../specs/2026-10-26-import-export-design.md) (approved). Issues **#22** (the framework, teams and fonts, milestone `rcl-core v0.3.0`) and **#23** (themes, milestone `rcl-producer v0.4.0`).

**How this plan was checked:** the work was built on a throwaway branch, one commit per task.
- Every commit passed `yarn check`.
- Task 6's commit passed the 34 story tests, and the last commit the 13 end-to-end tests.
- App tests go from 488 to 558.
- Each task's tests were run against the previous task's code and failed as its "Expected: FAIL" says.
- Every code block below is copied from those commits.
- Every "Replace … with" instruction was checked mechanically: applied to the previous task's files, it gives this task's files exactly.

## Global Constraints

- **From the spec:**
  - **The file:** "A `.zip` named like `rollcall-teams-2026-10-26.zip`", holding "`rollcall-export.json`, the manifest" and "`media/<sha256>.<ext>`: each logo, photo and uploaded font file, exactly as stored, named by the SHA-256 of its bytes". "No ids or timestamps travel."
  - **Versions:**
    - "A newer `formatVersion` is refused."
    - "A kind version newer than this install knows is refused for that item."
    - "Released kind versions never change; a change is a new version with a migration."
  - **Limits:**
    - "The zip is at most 200 MB, and its unzipped total at most 400 MB, checked from each entry's stated size before it's unzipped".
    - "The manifest is at most 10 MB, and a zip has at most 10 000 entries."
    - "Each media file is at most 5 MB and must be what its item says, checked by its bytes as uploads are (ADR-0022)." "Files nothing refers to are ignored."
  - **Import has two steps,** "each sending the same zip as the raw body (`application/zip`, up to 200 MB). The server keeps nothing between them." The chosen items are saved "in **one database transaction** … all or nothing".
  - **Conflicts:** teams with "the same name, ignoring case"; themes with "the same name, exactly"; "Font faces never conflict."
  - **Actions:**
    - Add is "allowed only for items with no conflict".
    - "Replace keeps the item here, with its id".
    - Keep both "adds the item under the first free '<name> copy', '<name> copy 2' and so on, shortened to fit 64 characters".
    - Skip leaves the item out.
  - **The default theme:** "only the theme named in `choices` becomes the default, replacing the current one. Nothing else changes the default. Replacing the current default theme keeps it the default."
  - **Permissions:**
    - `core:team`: export and import with `core:teams.manage`;
    - `core:font-face`: export with `core:fonts.read` "only as a theme's need", import with `core:fonts.manage`;
    - `producer:theme`: export with `producer:themes.read`, import with `producer:themes.manage`.
    - "No new permissions. The routes are declared `{ signedIn: true }` … API keys can't use them for now."
  - **Errors:** `400 bad_file`, `newer_format`, `invalid_item`, `bad_media`, `bad_choices`; `403 forbidden`; `409 changed_since_preview`; `413 too_large`; `415`. "Every refusal says what's wrong and where, and changes nothing."
- **Hard rules:**
  - Rule 3: the server is the hub. Files are downloaded and uploaded through rcl-core's routes. Apps never read or write core's tables, and core writes an app's tables only through its kind (ADR-0023, ADR-0024).
  - Rule 4: works offline. Yarn installs fflate with the server, and nothing is fetched at runtime.
  - Rule 5: authorization happens on the server: each item's kind is checked with `deny`. The pages hide buttons only for convenience.
  - Rule 6: server data lives in RTK Query. The dialog's choices are the dialog's own state.
  - Rule 7: releases are deliberate. Nothing here prepares one. The Producer app's `requiresCore` changes when rcl-core 0.3.0 is released.
- **Boundaries** (`scripts/check-boundaries.test.mjs`):
  - Core's server imports an app's code only in `src/installed-apps.ts`, and never an app's contract.
  - The Producer app's server depends only on `@rollcall/app-sdk` and contracts.
- **TypeScript and lint:** no `as` casts in source outside tests (`as const` aside), no `oxlint-disable`, and erasable syntax only, so no parameter properties.
- **Every commit passes `yarn format && yarn check`.** Task 6 also passes `yarn test:stories`, and Task 9 `yarn test:e2e`.
- **Commits:**
  - Conventional Commits with scope `rcl-core`, `rcl-producer`, `sdk` or `repo`;
  - each body ends with `Refs #22` or `Refs #23`, except Task 9's, which says `Closes #22` and `Closes #23`;
  - then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Nothing is pushed** without Mike's explicit OK.

## Review Focus

1. **Two teams here with the name of a team in the file,** such as two leagues' "All Stars". Replace must change the team chosen, not the first one found. Test in Task 4: "replaces the team chosen when two here have the conflicting name".
2. **A Producer importing an Admin's backup** that holds teams and themes. The themes are can't-import ("Your account can't import themes"), the teams can still be imported, and choices that try to import a can't-import item anyway are refused. Tests:
   - Task 5: "travel with their uploaded fonts, are imported by Admins only, and become the default only when chosen";
   - Task 4: "refuses to import an item that can’t be imported".
3. **Something changes between the preview and the import:** another file is sent, a team with the same name is added, or the team to replace is deleted. The import refuses with `409 changed_since_preview`, and the dialog checks the file again. Tests:
   - Task 4: "refuses choices made for another file, or that no longer fit what’s here";
   - Task 6: "checks the file again when something changed since it was checked".
4. **An item fails partway through an import.** Nothing is saved, and no media file is left behind. Test in Task 4: "saves nothing, and leaves no files, when an item fails partway".
5. **A small file that claims to unzip to more than the limits** (a "zip bomb"), or has too many entries. It's refused with `413` before anything is unzipped, so the server's memory can't fill. Test in Task 2: "refuses a file over the limits, judged before anything is unzipped".

## Decisions this plan makes

The spec leaves these open, or the build showed they were needed. Each is decided here so implementers and reviewers don't have to guess.

**The file:**
- **fflate unzips each entry into a buffer of its stated size and never grows it,** so an entry that lies about its size can't unzip past it.
  - The limits are judged from those stated sizes in fflate's `filter`, before anything is unzipped (Task 2).
  - Entries other than the manifest and `media/…` files are skipped, but still count towards the limits.
- **The manifest is compressed, and media files are stored as they are** (level 0), since images and fonts are compressed already.
- **A newer file is spotted first:** `ManifestHeadSchema` reads only `format` and `formatVersion`, so a newer layout gets `newer_format`, not `bad_file`.
- **The refusals' words:**
  - `413 too_large`: "That file is too big to import: the limit is 200 MB, unzipped twice that". A body over 200 MB gets "…the limit is 200 MB".
  - `415 unsupported_file`: "Send a Rollcall export file (.zip)". Both `application/zip` and `application/x-zip-compressed` are accepted, since browsers label a .zip either way.
  - Messages about an item give its number and kind, such as "Item 3 (team “All Stars”): …". A media problem names the file, such as "the photo of Jammy Dodger isn't a PNG, JPEG or WebP image".

**Kinds (ADR-0024):**
- **A kind checks its own data** with `check`, which returns the data or its first problem in words, rather than handing core a schema. So core never depends on an app's contract.
- **Media crosses as paths and ids, never bytes.**
  - `exportItem` gets `mediaPath(mediaId)`, and `save` gets `mediaId(path)`.
  - Core saves a file the first time a kind asks for it, so a file used twice is saved once.
- **`save` hands back the media it no longer uses** (`unusedMedia`, such as a replaced team's old logo and photos). Core removes those files after the commit.
- **Media is saved inside the transaction,** as items ask for it, not before it as the spec says. A failure still deletes every file saved for the import, and a skipped item's files are never saved.
- **`onlyAsNeed` and `canBeDefault`** mark font faces, which travel only as a theme's need, and themes, one of which an import can make the default.
- **A misnamed kind doesn't stop the server:** `hostApps` logs and skips a kind not named `<app id>:<thing>`, or with a name another kind has. The rest of its app is hosted as usual.
- **Can't-import reasons:**
  - **A kind nothing here owns:** "<Things> aren't known here yet", such as "Screens aren't known here yet". This also covers themes when the Producer app isn't installed, in place of the spec's "Themes need the Producer app", because core can't tell those two cases apart.
  - **A kind the caller may not import:** "Your account can't import themes", since access goes by permission, not role. The spec's wording was "Only Admins can import themes".
  - **A newer kind version:** "This file was made by a newer Rollcall. Update Rollcall to import it."
- **Reused items,** such as an identical font face, are listed under New with their reason, and count as skipped in the result.
- **Keep both for an item that's now new** still saves it as a copy. It isn't refused as changed, because the result is still what was chosen.
- **Conflicting teams are listed most recently changed first,** and Replace starts with the first.
- **Save order:** each item is saved after the items it needs, otherwise in the file's order.

**Routes:**
- **`GET /transfer/kinds`,** which isn't in the spec, lists the kinds the caller may export or import, with counts. It leaves out kinds that travel only as needs. The Import / export page is built from it.
- **The export query:** `items=<kind>:<id>,…`, where the kind is `<app>:<thing>` and the id is the rest, or `kinds=<kind>,…`. Both or neither is `400 validation_failed`: "Choose items, as kind:id, or kinds to export".
- **Export's refusals:**
  - `404`: "Nothing here is a <kind>" or "There's no such team";
  - `403`: "Your account can't export teams";
  - `400 bad_selection`: "Fonts travel only with what uses them";
  - `400 nothing_to_export`: "There’s nothing to export".
- **File names:**
  - `rollcall-<kind>-<name>-<date>.zip` for one item;
  - `rollcall-<kinds>-<date>.zip` for one kind;
  - `rollcall-export-<date>.zip` otherwise.
  - Names become lowercase ASCII letters, digits and dashes, or `item` if nothing is left.
- **Font faces are exported with `core:fonts.read`,** which every role holds, so whoever may export a theme may export its fonts.
- **The choices travel in the query string as JSON,** since the body is the file.

**Web:**
- **The header link "Import / export" needs `core:teams.manage`.** With today's roles, exactly the people who may import or export something hold it, and a link takes one permission.
- **The Import / export page** says "Uploaded fonts travel with the themes that use them." once under the tick boxes, not on the Themes box.
- **Keep both's line is generic:** "Keep both: the file’s team is added as a copy; the one here is unchanged." The copy's name is chosen when the import runs, and the Done step gives it.
- **Replace's line for the default theme:** "Replace: the theme here takes what’s in the file. It’s the default, so the OBS overlay changes at once."
- **Differences are highlighted** with Mantine's `Mark` (orange) and bold text, so they don't rely on color alone.
- **The dialog sends the file as a copy typed `application/zip`** (`new Blob([file], { type })`). Browsers label a .zip either way or not at all, and `fetchBaseQuery` drops a `Content-Type` header set on a file body.
- **The Themes page gives every row a menu** ("Actions for <name>"). Everyone who sees themes gets Export; only Admins get the rest.
- **In the role matrix,** Producers' theme row becomes "Export only".

**Tests:**
- **A demo app with the kind `demo:note`** in the route tests covers what core's kinds don't do yet: version 2 with a migration from 1, a default, a need, an item that fails partway ("boom"), and an after-import step.
- **Core's theme round trip** (`routes/transfer-themes.test.ts`) hosts the installed apps. Core's server may not import the Producer app's contract, so the test reads themes through a local interface.
- **Tests that order teams set `updatedAt` themselves,** since two saves in one millisecond tie.

**Docs:**
- **The feature page** goes to `shipped`, with a Behavior section.
  - Media packaging and name clashes move out of its open questions into the page.
  - CRG files and events stay open, and an open question on importing and exporting with API keys is added.
- **"Released kind versions never change" is stated once,** in the contract rules beside the kinds' schemas (`rcl-core-contract.md` and `rcl-producer-contract.md`). The spec put it in the server rules too, but one home per fact keeps them from drifting. The server rules name the kinds and point to ADR-0024.
- **The Producer app's `requiresCore` doesn't change here.** It becomes `^0.3.0` when rcl-core 0.3.0 is released.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `rcl-core/contract/src/{transfer,fonts,teams}.ts`, `packages/app-sdk/src/index.ts`, ADR-0024 | The export file, the import choices and preview, `TransferKind` | 1 |
| `rcl-core/server/src/transfer/zip.ts`, `fflate` | Packing and reading files within the limits | 2 |
| `src/teams/{transfer,teams}.ts`, `src/fonts/transfer.ts`, `copyName` | The `core:team` and `core:font-face` kinds | 3 |
| `src/transfer/{export,import}.ts`, `src/routes/transfer.ts`, `src/apps.ts` | Every app's kinds; the export, preview and import routes | 4 |
| `rcl-producer/contract/src/themes.ts`, `rcl-producer/server/src/themes/{transfer,themes}.ts` | The `producer:theme` kind | 5 |
| `packages/web-sdk/src/{transfer.ts,Import*.tsx}` | The Import dialog, `exportUrl` | 6 |
| `GET /transfer/kinds`, `rcl-core/web/src/pages/{TransferPage,TeamsPage,TeamPage}.tsx` | The Import / export page and team exports | 7 |
| `rcl-producer/web/src/pages/ThemesPage.tsx` | Import and export on the Themes page | 8 |
| `e2e/tests/accounts.spec.ts`, `docs/**`, changelogs | End to end, and the docs | 9 |

`src/` means `rcl-core/server/src/`. All other paths are relative to the repo root.

---

### Task 1: The export file contract, and kinds in the app SDK

**Files:**
- Create: `rcl-core/contract/src/transfer.ts`, `docs/decisions/0024-import-export-kinds.md`
- Modify: `rcl-core/contract/src/fonts.ts`, `rcl-core/contract/src/teams.ts`, `rcl-core/contract/src/index.ts`, `packages/app-sdk/src/index.ts`, `.claude/rules/rcl-core-contract.md`, `.claude/rules/sdk.md`, `docs/features/import-export.md` (status), and the generated `docs/decisions/README.md` and `docs/features/README.md`
- Test: `rcl-core/contract/src/transfer.test.ts` (new)

**Interfaces:**
- Produces, from `@rollcall/core-contract`:
  - `FONT_FACE_FIELDS` (`family`, `weight`, `style`) and `faceWeights(face, context)`, which turns `weight` into `weightMin` and `weightMax` (`fonts.ts`). `UploadFontFaceQuerySchema` is built from them and behaves as before.
  - `checkMember(member, context)` and `rosterProblem(members): { index, field, message } | null` (`teams.ts`), with messages such as "Number 07 is used by two skaters" and "Only one member can be Captain".
  - In `transfer.ts`:
    - `EXPORT_FORMAT` (`'rollcall-export'`), `EXPORT_FORMAT_VERSION` (1) and `MANIFEST_FILE` (`'rollcall-export.json'`);
    - the limits `MAX_EXPORT_BYTES` (200 MB), `MAX_UNZIPPED_BYTES` (400 MB), `MAX_MANIFEST_BYTES` (10 MB) and `MAX_EXPORT_ENTRIES` (10 000);
    - `KindNameSchema` and `KindName`, and `MediaPathSchema` (`media/<sha256>.<ext>`);
    - `ManifestHeadSchema` (`format` and `formatVersion` only), `ManifestItemSchema`/`ManifestItem` and `ManifestSchema`/`Manifest`;
    - `TeamItemSchema`/`TeamItem` and `FontFaceItemSchema`/`FontFaceItem`, version 1 of core's kinds;
    - `TransferFactSchema`/`TransferFact` (`{ label, value }`) and `IMPORT_ACTIONS`;
    - `ImportChoiceSchema`/`ImportChoice`, `ImportChoicesSchema`/`ImportChoices` (`{ file, items, default }`), and `ImportQuerySchema` (`choices` as JSON);
    - `PREVIEW_STATUSES` (`new`, `conflict`, `reused`, `cant`) and `ConflictTargetSchema`/`ConflictTarget` (`{ id, name, facts, updatedAt }`);
    - `PreviewItemSchema`/`PreviewItem` and `ImportPreviewSchema`/`ImportPreview` (`{ file, items }`);
    - `ImportResultSchema`/`ImportResult` (`{ added, replaced, keptBoth, skipped, copies }`).
- Produces, from `@rollcall/app-sdk`:
  - `TransferMediaType`, `TransferMedia` (`{ path, type, what }`), `TransferNeed` (`{ kind, key }`) and `ExportedItem` (`{ name, data, needs? }`);
  - `TransferMatch`, and `TransferSave` (`{ as: 'new' } | { as: 'copy' } | { as: 'replace'; id }`);
  - `TransferKind<Data>`, and `AppModule.transfer?(ctx): readonly TransferKind[]`.
  - Task 3 adds `unusedMedia` to what `save` returns.

- [ ] **Step 0: Branch, and commit the spec and this plan.**

```bash
git switch -c feat/import-export
git add design-docs/specs/2026-10-26-import-export-design.md design-docs/plans/2026-10-26-import-export.md
git commit -F - <<'EOF'
docs(repo): spec and plan for import and export

Teams and themes move between installs as export files: rcl-core hosts
import and export, and each app owns the kinds of item it stores.

Refs #22
Refs #23

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Remind Mike, in one line, to move #22 to "In progress" on board #6 and #23 on board #8.

- [ ] **Step 1: Write the failing test.**

Create `rcl-core/contract/src/transfer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FontFaceItemSchema,
  ImportQuerySchema,
  ManifestHeadSchema,
  ManifestSchema,
  TeamItemSchema,
  type TeamItem,
} from './transfer.ts';

const LOGO = `media/${'a'.repeat(64)}.png`;
const PHOTO = `media/${'b'.repeat(64)}.jpg`;
const FILE = 'c'.repeat(64);

const TEAM: TeamItem = {
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  shortName: 'RCR',
  primaryColor: '#aa0000',
  secondaryColor: null,
  logo: LOGO,
  members: [
    { kind: 'skater', name: 'Jammy Dodger', number: '07', pronouns: 'she/her', roles: ['captain'], photo: PHOTO },
    { kind: 'bench', name: 'Coach Carter', roles: ['bench-coach'] },
  ],
};

// The first problem the team schema finds, as `path: message`, or undefined when the team is accepted.
function problem(team: unknown) {
  const issue = TeamItemSchema.safeParse(team).error?.issues[0];
  return issue && `${issue.path.join('.')}: ${issue.message}`;
}

describe('ManifestSchema', () => {
  const manifest = {
    format: 'rollcall-export',
    formatVersion: 1,
    exportedAt: '2026-10-26T12:00:00.000Z',
    apps: { core: '0.3.0', producer: '0.4.0' },
    items: [{ kind: 'core:team', version: 1, data: TEAM }],
  };

  it('accepts a manifest as Rollcall writes it, leaving item data to each kind', () => {
    expect(ManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it('refuses another format, a kind not named <app>:<thing>, and a version that is not a whole number', () => {
    expect(ManifestSchema.safeParse({ ...manifest, format: 'something-else' }).success).toBe(false);
    expect(ManifestSchema.safeParse({ ...manifest, items: [{ kind: 'team', version: 1, data: {} }] }).success).toBe(
      false,
    );
    expect(
      ManifestSchema.safeParse({ ...manifest, items: [{ kind: 'core:team', version: 1.5, data: {} }] }).success,
    ).toBe(false);
  });

  it('reads enough of a newer manifest to know it is newer', () => {
    const newer = { format: 'rollcall-export', formatVersion: 2, somethingNew: true };
    expect(ManifestHeadSchema.parse(newer)).toMatchObject({ formatVersion: 2 });
    expect(ManifestSchema.safeParse(newer).success).toBe(false);
  });
});

describe('TeamItemSchema', () => {
  it('accepts a team with its logo and members, filling in what is left out', () => {
    expect(TeamItemSchema.parse(TEAM)).toEqual({
      ...TEAM,
      members: [
        { ...TEAM.members[0], customRoles: [] },
        { ...TEAM.members[1], number: null, pronouns: null, customRoles: [], photo: null },
      ],
    });
  });

  it('applies the Team pages’ rules to each member and to the team as a whole', () => {
    const member = (fields: object) => ({ ...TEAM, members: [{ kind: 'skater', name: 'X', number: '1', ...fields }] });
    expect(problem(member({ number: null }))).toBe('members.0.number: Give the skater a number');
    expect(problem(member({ kind: 'bench', roles: ['captain'], number: null }))).toBe(
      "members.0.roles: Captain isn't a role for bench staff",
    );
    const twoSevens = { ...TEAM, members: [TEAM.members[0], { kind: 'skater', name: 'Seven', number: '07' }] };
    expect(problem(twoSevens)).toBe('members.1.number: Number 07 is used by two skaters');
    const twoCaptains = {
      ...TEAM,
      members: [TEAM.members[0], { kind: 'skater', name: 'Cap', number: '1', roles: ['captain'] }],
    };
    expect(problem(twoCaptains)).toBe('members.1.roles: Only one member can be Captain');
  });

  it('refuses media that is not a file of the export, and a blank name', () => {
    expect(problem({ ...TEAM, logo: '/media/0123456789abcdef0123456789abcdef' })).toBe(
      'logo: Use a media file of this export, such as media/<sha256>.png',
    );
    expect(problem({ ...TEAM, name: '  ' })).toBe('name: Give the team a name');
  });
});

describe('FontFaceItemSchema', () => {
  it('accepts a face with its file, reading its weights as an upload does', () => {
    const face = { family: 'Rollerball', weight: '100-900', style: 'italic', file: `media/${'d'.repeat(64)}.woff2` };
    expect(FontFaceItemSchema.parse(face)).toEqual({
      family: 'Rollerball',
      weightMin: 100,
      weightMax: 900,
      style: 'italic',
      file: face.file,
    });
    expect(FontFaceItemSchema.safeParse({ ...face, family: 'Bad"; }' }).success).toBe(false);
    expect(FontFaceItemSchema.safeParse({ ...face, weight: '900-100' }).success).toBe(false);
  });
});

describe('ImportQuerySchema', () => {
  it('reads the choices as JSON, defaulting to no default theme', () => {
    const choices = { file: FILE, items: [{ action: 'add' }, { action: 'replace', target: 't1' }, { action: 'skip' }] };
    expect(ImportQuerySchema.parse({ choices: JSON.stringify(choices) })).toEqual({
      choices: { ...choices, default: null },
    });
  });

  it('refuses choices that are not JSON, an unknown action, and a replace with no target', () => {
    expect(ImportQuerySchema.safeParse({ choices: '{' }).error?.issues[0]?.message).toBe('Send the choices as JSON');
    for (const item of [{ action: 'merge' }, { action: 'replace' }]) {
      const choices = JSON.stringify({ file: FILE, items: [item] });
      expect(ImportQuerySchema.safeParse({ choices }).success, JSON.stringify(item)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `yarn vitest run rcl-core/contract/src/transfer.test.ts`
Expected: FAIL. The file doesn't load: `Cannot find module './transfer.ts'`.

- [ ] **Step 3: Share the font face fields and the roster rules.**

An export file's font faces and teams follow the same rules as uploads and the Team pages, so those rules become shareable:

In `rcl-core/contract/src/fonts.ts`:

Replace:

```ts
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
```
with:

```ts
/** A face as people give it: its family, weight (`400`, or `100-900` for a variable font) and style. */
export const FONT_FACE_FIELDS = {
  family: FontFamilyNameSchema,
  weight: z.string().regex(WEIGHTS, 'Use a weight such as 400, or a range such as 100-900'),
  style: FontStyleSchema.default('normal'),
};

/** Turns a face's `weight` into `weightMin` and `weightMax`, refusing weights outside 100–900 or the wrong way round. */
export function faceWeights<T extends { weight: string }>({ weight, ...rest }: T, context: z.RefinementCtx) {
  const [, min = '', max = min] = WEIGHTS.exec(weight) ?? [];
  const weightMin = Number(min);
  const weightMax = Number(max);
  if (weightMin < 100 || weightMax > 900 || weightMin > weightMax) {
    context.addIssue({ code: 'custom', path: ['weight'], message: 'Use weights from 100 to 900, lowest first' });
    return z.NEVER;
  }
  return { ...rest, weightMin, weightMax };
}

/** An upload's family, weight and style, sent in its query string. */
export const UploadFontFaceQuerySchema = z.strictObject(FONT_FACE_FIELDS).transform(faceWeights);
```


In `rcl-core/contract/src/teams.ts`:

Replace:

```ts
}

export const CreateMemberRequestSchema = z
```
with:

```ts
}

/** Adds memberProblem's finding, if any, to a schema's issues. */
export function checkMember(member: MemberFields, context: z.RefinementCtx): void {
  const problem = memberProblem(member);
  if (problem) context.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
}

/**
 * What's wrong with a team's members together, or null: two skaters with the same number, or two members with a role a
 * team has only one of. `index` is the second member involved.
 */
export function rosterProblem(
  members: readonly MemberFields[],
): { index: number; field: keyof MemberFields; message: string } | null {
  for (const [index, member] of members.entries()) {
    const earlier = members.slice(0, index);
    if (member.number !== null && earlier.some((other) => other.number === member.number)) {
      return { index, field: 'number', message: `Number ${member.number} is used by two skaters` };
    }
    const twice = member.roles.find(
      (role) => ONE_PER_TEAM.includes(role) && earlier.some((o) => o.roles.includes(role)),
    );
    if (twice) return { index, field: 'roles', message: `Only one member can be ${MEMBER_ROLE_NAMES[twice]}` };
  }
  return null;
}

export const CreateMemberRequestSchema = z
```


Replace:

```ts
  .superRefine((member, context) => {
    const problem = memberProblem(member);
    if (problem) context.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
  });
```
with:

```ts
  .superRefine(checkMember);
```


Run: `yarn vitest run rcl-core/contract/src/fonts.test.ts rcl-core/contract/src/teams.test.ts`
Expected: PASS, 19 tests, as before. Nothing they check has changed.

- [ ] **Step 4: Write the contract.**

Create `rcl-core/contract/src/transfer.ts`:

```ts
import { z } from 'zod';
import { FONT_FACE_FIELDS, faceWeights } from './fonts.ts';
import { checkMember, CreateMemberRequestSchema, CreateTeamRequestSchema, rosterProblem } from './teams.ts';

// Export files (docs/features/import-export.md, ADR-0024): a .zip holding a manifest and the media its items use. Core
// reads and writes them; each app owns the kinds of item it stores.

export const EXPORT_FORMAT = 'rollcall-export';
/** The export file's layout this Rollcall writes. A newer one is refused. */
export const EXPORT_FORMAT_VERSION = 1;
export const MANIFEST_FILE = 'rollcall-export.json';

/** The largest export file the server accepts: 200 MB. */
export const MAX_EXPORT_BYTES = 200 * 1024 * 1024;
/** The most an export file may unzip to: 400 MB, judged from each entry's stated size before it's unzipped. */
export const MAX_UNZIPPED_BYTES = 400 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
export const MAX_EXPORT_ENTRIES = 10_000;

/** A kind of item, named `<app id>:<thing>`, such as `core:team`. */
export const KindNameSchema = z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, 'Use a kind like core:team');
export type KindName = `${string}:${string}`;

/** A media file in an export: `media/<sha256>.<ext>`, named by its bytes' SHA-256. */
export const MediaPathSchema = z
  .string()
  .regex(/^media\/[0-9a-f]{64}\.[a-z0-9]{1,5}$/, 'Use a media file of this export, such as media/<sha256>.png');

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/** Enough of a manifest to know whether this Rollcall can read the rest. */
export const ManifestHeadSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.number().int().min(1),
});

export const ManifestItemSchema = z.strictObject({
  kind: KindNameSchema,
  version: z.number().int().min(1),
  data: z.unknown(),
});
export type ManifestItem = z.infer<typeof ManifestItemSchema>;

export const ManifestSchema = z.strictObject({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: z.iso.datetime(),
  /** Each installed app's version when the file was made, for people reading it. */
  apps: z.record(z.string(), z.string()),
  items: z.array(ManifestItemSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

const MemberItemSchema = z
  .strictObject({ ...CreateMemberRequestSchema.shape, photo: MediaPathSchema.nullable().default(null) })
  .superRefine(checkMember);

/** A team in an export file, version 1: its details, logo and members, with no ids or times. */
export const TeamItemSchema = z
  .strictObject({
    ...CreateTeamRequestSchema.shape,
    logo: MediaPathSchema.nullable().default(null),
    members: z.array(MemberItemSchema).max(200, 'Use at most 200 members'),
  })
  .superRefine((team, context) => {
    const problem = rosterProblem(team.members);
    if (problem) {
      context.addIssue({ code: 'custom', path: ['members', problem.index, problem.field], message: problem.message });
    }
  });
export type TeamItem = z.input<typeof TeamItemSchema>;

/** An uploaded font face in an export file, version 1. */
export const FontFaceItemSchema = z.strictObject({ ...FONT_FACE_FIELDS, file: MediaPathSchema }).transform(faceWeights);
export type FontFaceItem = z.input<typeof FontFaceItemSchema>;

/** One fact about an item, shown when it conflicts with one here, such as "Skaters: 14". */
export const TransferFactSchema = z.strictObject({ label: z.string(), value: z.string() });
export type TransferFact = z.infer<typeof TransferFactSchema>;

export const IMPORT_ACTIONS = ['add', 'replace', 'keep-both', 'skip'] as const;

/** What to do with one item of a file: add it, replace an item here (`target`), keep both, or skip it. */
export const ImportChoiceSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('add') }),
  z.strictObject({ action: z.literal('replace'), target: z.string() }),
  z.strictObject({ action: z.literal('keep-both') }),
  z.strictObject({ action: z.literal('skip') }),
]);
export type ImportChoice = z.infer<typeof ImportChoiceSchema>;

/** The choices for a file, item by item in its order, and the theme (by index) to make the default, if any. */
export const ImportChoicesSchema = z.strictObject({
  /** The SHA-256 of the file the choices were made for, from its preview. */
  file: Sha256Schema,
  items: z.array(ImportChoiceSchema),
  default: z.number().int().min(0).nullable().default(null),
});
export type ImportChoices = z.input<typeof ImportChoicesSchema>;

/** `POST /transfer/import`'s query string: the choices, as JSON. */
export const ImportQuerySchema = z.strictObject({
  choices: z
    .string()
    .transform((text, context) => {
      try {
        const choices: unknown = JSON.parse(text);
        return choices;
      } catch {
        context.addIssue({ code: 'custom', message: 'Send the choices as JSON' });
        return z.NEVER;
      }
    })
    .pipe(ImportChoicesSchema),
});

/** What happens to an item: it's new, it conflicts, one here is used instead, or it can't be imported. */
export const PREVIEW_STATUSES = ['new', 'conflict', 'reused', 'cant'] as const;

export const ConflictTargetSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  facts: z.array(TransferFactSchema),
  updatedAt: z.iso.datetime().nullable(),
});
export type ConflictTarget = z.infer<typeof ConflictTargetSchema>;

export const PreviewItemSchema = z.strictObject({
  index: z.number().int().min(0),
  kind: z.string(),
  /** The kind for people, such as "Team". */
  label: z.string(),
  name: z.string(),
  facts: z.array(TransferFactSchema),
  status: z.enum(PREVIEW_STATUSES),
  /** Why it can't be imported, or which item here is used instead. */
  reason: z.string().nullable(),
  /** The items here it conflicts with, most recently changed first. */
  conflicts: z.array(ConflictTargetSchema),
  /** The items of the file it needs, by index, such as a theme's fonts. */
  needs: z.array(z.number().int().min(0)),
  /** Whether it can be made the default (a theme), and whether it was the default where it was exported. */
  canBeDefault: z.boolean(),
  wasDefault: z.boolean(),
});
export type PreviewItem = z.infer<typeof PreviewItemSchema>;

/** What `POST /transfer/import/preview` replies: the file's SHA-256, for the import, and each of its items. */
export const ImportPreviewSchema = z.strictObject({ file: Sha256Schema, items: z.array(PreviewItemSchema) });
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

/** What an import did. `copies` are the names items kept as copies were given. */
export const ImportResultSchema = z.strictObject({
  added: z.number().int(),
  replaced: z.number().int(),
  keptBoth: z.number().int(),
  skipped: z.number().int(),
  copies: z.array(z.string()),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;
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
export * from './transfer.ts';
```

- [ ] **Step 5: Kinds in the app SDK.**

In `packages/app-sdk/src/index.ts`:

Replace:

```ts
import type { FontFamily, Role } from '@rollcall/core-contract';
```
with:

```ts
import type { ConflictTarget, FontFamily, KindName, Role, TransferFact } from '@rollcall/core-contract';
```


Replace:

```ts
}

/** An rcl app, as rcl-core hosts it (split spec). */
```
with:

```ts
}

/** The type a media file of an export must be: core checks its bytes, as it does an upload's (ADR-0022). */
export type TransferMediaType = 'image' | 'font';

/** A media file an item of an export file uses: its path in the file, its type, and what it is, for messages. */
export interface TransferMedia {
  path: string;
  type: TransferMediaType;
  /** Such as "the photo for Jammy Dodger". */
  what: string;
}

/** Items of another kind that an item needs, by key, such as a theme's font family: `{ kind: 'core:font-face', key }`. */
export interface TransferNeed {
  kind: KindName;
  key: string;
}

/** An item as it goes into an export file. */
export interface ExportedItem {
  name: string;
  /** Its data, of the kind's current version, with media as paths given by `mediaPath`. */
  data: unknown;
  needs?: readonly TransferNeed[];
}

/** How an item of a file meets what's here. */
export type TransferMatch =
  | { status: 'new' }
  /** Items here with the same name, most recently changed first. */
  | { status: 'conflict'; targets: readonly ConflictTarget[] }
  /** An identical item here is used instead, such as a font face. */
  | { status: 'reused'; reason: string }
  | { status: 'cant'; reason: string };

/** How to save an item: as a new one, as a copy under a free name, or in place of an item here, keeping its id. */
export type TransferSave = { as: 'new' } | { as: 'copy' } | { as: 'replace'; id: string };

/**
 * One kind of item in Rollcall export files, owned by the app that stores it (ADR-0024). Core reads and writes the files
 * and calls these; the kind reads and writes its own data. Saving is synchronous, so it joins core's transaction.
 */
export interface TransferKind<Data = unknown> {
  /** `<app id>:<thing>`, such as `producer:theme`. */
  name: KindName;
  /** For people: `{ one: 'Theme', many: 'themes' }`. */
  label: { one: string; many: string };
  /** The version of its data this app writes. */
  version: number;
  /** From each older version to the next: `migrations[1]` turns version 1 data into version 2. */
  migrations?: Readonly<Record<number, (data: unknown) => unknown>>;
  exportPermission: Permission;
  importPermission: Permission;
  /** It travels only as another item's need, never asked for on its own (font faces). */
  onlyAsNeed?: true;
  /** An import can make one item of it the default (themes). */
  canBeDefault?: true;
  /** Every item that can be exported, by id and name. */
  list(): readonly { id: string; name: string }[];
  /** An item for an export file, with each media id turned into a path by `mediaPath`. Undefined for an unknown id. */
  exportItem(id: string, mediaPath: (mediaId: string) => string): ExportedItem | undefined;
  /** The items a need of another item names, such as the uploaded faces of a font family. */
  exportNeed?(key: string, mediaPath: (mediaId: string) => string): readonly ExportedItem[];
  /** Checks an item's data, of the current version: the data as the kind saves it, or its first problem, in words. */
  check(data: unknown): { ok: true; data: Data } | { ok: false; message: string };
  nameOf(data: Data): string;
  /** The facts shown when it conflicts with an item here, such as a team's number of skaters. */
  facts(data: Data): readonly TransferFact[];
  media(data: Data): readonly TransferMedia[];
  /** The items it needs, such as a theme's font families. */
  needs?(data: Data): readonly TransferNeed[];
  /** The key another item's need names it by, such as a font face's family. */
  needKey?(data: Data): string;
  /** Whether it was the default where it was exported, shown only as a hint. */
  wasDefault?(data: Data): boolean;
  match(data: Data): TransferMatch;
  /** Saves it, with each media path turned into its new media id by `mediaId`, and returns the name it was saved under. */
  save(
    data: Data,
    how: TransferSave,
    mediaId: (path: string) => string,
    options: { makeDefault: boolean },
  ): { name: string };
  /** Runs once an import that saved items of this kind is committed, such as telling overlays about a new default. */
  afterImport?(): void;
}

/** An rcl app, as rcl-core hosts it (split spec). */
```


Replace:

```ts
  realtime?(rt: Realtime, ctx: AppContext): void;
```
with:

```ts
  realtime?(rt: Realtime, ctx: AppContext): void;
  /** The kinds of item it stores that travel in export files (ADR-0024). */
  transfer?(ctx: AppContext): readonly TransferKind[];
```


- [ ] **Step 6: Record the decision, and start the feature.**

Create `docs/decisions/0024-import-export-kinds.md`:

```markdown
---
title: "Import and export: core hosts them, apps own their kinds"
status: accepted
date: 2026-10-26
---
# 0024. Import and export: core hosts them, apps own their kinds

## Context

[Import / export](../features/import-export.md) moves teams and themes between installs as files. Teams and fonts live in rcl-core; themes live in the Producer app. One file can hold both, and an import must save everything or nothing (R3). A theme's uploaded fonts travel with it, but [ADR-0023](0023-core-data-services-for-apps.md) keeps apps from writing core's data.

Options considered:
- **Each app exports its own kinds, in its own files.** Rejected: "everything" becomes several files, and a theme's fonts would have to be written into core by the Producer app.
- **The browser builds and splits the file,** calling each app's routes. Rejected: nothing could make an import across apps all-or-nothing, and much of the logic would move to the browser.

## Decision

- **Core reads and writes export files,** at `/api/core/transfer/…`: the zip, its manifest, the media in it, the limits, the checks and the transaction.
- **Each app owns its kinds.** An app module lists the kinds of item it stores with `transfer(ctx)` (`TransferKind` in `@rollcall/app-sdk`): each kind's name (`<app id>:<thing>`), version and migrations, who may export and import it, how its items are listed, exported, checked, matched with what's here and saved. Core declares `core:team` and `core:font-face`; the Producer app declares `producer:theme`.
- **One import is one transaction.** Every app shares one SQLite connection and a kind's save is synchronous, so all of a file's items are saved together or not at all.
- **Media stays core's.** A kind refers to media by core's media ids; core turns them into paths in the file on export, and saves the files and hands the kind new ids on import.
- **Released kind versions never change.** A change to a kind's data is a new version, with a migration from the one before.
- ADR-0023 still holds: apps never read or write core's tables, and core writes an app's data only through its kind.

## Consequences

- One file holds any mix of kinds, and an import of it saves all or nothing.
- A new kind, such as screens, is added by the app that owns it, with no change to core's routes or the dialog.
- The app SDK grows: `TransferKind` is a contract between core and every app, and changing it is a change to all of them.
- An item whose app isn't installed can't be imported; the preview says so and the rest of the file can be.
```

Replace `.claude/rules/rcl-core-contract.md` with:

```markdown
---
paths:
  - "rcl-core/contract/**"
---
# rcl-core contract (`rcl-core/contract/`, ADR-0019)

- **This is rcl-core's contract:** `/api/core` and core's namespaces. Each rcl app has its own (`rcl-<app>/contract`), and an app may use another's.

- **Zod schemas are the single contract** for REST, Socket.IO and import/export.
  - Types come from `z.infer`.
  - Name schemas `FooSchema` and their types `Foo`.
  - Prefer `z.strictObject`.
- **A schema change is a server *and* web change.** Update both, and their tests, in the same change.
- **Released import/export format versions never change.** Add a new version plus a migration instead (`docs/features/import-export.md`, ADR-0024). The export file's manifest, choices and core's kinds (`TeamItemSchema`, `FontFaceItemSchema`) are in `src/transfer.ts`.
- **Keep it lean:** servers, web apps and the web SDK all use this package. That means no runtime dependencies beyond `zod`, and no Node-only or DOM-only APIs.
- **Tests:** every schema has tests for an accepted payload and for the rejected shapes that matter.
```

In `.claude/rules/sdk.md`:

Replace:

```markdown
  - `AppContext` is one object per app, passed to both `register()` and `realtime()`. Core's data reaches apps only through its read-only services, such as `fonts.list()` (ADR-0023), never through core's tables.
```
with:

```markdown
  - `AppContext` is one object per app, passed to both `register()` and `realtime()`. Core's data reaches apps only through its read-only services, such as `fonts.list()` (ADR-0023), never through core's tables.
  - An app module lists the kinds of item it stores that travel in export files with `transfer(ctx)` (`TransferKind`, ADR-0024).
```


Work starts, so in `docs/features/import-export.md`:

Replace:

```markdown
status: planned
```
with:

```markdown
status: in-progress
```


Then run `node scripts/check-docs.mjs --fix`, which adds ADR-0024 to `docs/decisions/README.md` and updates the features table in `docs/features/README.md`.

- [ ] **Step 7: Run it and see it pass.**

Run: the command from Step 2.
Expected: PASS, 9 tests. `yarn test` passes 497.

- [ ] **Step 8: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/contract packages/app-sdk docs .claude/rules
git commit -F - <<'EOF'
feat(rcl-core): the export file contract, and kinds for apps

The contract for Rollcall export files: the manifest, version 1 of the
team and font face items, the import choices, the preview and the
result. TransferKind in the app SDK lets each app declare the kinds of
item it stores that travel in export files (ADR-0024). Font face fields
and roster rules are shared with uploads and the Team pages.

Refs #22

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Reading and writing export files

**Files:**
- Create: `rcl-core/server/src/transfer/zip.ts`
- Modify: `rcl-core/server/package.json`, `yarn.lock`, `.claude/rules/rcl-core-server.md`
- Test: `rcl-core/server/src/transfer/zip.test.ts` (new)

**Interfaces:**
- Consumes from Task 1: `Manifest`, `MANIFEST_FILE` and the four limits.
- Produces, in `src/transfer/zip.ts`:
  - `TransferError(status: 400 | 403 | 404 | 409 | 413 | 415, code, message)`, used for every refusal of an export or import;
  - `NOT_AN_EXPORT` ("This isn't a Rollcall export file.");
  - `ExportLimits` (`{ bytes, unzipped, manifest, entries }`) and `EXPORT_LIMITS`;
  - `sha256(bytes): string`, and `mediaPathFor(bytes, type: MediaType): string`, which gives `media/<sha256>.<ext>`;
  - `packExport(manifest, media: ReadonlyMap<string, Uint8Array>): Uint8Array`;
  - `readExport(zip, limits = EXPORT_LIMITS): { manifest: unknown; media: Map<string, Uint8Array> }`:
    - `400 bad_file` for anything that isn't a zip with a JSON manifest;
    - `413 too_large` over a limit.

- [ ] **Step 1: Add fflate.**

In `rcl-core/server/package.json`:

Replace:

```json
    "fastify-type-provider-zod": "^7.0.0",
```
with:

```json
    "fastify-type-provider-zod": "^7.0.0",
    "fflate": "^0.8.3",
```


Run: `yarn install`
Expected: the lockfile gains one line, `fflate: "npm:^0.8.3"` under `@rollcall/core-server`. Nothing is downloaded, since Vitest's UI already uses fflate 0.8.3.

- [ ] **Step 2: Write the failing test.**

Create `rcl-core/server/src/transfer/zip.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { Manifest } from '@rollcall/core-contract';
import { IMAGES } from '../testing.ts';
import { EXPORT_LIMITS, mediaPathFor, packExport, readExport, sha256, TransferError } from './zip.ts';

const MANIFEST: Manifest = {
  format: 'rollcall-export',
  formatVersion: 1,
  exportedAt: '2026-10-26T12:00:00.000Z',
  apps: { core: '0.3.0' },
  items: [],
};

// What readExport throws for `zip`, as [status, code], or undefined when it reads it.
function refusal(zip: Uint8Array, limits = EXPORT_LIMITS) {
  try {
    readExport(zip, limits);
    return undefined;
  } catch (error) {
    if (error instanceof TransferError) return [error.status, error.code, error.message];
    throw error;
  }
}

const zip = (files: Record<string, string | Uint8Array>) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, data]) => [name, typeof data === 'string' ? strToU8(data) : data]),
    ),
  );

describe('mediaPathFor', () => {
  it('names a file by the SHA-256 of its bytes, with its type’s extension', () => {
    expect(mediaPathFor(IMAGES.png, 'image/png')).toBe(`media/${sha256(IMAGES.png)}.png`);
    expect(mediaPathFor(IMAGES.jpeg, 'image/jpeg')).toMatch(/^media\/[0-9a-f]{64}\.jpg$/);
    expect(mediaPathFor(strToU8('wOF2'), 'font/woff2')).toMatch(/\.woff2$/);
  });
});

describe('packExport and readExport', () => {
  it('round-trip a manifest and its media files', () => {
    const path = mediaPathFor(IMAGES.png, 'image/png');
    const read = readExport(packExport(MANIFEST, new Map([[path, IMAGES.png]])));
    expect(read.manifest).toEqual(MANIFEST);
    expect([...read.media.keys()]).toEqual([path]);
    expect(Buffer.from(read.media.get(path)!).equals(IMAGES.png)).toBe(true);
  });

  it('ignores anything in the zip but the manifest and media files', () => {
    const read = readExport(zip({ 'rollcall-export.json': JSON.stringify(MANIFEST), 'notes.txt': 'hi', 'media/': '' }));
    expect(read.media.size).toBe(0);
  });

  it('refuses a file that is not a zip, or a zip that is not a Rollcall export', () => {
    const notAnExport = [400, 'bad_file', "This isn't a Rollcall export file."];
    expect(refusal(strToU8('just some text'))).toEqual(notAnExport);
    expect(refusal(zip({ 'team.json': '{}' }))).toEqual(notAnExport);
    expect(refusal(zip({ 'rollcall-export.json': '{ not json' }))).toEqual(notAnExport);
  });

  it('refuses a file over the limits, judged before anything is unzipped', () => {
    const small = { bytes: 1024 * 1024, unzipped: 2048, manifest: 512, entries: 3 };
    const tooBig = [413, 'too_large', 'That file is too big to import: the limit is 1 MB, unzipped twice that'];
    // Compresses to almost nothing, but unzips past the limit.
    expect(refusal(zip({ 'rollcall-export.json': '{}', 'media/a.png': new Uint8Array(4096) }), small)).toEqual(tooBig);
    expect(refusal(zip({ 'rollcall-export.json': ' '.repeat(600) }), small)).toEqual(tooBig);
    expect(refusal(zip({ 'rollcall-export.json': '{}', 'a.txt': '', 'b.txt': '', 'c.txt': '' }), small)).toEqual(
      tooBig,
    );
    expect(refusal(new Uint8Array(small.bytes + 1), small)).toEqual(tooBig);
    expect(refusal(zip({ 'rollcall-export.json': '{}', 'media/a.png': new Uint8Array(1024) }), small)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it and see it fail.**

Run: `yarn vitest run rcl-core/server/src/transfer/zip.test.ts`
Expected: FAIL. The file doesn't load: `Cannot find module './zip.ts'`.

- [ ] **Step 4: Pack and read files.**

Create `rcl-core/server/src/transfer/zip.ts`:

```ts
import { createHash } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import {
  MANIFEST_FILE,
  MAX_EXPORT_BYTES,
  MAX_EXPORT_ENTRIES,
  MAX_MANIFEST_BYTES,
  MAX_UNZIPPED_BYTES,
  type Manifest,
} from '@rollcall/core-contract';
import type { MediaType } from '../media.ts';

// Export files are zips (ADR-0024): the manifest, and each media file under media/<sha256>.<ext>. Media files are
// stored as they are, since images and fonts are compressed already.

/** A refusal of an export or import, with its HTTP status, error code and the words to show. */
export class TransferError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 413 | 415;
  readonly code: string;

  constructor(status: TransferError['status'], code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const NOT_AN_EXPORT = "This isn't a Rollcall export file.";

export interface ExportLimits {
  bytes: number;
  unzipped: number;
  manifest: number;
  entries: number;
}

export const EXPORT_LIMITS: ExportLimits = {
  bytes: MAX_EXPORT_BYTES,
  unzipped: MAX_UNZIPPED_BYTES,
  manifest: MAX_MANIFEST_BYTES,
  entries: MAX_EXPORT_ENTRIES,
};

const EXTENSIONS: Record<MediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
};

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Where a media file goes in an export: named by its bytes, so the same file is stored once. */
export const mediaPathFor = (bytes: Uint8Array, type: MediaType) => `media/${sha256(bytes)}.${EXTENSIONS[type]}`;

/** An export file: the manifest, then each media file by its path. */
export function packExport(manifest: Manifest, media: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const entries: Zippable = { [MANIFEST_FILE]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }] };
  for (const [path, bytes] of media) entries[path] = [bytes, { level: 0 }];
  return zipSync(entries);
}

/**
 * Reads an export file: its manifest, parsed as JSON but not yet checked, and its media files by path. Anything else in
 * the zip is ignored. The sizes each entry states are checked before anything is unzipped, so a small file can't
 * unzip to fill the memory.
 */
export function readExport(
  zip: Uint8Array,
  limits: ExportLimits = EXPORT_LIMITS,
): { manifest: unknown; media: Map<string, Uint8Array> } {
  if (zip.length > limits.bytes) throw tooLarge(limits);
  let entries = 0;
  let unzipped = 0;
  let files;
  try {
    files = unzipSync(zip, {
      filter: ({ name, originalSize }) => {
        entries += 1;
        unzipped += originalSize;
        if (entries > limits.entries) throw tooLarge(limits);
        if (unzipped > limits.unzipped) throw tooLarge(limits);
        if (name === MANIFEST_FILE && originalSize > limits.manifest) throw tooLarge(limits);
        return name === MANIFEST_FILE || (name.startsWith('media/') && !name.endsWith('/'));
      },
    });
  } catch (error) {
    if (error instanceof TransferError) throw error;
    throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);
  }
  const manifestBytes = files[MANIFEST_FILE];
  if (!manifestBytes) throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);
  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);
  }
  const media = new Map(Object.entries(files).filter(([name]) => name !== MANIFEST_FILE));
  return { manifest, media };
}

function tooLarge(limits: ExportLimits) {
  const mb = Math.round(limits.bytes / (1024 * 1024));
  return new TransferError(
    413,
    'too_large',
    `That file is too big to import: the limit is ${mb} MB, unzipped twice that`,
  );
}
```

In `.claude/rules/rcl-core-server.md`:

Replace:

```markdown
- **Bundled fonts** are in `fonts/`, listed in `src/fonts/bundled.ts` and served at `/fonts/<folder>/<file>` to anyone, so `fonts` is a reserved app id too.
```
with:

```markdown
- **Bundled fonts** are in `fonts/`, listed in `src/fonts/bundled.ts` and served at `/fonts/<folder>/<file>` to anyone, so `fonts` is a reserved app id too.
- **Export files** (ADR-0024) are read and written in `src/transfer/`: `zip.ts` packs and reads the zip within the limits, judging each entry's stated size before unzipping, and refusals are `TransferError`s.
```


- [ ] **Step 5: Run it and see it pass.**

Run: the command from Step 3.
Expected: PASS, 5 tests. `yarn test` passes 502.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server yarn.lock .claude/rules
git commit -F - <<'EOF'
feat(rcl-core): read and write export files, within limits

Export files are zips made with fflate (MIT, no dependencies): the
manifest, compressed, and each media file stored as it is. Reading one
judges every entry's stated size against the limits before anything is
unzipped, so a small file can't unzip to fill the memory.

Refs #22

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Core's kinds: teams and font faces

**Files:**
- Create: `rcl-core/server/src/teams/transfer.ts`, `rcl-core/server/src/fonts/transfer.ts`
- Modify: `rcl-core/contract/src/transfer.ts`, `packages/app-sdk/src/index.ts`, `rcl-core/server/src/teams/teams.ts`, `rcl-core/server/src/core-app.ts`, `.claude/rules/rcl-core-server.md`
- Test: `rcl-core/contract/src/transfer.test.ts`, and `rcl-core/server/src/teams/transfer.test.ts` and `rcl-core/server/src/fonts/transfer.test.ts` (new)

**Interfaces:**
- Consumes:
  - from Task 1: `TeamItemSchema`, `FontFaceItemSchema`, `TransferFact`, `ConflictTarget` and `TransferKind`;
  - from the font library: `addFontFace`, `bundledFamilyNamed`, `familyName` and `fontFaceTaken` (`fonts/fonts.ts`);
  - from teams: `createTeam`, `findTeamRow`, `listTeams` and `updateTeam` (`teams/teams.ts`).
- Produces:
  - `copyName(name, n, max = 64): string` in the contract: "All Stars copy", "All Stars copy 2" and so on, shortened to fit;
  - `TransferKind.save` returns `{ name, unusedMedia? }`. `unusedMedia` lists the media ids the item no longer uses, which core removes after the commit;
  - in `teams/teams.ts`: `membersOf(db, teamId)` is exported, and `replaceMembers(db, teamId, members): (string | null)[]` returns the old members' photos;
  - `teamKind({ db })` (`core:team`) and `fontFaceKind({ db })` (`core:font-face`, `onlyAsNeed`, `exportNeed(family)`), listed by `coreApp`'s `transfer`.

- [ ] **Step 1: Write the failing tests.**

In `rcl-core/contract/src/transfer.test.ts`:

Replace:

```ts
import {
```
with:

```ts
import {
  copyName,
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

describe('copyName', () => {
  it('names copies "<name> copy", then "copy 2", shortened to fit', () => {
    expect([1, 2, 3].map((n) => copyName('All Stars', n))).toEqual([
      'All Stars copy',
      'All Stars copy 2',
      'All Stars copy 3',
    ]);
    expect(copyName('x'.repeat(64), 1)).toBe(`${'x'.repeat(59)} copy`);
    expect(copyName('x'.repeat(64), 2)).toBe(`${'x'.repeat(57)} copy 2`);
  });
});
```


Create `rcl-core/server/src/teams/transfer.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { TeamItem } from '@rollcall/core-contract';
import { saveMedia } from '../media.ts';
import { IMAGES, testApp } from '../testing.ts';
import { addMember, createTeam, findTeam, findTeamRow, membersOf, updateMember, updateTeam } from './teams.ts';
import { teamKind } from './transfer.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// A media id as a path of an export file, as core names them.
const mediaPath = (id: string) => `media/${id}${id}.png`;

function setup() {
  const { app, db, mediaDir } = testApp();
  opened.push(app);
  const kind = teamKind({ db });
  const image = () => saveMedia(db, mediaDir, IMAGES.png)!;
  // All Stars, with a logo, a photographed captain and a coach.
  const allStars = () => {
    const team = createTeam(db, {
      name: 'All Stars',
      leagueName: 'Rose City Rollers',
      shortName: 'RCR',
      primaryColor: '#aa0000',
      secondaryColor: null,
    });
    updateTeam(db, team.id, { logoMediaId: image() });
    const jammy = addMember(db, team.id, {
      kind: 'skater',
      name: 'Jammy Dodger',
      number: '07',
      pronouns: 'she/her',
      roles: ['captain'],
      customRoles: [],
    });
    updateMember(db, team.id, jammy.members[0]!.id, { photoMediaId: image() });
    addMember(db, team.id, {
      kind: 'bench',
      name: 'Coach Carter',
      number: null,
      pronouns: null,
      roles: ['bench-coach'],
      customRoles: [],
    });
    return team.id;
  };
  // Turns a file's media paths into newly saved media ids, as an import does.
  const saved = new Map<string, string>();
  const mediaId = (path: string) => {
    const id = saved.get(path) ?? image();
    saved.set(path, id);
    return id;
  };
  return { db, kind, image, allStars, mediaId };
}

const ITEM: TeamItem = {
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  shortName: 'RCR',
  primaryColor: '#aa0000',
  secondaryColor: '#000000',
  logo: `media/${'a'.repeat(64)}.png`,
  members: [
    { kind: 'skater', name: 'Jammy Dodger', number: '07', roles: ['captain'], photo: `media/${'b'.repeat(64)}.png` },
    { kind: 'skater', name: 'Zero Cool', number: '00' },
    { kind: 'bench', name: 'Coach Carter', roles: ['bench-coach'] },
  ],
};

// An item's data, checked as an import checks it.
function checked(kind: ReturnType<typeof setup>['kind'], data: unknown) {
  const result = kind.check(data);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

describe('the core:team kind', () => {
  it('exports a team’s details and members, with its logo and photos as paths of the file', () => {
    const { db, kind, allStars } = setup();
    const id = allStars();
    const row = findTeamRow(db, id)!;
    const photo = membersOf(db, id).find((member) => member.name === 'Jammy Dodger')!.photoMediaId!;
    const exported = kind.exportItem(id, mediaPath);
    expect(exported?.name).toBe('All Stars');
    expect(exported?.data).toEqual({
      name: 'All Stars',
      leagueName: 'Rose City Rollers',
      shortName: 'RCR',
      primaryColor: '#aa0000',
      secondaryColor: null,
      logo: mediaPath(row.logoMediaId!),
      members: expect.arrayContaining([
        {
          kind: 'skater',
          name: 'Jammy Dodger',
          number: '07',
          pronouns: 'she/her',
          roles: ['captain'],
          customRoles: [],
          photo: mediaPath(photo),
        },
        {
          kind: 'bench',
          name: 'Coach Carter',
          number: null,
          pronouns: null,
          roles: ['bench-coach'],
          customRoles: [],
          photo: null,
        },
      ]),
    });
    expect(kind.check(exported?.data).ok).toBe(true);
    expect(kind.list()).toEqual([{ id, name: 'All Stars' }]);
    expect(kind.exportItem('nope', mediaPath)).toBeUndefined();
  });

  it('refuses a team that breaks the Team pages’ rules, in their words', () => {
    const { kind } = setup();
    const twoSevens = { ...ITEM, members: [...ITEM.members, { kind: 'skater', name: 'Seven', number: '07' }] };
    expect(kind.check(twoSevens)).toEqual({ ok: false, message: 'Number 07 is used by two skaters' });
    expect(kind.check({ ...ITEM, name: '' })).toEqual({ ok: false, message: 'Give the team a name' });
  });

  it('gives a team’s facts, and the media it uses with what each is', () => {
    const { kind } = setup();
    const data = checked(kind, ITEM);
    expect(kind.facts(data)).toEqual([
      { label: 'League', value: 'Rose City Rollers' },
      { label: 'Skaters', value: '2' },
      { label: 'Bench staff', value: '1' },
      { label: 'Colors', value: '#aa0000, #000000' },
      { label: 'Logo', value: 'yes' },
    ]);
    expect(kind.media(data)).toEqual([
      { path: ITEM.logo, type: 'image', what: 'the logo' },
      { path: ITEM.members[0]!.photo, type: 'image', what: 'the photo of Jammy Dodger' },
    ]);
  });

  it('is new unless teams here have the same name, ignoring case, listed most recently changed first', () => {
    const { db, kind, allStars } = setup();
    const data = checked(kind, ITEM);
    expect(kind.match(data)).toEqual({ status: 'new' });
    const older = allStars();
    const newer = createTeam(db, {
      name: 'ALL STARS',
      leagueName: null,
      shortName: null,
      primaryColor: null,
      secondaryColor: null,
    });
    updateTeam(db, newer.id, { shortName: 'AS' });
    const match = kind.match(data);
    expect(match.status === 'conflict' && match.targets.map((target) => target.id)).toEqual([newer.id, older]);
    expect(match.status === 'conflict' && match.targets[1]?.facts).toContainEqual({ label: 'Skaters', value: '1' });
  });

  it('adds a team with its members, logo and photos', () => {
    const { db, kind, mediaId } = setup();
    expect(kind.save(checked(kind, ITEM), { as: 'new' }, mediaId, { makeDefault: false })).toEqual({
      name: 'All Stars',
    });
    const [summary] = kind.list();
    const team = findTeam(db, summary!.id)!;
    expect(team).toMatchObject({
      name: 'All Stars',
      secondaryColor: '#000000',
      logoUrl: `/media/${mediaId(ITEM.logo!)}`,
    });
    expect(team.members.map((member) => [member.name, member.number, member.photoUrl])).toEqual([
      ['Zero Cool', '00', null],
      ['Jammy Dodger', '07', `/media/${mediaId(ITEM.members[0]!.photo!)}`],
      ['Coach Carter', null, null],
    ]);
  });

  it('keeps both under the first copy name no team has', () => {
    const { kind, allStars, mediaId } = setup();
    allStars();
    const data = checked(kind, ITEM);
    expect(kind.save(data, { as: 'copy' }, mediaId, { makeDefault: false }).name).toBe('All Stars copy');
    expect(kind.save(data, { as: 'copy' }, mediaId, { makeDefault: false }).name).toBe('All Stars copy 2');
  });

  it('replaces a team in place, keeping its id and name, and hands back the images it no longer uses', () => {
    const { db, kind, allStars, mediaId } = setup();
    const id = allStars();
    const oldLogo = findTeamRow(db, id)!.logoMediaId;
    const oldPhotos = membersOf(db, id).map((member) => member.photoMediaId);
    const saved = kind.save(checked(kind, { ...ITEM, name: 'all stars' }), { as: 'replace', id }, mediaId, {
      makeDefault: false,
    });
    expect(saved.name).toBe('All Stars');
    expect(saved.unusedMedia).toEqual(expect.arrayContaining([oldLogo, ...oldPhotos]));
    const team = findTeam(db, id)!;
    expect(team).toMatchObject({ id, name: 'All Stars', logoUrl: `/media/${mediaId(ITEM.logo!)}` });
    expect(team.members.map((member) => member.name)).toEqual(['Zero Cool', 'Jammy Dodger', 'Coach Carter']);
  });
});
```

Create `rcl-core/server/src/fonts/transfer.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { fontTypeOf, saveMedia } from '../media.ts';
import { FONTS, testApp } from '../testing.ts';
import { addFontFace, listFonts } from './fonts.ts';
import { fontFaceKind } from './transfer.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

const mediaPath = (id: string) => `media/${id}${id}.woff2`;
const FILE = `media/${'f'.repeat(64)}.woff2`;

function setup() {
  const { app, db, mediaDir } = testApp();
  opened.push(app);
  const kind = fontFaceKind({ db });
  const upload = (family: string, weightMin: number, weightMax = weightMin, style: 'normal' | 'italic' = 'normal') => {
    const mediaId = saveMedia(db, mediaDir, FONTS.woff2, fontTypeOf)!;
    addFontFace(db, { family, weightMin, weightMax, style, mediaId });
    return mediaId;
  };
  const checked = (data: unknown) => {
    const result = kind.check(data);
    if (!result.ok) throw new Error(result.message);
    return result.data;
  };
  const fontFile = () => saveMedia(db, mediaDir, FONTS.woff2, fontTypeOf)!;
  return { db, kind, upload, checked, fontFile };
}

describe('the core:font-face kind', () => {
  it('exports a family’s uploaded faces as another item’s need, and nothing for a bundled family', () => {
    const { kind, upload } = setup();
    const bold = upload('Rollerball', 700);
    upload('Rollerball', 400, 400, 'italic');
    upload('Jammer', 400);
    const faces = kind.exportNeed?.('rollerball', mediaPath) ?? [];
    expect(faces.map((face) => face.name)).toEqual(['Rollerball 700', 'Rollerball 400 italic']);
    expect(faces[0]?.data).toEqual({ family: 'Rollerball', weight: '700', style: 'normal', file: mediaPath(bold) });
    expect(kind.exportNeed?.('Oswald', mediaPath)).toEqual([]);
    expect(kind.onlyAsNeed).toBe(true);
  });

  it('reads a face as an upload does, and names it, its family and its file', () => {
    const { kind, checked } = setup();
    const data = checked({ family: 'Rollerball', weight: '100-900', style: 'italic', file: FILE });
    expect(kind.nameOf(data)).toBe('Rollerball 100–900 italic');
    expect(kind.needKey?.(data)).toBe('Rollerball');
    expect(kind.facts(data)).toEqual([
      { label: 'Family', value: 'Rollerball' },
      { label: 'Weights', value: '100-900' },
      { label: 'Style', value: 'italic' },
    ]);
    expect(kind.media(data)).toEqual([{ path: FILE, type: 'font', what: 'the font file' }]);
    expect(kind.check({ family: 'Bad"; }', weight: '400', file: FILE })).toMatchObject({ ok: false });
  });

  it('reuses an identical face here, never imports a bundled family’s, and is otherwise new', () => {
    const { kind, upload, checked } = setup();
    upload('Rollerball', 700);
    const face = (family: string, weight = '700') => kind.match(checked({ family, weight, file: FILE }));
    expect(face('ROLLERBALL')).toEqual({ status: 'reused', reason: 'Already here: the one here is used' });
    expect(face('oswald')).toEqual({ status: 'cant', reason: 'Oswald comes with Rollcall, so themes use that' });
    expect(face('Rollerball', '400')).toEqual({ status: 'new' });
  });

  it('adds a face to the family here whose name differs only in case', () => {
    const { db, kind, upload, checked, fontFile } = setup();
    upload('Rollerball', 700);
    const data = checked({ family: 'rollerball', weight: '400', file: FILE });
    const file = fontFile();
    expect(kind.save(data, { as: 'new' }, () => file, { makeDefault: false })).toEqual({ name: 'Rollerball 400' });
    const family = listFonts(db).find((f) => f.name === 'Rollerball');
    expect(family?.faces.map((f) => [f.weightMin, f.url])).toEqual([
      [400, `/media/${file}`],
      [700, expect.stringMatching(/^\/media\//)],
    ]);
    expect(() => kind.save(data, { as: 'copy' }, () => 'x', { makeDefault: false })).toThrow('only ever added');
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/contract/src/transfer.test.ts rcl-core/server/src/teams/transfer.test.ts rcl-core/server/src/fonts/transfer.test.ts`
Expected: FAIL, in 3 files.
- Contract: "names copies…" fails with `copyName is not a function`. The other 9 pass.
- Neither kind's test loads: `Cannot find module './transfer.ts'`.

- [ ] **Step 3: Copy names, and media a save leaves unused.**

In `rcl-core/contract/src/transfer.ts`:

Replace:

```ts
export type FontFaceItem = z.input<typeof FontFaceItemSchema>;
```
with:

```ts
export type FontFaceItem = z.input<typeof FontFaceItemSchema>;

/**
 * The name an item kept as a copy gets: "<name> copy" for the first, "<name> copy 2" and so on, with the name
 * shortened so the whole fits in `max` characters.
 */
export function copyName(name: string, n: number, max = 64): string {
  const suffix = n === 1 ? ' copy' : ` copy ${n}`;
  return `${name.slice(0, max - suffix.length).trimEnd()}${suffix}`;
}
```


In `packages/app-sdk/src/index.ts`:

Replace:

```ts
  /** Saves it, with each media path turned into its new media id by `mediaId`, and returns the name it was saved under. */
```
with:

```ts
  /**
   * Saves it, with each media path turned into its new media id by `mediaId`. Returns the name it was saved under, and
   * the media ids it no longer uses (a replaced team's old photos), which core removes once the import is committed.
   */
```


Replace:

```ts
  ): { name: string };
```
with:

```ts
  ): { name: string; unusedMedia?: readonly (string | null)[] };
```


- [ ] **Step 4: Replacing a team's members.**

In `rcl-core/server/src/teams/teams.ts`:

Replace:

```ts
const membersOf = (db: Queryable, teamId: string) =>
```
with:

```ts
/** A team's members, in no particular order. */
export const membersOf = (db: Queryable, teamId: string): MemberRow[] =>
```


Replace:

```ts
}

// Marks a team updated after a change to its members, and returns it.
```
with:

```ts
}

/**
 * Puts `members` in place of all of a team's members, as an import replacing a team does, and marks the team updated.
 * Returns the photos the old members had, for the caller to remove. The caller has checked the members together.
 */
export function replaceMembers(
  db: Queryable,
  teamId: string,
  members: readonly (MemberFields & { photoMediaId: string | null })[],
): (string | null)[] {
  const photos = membersOf(db, teamId).map((member) => member.photoMediaId);
  db.delete(teamMembers).where(eq(teamMembers.teamId, teamId)).run();
  const now = new Date().toISOString();
  for (const member of members) {
    db.insert(teamMembers)
      .values({
        id: randomUUID(),
        teamId,
        ...member,
        roles: [...member.roles],
        customRoles: [...member.customRoles],
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  touchTeam(db, teamId);
  return photos;
}

// Marks a team updated after a change to its members, and returns it.
```


- [ ] **Step 5: The kinds.**

Create `rcl-core/server/src/teams/transfer.ts`:

```ts
import { copyName, TeamItemSchema, type TeamItem, type TransferFact } from '@rollcall/core-contract';
import type { TransferKind } from '@rollcall/app-sdk';
import type { z } from 'zod';
import type { Queryable } from '../db.ts';
import { createTeam, findTeamRow, listTeams, membersOf, replaceMembers, updateTeam } from './teams.ts';

// Teams in export files (docs/features/import-export.md, ADR-0024): a team's details, logo and members, with no ids.

type TeamData = z.output<typeof TeamItemSchema>;

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// The facts shown when a team in a file conflicts with one here.
function teamFacts(team: {
  leagueName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  hasLogo: boolean;
  skaters: number;
  bench: number;
}): TransferFact[] {
  const colors = [team.primaryColor, team.secondaryColor].filter((color) => color !== null);
  return [
    { label: 'League', value: team.leagueName ?? 'none' },
    { label: 'Skaters', value: String(team.skaters) },
    { label: 'Bench staff', value: String(team.bench) },
    { label: 'Colors', value: colors.length > 0 ? colors.join(', ') : 'none' },
    { label: 'Logo', value: team.hasLogo ? 'yes' : 'none' },
  ];
}

const factsOf = (data: TeamData) =>
  teamFacts({
    ...data,
    hasLogo: data.logo !== null,
    skaters: data.members.filter((member) => member.kind === 'skater').length,
    bench: data.members.filter((member) => member.kind === 'bench').length,
  });

/** The `core:team` kind: everyone holding core:teams.manage may export and import teams. */
export function teamKind({ db }: { db: Queryable }): TransferKind<TeamData> {
  // The first copy name no team here has, ignoring case.
  const freeCopyName = (name: string) => {
    const names = listTeams(db).map((team) => team.name);
    let n = 1;
    while (names.some((taken) => sameName(taken, copyName(name, n)))) n += 1;
    return copyName(name, n);
  };

  return {
    name: 'core:team',
    label: { one: 'Team', many: 'teams' },
    version: 1,
    exportPermission: 'core:teams.manage',
    importPermission: 'core:teams.manage',

    list: () => listTeams(db).map(({ id, name }) => ({ id, name })),

    exportItem(id, mediaPath) {
      const row = findTeamRow(db, id);
      if (!row) return undefined;
      const media = (mediaId: string | null) => (mediaId === null ? null : mediaPath(mediaId));
      const data: TeamItem = {
        name: row.name,
        leagueName: row.leagueName,
        shortName: row.shortName,
        primaryColor: row.primaryColor,
        secondaryColor: row.secondaryColor,
        logo: media(row.logoMediaId),
        members: membersOf(db, id).map((member) => ({
          kind: member.kind,
          name: member.name,
          number: member.number,
          pronouns: member.pronouns,
          roles: member.roles,
          customRoles: member.customRoles,
          photo: media(member.photoMediaId),
        })),
      };
      return { name: row.name, data };
    },

    check(data) {
      const checked = TeamItemSchema.safeParse(data);
      return checked.success
        ? { ok: true, data: checked.data }
        : { ok: false, message: checked.error.issues[0]?.message ?? 'Not a team' };
    },

    nameOf: (data) => data.name,
    facts: factsOf,

    media: (data) => [
      ...(data.logo === null ? [] : [{ path: data.logo, type: 'image' as const, what: 'the logo' }]),
      ...data.members.flatMap((member) =>
        member.photo === null
          ? []
          : [{ path: member.photo, type: 'image' as const, what: `the photo of ${member.name}` }],
      ),
    ],

    match(data) {
      const targets = listTeams(db)
        .filter((team) => sameName(team.name, data.name))
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((team) => ({
          id: team.id,
          name: team.name,
          facts: teamFacts({
            ...team,
            hasLogo: team.logoUrl !== null,
            skaters: team.skaterCount,
            bench: team.benchCount,
          }),
          updatedAt: team.updatedAt,
        }));
      return targets.length > 0 ? { status: 'conflict', targets } : { status: 'new' };
    },

    save(data, how, mediaId) {
      const { logo, members, ...details } = data;
      const logoMediaId = logo === null ? null : mediaId(logo);
      // Each member is a fresh object from the destructuring, so it's safe to add to.
      const roster = members.map(({ photo, ...member }) =>
        Object.assign(member, { photoMediaId: photo === null ? null : mediaId(photo) }),
      );
      if (how.as === 'replace') {
        const old = findTeamRow(db, how.id);
        if (!old) throw new Error(`Team ${how.id} to replace is gone`);
        updateTeam(db, how.id, { ...details, name: old.name, logoMediaId });
        const photos = replaceMembers(db, how.id, roster);
        return { name: old.name, unusedMedia: [old.logoMediaId, ...photos] };
      }
      const name = how.as === 'copy' ? freeCopyName(details.name) : details.name;
      const team = createTeam(db, { ...details, name });
      updateTeam(db, team.id, { logoMediaId });
      replaceMembers(db, team.id, roster);
      return { name };
    },
  };
}
```

Create `rcl-core/server/src/fonts/transfer.ts`:

```ts
import { eq } from 'drizzle-orm';
import { FontFaceItemSchema, type FontFaceItem } from '@rollcall/core-contract';
import type { ExportedItem, TransferKind } from '@rollcall/app-sdk';
import type { z } from 'zod';
import type { Queryable } from '../db.ts';
import { fontFaces } from '../db/schema.ts';
import { addFontFace, bundledFamilyNamed, familyName, fontFaceTaken } from './fonts.ts';

// Uploaded font faces in export files (docs/features/import-export.md, ADR-0024). They travel only with the themes
// that use them; bundled families never travel, since every install has them.

type FontFaceData = z.output<typeof FontFaceItemSchema>;
type FaceRow = typeof fontFaces.$inferSelect;

const weightsOf = (face: { weightMin: number; weightMax: number }) =>
  face.weightMin === face.weightMax ? `${face.weightMin}` : `${face.weightMin}-${face.weightMax}`;
const faceName = (face: { family: string; weightMin: number; weightMax: number; style: string }) =>
  `${face.family} ${weightsOf(face).replace('-', '–')}${face.style === 'italic' ? ' italic' : ''}`;

/** The `core:font-face` kind: it travels with themes, so holders of core:fonts.read export it; Admins import it. */
export function fontFaceKind({ db }: { db: Queryable }): TransferKind<FontFaceData> {
  const exported = (face: FaceRow, mediaPath: (mediaId: string) => string): ExportedItem => {
    const data: FontFaceItem = {
      family: face.family,
      weight: weightsOf(face),
      style: face.style,
      file: mediaPath(face.mediaId),
    };
    return { name: faceName(face), data };
  };
  const faces = () => db.select().from(fontFaces).all();

  return {
    name: 'core:font-face',
    label: { one: 'Font', many: 'fonts' },
    version: 1,
    exportPermission: 'core:fonts.read',
    importPermission: 'core:fonts.manage',
    onlyAsNeed: true,

    list: () => faces().map((face) => ({ id: face.id, name: faceName(face) })),

    exportItem(id, mediaPath) {
      const face = db.select().from(fontFaces).where(eq(fontFaces.id, id)).get();
      return face && exported(face, mediaPath);
    },

    // A family's uploaded faces. A bundled family has none to send.
    exportNeed: (family, mediaPath) =>
      faces()
        .filter((face) => face.family.toLowerCase() === family.toLowerCase())
        .map((face) => exported(face, mediaPath)),

    check(data) {
      const checked = FontFaceItemSchema.safeParse(data);
      return checked.success
        ? { ok: true, data: checked.data }
        : { ok: false, message: checked.error.issues[0]?.message ?? 'Not a font face' };
    },

    nameOf: faceName,
    needKey: (data) => data.family,
    facts: (data) => [
      { label: 'Family', value: data.family },
      { label: 'Weights', value: weightsOf(data) },
      { label: 'Style', value: data.style },
    ],
    media: (data) => [{ path: data.file, type: 'font', what: 'the font file' }],

    match(data) {
      const bundled = bundledFamilyNamed(data.family);
      if (bundled) return { status: 'cant', reason: `${bundled.name} comes with Rollcall, so themes use that` };
      if (fontFaceTaken(db, data)) return { status: 'reused', reason: 'Already here: the one here is used' };
      return { status: 'new' };
    },

    // Faces never conflict, so they're only ever added, joining a family here whose name differs only in case.
    save(data, how, mediaId) {
      if (how.as !== 'new') throw new Error('Font faces are only ever added');
      const { file, ...face } = data;
      const family = familyName(db, face.family);
      addFontFace(db, { ...face, family, mediaId: mediaId(file) });
      return { name: faceName({ ...face, family }) };
    },
  };
}
```

In `rcl-core/server/src/core-app.ts`:

Replace:

```ts
import { CORE_APP_ID, CORE_PERMISSIONS } from './auth/permissions.ts';
```
with:

```ts
import { CORE_APP_ID, CORE_PERMISSIONS } from './auth/permissions.ts';
import { fontFaceKind } from './fonts/transfer.ts';
```


Replace:

```ts
import { registerUserRoutes } from './routes/users.ts';
```
with:

```ts
import { registerUserRoutes } from './routes/users.ts';
import { teamKind } from './teams/transfer.ts';
```


Replace:

```ts
    },
  };
```
with:

```ts
    },
    // Teams and their fonts' faces travel in export files (ADR-0024).
    transfer: () => [teamKind({ db }), fontFaceKind({ db })],
  };
```


In `.claude/rules/rcl-core-server.md`:

Replace:

```markdown
- **Export files** (ADR-0024) are read and written in `src/transfer/`: `zip.ts` packs and reads the zip within the limits, judging each entry's stated size before unzipping, and refusals are `TransferError`s.
```
with:

```markdown
- **Export files** (ADR-0024) are read and written in `src/transfer/`: `zip.ts` packs and reads the zip within the limits, judging each entry's stated size before unzipping, and refusals are `TransferError`s.
  - Core's kinds are `teamKind` (`src/teams/transfer.ts`) and `fontFaceKind` (`src/fonts/transfer.ts`), listed by `coreApp`'s `transfer`. A kind's `save` is synchronous and returns media it no longer uses, which core removes after the commit.
```


- [ ] **Step 6: Run them and see them pass.**

Run: the command from Step 2, plus `rcl-core/server/src/routes/teams.test.ts`.
Expected: PASS. The three files from Step 2 pass 21 tests, and `routes/teams.test.ts` still passes 13. `yarn test` passes 514.

- [ ] **Step 7: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core packages/app-sdk .claude/rules
git commit -F - <<'EOF'
feat(rcl-core): teams and font faces as export kinds

core:team exports a team's details and members with its logo and
photos. It conflicts with teams of the same name regardless of case, and
saves as new, as a copy, or in place of a chosen team, keeping its id.
core:font-face travels only with what uses it: an identical face here is
reused, and a bundled family's face is never imported.

Refs #22

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: The export, preview and import routes

**Files:**
- Create: `rcl-core/server/src/transfer/export.ts`, `rcl-core/server/src/transfer/import.ts`, `rcl-core/server/src/routes/transfer.ts`
- Modify: `rcl-core/contract/src/transfer.ts`, `rcl-core/server/src/apps.ts`, `rcl-core/server/src/core-app.ts`, `rcl-core/server/src/openapi.ts`, `.claude/rules/rcl-core-server.md`
- Test: `rcl-core/contract/src/transfer.test.ts`, `rcl-core/server/src/apps.test.ts`, and `rcl-core/server/src/routes/transfer.test.ts` (new)

**Interfaces:**
- Consumes:
  - from Tasks 1–3: the contract's schemas, `TransferKind`, `TransferError`, `readExport`, `packExport`, `mediaPathFor`, `sha256`, and core's kinds;
  - from the server: `saveMedia`, `removeMedia`, `imageTypeOf` and `fontTypeOf` (`media.ts`), `deny` (`auth/access.ts`) and `registerUploads` (`routes/uploads.ts`).
- Produces:
  - in the contract: `ExportSelection` (`{ items: { kind, id }[] } | { kinds: string[] }`), `ExportQuerySchema` and `ExportQuery`;
  - `HostedApps.kinds: ReadonlyMap<string, TransferKind>`: every app's kinds by name. A kind not named `<app id>:<thing>`, or named twice, is logged and skipped;
  - `buildExport({ db, mediaDir, modules, kinds, selection, mayExport }): ExportFile`, where `ExportFile` is `{ bytes, fileName }`;
  - `planImport({ zip, kinds, mayImport }): ImportPlan`, `previewOf(plan): ImportPreview` and `applyImport({ db, mediaDir, plan, choices }): ImportResult`;
  - `registerTransferRoutes(fastify, { db, mediaDir })`, with `GET /transfer/export`, `POST /transfer/import/preview` and `POST /transfer/import`, tagged `core/transfer`.

- [ ] **Step 1: Write the failing tests.**

In `rcl-core/contract/src/transfer.test.ts`:

Replace:

```ts
  copyName,
```
with:

```ts
  copyName,
  ExportQuerySchema,
```


Replace:

```ts
    expect(copyName('x'.repeat(64), 2)).toBe(`${'x'.repeat(57)} copy 2`);
  });
});
```
with:

```ts
    expect(copyName('x'.repeat(64), 2)).toBe(`${'x'.repeat(57)} copy 2`);
  });
});

describe('ExportQuerySchema', () => {
  it('reads chosen items as kind:id, or whole kinds', () => {
    expect(ExportQuerySchema.parse({ items: 'core:team:t1,producer:theme:th-2' })).toEqual({
      items: [
        { kind: 'core:team', id: 't1' },
        { kind: 'producer:theme', id: 'th-2' },
      ],
    });
    expect(ExportQuerySchema.parse({ kinds: 'core:team,producer:theme' })).toEqual({
      kinds: ['core:team', 'producer:theme'],
    });
  });

  it('refuses both, neither, an empty list of items, and an item with no kind', () => {
    for (const query of [{ items: 'core:team:t1', kinds: 'core:team' }, {}, { items: '' }, { items: 't1' }]) {
      expect(ExportQuerySchema.safeParse(query).error?.issues[0]?.message, JSON.stringify(query)).toBe(
        'Choose items, as kind:id, or kinds to export',
      );
    }
  });
});
```


In `rcl-core/server/src/apps.test.ts`:

Replace:

```ts
import type { AppModule } from '@rollcall/app-sdk';
```
with:

```ts
import type { AppModule, TransferKind } from '@rollcall/app-sdk';
```


Replace:

```ts
});

describe("an app's tables", () => {
```
with:

```ts
});

// A kind whose name is all that matters here.
const kind = (name: string) => ({ name }) as unknown as TransferKind;

describe("apps' export kinds", () => {
  it('are gathered by name, each named after its app, skipping and logging any that are not', () => {
    const { hosted, log } = host([app({ transfer: () => [kind('demo:note'), kind('core:team'), kind('demo:note')] })]);
    expect([...hosted.kinds.keys()]).toEqual(['demo:note']);
    expect(log.error).toHaveBeenCalledWith(
      { app: 'demo' },
      'Skipping export kind "core:team": it must be named demo:<thing>',
    );
    expect(log.error).toHaveBeenCalledWith(
      { app: 'demo' },
      'Skipping export kind "demo:note": another kind has that name',
    );
  });
});

describe("an app's tables", () => {
```


The route tests host core with a demo app whose kind, `demo:note`, does what core's kinds don't yet: it has a migration from version 1, a default, a need and an after-import step, and its item "boom" fails as it's saved.

Create `rcl-core/server/src/routes/transfer.test.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import type { AppModule, TransferKind } from '@rollcall/app-sdk';
import {
  ImportPreviewSchema,
  ImportResultSchema,
  ManifestSchema,
  type ImportChoices,
  type ManifestItem,
  type Role,
  type TeamItem,
} from '@rollcall/core-contract';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { teams } from '../db/schema.ts';
import { addFontFace, listFonts } from '../fonts/fonts.ts';
import { fontTypeOf, saveMedia } from '../media.ts';
import { addMember, createTeam, deleteTeam, findTeam, listTeams, updateMember, updateTeam } from '../teams/teams.ts';
import { addUser, FONTS, IMAGES, testApp } from '../testing.ts';
import { mediaPathFor, packExport } from '../transfer/zip.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// A demo app with one kind, "demo:note", kept in memory: version 2, migrated from 1, able to be the default, needing a
// font family, and failing to save a note named "boom", for what core's own kinds don't show.
function demoApp(db: () => ReturnType<typeof testApp>['db']) {
  const notes: { id: string; name: string; text: string; isDefault: boolean; fontHere: boolean }[] = [];
  let afterImports = 0;
  const NoteSchema = z.strictObject({
    name: z.string().min(1, 'Give the note a name'),
    text: z.string(),
    font: z.string().optional(),
  });
  const kind: TransferKind<z.infer<typeof NoteSchema>> = {
    name: 'demo:note',
    label: { one: 'Note', many: 'notes' },
    version: 2,
    // Version 1 called the text "body".
    migrations: {
      1: (data) => {
        const { body, ...rest } = data as { body: string };
        return { ...rest, text: body };
      },
    },
    exportPermission: 'demo:notes.manage',
    importPermission: 'demo:notes.manage',
    canBeDefault: true,
    list: () => notes.map(({ id, name }) => ({ id, name })),
    exportItem: (id) => {
      const note = notes.find((n) => n.id === id);
      return note && { name: note.name, data: { name: note.name, text: note.text } };
    },
    check(data) {
      const checked = NoteSchema.safeParse(data);
      return checked.success
        ? { ok: true, data: checked.data }
        : { ok: false, message: checked.error.issues[0]!.message };
    },
    nameOf: (data) => data.name,
    facts: (data) => [{ label: 'Text', value: data.text }],
    media: () => [],
    needs: (data) => (data.font ? [{ kind: 'core:font-face', key: data.font }] : []),
    wasDefault: (data) => data.name === 'Was default',
    match: (data) =>
      notes.some((n) => n.name === data.name)
        ? {
            status: 'conflict',
            targets: notes
              .filter((n) => n.name === data.name)
              .map((n) => ({ id: n.id, name: n.name, facts: [], updatedAt: null })),
          }
        : { status: 'new' },
    save(data, how, _mediaId, { makeDefault }) {
      if (data.name === 'boom') throw new Error('boom');
      if (makeDefault) for (const note of notes) note.isDefault = false;
      const fontHere = data.font === undefined || listFonts(db()).some((f) => f.name === data.font);
      notes.push({
        id: `n${notes.length + 1}`,
        name: how.as === 'copy' ? `${data.name} copy` : data.name,
        text: data.text,
        isDefault: makeDefault,
        fontHere,
      });
      return { name: notes.at(-1)!.name };
    },
    afterImport: () => void (afterImports += 1),
  };
  const app: AppModule = {
    id: 'demo',
    title: 'Demo',
    version: '1.0.0',
    requiresCore: '*',
    permissions: [{ key: 'demo:notes.manage', summary: 'Manage notes', roles: [] }],
    transfer: () => [kind],
  };
  return { app, notes, afterImports: () => afterImports };
}

// An app with `role` signed in, and ways to export and import as them.
async function as(role: Role = 'admin', { demo = false } = {}) {
  let database: ReturnType<typeof testApp>['db'] | undefined;
  const notes = demoApp(() => database!);
  const { app, db, mediaDir } = testApp(demo ? { apps: [notes.app] } : {});
  database = db;
  opened.push(app);
  const user = await addUser(db, `${role}1`, 'correct horse', role);
  const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
  const exportOf = (query: string) => app.inject({ method: 'GET', url: `/api/core/transfer/export?${query}`, cookies });
  const send = (url: string, zip: Uint8Array | string, contentType = 'application/zip') =>
    app.inject({ method: 'POST', url, cookies, headers: { 'content-type': contentType }, payload: Buffer.from(zip) });
  const preview = async (zip: Uint8Array) => {
    const res = await send('/api/core/transfer/import/preview', zip);
    return { res, body: res.statusCode === 200 ? ImportPreviewSchema.parse(res.json()) : undefined };
  };
  const importFile = (zip: Uint8Array, choices: ImportChoices) =>
    send(`/api/core/transfer/import?choices=${encodeURIComponent(JSON.stringify(choices))}`, zip);
  const image = () => saveMedia(db, mediaDir, IMAGES.png)!;
  // All Stars, with a logo and a photographed captain.
  const allStars = (name = 'All Stars') => {
    const team = createTeam(db, {
      name,
      leagueName: 'Rose City Rollers',
      shortName: null,
      primaryColor: '#aa0000',
      secondaryColor: null,
    });
    updateTeam(db, team.id, { logoMediaId: image() });
    const added = addMember(db, team.id, {
      kind: 'skater',
      name: 'Jammy Dodger',
      number: '07',
      pronouns: null,
      roles: ['captain'],
      customRoles: [],
    });
    updateMember(db, team.id, added.members[0]!.id, { photoMediaId: image() });
    return team.id;
  };
  const uploadFont = (family: string, weight: number) =>
    addFontFace(db, {
      family,
      weightMin: weight,
      weightMax: weight,
      style: 'normal',
      mediaId: saveMedia(db, mediaDir, FONTS.woff2, fontTypeOf)!,
    });
  return { app, db, mediaDir, notes, exportOf, send, preview, importFile, allStars, uploadFont };
}

const LOGO = mediaPathFor(IMAGES.png, 'image/png');
const PHOTO = mediaPathFor(IMAGES.jpeg, 'image/jpeg');
const FONT = mediaPathFor(FONTS.woff2, 'font/woff2');
const TEAM: TeamItem = {
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  logo: LOGO,
  members: [{ kind: 'skater', name: 'Jammy Dodger', number: '07', roles: ['captain'], photo: PHOTO }],
};
const MEDIA = new Map([
  [LOGO, IMAGES.png],
  [PHOTO, IMAGES.jpeg],
  [FONT, FONTS.woff2],
]);

// An export file holding `items`, with every media file the tests use unless told otherwise.
const fileOf = (items: ManifestItem[], { media = MEDIA } = {}) =>
  packExport(
    {
      format: 'rollcall-export',
      formatVersion: 1,
      exportedAt: '2026-10-26T12:00:00.000Z',
      apps: { core: '0.3.0' },
      items,
    },
    media,
  );
const team = (data: object = TEAM): ManifestItem => ({ kind: 'core:team', version: 1, data });
const note = (data: object, version = 2): ManifestItem => ({ kind: 'demo:note', version, data });
const face = (family: string, weight = '700'): ManifestItem => ({
  kind: 'core:font-face',
  version: 1,
  data: { family, weight, style: 'normal', file: FONT },
});
// The manifest of an exported file.
const manifestOf = (body: Buffer) =>
  ManifestSchema.parse(JSON.parse(strFromU8(unzipSync(body)['rollcall-export.json']!)));
const choose = (file: string, ...items: ImportChoices['items']): ImportChoices => ({ file, items });

describe('exporting', () => {
  it('exports a team with its logo and photos, as a download named after it', async () => {
    const { exportOf, allStars } = await as();
    const id = allStars();
    const res = await exportOf(`items=core:team:${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="rollcall-team-all-stars-\d{4}-\d\d-\d\d\.zip"$/,
    );
    const files = unzipSync(res.rawPayload);
    const manifest = manifestOf(res.rawPayload);
    expect(manifest).toMatchObject({ format: 'rollcall-export', formatVersion: 1, apps: { core: expect.any(String) } });
    expect(manifest.items).toEqual([
      { kind: 'core:team', version: 1, data: expect.objectContaining({ name: 'All Stars' }) },
    ]);
    const data = manifest.items[0]!.data as TeamItem;
    expect(Object.keys(files).toSorted()).toEqual(['rollcall-export.json', data.logo!].toSorted());
    expect(data.logo).toBe(data.members[0]!.photo);
  });

  it('exports every item of a kind, named after the kind', async () => {
    const { exportOf, allStars } = await as();
    allStars();
    allStars('B Team');
    const res = await exportOf('kinds=core:team');
    expect(res.headers['content-disposition']).toMatch(/filename="rollcall-teams-/);
    expect(
      manifestOf(res.rawPayload)
        .items.map((item) => (item.data as TeamItem).name)
        .toSorted(),
    ).toEqual(['All Stars', 'B Team']);
  });

  it('refuses an unknown item or kind, nothing at all, and fonts on their own', async () => {
    const { exportOf } = await as();
    expect((await exportOf('items=core:team:nope')).json()).toEqual({
      error: 'not_found',
      message: "There's no such team",
    });
    expect((await exportOf('kinds=demo:note')).json()).toEqual({
      error: 'not_found',
      message: 'Nothing here is a demo:note',
    });
    expect((await exportOf('kinds=core:team')).json()).toEqual({
      error: 'nothing_to_export',
      message: 'There’s nothing to export',
    });
    const fonts = await exportOf('kinds=core:font-face');
    expect([fonts.statusCode, fonts.json()]).toEqual([
      400,
      { error: 'bad_selection', message: 'Fonts travel only with what uses them' },
    ]);
    expect((await exportOf('items=nope')).json()).toMatchObject({ error: 'validation_failed' });
  });

  it('refuses a kind the caller may not export, naming it', async () => {
    const { exportOf, allStars } = await as('announcer');
    allStars();
    const res = await exportOf('kinds=core:team');
    expect([res.statusCode, res.json()]).toEqual([
      403,
      { error: 'forbidden', message: "Your account can't export teams" },
    ]);
  });
});

describe('previewing an import', () => {
  it('says what each item is and what would happen to it, saving nothing', async () => {
    const { preview, allStars, db } = await as('admin', { demo: true });
    const here = allStars('ALL STARS');
    const { body } = await preview(
      fileOf([
        team(),
        team({ ...TEAM, name: 'B Team' }),
        { kind: 'core:screen', version: 1, data: { name: 'Bout intro' } },
        note({ name: 'Old', body: 'hi' }, 1),
      ]),
    );
    expect(body?.items.map((item) => [item.index, item.label, item.name, item.status, item.reason])).toEqual([
      [0, 'Team', 'All Stars', 'conflict', null],
      [1, 'Team', 'B Team', 'new', null],
      [2, 'Screen', 'Bout intro', 'cant', "Screens aren't known here yet"],
      [3, 'Note', 'Old', 'new', null],
    ]);
    expect(body?.items[0]?.conflicts).toEqual([
      {
        id: here,
        name: 'ALL STARS',
        facts: expect.arrayContaining([{ label: 'Skaters', value: '1' }]),
        updatedAt: expect.any(String),
      },
    ]);
    expect(body?.items[1]?.facts).toContainEqual({ label: 'League', value: 'Rose City Rollers' });
    expect(body?.items[3]?.facts).toEqual([{ label: 'Text', value: 'hi' }]);
    expect(listTeams(db)).toHaveLength(1);
  });

  it('marks items made by a newer Rollcall, and kinds the caller may not import, as can’t-import', async () => {
    const { preview } = await as('producer', { demo: true });
    const { body } = await preview(
      fileOf([note({ name: 'Future', text: '' }, 3), note({ name: 'Mine', text: '' }), face('Rollerball')]),
    );
    expect(body?.items.map((item) => [item.status, item.reason])).toEqual([
      ['cant', 'This file was made by a newer Rollcall. Update Rollcall to import it.'],
      ['cant', "Your account can't import notes"],
      ['cant', "Your account can't import fonts"],
    ]);
  });

  it('reuses an identical font face, never imports a bundled family’s, and links fonts to what needs them', async () => {
    const { preview, uploadFont } = await as('admin', { demo: true });
    uploadFont('Rollerball', 700);
    const { body } = await preview(
      fileOf([
        face('rollerball'),
        face('Oswald'),
        face('Jammer', '400'),
        note({ name: 'Uses Jammer', text: '', font: 'jammer' }),
      ]),
    );
    expect(body?.items.map((item) => [item.name, item.status, item.reason])).toEqual([
      ['rollerball 700', 'reused', 'Already here: the one here is used'],
      ['Oswald 700', 'cant', 'Oswald comes with Rollcall, so themes use that'],
      ['Jammer 400', 'new', null],
      ['Uses Jammer', 'new', null],
    ]);
    expect(body?.items[3]?.needs).toEqual([2]);
    expect(body?.items.map((item) => item.canBeDefault)).toEqual([false, false, false, true]);
  });

  it('refuses a file that isn’t an export, is newer, or holds a broken item or media file, saying where', async () => {
    const { send, preview } = await as();
    const refusal = async (zip: Uint8Array) => (await preview(zip)).res.json<{ error: string; message: string }>();
    expect(await refusal(new TextEncoder().encode('not a zip'))).toEqual({
      error: 'bad_file',
      message: "This isn't a Rollcall export file.",
    });
    // A formatVersion 2 file, written by hand since this Rollcall writes only 1.
    const newer = zipSync({
      'rollcall-export.json': strToU8(JSON.stringify({ format: 'rollcall-export', formatVersion: 2 })),
    });
    expect(await refusal(newer)).toEqual({
      error: 'newer_format',
      message: 'This file was made by a newer Rollcall. Update Rollcall to import it.',
    });
    expect((await preview(fileOf([]))).body?.items).toEqual([]);
    const twoSevens = { ...TEAM, members: [...TEAM.members, { kind: 'skater', name: 'Seven', number: '07' }] };
    expect(await refusal(fileOf([team(), team(twoSevens)]))).toEqual({
      error: 'invalid_item',
      message: 'Item 2 (team “All Stars”): Number 07 is used by two skaters',
    });
    expect(await refusal(fileOf([team()], { media: new Map([[PHOTO, IMAGES.jpeg]]) }))).toEqual({
      error: 'bad_media',
      message: 'Item 1 (team “All Stars”): the logo is missing from the file',
    });
    expect(
      await refusal(
        fileOf([team()], {
          media: new Map([
            [LOGO, IMAGES.png],
            [PHOTO, FONTS.woff2],
          ]),
        }),
      ),
    ).toEqual({
      error: 'bad_media',
      message: "Item 1 (team “All Stars”): the photo of Jammy Dodger isn't a PNG, JPEG or WebP image",
    });
    expect(await refusal(fileOf([face('Jammer')], { media: new Map([[FONT, IMAGES.png]]) }))).toEqual({
      error: 'bad_media',
      message: "Item 1 (font “Jammer 700”): the font file isn't a WOFF2, WOFF, TTF or OTF font",
    });
    const json = await send('/api/core/transfer/import/preview', '{}', 'application/json');
    expect([json.statusCode, json.json()]).toEqual([
      415,
      { error: 'unsupported_file', message: 'Send a Rollcall export file (.zip)' },
    ]);
  });
});

describe('importing', () => {
  it('round-trips: everything exported comes back with its media', async () => {
    const { db, mediaDir, exportOf, preview, importFile, allStars, app } = await as();
    const id = allStars();
    const zip = (await exportOf('kinds=core:team')).rawPayload;
    deleteTeam(db, id);
    const { body } = await preview(zip);
    const res = await importFile(zip, choose(body!.file, { action: 'add' }));
    expect(ImportResultSchema.parse(res.json())).toEqual({
      added: 1,
      replaced: 0,
      keptBoth: 0,
      skipped: 0,
      copies: [],
    });
    const [back] = listTeams(db);
    const restored = findTeam(db, back!.id)!;
    expect(restored).toMatchObject({ name: 'All Stars', leagueName: 'Rose City Rollers', primaryColor: '#aa0000' });
    expect(restored.members.map((member) => [member.name, member.number, member.roles])).toEqual([
      ['Jammy Dodger', '07', ['captain']],
    ]);
    const logo = await app.inject({ method: 'GET', url: restored.logoUrl! });
    expect([logo.statusCode, logo.headers['content-type']]).toEqual([200, 'image/png']);
    expect(existsSync(mediaDir) && readdirSync(mediaDir).length).toBeGreaterThan(0);
  });

  it('replaces in place, keeps both as a copy, or skips, as chosen for each conflict', async () => {
    const { db, mediaDir, preview, importFile, allStars } = await as();
    const replaced = allStars();
    allStars('B Team');
    allStars('C Team');
    const oldFiles = readdirSync(mediaDir);
    const zip = fileOf([
      team({ ...TEAM, leagueName: 'From the file' }),
      team({ ...TEAM, name: 'B Team' }),
      team({ ...TEAM, name: 'C Team' }),
    ]);
    const { body } = await preview(zip);
    const res = await importFile(
      zip,
      choose(body!.file, { action: 'replace', target: replaced }, { action: 'keep-both' }, { action: 'skip' }),
    );
    expect(res.json()).toEqual({ added: 0, replaced: 1, keptBoth: 1, skipped: 1, copies: ['B Team copy'] });
    expect(findTeam(db, replaced)).toMatchObject({ id: replaced, name: 'All Stars', leagueName: 'From the file' });
    expect(listTeams(db).map((t) => t.name)).toEqual(['All Stars', 'B Team', 'B Team copy', 'C Team']);
    // The replaced team's old logo and photo are gone; the others' are kept.
    expect(readdirSync(mediaDir).filter((file) => oldFiles.includes(file))).toHaveLength(oldFiles.length - 2);
  });

  it('replaces the team chosen when two here have the conflicting name', async () => {
    const { db, preview, importFile, allStars } = await as();
    const first = allStars();
    const second = allStars('all stars');
    // The first was changed longer ago.
    db.update(teams).set({ updatedAt: '2026-01-01T00:00:00.000Z' }).where(eq(teams.id, first)).run();
    const zip = fileOf([team({ ...TEAM, leagueName: 'New' })]);
    const { body } = await preview(zip);
    expect(body?.items[0]?.conflicts.map((c) => c.id)).toEqual([second, first]);
    await importFile(zip, choose(body!.file, { action: 'replace', target: first }));
    expect(findTeam(db, first)?.leagueName).toBe('New');
    expect(findTeam(db, second)?.leagueName).toBe('Rose City Rollers');
  });

  it('migrates old items, saves needs first, makes only the chosen item the default, then runs after-import', async () => {
    const { notes, preview, importFile } = await as('admin', { demo: true });
    const zip = fileOf([
      note({ name: 'Uses Jammer', text: 'x', font: 'Jammer' }),
      note({ name: 'Old', body: 'from v1' }, 1),
      face('Jammer', '400'),
    ]);
    const { body } = await preview(zip);
    const res = await importFile(zip, {
      ...choose(body!.file, { action: 'add' }, { action: 'add' }, { action: 'add' }),
      default: 1,
    });
    expect(res.json()).toMatchObject({ added: 3 });
    expect(notes.notes.map((n) => [n.name, n.text, n.isDefault, n.fontHere])).toEqual([
      ['Uses Jammer', 'x', false, true],
      ['Old', 'from v1', true, true],
    ]);
    expect(notes.afterImports()).toBe(1);
  });

  it('makes nothing the default unless chosen, and only an item that can be', async () => {
    const { notes, preview, importFile } = await as('admin', { demo: true });
    const zip = fileOf([note({ name: 'Was default', text: '' }), face('Jammer', '400')]);
    const { body } = await preview(zip);
    expect(body?.items[0]?.wasDefault).toBe(true);
    const wrong = await importFile(zip, { ...choose(body!.file, { action: 'add' }, { action: 'add' }), default: 1 });
    expect([wrong.statusCode, wrong.json()]).toEqual([
      400,
      { error: 'bad_choices', message: 'Only a theme being imported can be made the default' },
    ]);
    await importFile(zip, choose(body!.file, { action: 'add' }, { action: 'add' }));
    expect(notes.notes.map((n) => n.isDefault)).toEqual([false]);
  });

  it('saves nothing, and leaves no files, when an item fails partway', async () => {
    const { db, mediaDir, notes, preview, importFile, allStars } = await as('admin', { demo: true });
    allStars('Here already');
    const before = readdirSync(mediaDir);
    const zip = fileOf([team(), note({ name: 'boom', text: '' })]);
    const { body } = await preview(zip);
    const res = await importFile(zip, choose(body!.file, { action: 'add' }, { action: 'add' }));
    expect(res.statusCode).toBe(500);
    expect(listTeams(db).map((t) => t.name)).toEqual(['Here already']);
    expect(notes.notes).toEqual([]);
    expect(readdirSync(mediaDir).toSorted()).toEqual(before.toSorted());
  });

  it('refuses choices made for another file, or that no longer fit what’s here', async () => {
    const { db, preview, importFile, allStars } = await as();
    const doomed = allStars('B Team');
    const zip = fileOf([team(), team({ ...TEAM, name: 'B Team' })]);
    const { body } = await preview(zip);
    const changed = {
      error: 'changed_since_preview',
      message: 'Something changed since you checked this file. Check it again.',
    };
    const otherFile = await importFile(zip, choose('0'.repeat(64), { action: 'add' }, { action: 'skip' }));
    expect([otherFile.statusCode, otherFile.json()]).toEqual([409, changed]);
    allStars();
    expect((await importFile(zip, choose(body!.file, { action: 'add' }, { action: 'skip' }))).json()).toEqual(changed);
    deleteTeam(db, doomed);
    expect(
      (await importFile(zip, choose(body!.file, { action: 'skip' }, { action: 'replace', target: doomed }))).json(),
    ).toEqual(changed);
    expect((await importFile(zip, choose(body!.file, { action: 'skip' }))).json()).toEqual({
      error: 'bad_choices',
      message: 'Choose what happens to each item of the file',
    });
  });

  it('refuses to import an item that can’t be imported', async () => {
    const { preview, importFile } = await as();
    const zip = fileOf([{ kind: 'core:screen', version: 1, data: {} }]);
    const { body } = await preview(zip);
    expect((await importFile(zip, choose(body!.file, { action: 'add' }))).json()).toEqual({
      error: 'bad_choices',
      message: "Item 1 can't be imported",
    });
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/contract/src/transfer.test.ts rcl-core/server/src/apps.test.ts rcl-core/server/src/routes/transfer.test.ts`
Expected: FAIL, 19 of 37 tests in 3 files.
- Contract: both `ExportQuerySchema` tests, with `Cannot read properties of undefined (reading 'parse')` and `(reading 'safeParse')`.
- `apps.test.ts`: "apps' export kinds…", with `Cannot read properties of undefined (reading 'keys')`.
- All 16 in `routes/transfer.test.ts`: the routes don't exist yet, so they answer `404 not_found`.

- [ ] **Step 3: The export query.**

In `rcl-core/contract/src/transfer.ts`:

Replace:

```ts
}

/** One fact about an item, shown when it conflicts with one here, such as "Skaters: 14". */
```
with:

```ts
}

/** What to export: chosen items, or everything of some kinds. */
export type ExportSelection = { items: { kind: string; id: string }[] } | { kinds: string[] };

// A comma-separated list, without empty entries.
const commaList = (text: string) => text.split(',').filter((part) => part !== '');

/**
 * `GET /transfer/export`'s query string: `items=core:team:<id>,producer:theme:<id>` for chosen items, or
 * `kinds=core:team,producer:theme` for everything of those kinds.
 */
export const ExportQuerySchema = z
  .strictObject({ items: z.string().optional(), kinds: z.string().optional() })
  .transform(({ items, kinds }, context): ExportSelection => {
    if (items !== undefined && kinds === undefined) {
      const picked = commaList(items).map((item) => /^([a-z][a-z0-9-]*:[a-z][a-z0-9-]*):(.+)$/.exec(item));
      if (picked.length > 0 && picked.every((match): match is RegExpExecArray => match !== null)) {
        return { items: picked.map(([, kind = '', id = '']) => ({ kind, id })) };
      }
    }
    if (kinds !== undefined && items === undefined) return { kinds: commaList(kinds) };
    context.addIssue({ code: 'custom', message: 'Choose items, as kind:id, or kinds to export' });
    return z.NEVER;
  });
export type ExportQuery = z.input<typeof ExportQuerySchema>;

/** One fact about an item, shown when it conflicts with one here, such as "Skaters: 14". */
```


- [ ] **Step 4: Every app's kinds.**

In `rcl-core/server/src/apps.ts`:

Replace:

```ts
import type { AppContext, AppModule } from '@rollcall/app-sdk';
```
with:

```ts
import type { AppContext, AppModule, TransferKind } from '@rollcall/app-sdk';
```


Replace:

```ts
  contextFor(module: AppModule): AppContext;
```
with:

```ts
  contextFor(module: AppModule): AppContext;
  /** Every hosted app's kinds of item for export files, by name (ADR-0024). */
  kinds: ReadonlyMap<string, TransferKind>;
```


Replace:

```ts
  });
```
with:

```ts
  });
  const contextFor = (module: AppModule) => {
    const ctx = contexts.get(module.id) ?? newContext(module);
    contexts.set(module.id, ctx);
    return ctx;
  };
  // Each app's kinds, each named after its app, as its permissions are.
  const kinds = new Map<string, TransferKind>();
  for (const module of modules) {
    for (const kind of module.transfer?.(contextFor(module)) ?? []) {
      const problem = !kind.name.startsWith(`${module.id}:`)
        ? `it must be named ${module.id}:<thing>`
        : kinds.has(kind.name)
          ? 'another kind has that name'
          : null;
      if (problem) log.error({ app: module.id }, `Skipping export kind "${kind.name}": ${problem}`);
      else kinds.set(kind.name, kind);
    }
  }
```


Replace:

```ts
    contextFor: (module) => {
      const ctx = contexts.get(module.id) ?? newContext(module);
      contexts.set(module.id, ctx);
      return ctx;
    },
```
with:

```ts
    contextFor,
    kinds,
```


- [ ] **Step 5: Building an export file.**

Create `rcl-core/server/src/transfer/export.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportSelection, type ManifestItem } from '@rollcall/core-contract';
import type { AppModule, ExportedItem, TransferKind } from '@rollcall/app-sdk';
import type { Queryable } from '../db.ts';
import { media } from '../db/schema.ts';
import { mediaPathFor, packExport, TransferError } from './zip.ts';

// Building an export file (docs/features/import-export.md, ADR-0024): the chosen items, each from the kind that owns
// it, then the items they need, such as a theme's fonts, with every media file they use.

export interface ExportFile {
  bytes: Uint8Array;
  /** Such as rollcall-team-all-stars-2026-10-26.zip. */
  fileName: string;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '') || 'item';

/** An export file of `selection` and what it needs. `mayExport` says whether the caller may export a kind. */
export function buildExport({
  db,
  mediaDir,
  modules,
  kinds,
  selection,
  mayExport,
}: {
  db: Queryable;
  mediaDir: string;
  modules: readonly AppModule[];
  kinds: ReadonlyMap<string, TransferKind>;
  selection: ExportSelection;
  mayExport: (kind: TransferKind) => boolean;
}): ExportFile {
  const kindNamed = (name: string) => {
    const kind = kinds.get(name);
    if (!kind) throw new TransferError(404, 'not_found', `Nothing here is a ${name}`);
    if (!mayExport(kind)) throw new TransferError(403, 'forbidden', `Your account can't export ${kind.label.many}`);
    if (kind.onlyAsNeed) {
      const things = `${kind.label.many.charAt(0).toUpperCase()}${kind.label.many.slice(1)}`;
      throw new TransferError(400, 'bad_selection', `${things} travel only with what uses them`);
    }
    return kind;
  };
  const wanted =
    'items' in selection
      ? selection.items.map(({ kind, id }) => ({ kind: kindNamed(kind), id }))
      : selection.kinds.flatMap((name) => {
          const kind = kindNamed(name);
          return kind.list().map(({ id }) => ({ kind, id }));
        });
  if (wanted.length === 0) throw new TransferError(400, 'nothing_to_export', 'There’s nothing to export');

  // Each media file, under its path in the file, read once.
  const files = new Map<string, Uint8Array>();
  const paths = new Map<string, string>();
  const mediaPath = (mediaId: string) => {
    const known = paths.get(mediaId);
    if (known) return known;
    const row = db.select().from(media).where(eq(media.id, mediaId)).get();
    if (!row) throw new Error(`Media ${mediaId} has no row`);
    const bytes = readFileSync(join(mediaDir, mediaId));
    const path = mediaPathFor(bytes, row.contentType);
    files.set(path, bytes);
    paths.set(mediaId, path);
    return path;
  };

  const items: ManifestItem[] = [];
  const add = (kind: TransferKind, item: ExportedItem) =>
    items.push({ kind: kind.name, version: kind.version, data: item.data });
  const needsSent = new Set<string>();
  const names: string[] = [];
  for (const { kind, id } of wanted) {
    const item = kind.exportItem(id, mediaPath);
    if (!item) throw new TransferError(404, 'not_found', `There's no such ${kind.label.one.toLowerCase()}`);
    add(kind, item);
    names.push(item.name);
    for (const need of item.needs ?? []) {
      const key = `${need.kind}|${need.key.toLowerCase()}`;
      const needKind = kinds.get(need.kind);
      if (needsSent.has(key) || !needKind?.exportNeed) continue;
      if (!mayExport(needKind)) {
        throw new TransferError(403, 'forbidden', `Your account can't export ${needKind.label.many}`);
      }
      needsSent.add(key);
      for (const needed of needKind.exportNeed(need.key, mediaPath)) add(needKind, needed);
    }
  }

  const manifest = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    apps: Object.fromEntries(modules.map((module) => [module.id, module.version])),
    items,
  } as const;
  const today = manifest.exportedAt.slice(0, 10);
  const [first] = wanted;
  const what =
    wanted.length === 1 && first
      ? `${slug(first.kind.label.one)}-${slug(names[0] ?? '')}`
      : wanted.every(({ kind }) => kind === first?.kind) && first
        ? slug(first.kind.label.many)
        : 'export';
  return { bytes: packExport(manifest, files), fileName: `rollcall-${what}-${today}.zip` };
}
```

- [ ] **Step 6: Planning and applying an import.**

Create `rcl-core/server/src/transfer/import.ts`:

```ts
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPORT_FORMAT_VERSION,
  ManifestHeadSchema,
  ManifestSchema,
  MAX_IMAGE_BYTES,
  type ConflictTarget,
  type ImportPreview,
  type ImportResult,
  type PreviewItem,
  type TransferFact,
} from '@rollcall/core-contract';
import type { TransferKind, TransferMediaType, TransferSave } from '@rollcall/app-sdk';
import type { z } from 'zod';
import type { ImportChoicesSchema } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import { fontTypeOf, imageTypeOf, removeMedia, saveMedia } from '../media.ts';
import { NOT_AN_EXPORT, readExport, sha256, TransferError } from './zip.ts';

// Importing an export file (docs/features/import-export.md, ADR-0024), in two steps that each read the whole file: a
// preview that checks everything and saves nothing, then the import, which checks again and saves the chosen items in
// one transaction, or nothing.

type Choices = z.output<typeof ImportChoicesSchema>;

/** One item of a file, checked and matched with what's here. */
export interface PlannedItem {
  index: number;
  kindName: string;
  kind: TransferKind | undefined;
  label: string;
  name: string;
  /** Its data, migrated to its kind's current version and checked by it. */
  data: unknown;
  facts: readonly TransferFact[];
  status: PreviewItem['status'];
  reason: string | null;
  targets: readonly ConflictTarget[];
  needs: number[];
  canBeDefault: boolean;
  wasDefault: boolean;
  /** Each media file it uses, by path, with the type it must be. */
  media: ReadonlyMap<string, TransferMediaType>;
}

export interface ImportPlan {
  /** The file's SHA-256, which the import's choices must name. */
  file: string;
  items: PlannedItem[];
  media: ReadonlyMap<string, Uint8Array>;
}

const NEWER = 'This file was made by a newer Rollcall. Update Rollcall to import it.';
const CHANGED = 'Something changed since you checked this file. Check it again.';
const TYPE_CHECKS = { image: imageTypeOf, font: fontTypeOf } as const;
const TYPE_WORDS = { image: "isn't a PNG, JPEG or WebP image", font: "isn't a WOFF2, WOFF, TTF or OTF font" } as const;

// A kind this server doesn't store, for people: core:screen → "Screens".
const thingsOf = (kindName: string) => {
  const thing = (kindName.split(':')[1] ?? kindName).replaceAll('-', ' ');
  return `${thing.charAt(0).toUpperCase()}${thing.slice(1)}s`;
};
// An item's name before its kind has checked it, for messages.
const rawName = (data: unknown) =>
  typeof data === 'object' && data !== null && 'name' in data && typeof data.name === 'string' ? data.name : '';

/** Reads and checks an export file, and matches its items with what's here. Throws a TransferError if it can't. */
export function planImport({
  zip,
  kinds,
  mayImport,
}: {
  zip: Uint8Array;
  kinds: ReadonlyMap<string, TransferKind>;
  mayImport: (kind: TransferKind) => boolean;
}): ImportPlan {
  const { manifest, media } = readExport(zip);
  const head = ManifestHeadSchema.safeParse(manifest);
  if (!head.success) throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);
  if (head.data.formatVersion > EXPORT_FORMAT_VERSION) throw new TransferError(400, 'newer_format', NEWER);
  const parsed = ManifestSchema.safeParse(manifest);
  if (!parsed.success) throw new TransferError(400, 'bad_file', NOT_AN_EXPORT);

  const items = parsed.data.items.map((item, index): PlannedItem => {
    const kind = kinds.get(item.kind);
    const name = rawName(item.data);
    const cant = (reason: string, label = kind?.label.one ?? thingsOf(item.kind).slice(0, -1)): PlannedItem => ({
      index,
      kindName: item.kind,
      kind,
      label,
      name,
      data: item.data,
      facts: [],
      status: 'cant',
      reason,
      targets: [],
      needs: [],
      canBeDefault: false,
      wasDefault: false,
      media: new Map(),
    });
    if (!kind) return cant(`${thingsOf(item.kind)} aren't known here yet`);
    if (item.version > kind.version) return cant(NEWER);
    if (!mayImport(kind)) return cant(`Your account can't import ${kind.label.many}`);

    let data = item.data;
    for (let version = item.version; version < kind.version; version += 1) {
      const migrate = kind.migrations?.[version];
      if (!migrate) throw new Error(`${kind.name} has no migration from version ${version}`);
      data = migrate(data);
    }
    const where = (named: string) => `Item ${index + 1} (${kind.label.one.toLowerCase()} “${named || '?'}”)`;
    const checked = kind.check(data);
    if (!checked.ok) throw new TransferError(400, 'invalid_item', `${where(name)}: ${checked.message}`);
    const used = new Map<string, TransferMediaType>();
    for (const file of kind.media(checked.data)) {
      const bytes = media.get(file.path);
      const problem = !bytes
        ? 'is missing from the file'
        : bytes.length > MAX_IMAGE_BYTES
          ? 'is over 5 MB'
          : TYPE_CHECKS[file.type](bytes)
            ? undefined
            : TYPE_WORDS[file.type];
      if (problem)
        throw new TransferError(400, 'bad_media', `${where(kind.nameOf(checked.data))}: ${file.what} ${problem}`);
      used.set(file.path, file.type);
    }
    const match = kind.match(checked.data);
    return {
      index,
      kindName: item.kind,
      kind,
      label: kind.label.one,
      name: kind.nameOf(checked.data),
      data: checked.data,
      facts: kind.facts(checked.data),
      status: match.status,
      reason: match.status === 'reused' || match.status === 'cant' ? match.reason : null,
      targets: match.status === 'conflict' ? match.targets : [],
      needs: [],
      canBeDefault: match.status !== 'cant' && kind.canBeDefault === true,
      wasDefault: kind.wasDefault?.(checked.data) ?? false,
      media: used,
    };
  });

  // Which items of the file each needs, such as a theme's fonts.
  for (const item of items) {
    if (item.status === 'cant' || !item.kind?.needs) continue;
    for (const need of item.kind.needs(item.data)) {
      for (const other of items) {
        const key = other.status === 'cant' ? undefined : other.kind?.needKey?.(other.data);
        if (other.kindName === need.kind && key?.toLowerCase() === need.key.toLowerCase()) item.needs.push(other.index);
      }
    }
  }
  return { file: sha256(zip), items, media };
}

/** What the preview replies. */
export const previewOf = (plan: ImportPlan): ImportPreview => ({
  file: plan.file,
  items: plan.items.map((item) => ({
    index: item.index,
    kind: item.kindName,
    label: item.label,
    name: item.name,
    facts: [...item.facts],
    status: item.status,
    reason: item.reason,
    conflicts: [...item.targets],
    needs: item.needs,
    canBeDefault: item.canBeDefault,
    wasDefault: item.wasDefault,
  })),
});

// How each item is saved, or null to skip it, from the choices. Choices that no longer fit what's here are refused as
// changed since the preview; choices that never fit the file are refused as bad choices.
function decide(plan: ImportPlan, choices: Choices): (TransferSave | null)[] {
  if (choices.file !== plan.file) throw new TransferError(409, 'changed_since_preview', CHANGED);
  if (choices.items.length !== plan.items.length) {
    throw new TransferError(400, 'bad_choices', 'Choose what happens to each item of the file');
  }
  return plan.items.map((item, index) => {
    const choice = choices.items[index] ?? { action: 'skip' };
    if (choice.action === 'skip' || item.status === 'reused') return null;
    if (item.status === 'cant') throw new TransferError(400, 'bad_choices', `Item ${index + 1} can't be imported`);
    if (choice.action === 'keep-both') return { as: 'copy' };
    if (choice.action === 'add') {
      if (item.status === 'conflict') throw new TransferError(409, 'changed_since_preview', CHANGED);
      return { as: 'new' };
    }
    if (!item.targets.some((target) => target.id === choice.target)) {
      throw new TransferError(409, 'changed_since_preview', CHANGED);
    }
    return { as: 'replace', id: choice.target };
  });
}

// The order to save in: each item after the items it needs.
function saveOrder(plan: ImportPlan): PlannedItem[] {
  const ordered: PlannedItem[] = [];
  const visit = (item: PlannedItem, path: Set<number>) => {
    if (ordered.includes(item) || path.has(item.index)) return;
    path.add(item.index);
    for (const need of item.needs) {
      const needed = plan.items[need];
      if (needed) visit(needed, path);
    }
    ordered.push(item);
  };
  for (const item of plan.items) visit(item, new Set());
  return ordered;
}

/** Saves the chosen items of a planned file in one transaction, or nothing, and says what it did. */
export function applyImport({
  db,
  mediaDir,
  plan,
  choices,
}: {
  db: AppDatabase;
  mediaDir: string;
  plan: ImportPlan;
  choices: Choices;
}): ImportResult {
  const how = decide(plan, choices);
  if (choices.default !== null) {
    const chosen = plan.items[choices.default];
    if (!chosen?.canBeDefault || !how[choices.default]) {
      throw new TransferError(400, 'bad_choices', 'Only a theme being imported can be made the default');
    }
  }
  const result: ImportResult = { added: 0, replaced: 0, keptBoth: 0, skipped: 0, copies: [] };
  const saved = new Map<string, string>();
  const unused: (string | null)[] = [];
  const kindsSaved = new Set<TransferKind>();
  try {
    db.$client.transaction(() => {
      for (const item of saveOrder(plan)) {
        const save = how[item.index];
        if (!save || !item.kind) {
          result.skipped += 1;
          continue;
        }
        const mediaId = (path: string) => {
          const known = saved.get(path);
          const bytes = plan.media.get(path);
          const type = item.media.get(path);
          if (known) return known;
          const id = bytes && type ? saveMedia(db, mediaDir, bytes, TYPE_CHECKS[type]) : null;
          if (!id) throw new Error(`Media ${path} wasn't checked`);
          saved.set(path, id);
          return id;
        };
        const done = item.kind.save(item.data, save, mediaId, { makeDefault: choices.default === item.index });
        unused.push(...(done.unusedMedia ?? []));
        kindsSaved.add(item.kind);
        if (save.as === 'new') result.added += 1;
        else if (save.as === 'replace') result.replaced += 1;
        else {
          result.keptBoth += 1;
          result.copies.push(done.name);
        }
      }
    })();
  } catch (error) {
    // The rows rolled back; the files saved for them go too.
    for (const id of saved.values()) rmSync(join(mediaDir, id), { force: true });
    throw error;
  }
  removeMedia(db, mediaDir, unused);
  for (const kind of kindsSaved) kind.afterImport?.();
  return result;
}
```

- [ ] **Step 7: The routes.**

Create `rcl-core/server/src/routes/transfer.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TransferKind } from '@rollcall/app-sdk';
import {
  ExportQuerySchema,
  ImportPreviewSchema,
  ImportQuerySchema,
  ImportResultSchema,
  MAX_EXPORT_BYTES,
} from '@rollcall/core-contract';
import type { Access } from '../auth/access.ts';
import { deny } from '../auth/access.ts';
import type { AppDatabase } from '../db.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { buildExport } from '../transfer/export.ts';
import { applyImport, planImport, previewOf } from '../transfer/import.ts';
import { TransferError } from '../transfer/zip.ts';
import { registerUploads } from './uploads.ts';

const SIGNED_IN: { config: { access: Access } } = { config: { access: { signedIn: true } } };
const TAGS = ['core/transfer'];
/** Browsers label a .zip either way. */
const ZIP_TYPES = ['application/zip', 'application/x-zip-compressed'] as const;
const TOO_LARGE = { error: 'too_large', message: 'That file is too big to import: the limit is 200 MB' };
const UNSUPPORTED = { error: 'unsupported_file', message: 'Send a Rollcall export file (.zip)' };

// Whether the caller holds a kind's permission for exporting or importing, by the same check routes use (hard rule 5).
const holds = (request: FastifyRequest, permission: TransferKind['exportPermission']) =>
  deny({ permission }, request.principal, request.server.hostedApps.permissions) === undefined;

// A TransferError as its reply; anything else goes on to the error handler.
function refuse(error: unknown, reply: FastifyReply) {
  if (error instanceof TransferError)
    return reply.code(error.status).send({ error: error.code, message: error.message });
  throw error;
}

// The request's file, planned for import, or a refusal: a body that isn't a file is refused as unsupported.
function plan(request: FastifyRequest) {
  if (!Buffer.isBuffer(request.body)) throw new TransferError(415, UNSUPPORTED.error, UNSUPPORTED.message);
  const { kinds } = request.server.hostedApps;
  return planImport({ zip: request.body, kinds, mayImport: (kind) => holds(request, kind.importPermission) });
}

// Import and export (docs/features/import-export.md, ADR-0024), for signed-in people: each item's kind is checked
// against the permission that kind names, since one file can hold several kinds.
export function registerTransferRoutes(
  fastify: FastifyInstance,
  { db, mediaDir }: { db: AppDatabase; mediaDir: string },
) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/transfer/export',
    {
      ...SIGNED_IN,
      schema: {
        tags: TAGS,
        summary: 'Export chosen items, or everything of some kinds, as a Rollcall export file (.zip)',
        querystring: ExportQuerySchema,
        produces: ['application/zip'],
        response: { 200: z.unknown().describe('The export file, a .zip'), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      try {
        const { modules, kinds } = request.server.hostedApps;
        const file = buildExport({
          db,
          mediaDir,
          modules,
          kinds,
          selection: request.query,
          mayExport: (kind) => holds(request, kind.exportPermission),
        });
        return await reply
          .type('application/zip')
          .header('content-disposition', `attachment; filename="${file.fileName}"`)
          .send(Buffer.from(file.bytes));
      } catch (error) {
        return refuse(error, reply);
      }
    },
  );

  registerUploads(
    fastify,
    { types: ZIP_TYPES, maxBytes: MAX_EXPORT_BYTES, tooLarge: TOO_LARGE, unsupported: UNSUPPORTED },
    (uploads) => {
      const api = uploads.withTypeProvider<ZodTypeProvider>();
      api.post(
        '/transfer/import/preview',
        {
          ...SIGNED_IN,
          bodyLimit: MAX_EXPORT_BYTES,
          schema: {
            tags: TAGS,
            summary: "Check a Rollcall export file and say what's in it, saving nothing: the body is the .zip",
            consumes: [...ZIP_TYPES],
            response: { 200: ImportPreviewSchema, ...ERROR_RESPONSES },
          },
        },
        async (request, reply) => {
          try {
            return previewOf(plan(request));
          } catch (error) {
            return refuse(error, reply);
          }
        },
      );

      api.post(
        '/transfer/import',
        {
          ...SIGNED_IN,
          bodyLimit: MAX_EXPORT_BYTES,
          schema: {
            tags: TAGS,
            summary: 'Import a Rollcall export file as its preview’s choices say, all or nothing: the body is the .zip',
            consumes: [...ZIP_TYPES],
            querystring: ImportQuerySchema,
            response: { 200: ImportResultSchema, ...ERROR_RESPONSES },
          },
        },
        async (request, reply) => {
          try {
            return applyImport({ db, mediaDir, plan: plan(request), choices: request.query.choices });
          } catch (error) {
            return refuse(error, reply);
          }
        },
      );
    },
  );
}
```

In `rcl-core/server/src/core-app.ts`:

Replace:

```ts
import { registerTeamRoutes } from './routes/teams.ts';
```
with:

```ts
import { registerTeamRoutes } from './routes/teams.ts';
import { registerTransferRoutes } from './routes/transfer.ts';
```


Replace:

```ts
      registerFontRoutes(fastify, { db, mediaDir });
```
with:

```ts
      registerFontRoutes(fastify, { db, mediaDir });
      registerTransferRoutes(fastify, { db, mediaDir });
```


In `rcl-core/server/src/openapi.ts`:

Replace:

```ts
        { name: 'core/fonts', description: 'The font library: bundled and uploaded fonts' },
```
with:

```ts
        { name: 'core/fonts', description: 'The font library: bundled and uploaded fonts' },
        {
          name: 'core/transfer',
          description: 'Import and export: Rollcall export files of teams, themes and their media',
        },
```


In `.claude/rules/rcl-core-server.md`:

Replace:

```markdown
  - Core's kinds are `teamKind` (`src/teams/transfer.ts`) and `fontFaceKind` (`src/fonts/transfer.ts`), listed by `coreApp`'s `transfer`. A kind's `save` is synchronous and returns media it no longer uses, which core removes after the commit.
```
with:

```markdown
  - Core's kinds are `teamKind` (`src/teams/transfer.ts`) and `fontFaceKind` (`src/fonts/transfer.ts`), listed by `coreApp`'s `transfer`. A kind's `save` is synchronous and returns media it no longer uses, which core removes after the commit.
  - `hostApps` gathers every app's kinds (`hostedApps.kinds`). `src/routes/transfer.ts` exports (`buildExport`, `src/transfer/export.ts`) and imports in two steps (`planImport` and `applyImport`, `src/transfer/import.ts`): the routes are for signed-in people, and each item's kind is checked against its own permission with `deny`.
```


- [ ] **Step 8: Run them and see them pass.**

Run: the command from Step 2.
Expected: PASS, 37 tests. `yarn test` passes 533.

- [ ] **Step 9: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core .claude/rules
git commit -F - <<'EOF'
feat(rcl-core): export, preview and import routes

GET /api/core/transfer/export downloads chosen items, or whole kinds,
with the items they need and their media. POST /transfer/import/preview
checks a file and says what each item is and what would happen to it,
saving nothing. POST /transfer/import saves the chosen items in one
transaction, or nothing, then removes media that replaced items no
longer use. Each item's kind is checked against its own permission.

Refs #22

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Themes in export files

**Files:**
- Create: `rcl-producer/server/src/themes/transfer.ts`
- Modify: `rcl-producer/contract/src/themes.ts`, `rcl-producer/server/src/themes/themes.ts`, `rcl-producer/server/src/index.ts`, `.claude/rules/rcl-producer-contract.md`, `.claude/rules/rcl-producer-server.md`
- Test: `rcl-producer/contract/src/themes.test.ts`, and `rcl-producer/server/src/themes/transfer.test.ts` and `rcl-core/server/src/routes/transfer-themes.test.ts` (new)

**Interfaces:**
- Consumes:
  - from Tasks 1–4: `TransferKind`, `TransferFact`, `copyName`, and the routes;
  - from the Producer app: `ThemeNameSchema`, `ThemeTokensSchema`, `createTheme`, `findTheme`, `listThemes`, `setDefaultTheme`, `updateTheme` and `announceDefaultTheme`.
- Produces:
  - `ThemeItemSchema` and `ThemeItem` (`{ name, tokens, default }`), where `default` is false when left out;
  - `freeCopyName(db, name): string` (`themes/themes.ts`), which duplicating a theme now uses too;
  - `themeKind({ db, announce })` (`producer:theme`, `canBeDefault`), listed by the Producer app's `transfer`.

- [ ] **Step 1: Write the failing tests.**

In `rcl-producer/contract/src/themes.test.ts`:

Replace:

```ts
  SetDefaultThemeRequestSchema,
```
with:

```ts
  SetDefaultThemeRequestSchema,
  ThemeItemSchema,
```


Replace:

```ts
    expect(themeToCss(missing, LIBRARY).variables['--theme-font-body']).toBe('"Gone", system-ui, sans-serif');
  });
});
```
with:

```ts
    expect(themeToCss(missing, LIBRARY).variables['--theme-font-body']).toBe('"Gone", system-ui, sans-serif');
  });
});

describe('ThemeItemSchema', () => {
  it('accepts a theme as an export file holds it, its name trimmed, not the default unless it says so', () => {
    expect(ThemeItemSchema.parse({ name: ' Derby Night ', tokens: DEFAULT_TOKENS })).toEqual({
      name: 'Derby Night',
      tokens: DEFAULT_TOKENS,
      default: false,
    });
    expect(ThemeItemSchema.parse({ name: 'Finals', tokens: DEFAULT_TOKENS, default: true }).default).toBe(true);
  });

  it('refuses a blank name, tokens the contract refuses, and anything else', () => {
    expect(ThemeItemSchema.safeParse({ name: '', tokens: DEFAULT_TOKENS }).success).toBe(false);
    const gold = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: 'gold' } };
    expect(ThemeItemSchema.safeParse({ name: 'Gold', tokens: gold }).error?.issues[0]?.message).toBe(
      'Use a color like #1a2b3c',
    );
    expect(ThemeItemSchema.safeParse({ name: 'X', tokens: DEFAULT_TOKENS, id: 't1' }).success).toBe(false);
  });
});
```


Create `rcl-producer/server/src/themes/transfer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOKENS, type ThemeItem, type ThemeTokens } from '@rollcall/producer-contract';
import * as schema from '../db/schema.ts';
import { testProducer } from '../testing.ts';
import { createTheme, findDefaultTheme, findTheme, listThemes, setDefaultTheme } from './themes.ts';
import { themeKind } from './transfer.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
});

const OSWALD: ThemeTokens = {
  ...DEFAULT_TOKENS,
  fonts: { ...DEFAULT_TOKENS.fonts, heading: { family: 'Oswald', weight: 700 } },
};
const ITEM: ThemeItem = { name: 'Derby Night', tokens: OSWALD, default: true };

// Themes have no media, so saving one never asks for a media id.
const noMedia = () => {
  throw new Error('Themes have no media');
};

function setup() {
  const { api, ctx } = testProducer();
  opened.push(api);
  const db = ctx.db(schema);
  const announce = vi.fn<() => void>();
  const kind = themeKind({ db, announce });
  const checked = (data: unknown) => {
    const result = kind.check(data);
    if (!result.ok) throw new Error(result.message);
    return result.data;
  };
  return { db, kind, announce, checked };
}

describe('the producer:theme kind', () => {
  it('exports a theme’s name, tokens and whether it’s the default, needing its font families once each', () => {
    const { db, kind } = setup();
    const theme = createTheme(db, { name: 'Derby Night', tokens: OSWALD });
    setDefaultTheme(db, theme.id);
    expect(kind.exportItem(theme.id, () => '')).toEqual({
      name: 'Derby Night',
      data: { name: 'Derby Night', tokens: OSWALD, default: true },
      needs: [
        { kind: 'core:font-face', key: 'Oswald' },
        { kind: 'core:font-face', key: 'Inter' },
      ],
    });
    const plain = createTheme(db, { name: 'Plain' });
    expect(kind.exportItem(plain.id, () => '')?.needs).toEqual([{ kind: 'core:font-face', key: 'Inter' }]);
    expect(kind.list().map((t) => t.name)).toEqual(['Derby Night', 'Plain']);
    expect(kind.exportItem('nope', () => '')).toBeUndefined();
  });

  it('checks a theme as the contract does, and gives its facts, needs and default hint', () => {
    const { kind, checked } = setup();
    const data = checked(ITEM);
    expect(kind.facts(data)).toEqual([
      { label: 'Surface', value: DEFAULT_TOKENS.colors.surface },
      { label: 'Accent', value: DEFAULT_TOKENS.colors.accent },
      { label: 'Fonts', value: 'Oswald / Inter' },
    ]);
    expect(kind.wasDefault?.(data)).toBe(true);
    expect(kind.media(data)).toEqual([]);
    expect(kind.check({ ...ITEM, name: '' })).toEqual({ ok: false, message: 'Give the theme a name' });
  });

  it('conflicts only with a theme of exactly the same name, saying whether that one is the default', () => {
    const { db, kind, checked } = setup();
    expect(kind.match(checked(ITEM))).toEqual({ status: 'new' });
    const here = createTheme(db, { name: 'Derby Night' });
    setDefaultTheme(db, here.id);
    createTheme(db, { name: 'derby night' });
    expect(kind.match(checked(ITEM))).toEqual({
      status: 'conflict',
      targets: [
        {
          id: here.id,
          name: 'Derby Night',
          facts: expect.arrayContaining([{ label: 'Default', value: 'yes' }]),
          updatedAt: expect.any(String),
        },
      ],
    });
  });

  it('adds a theme, or a copy, never making it the default unless told to', () => {
    const { db, kind, checked, announce } = setup();
    expect(kind.save(checked(ITEM), { as: 'new' }, noMedia, { makeDefault: false })).toEqual({ name: 'Derby Night' });
    expect(kind.save(checked(ITEM), { as: 'copy' }, noMedia, { makeDefault: false })).toEqual({
      name: 'Derby Night copy',
    });
    expect(listThemes(db).map((t) => [t.name, t.tokens, t.isDefault])).toEqual([
      ['Derby Night', OSWALD, false],
      ['Derby Night copy', OSWALD, false],
    ]);
    kind.afterImport?.();
    expect(announce).not.toHaveBeenCalled();
  });

  it('makes the chosen theme the default, switching the old one off, and tells the overlay after the import', () => {
    const { db, kind, checked, announce } = setup();
    const old = createTheme(db, { name: 'Old' });
    setDefaultTheme(db, old.id);
    kind.save(checked(ITEM), { as: 'new' }, noMedia, { makeDefault: true });
    expect(announce).not.toHaveBeenCalled();
    kind.afterImport?.();
    expect(announce).toHaveBeenCalledOnce();
    expect(findDefaultTheme(db)?.name).toBe('Derby Night');
    expect(findTheme(db, old.id)?.isDefault).toBe(false);
  });

  it('replaces a theme’s tokens, keeping its id, name and default, and tells the overlay when it is the default', () => {
    const { db, kind, checked, announce } = setup();
    const here = createTheme(db, { name: 'Derby Night' });
    setDefaultTheme(db, here.id);
    const saved = kind.save(checked({ ...ITEM, default: false }), { as: 'replace', id: here.id }, noMedia, {
      makeDefault: false,
    });
    expect(saved).toEqual({ name: 'Derby Night' });
    expect(findTheme(db, here.id)).toMatchObject({ id: here.id, tokens: OSWALD, isDefault: true });
    kind.afterImport?.();
    expect(announce).toHaveBeenCalledOnce();
  });
});
```

Core's route test hosts the installed apps, as the server does. Core's server may not import the Producer app's contract, so a theme there is just the fields the test reads:

Create `rcl-core/server/src/routes/transfer-themes.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { FontFamilySchema, ImportPreviewSchema, ManifestSchema, type Role } from '@rollcall/core-contract';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { INSTALLED_APPS } from '../installed-apps.ts';
import { addUser, CORE_VERSION, FONTS, testApp } from '../testing.ts';

// Themes travel in export files through the Producer app's kind, which core hosts like any other (ADR-0024). Core's
// server doesn't depend on the Producer app's contract, so a theme here is just the fields these tests read.
interface Theme {
  id: string;
  name: string;
  isDefault: boolean;
  tokens: { fonts: { heading: { family: string; weight: number } } & Record<string, unknown> } & Record<
    string,
    unknown
  >;
}

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// The installed apps, with ways to call routes as an Admin or a Producer.
async function installed() {
  const { app, db } = testApp({ version: CORE_VERSION, apps: INSTALLED_APPS });
  opened.push(app);
  const cookiesOf = async (role: Role) => {
    const user = await addUser(db, `${role}1`, 'correct horse', role);
    return { [SESSION_COOKIE]: createSession(db, user.id).token };
  };
  const admin = await cookiesOf('admin');
  const producer = await cookiesOf('producer');
  const call = (
    cookies: Record<string, string>,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) => app.inject({ method, url, cookies, ...(payload ? { payload } : {}) });
  // A file as the body, as uploads and the Import dialog send them.
  const send = (cookies: Record<string, string>, url: string, body: Uint8Array, type = 'application/zip') =>
    app.inject({ method: 'POST', url, cookies, headers: { 'content-type': type }, payload: Buffer.from(body) });
  return { admin, producer, call, send };
}

describe('themes in export files', () => {
  it('travel with their uploaded fonts, are imported by Admins only, and become the default only when chosen', async () => {
    const { admin, producer, call, send } = await installed();
    await send(admin, '/api/core/fonts/faces?family=Rollerball&weight=700', FONTS.woff2, 'font/woff2');
    const theme = (await call(admin, 'POST', '/api/producer/themes', { name: 'Derby Night' })).json<Theme>();
    const tokens = {
      ...theme.tokens,
      fonts: { ...theme.tokens.fonts, heading: { family: 'Rollerball', weight: 700 } },
    };
    await call(admin, 'PATCH', `/api/producer/themes/${theme.id}`, { tokens });
    await call(admin, 'PUT', '/api/producer/default-theme', { themeId: theme.id });

    // A Producer may export themes, their fonts included.
    const exported = await call(producer, 'GET', `/api/core/transfer/export?items=producer:theme:${theme.id}`);
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toMatch(/filename="rollcall-theme-derby-night-/);
    const files = unzipSync(exported.rawPayload);
    const manifest = ManifestSchema.parse(JSON.parse(strFromU8(files['rollcall-export.json']!)));
    expect(manifest.items.map((item) => item.kind)).toEqual(['producer:theme', 'core:font-face']);
    expect(Object.keys(files).filter((name) => name.endsWith('.woff2'))).toHaveLength(1);
    const zip = exported.rawPayload;

    // Only an Admin may import them.
    const asProducer = ImportPreviewSchema.parse(
      (await send(producer, '/api/core/transfer/import/preview', zip)).json(),
    );
    expect(asProducer.items.map((item) => [item.label, item.status, item.reason])).toEqual([
      ['Theme', 'cant', "Your account can't import themes"],
      ['Font', 'cant', "Your account can't import fonts"],
    ]);

    // Gone, then back, with no default until one is chosen.
    await call(admin, 'DELETE', `/api/producer/themes/${theme.id}`);
    const before = FontFamilySchema.array().parse((await call(admin, 'GET', '/api/core/fonts')).json());
    const face = before.find((family) => family.name === 'Rollerball')?.faces[0];
    await call(admin, 'DELETE', `/api/core/fonts/faces/${face?.id}`);
    const preview = ImportPreviewSchema.parse((await send(admin, '/api/core/transfer/import/preview', zip)).json());
    expect(
      preview.items.map((item) => [item.name, item.status, item.needs, item.wasDefault, item.canBeDefault]),
    ).toEqual([
      ['Derby Night', 'new', [1], true, true],
      ['Rollerball 700', 'new', [], false, false],
    ]);
    const choices = { file: preview.file, items: [{ action: 'add' }, { action: 'add' }] };
    const imported = await send(
      admin,
      `/api/core/transfer/import?choices=${encodeURIComponent(JSON.stringify(choices))}`,
      zip,
    );
    expect(imported.json()).toEqual({ added: 2, replaced: 0, keptBoth: 0, skipped: 0, copies: [] });
    const themes = (await call(admin, 'GET', '/api/producer/themes')).json<Theme[]>();
    expect(themes.map((t) => [t.name, t.tokens.fonts.heading.family, t.isDefault])).toEqual([
      ['Derby Night', 'Rollerball', false],
    ]);
    const after = FontFamilySchema.array().parse((await call(admin, 'GET', '/api/core/fonts')).json());
    expect(after.find((family) => family.name === 'Rollerball')?.faces).toHaveLength(1);

    // Imported again as a copy, made the default.
    const again = ImportPreviewSchema.parse((await send(admin, '/api/core/transfer/import/preview', zip)).json());
    expect(again.items.map((item) => item.status)).toEqual(['conflict', 'reused']);
    const copy = { file: again.file, items: [{ action: 'keep-both' }, { action: 'add' }], default: 0 };
    await send(admin, `/api/core/transfer/import?choices=${encodeURIComponent(JSON.stringify(copy))}`, zip);
    const now = (await call(admin, 'GET', '/api/producer/themes')).json<Theme[]>();
    expect(now.map((t) => [t.name, t.isDefault])).toEqual([
      ['Derby Night', false],
      ['Derby Night copy', true],
    ]);
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-producer/contract/src/themes.test.ts rcl-producer/server/src/themes/transfer.test.ts rcl-core/server/src/routes/transfer-themes.test.ts`
Expected: FAIL, 3 of 22 tests, and one file that doesn't load.
- `themes/transfer.test.ts` doesn't load: `Cannot find module './transfer.ts'`.
- Contract: both `ThemeItemSchema` tests, with `Cannot read properties of undefined (reading 'parse')` and `(reading 'safeParse')`.
- `transfer-themes.test.ts` fails with `expected 404 to be 200`, since no kind is named `producer:theme` yet.

- [ ] **Step 3: The theme item.**

In `rcl-producer/contract/src/themes.ts`:

Replace:

```ts
export type Theme = z.infer<typeof ThemeSchema>;

/** A new theme. Without tokens, it starts from the built-in look. */
```
with:

```ts
export type Theme = z.infer<typeof ThemeSchema>;

/**
 * A theme in a Rollcall export file (ADR-0024), version 1: its name and tokens, and whether it was the default where it
 * was exported, which an import shows only as a hint.
 */
export const ThemeItemSchema = z.strictObject({
  name: ThemeNameSchema,
  tokens: ThemeTokensSchema,
  default: z.boolean().default(false),
});
export type ThemeItem = z.input<typeof ThemeItemSchema>;

/** A new theme. Without tokens, it starts from the built-in look. */
```


- [ ] **Step 4: The kind.**

In `rcl-producer/server/src/themes/themes.ts`:

Replace:

```ts
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
```
with:

```ts
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { copyName } from '@rollcall/core-contract';
```


Delete:

```ts
const MAX_NAME = 64;
```


Replace:

```ts
// "<name> copy", or "<name> copy <n>", with the name shortened so the whole still fits in MAX_NAME characters.
function copyName(name: string, n: number): string {
  const suffix = n === 1 ? ' copy' : ` copy ${n}`;
  return `${name.slice(0, MAX_NAME - suffix.length).trimEnd()}${suffix}`;
```
with:

```ts
/** The first copy name, "<name> copy" or "<name> copy 2" and so on, that no theme has. */
export function freeCopyName(db: ProducerDatabase, name: string): string {
  let n = 1;
  while (themeNameTaken(db, copyName(name, n))) n += 1;
  return copyName(name, n);
```


Replace:

```ts
  let n = 1;
  while (themeNameTaken(db, copyName(theme.name, n))) n += 1;
  return createTheme(db, { name: copyName(theme.name, n), tokens: theme.tokens });
```
with:

```ts
  return createTheme(db, { name: freeCopyName(db, theme.name), tokens: theme.tokens });
```


Create `rcl-producer/server/src/themes/transfer.ts`:

```ts
import { ThemeItemSchema, type ThemeItem, type ThemeTokens } from '@rollcall/producer-contract';
import type { TransferKind } from '@rollcall/app-sdk';
import type { TransferFact } from '@rollcall/core-contract';
import type { z } from 'zod';
import {
  createTheme,
  findTheme,
  freeCopyName,
  listThemes,
  setDefaultTheme,
  updateTheme,
  type ProducerDatabase,
} from './themes.ts';

// Themes in Rollcall export files (docs/features/import-export.md, ADR-0024). A theme brings the uploaded faces of the
// font families it uses; core's font kind sends and saves those.

type ThemeData = z.output<typeof ThemeItemSchema>;

const factsOf = (tokens: ThemeTokens): TransferFact[] => [
  { label: 'Surface', value: tokens.colors.surface },
  { label: 'Accent', value: tokens.colors.accent },
  { label: 'Fonts', value: `${tokens.fonts.heading.family} / ${tokens.fonts.body.family}` },
];

// The font families a theme's heading and body use, each once, as needs of core's font kind.
const fontNeeds = (tokens: ThemeTokens) =>
  [...new Set([tokens.fonts.heading.family, tokens.fonts.body.family])].map((key) => ({
    kind: 'core:font-face' as const,
    key,
  }));

/**
 * The `producer:theme` kind: holders of producer:themes.read export themes, and of producer:themes.manage import them.
 * `announce` tells the OBS overlay about the default theme, after an import that changed it.
 */
export function themeKind({ db, announce }: { db: ProducerDatabase; announce: () => void }): TransferKind<ThemeData> {
  let defaultChanged = false;
  return {
    name: 'producer:theme',
    label: { one: 'Theme', many: 'themes' },
    version: 1,
    exportPermission: 'producer:themes.read',
    importPermission: 'producer:themes.manage',
    canBeDefault: true,

    list: () => listThemes(db).map(({ id, name }) => ({ id, name })),

    exportItem(id) {
      const theme = findTheme(db, id);
      if (!theme) return undefined;
      const data: ThemeItem = { name: theme.name, tokens: theme.tokens, default: theme.isDefault };
      return { name: theme.name, data, needs: fontNeeds(theme.tokens) };
    },

    check(data) {
      const checked = ThemeItemSchema.safeParse(data);
      return checked.success
        ? { ok: true, data: checked.data }
        : { ok: false, message: checked.error.issues[0]?.message ?? 'Not a theme' };
    },

    nameOf: (data) => data.name,
    facts: (data) => factsOf(data.tokens),
    media: () => [],
    needs: (data) => fontNeeds(data.tokens),
    wasDefault: (data) => data.default,

    // Theme names are unique as written, so at most one theme here conflicts.
    match(data) {
      const here = listThemes(db).find((theme) => theme.name === data.name);
      if (!here) return { status: 'new' };
      const facts = [...factsOf(here.tokens), { label: 'Default', value: here.isDefault ? 'yes' : 'no' }];
      return { status: 'conflict', targets: [{ id: here.id, name: here.name, facts, updatedAt: here.updatedAt }] };
    },

    // Replacing keeps the theme's name and whether it's the default. Only the theme chosen becomes the default.
    save(data, how, _mediaId, { makeDefault }) {
      let id: string;
      let name: string;
      if (how.as === 'replace') {
        const theme = updateTheme(db, how.id, { tokens: data.tokens });
        if (!theme) throw new Error(`Theme ${how.id} to replace is gone`);
        ({ id, name } = theme);
        if (theme.isDefault) defaultChanged = true;
      } else {
        const theme = createTheme(db, {
          name: how.as === 'copy' ? freeCopyName(db, data.name) : data.name,
          tokens: data.tokens,
        });
        ({ id, name } = theme);
      }
      if (makeDefault) {
        setDefaultTheme(db, id);
        defaultChanged = true;
      }
      return { name };
    },

    afterImport() {
      if (!defaultChanged) return;
      defaultChanged = false;
      announce();
    },
  };
}
```

In `rcl-producer/server/src/index.ts`:

Replace:

```ts
import { registerThemeRoutes } from './routes/themes.ts';
```
with:

```ts
import { registerThemeRoutes } from './routes/themes.ts';
import { themeKind } from './themes/transfer.ts';
```


Replace:

```ts
  },
};
```
with:

```ts
  },
  // Themes travel in export files (ADR-0024).
  transfer: (ctx) => [themeKind({ db: ctx.db(schema), announce: () => announceDefaultTheme(ctx) })],
};
```


- [ ] **Step 5: The rules.**

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
- **Themes** (`src/themes.ts`), including `ThemeItemSchema`, a theme in export files (ADR-0024; released versions never change): the token schema, `DEFAULT_TOKENS` (the built-in look) and `themeToCss`, which the editor's preview and the overlay both use. Token rules and variable names are in `docs/features/theme-builder.md`.
  - Stored themes are checked against `ThemeTokensSchema` on every reply, and the overlay drops tokens that fail it. So a change to the tokens needs a Producer app migration that rewrites every theme's `tokens` in the same change.
- **Tests:** every schema has tests for an accepted payload and for the rejected shapes that matter.
```

In `.claude/rules/rcl-producer-server.md`:

Replace:

```markdown
- **Tests** host the module with `testProducer()` (`src/testing.ts`): an in-memory database with the migrations run, a context with the fonts given, and the routes below `/api/producer`. Access isn't checked there: core's route inventory sweeps these routes with every kind of caller, so add each new route to its pinned list.
```
with:

```markdown
- **Tests** host the module with `testProducer()` (`src/testing.ts`): an in-memory database with the migrations run, a context with the fonts given, and the routes below `/api/producer`. Access isn't checked there: core's route inventory sweeps these routes with every kind of caller, so add each new route to its pinned list.
- **Export files** (ADR-0024): the Producer app's kind is `themeKind` (`src/themes/transfer.ts`), listed by `producerApp.transfer`. Core hosts import and export; the kind saves into `producer_themes` inside core's transaction, and tells the overlay after the commit when the default changed.
```


- [ ] **Step 6: Run them and see them pass.**

Run: the command from Step 2, plus `rcl-producer/server/src/routes/themes.test.ts`.
Expected: PASS. The three files from Step 2 pass 28 tests, and `routes/themes.test.ts` still passes 13. `yarn test` passes 542.

- [ ] **Step 7: Check and commit.**

```bash
yarn format && yarn check
git add rcl-producer rcl-core/server/src/routes/transfer-themes.test.ts .claude/rules
git commit -F - <<'EOF'
feat(rcl-producer): themes in export files

The producer:theme kind exports a theme's name and tokens, whether it's
the default, and the font families it uses, whose uploaded faces travel
with it. On import it conflicts only with a theme of exactly the same
name. A theme becomes the default only when the import says so, and the
overlay is told once the import is committed.

Refs #23

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: The Import dialog

**Files:**
- Create: `packages/web-sdk/src/transfer.ts`, `packages/web-sdk/src/ImportConflict.tsx`, `packages/web-sdk/src/ImportList.tsx`, `packages/web-sdk/src/ImportDialog.tsx`, `packages/web-sdk/src/ImportConflict.stories.tsx`, `packages/web-sdk/src/ImportList.stories.tsx`
- Modify: `packages/web-sdk/src/index.ts`, `.claude/rules/sdk.md`
- Test: `packages/web-sdk/src/transfer.test.ts` and `packages/web-sdk/src/ImportDialog.test.tsx` (new)

**Interfaces:**
- Consumes:
  - from Tasks 1 and 4: `ExportSelection`, `ImportChoice`, `ImportChoices`, `ImportPreview`, `ImportResult`, `PreviewItem`, `ConflictTarget`, `TransferFact` and their schemas;
  - from Task 4: `GET /api/core/transfer/export`, `POST /api/core/transfer/import/preview`, `POST /api/core/transfer/import?choices=…` and the error code `changed_since_preview`.
- Produces, from `@rollcall/web-sdk`:
  - `exportUrl(selection: ExportSelection): string`, for download links;
  - `usePreviewImportMutation()` (a `Blob` in, an `ImportPreview` out) and `useImportFileMutation()` (`{ file, choices }` in, an `ImportResult` out). Each sends the file typed `application/zip`;
  - `importSummary(result): string`, such as "Imported 5: 3 new, 1 replaced, 1 kept as a copy (“All Stars copy”).";
  - `ImportDialog({ opened, onClose, onImported? })`.
- Inside the package: `ImportConflict({ number, item, choice, onChoose, makeDefault? })` and `ImportList({ items, all, choices, onChoose, makeDefault })`, each with stories.

- [ ] **Step 1: Write the failing tests.**

Create `packages/web-sdk/src/transfer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { exportUrl, importSummary } from './transfer.ts';

describe('exportUrl', () => {
  it('asks for chosen items as kind:id, or for whole kinds', () => {
    expect(
      exportUrl({
        items: [
          { kind: 'core:team', id: 't1' },
          { kind: 'producer:theme', id: 'th2' },
        ],
      }),
    ).toBe('/api/core/transfer/export?items=core%3Ateam%3At1%2Cproducer%3Atheme%3Ath2');
    expect(exportUrl({ kinds: ['core:team', 'producer:theme'] })).toBe(
      '/api/core/transfer/export?kinds=core%3Ateam%2Cproducer%3Atheme',
    );
  });
});

describe('importSummary', () => {
  it('says what an import did, in a sentence', () => {
    expect(importSummary({ added: 3, replaced: 1, keptBoth: 1, skipped: 1, copies: ['All Stars copy'] })).toBe(
      'Imported 5: 3 new, 1 replaced, 1 kept as a copy (“All Stars copy”). Skipped 1.',
    );
    expect(importSummary({ added: 0, replaced: 0, keptBoth: 2, skipped: 0, copies: ['A copy', 'B copy'] })).toBe(
      'Imported 2: 2 kept as copies (“A copy”, “B copy”).',
    );
    expect(importSummary({ added: 0, replaced: 0, keptBoth: 0, skipped: 2, copies: [] })).toBe(
      'Imported nothing. Skipped 2.',
    );
  });
});
```

Create `packages/web-sdk/src/ImportDialog.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Provider } from 'react-redux';
import type { ImportPreview, PreviewItem } from '@rollcall/core-contract';
import { ImportDialog } from './ImportDialog.tsx';
import { makeStore } from './store.ts';
import { fakeServer, json } from './testing.ts';
import { theme } from './theme.ts';

afterEach(() => vi.unstubAllGlobals());

const item = (
  fields: Partial<PreviewItem> & Pick<PreviewItem, 'index' | 'label' | 'name' | 'status'>,
): PreviewItem => ({
  kind: `core:${fields.label.toLowerCase()}`,
  facts: [],
  reason: null,
  conflicts: [],
  needs: [],
  canBeDefault: false,
  wasDefault: false,
  ...fields,
});
const PREVIEW: ImportPreview = {
  file: 'f'.repeat(64),
  items: [
    item({
      index: 0,
      label: 'Team',
      name: 'All Stars',
      status: 'conflict',
      facts: [
        { label: 'League', value: 'Rose City Rollers' },
        { label: 'Skaters', value: '16' },
      ],
      conflicts: [
        {
          id: 't1',
          name: 'All Stars',
          facts: [
            { label: 'League', value: 'Rose City Rollers' },
            { label: 'Skaters', value: '14' },
          ],
          updatedAt: '2026-10-24T10:00:00.000Z',
        },
        {
          id: 't2',
          name: 'all stars',
          facts: [{ label: 'Skaters', value: '9' }],
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
    }),
    item({
      index: 1,
      label: 'Team',
      name: 'Rose City Rollers',
      status: 'new',
      facts: [{ label: 'Skaters', value: '14' }],
    }),
    item({
      index: 2,
      kind: 'producer:theme',
      label: 'Theme',
      name: 'Derby Night',
      status: 'new',
      needs: [3],
      canBeDefault: true,
      wasDefault: true,
    }),
    item({ index: 3, kind: 'core:font-face', label: 'Font', name: 'Rollerball 700', status: 'new' }),
    item({
      index: 4,
      kind: 'producer:theme',
      label: 'Theme',
      name: 'Finals',
      status: 'conflict',
      canBeDefault: true,
      conflicts: [{ id: 'th1', name: 'Finals', facts: [{ label: 'Default', value: 'yes' }], updatedAt: null }],
    }),
    item({ index: 5, label: 'Screen', name: 'Bout intro', status: 'cant', reason: "Screens aren't known here yet" }),
  ],
};
const RESULT = { added: 3, replaced: 0, keptBoth: 2, skipped: 1, copies: ['All Stars copy', 'Finals copy'] };

function openDialog(routes: Parameters<typeof fakeServer>[0] = {}) {
  const server = fakeServer({ 'POST /api/core/transfer/import/preview': json(PREVIEW), ...routes });
  const onClose = vi.fn<() => void>();
  const onImported = vi.fn<() => void>();
  render(
    <MantineProvider theme={theme}>
      <Provider store={makeStore()}>
        <ImportDialog opened onClose={onClose} onImported={onImported} />
      </Provider>
    </MantineProvider>,
  );
  return { ...server, onClose, onImported };
}

const pickFile = async () => {
  const input = await vi.waitFor(() => document.body.querySelector<HTMLInputElement>('input[type="file"]')!);
  fireEvent.change(input, { target: { files: [new File(['PK zip bytes'], 'setup.zip', { type: '' })] } });
  await screen.findByText('6 items. Nothing is saved until you import them.');
};
const conflict = (n: number) => within(screen.getByRole('region', { name: new RegExp(`^Conflict ${n}:`) }));
// The choices each import sent, from its address.
const sentChoices = (urls: string[]) =>
  urls.map((url) => JSON.parse(new URL(url).searchParams.get('choices')!) as unknown);

describe('the Import dialog', () => {
  it('checks a chosen file, then shows its conflicts side by side, its new items and what can’t be imported', async () => {
    const { requests } = openDialog();
    await pickFile();
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/transfer/import/preview',
      body: 'PK zip bytes',
      contentType: 'application/zip',
    });
    expect(screen.getByText('Import from setup.zip')).toBeTruthy();
    const first = conflict(1);
    expect(first.getByText('Team “All Stars”')).toBeTruthy();
    expect(first.getByText('Here now · 2 have this name')).toBeTruthy();
    // The skater counts differ, so both are highlighted; the leagues match, so neither is.
    expect([...first.getAllByText(/^1[46]$/)].map((el) => el.tagName)).toEqual(['MARK', 'MARK']);
    expect(first.getAllByText('Rose City Rollers').map((el) => el.tagName)).toEqual(['P', 'P']);
    expect(first.getByText('Keep both: the file’s team is added as a copy; the one here is unchanged.')).toBeTruthy();
    expect(screen.getByText('used by Derby Night')).toBeTruthy();
    expect(screen.getByText('was the default in the file')).toBeTruthy();
    expect(screen.getByText("Screens aren't known here yet")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import 5 items' })).toBeTruthy();
  });

  it('imports with each item’s first choice and no default, then says what was done', async () => {
    const urls: string[] = [];
    const { onImported, onClose } = openDialog({
      'POST /api/core/transfer/import': (request) => {
        urls.push(request.url);
        return Response.json(RESULT);
      },
    });
    await pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import 5 items' }));
    expect(
      await screen.findByText('Imported 5: 3 new, 2 kept as copies (“All Stars copy”, “Finals copy”). Skipped 1.'),
    ).toBeTruthy();
    expect(sentChoices(urls)).toEqual([
      {
        file: PREVIEW.file,
        items: [
          { action: 'keep-both' },
          { action: 'add' },
          { action: 'add' },
          { action: 'add' },
          { action: 'keep-both' },
          { action: 'skip' },
        ],
        default: null,
      },
    ]);
    expect(onImported).toHaveBeenCalledWith(RESULT);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('replaces the item chosen, leaves out an unticked one, and makes only one theme the default', async () => {
    const urls: string[] = [];
    openDialog({
      'POST /api/core/transfer/import': (request) => {
        urls.push(request.url);
        return Response.json(RESULT);
      },
    });
    await pickFile();
    fireEvent.click(conflict(1).getByLabelText('Replace'));
    const which = await vi.waitFor(() => conflict(1).getByLabelText<HTMLSelectElement>('Replace which?'));
    expect(which.value).toBe('t1');
    fireEvent.change(which, { target: { value: 't2' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Import Team “Rose City Rollers”' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Make theme “Derby Night” the default' }));
    fireEvent.click(conflict(2).getByRole('switch', { name: 'Make theme “Finals” the default' }));
    expect(screen.getByRole<HTMLInputElement>('switch', { name: 'Make theme “Derby Night” the default' }).checked).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import 4 items' }));
    await screen.findByText(/^Imported 5/);
    expect(sentChoices(urls)).toEqual([
      {
        file: PREVIEW.file,
        items: [
          { action: 'replace', target: 't2' },
          { action: 'skip' },
          { action: 'add' },
          { action: 'add' },
          { action: 'keep-both' },
          { action: 'skip' },
        ],
        default: 4,
      },
    ]);
  });

  it('says why a file can’t be imported, and stays on choosing one', async () => {
    openDialog({
      'POST /api/core/transfer/import/preview': json(
        { error: 'invalid_item', message: 'Item 3 (team “All Stars”): Number 07 is used by two skaters' },
        400,
      ),
    });
    const input = await vi.waitFor(() => document.body.querySelector<HTMLInputElement>('input[type="file"]')!);
    fireEvent.change(input, { target: { files: [new File(['x'], 'bad.zip')] } });
    expect(await screen.findByText('Item 3 (team “All Stars”): Number 07 is used by two skaters')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeTruthy();
  });

  it('checks the file again when something changed since it was checked', async () => {
    const { requests } = openDialog({
      'POST /api/core/transfer/import': json({ error: 'changed_since_preview', message: 'Something changed' }, 409),
    });
    await pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import 5 items' }));
    expect(
      await screen.findByText(
        'Something changed since you checked this file, so it’s been checked again. Choose again where needed.',
      ),
    ).toBeTruthy();
    expect(requests.filter((r) => r.path === '/api/core/transfer/import/preview')).toHaveLength(2);
  });

  it('goes back to choosing another file', async () => {
    openDialog();
    await pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run packages/web-sdk/src/transfer.test.ts packages/web-sdk/src/ImportDialog.test.tsx`
Expected: FAIL. Neither file loads: `Failed to resolve import "./transfer.ts"` and `"./ImportDialog.tsx"`.

- [ ] **Step 3: The endpoints, the download link and the summary.**

Create `packages/web-sdk/src/transfer.ts`:

```ts
import {
  ImportPreviewSchema,
  ImportResultSchema,
  type ExportSelection,
  type ImportChoices,
  type ImportPreview,
  type ImportResult,
} from '@rollcall/core-contract';
import { api } from './api.ts';

// Import and export for every rcl app's pages (docs/features/import-export.md): rcl-core's transfer routes, which take
// every app's kinds of item (ADR-0024).

/** Where to download an export file of `selection`, for a link: the browser saves the .zip the server replies with. */
export function exportUrl(selection: ExportSelection): string {
  const query =
    'items' in selection
      ? ['items', selection.items.map(({ kind, id }) => `${kind}:${id}`).join(',')]
      : ['kinds', selection.kinds.join(',')];
  return `/api/core/transfer/export?${new URLSearchParams([query]).toString()}`;
}

// The file as the request body, typed as a .zip: browsers label one either way, or not at all.
const zipOf = (file: Blob) => new Blob([file], { type: 'application/zip' });

const transferApi = api.injectEndpoints({
  endpoints: (build) => ({
    previewImport: build.mutation<ImportPreview, Blob>({
      query: (file) => ({ url: 'core/transfer/import/preview', method: 'POST', body: zipOf(file) }),
      transformResponse: (response: unknown) => ImportPreviewSchema.parse(response),
    }),
    importFile: build.mutation<ImportResult, { file: Blob; choices: ImportChoices }>({
      query: ({ file, choices }) => ({
        url: 'core/transfer/import',
        method: 'POST',
        params: { choices: JSON.stringify(choices) },
        body: zipOf(file),
      }),
      transformResponse: (response: unknown) => ImportResultSchema.parse(response),
    }),
  }),
});

export const { usePreviewImportMutation, useImportFileMutation } = transferApi;

/** What an import did, in a sentence: "Imported 5: 3 new, 1 replaced, 1 kept as a copy (“All Stars copy”)." */
export function importSummary({ added, replaced, keptBoth, skipped, copies }: ImportResult): string {
  const total = added + replaced + keptBoth;
  const copiesSaid = copies.map((name) => `“${name}”`).join(', ');
  const parts = [
    added > 0 ? `${added} new` : '',
    replaced > 0 ? `${replaced} replaced` : '',
    keptBoth > 0 ? `${keptBoth} kept as ${keptBoth === 1 ? 'a copy' : 'copies'} (${copiesSaid})` : '',
  ].filter((part) => part !== '');
  const imported = total === 0 ? 'Imported nothing' : `Imported ${total}: ${parts.join(', ')}`;
  return skipped > 0 ? `${imported}. Skipped ${skipped}.` : `${imported}.`;
}
```

- [ ] **Step 4: The conflict card and the item list, with their stories.**

Create `packages/web-sdk/src/ImportConflict.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Badge, Group, Mark, NativeSelect, Paper, SegmentedControl, Stack, Text } from '@mantine/core';
import type { ConflictTarget, ImportChoice, PreviewItem, TransferFact } from '@rollcall/core-contract';

const ACTIONS = [
  { value: 'replace', label: 'Replace' },
  { value: 'keep-both', label: 'Keep both' },
  { value: 'skip', label: 'Skip' },
];

export interface ImportConflictProps {
  /** Its place among the file's conflicts, from 1. */
  number: number;
  item: PreviewItem;
  choice: ImportChoice;
  onChoose: (choice: ImportChoice) => void;
  /** The item's "Make default" switch, when it can be the default. */
  makeDefault?: ReactNode;
}

// One side of a conflict: its facts, with those that differ from the other side's highlighted.
function Side({
  title,
  name,
  facts,
  other,
}: {
  title: string;
  name: string;
  facts: readonly TransferFact[];
  other: readonly TransferFact[];
}) {
  return (
    <Paper withBorder p="xs" radius="sm">
      <Text size="xs" tt="uppercase" fw={600}>
        {title}
      </Text>
      <Text fw={600}>{name}</Text>
      {facts.map((fact) => {
        const differs = other.some((o) => o.label === fact.label && o.value !== fact.value);
        return (
          <Group key={fact.label} justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm">{fact.label}</Text>
            <Text size="sm" fw={differs ? 700 : 400}>
              {differs ? <Mark color="orange">{fact.value}</Mark> : fact.value}
            </Text>
          </Group>
        );
      })}
    </Paper>
  );
}

// What the choice will do, in a sentence.
function outcome(item: PreviewItem, choice: ImportChoice, target: ConflictTarget | undefined): string {
  const thing = item.label.toLowerCase();
  if (choice.action === 'skip') return `Skip: the file’s ${thing} isn’t imported.`;
  if (choice.action === 'keep-both')
    return `Keep both: the file’s ${thing} is added as a copy; the one here is unchanged.`;
  const isDefault = target?.facts.some((fact) => fact.label === 'Default' && fact.value === 'yes');
  return isDefault
    ? `Replace: the ${thing} here takes what’s in the file. It’s the default, so the OBS overlay changes at once.`
    : `Replace: the ${thing} here takes what’s in the file, and keeps its place.`;
}

// A conflict in a file being imported (docs/features/import-export.md): the item in the file and the one here it
// clashes with, side by side with their differences highlighted, and Replace, Keep both or Skip.
export function ImportConflict({ number, item, choice, onChoose, makeDefault }: ImportConflictProps) {
  const target = item.conflicts.find((c) => choice.action === 'replace' && c.id === choice.target) ?? item.conflicts[0];
  const choose = (action: string) => {
    if (action === 'replace') onChoose({ action: 'replace', target: target?.id ?? '' });
    else onChoose({ action: action === 'skip' ? 'skip' : 'keep-both' });
  };
  return (
    <Paper
      withBorder
      p="sm"
      radius="sm"
      style={{ borderLeft: '4px solid var(--mantine-color-orange-6)' }}
      aria-label={`Conflict ${number}: ${item.label} “${item.name}”`}
      component="section"
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <Badge color="orange" circle>
              {number}
            </Badge>
            <Text fw={600}>
              {item.label} “{item.name}”
            </Text>
          </Group>
          <SegmentedControl
            size="xs"
            data={ACTIONS}
            value={choice.action === 'add' ? 'keep-both' : choice.action}
            onChange={choose}
            aria-label={`What happens to ${item.label.toLowerCase()} “${item.name}”`}
          />
        </Group>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
          <Side title="In the file" name={item.name} facts={item.facts} other={target?.facts ?? []} />
          <Text c="orange.9" fw={700} size="lg" aria-hidden>
            ⇄
          </Text>
          <Side
            title={item.conflicts.length > 1 ? `Here now · ${item.conflicts.length} have this name` : 'Here now'}
            name={target?.name ?? ''}
            facts={target?.facts ?? []}
            other={item.facts}
          />
        </div>
        {choice.action === 'replace' && item.conflicts.length > 1 && (
          <NativeSelect
            label="Replace which?"
            size="xs"
            data={item.conflicts.map((c) => ({
              value: c.id,
              label: c.updatedAt ? `${c.name} · changed ${c.updatedAt.slice(0, 10)}` : c.name,
            }))}
            value={choice.target}
            onChange={(event) => onChoose({ action: 'replace', target: event.currentTarget.value })}
          />
        )}
        <Text size="sm">{outcome(item, choice, target)}</Text>
        {makeDefault}
      </Stack>
    </Paper>
  );
}
```

Create `packages/web-sdk/src/ImportConflict.stories.tsx`:

```tsx
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from '@mantine/core';
import type { ImportChoice, PreviewItem } from '@rollcall/core-contract';
import { ImportConflict, type ImportConflictProps } from './ImportConflict.tsx';

const TEAM: PreviewItem = {
  index: 0,
  kind: 'core:team',
  label: 'Team',
  name: 'All Stars',
  facts: [
    { label: 'League', value: 'Rose City Rollers' },
    { label: 'Skaters', value: '16' },
    { label: 'Bench staff', value: '2' },
    { label: 'Colors', value: '#aa0000, #000000' },
    { label: 'Logo', value: 'yes' },
  ],
  status: 'conflict',
  reason: null,
  conflicts: [
    {
      id: 't1',
      name: 'All Stars',
      facts: [
        { label: 'League', value: 'Rose City Rollers' },
        { label: 'Skaters', value: '14' },
        { label: 'Bench staff', value: '2' },
        { label: 'Colors', value: '#aa0000, #000000' },
        { label: 'Logo', value: 'none' },
      ],
      updatedAt: '2026-10-24T10:00:00.000Z',
    },
  ],
  needs: [],
  canBeDefault: false,
  wasDefault: false,
};
const THEME: PreviewItem = {
  ...TEAM,
  index: 1,
  kind: 'producer:theme',
  label: 'Theme',
  name: 'Finals',
  facts: [
    { label: 'Surface', value: '#141821d9' },
    { label: 'Accent', value: '#ffd700' },
    { label: 'Fonts', value: 'Oswald / Inter' },
  ],
  conflicts: [
    {
      id: 'th1',
      name: 'Finals',
      facts: [
        { label: 'Surface', value: '#141821d9' },
        { label: 'Accent', value: '#228be6' },
        { label: 'Fonts', value: 'Inter / Inter' },
        { label: 'Default', value: 'yes' },
      ],
      updatedAt: '2026-10-25T10:00:00.000Z',
    },
  ],
  canBeDefault: true,
};

// The card with its choice kept in state, as the dialog keeps it.
function Stateful({ choice: first, ...props }: ImportConflictProps) {
  const [choice, setChoice] = useState<ImportChoice>(first);
  return <ImportConflict {...props} choice={choice} onChoose={setChoice} />;
}

const meta = {
  title: 'Import/ImportConflict',
  component: ImportConflict,
  render: (args) => <Stateful {...args} />,
  args: { number: 1, item: TEAM, choice: { action: 'keep-both' }, onChoose: () => undefined },
} satisfies Meta<typeof ImportConflict>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KeepBoth: Story = {};

export const SeveralMatches: Story = {
  args: {
    item: {
      ...TEAM,
      conflicts: [
        ...TEAM.conflicts,
        {
          id: 't2',
          name: 'all stars',
          facts: [{ label: 'Skaters', value: '9' }],
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
    },
    choice: { action: 'replace', target: 't1' },
  },
};

export const ReplacingTheDefaultTheme: Story = {
  args: {
    number: 2,
    item: THEME,
    choice: { action: 'replace', target: 'th1' },
    makeDefault: <Switch size="xs" label="Make default" aria-label="Make theme “Finals” the default" />,
  },
};
```

Create `packages/web-sdk/src/ImportList.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Checkbox, Group, Stack, Text } from '@mantine/core';
import type { ImportChoice, PreviewItem } from '@rollcall/core-contract';

export interface ImportListProps {
  /** The file's items that aren't conflicts: new, reused or can't-import. */
  items: readonly PreviewItem[];
  /** Every item of the file, for naming what needs what. */
  all: readonly PreviewItem[];
  choices: readonly ImportChoice[];
  onChoose: (index: number, choice: ImportChoice) => void;
  /** An item's "Make default" switch, when it can be the default. */
  makeDefault: (item: PreviewItem) => ReactNode;
}

// A short summary of an item: what needs it, such as "used by Derby Night", or else its first facts.
function summaryOf(item: PreviewItem, all: readonly PreviewItem[]): string {
  const usedBy = all.filter((other) => other.needs.includes(item.index)).map((other) => other.name);
  if (usedBy.length > 0) return `used by ${usedBy.join(', ')}`;
  return item.facts
    .slice(0, 3)
    .map((fact) => `${fact.label}: ${fact.value}`)
    .join(' · ');
}

// The items of a file being imported that aren't conflicts (docs/features/import-export.md): new ones with a tick box,
// ones already here, and ones that can't be imported, with why.
export function ImportList({ items, all, choices, onChoose, makeDefault }: ImportListProps) {
  return (
    <Stack gap={4}>
      {items.map((item) => {
        const choice = choices[item.index];
        const label = `${item.label} “${item.name}”`;
        return (
          <Group
            key={item.index}
            gap="sm"
            wrap="nowrap"
            py={4}
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
          >
            {item.status === 'new' ? (
              <Checkbox
                aria-label={`Import ${label}`}
                checked={choice?.action === 'add'}
                onChange={(event) => onChoose(item.index, { action: event.currentTarget.checked ? 'add' : 'skip' })}
              />
            ) : (
              <span style={{ width: 20 }} />
            )}
            <Text size="sm" w={56}>
              {item.label}
            </Text>
            <Text size="sm" fw={500}>
              {item.name || 'Unnamed'}
            </Text>
            <Group gap="sm" ml="auto" wrap="nowrap">
              {item.wasDefault && <Text size="xs">was the default in the file</Text>}
              <Text size="xs">{item.status === 'new' ? summaryOf(item, all) : item.reason}</Text>
              {item.status === 'new' && makeDefault(item)}
            </Group>
          </Group>
        );
      })}
    </Stack>
  );
}
```

Create `packages/web-sdk/src/ImportList.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from '@mantine/core';
import type { PreviewItem } from '@rollcall/core-contract';
import { ImportList } from './ImportList.tsx';

const base = { reason: null, conflicts: [], needs: [], canBeDefault: false, wasDefault: false, facts: [] };
const ITEMS: PreviewItem[] = [
  {
    ...base,
    index: 0,
    kind: 'core:team',
    label: 'Team',
    name: 'Rose City Rollers',
    status: 'new',
    facts: [
      { label: 'League', value: 'Rose City Rollers' },
      { label: 'Skaters', value: '14' },
    ],
  },
  {
    ...base,
    index: 1,
    kind: 'producer:theme',
    label: 'Theme',
    name: 'Derby Night',
    status: 'new',
    needs: [2],
    canBeDefault: true,
    wasDefault: true,
  },
  { ...base, index: 2, kind: 'core:font-face', label: 'Font', name: 'Rollerball 700', status: 'new' },
  {
    ...base,
    index: 3,
    kind: 'core:font-face',
    label: 'Font',
    name: 'Jammer 400',
    status: 'reused',
    reason: 'Already here: the one here is used',
  },
];
const CANT: PreviewItem[] = [
  {
    ...base,
    index: 4,
    kind: 'core:screen',
    label: 'Screen',
    name: 'Bout intro',
    status: 'cant',
    reason: "Screens aren't known here yet",
  },
  {
    ...base,
    index: 5,
    kind: 'producer:theme',
    label: 'Theme',
    name: 'Playoffs',
    status: 'cant',
    reason: "Your account can't import themes",
  },
];

const meta = {
  title: 'Import/ImportList',
  component: ImportList,
  args: {
    items: ITEMS,
    all: [...ITEMS, ...CANT],
    choices: [
      { action: 'add' },
      { action: 'add' },
      { action: 'add' },
      { action: 'skip' },
      { action: 'skip' },
      { action: 'skip' },
    ],
    onChoose: () => undefined,
    makeDefault: (item) =>
      item.canBeDefault ? <Switch size="xs" label="Make default" aria-label={`Make ${item.name} the default`} /> : null,
  },
} satisfies Meta<typeof ImportList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {};

export const CantImport: Story = { args: { items: CANT, makeDefault: () => null } };
```

- [ ] **Step 5: The dialog.**

Create `packages/web-sdk/src/ImportDialog.tsx`:

```tsx
import { useState } from 'react';
import { Alert, Badge, Button, FileButton, Group, Modal, Stack, Switch, Text, Title } from '@mantine/core';
import type { ImportChoice, ImportPreview, ImportResult, PreviewItem } from '@rollcall/core-contract';
import { apiError } from './errors.ts';
import { problemWith } from './forms.ts';
import { ImportConflict } from './ImportConflict.tsx';
import { ImportList } from './ImportList.tsx';
import { importSummary, useImportFileMutation, usePreviewImportMutation } from './transfer.ts';

export interface ImportDialogProps {
  opened: boolean;
  onClose: () => void;
  /** Runs once something was imported, so the page behind can refresh what it shows. */
  onImported?: (result: ImportResult) => void;
}

// Each item's first choice: add a new item, keep both for a conflict, skip the rest.
const firstChoice = (item: PreviewItem): ImportChoice =>
  item.status === 'new' ? { action: 'add' } : item.status === 'conflict' ? { action: 'keep-both' } : { action: 'skip' };

const CHANGED = 'changed_since_preview';

// Importing a Rollcall export file (docs/features/import-export.md), in three steps: choose a file, see what's in it
// and choose what happens to each item, then what was done. Nothing is saved until Import. Shared by every app's pages.
export function ImportDialog({ opened, onClose, onImported }: ImportDialogProps) {
  const [previewImport, preview] = usePreviewImportMutation();
  const [importFile, imported] = useImportFileMutation();
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<ImportChoice[]>([]);
  const [makeDefault, setMakeDefault] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const check = async (picked: File) => {
    const reply = await previewImport(picked);
    if (reply.error || !reply.data) {
      setProblem(problemWith(reply.error));
      return false;
    }
    setFile(picked);
    setChecked(reply.data);
    setChoices(reply.data.items.map(firstChoice));
    setMakeDefault(null);
    return true;
  };
  const choose = async (picked: File | null) => {
    if (!picked) return;
    setProblem(null);
    await check(picked);
  };
  const startOver = () => {
    setFile(null);
    setChecked(null);
    setProblem(null);
    setResult(null);
  };
  const close = () => {
    startOver();
    onClose();
  };
  const chooseFor = (index: number, choice: ImportChoice) => {
    setChoices((current) => current.map((old, i) => (i === index ? choice : old)));
    if (choice.action === 'skip' && makeDefault === index) setMakeDefault(null);
  };

  const run = async () => {
    if (!file || !checked) return;
    const reply = await importFile({ file, choices: { file: checked.file, items: choices, default: makeDefault } });
    if (reply.data) {
      setResult(reply.data);
      onImported?.(reply.data);
      return;
    }
    if (apiError(reply.error)?.code === CHANGED && (await check(file))) {
      setProblem(
        'Something changed since you checked this file, so it’s been checked again. Choose again where needed.',
      );
      return;
    }
    setProblem(problemWith(reply.error));
  };

  const items = checked?.items ?? [];
  const conflicts = items.filter((item) => item.status === 'conflict');
  const fresh = items.filter((item) => item.status === 'new' || item.status === 'reused');
  const cant = items.filter((item) => item.status === 'cant');
  const toImport = choices.filter((choice) => choice.action !== 'skip').length;
  const defaultSwitch = (item: PreviewItem) =>
    item.canBeDefault && choices[item.index]?.action !== 'skip' ? (
      <Switch
        size="xs"
        label="Make default"
        checked={makeDefault === item.index}
        onChange={(event) => setMakeDefault(event.currentTarget.checked ? item.index : null)}
        aria-label={`Make ${item.label.toLowerCase()} “${item.name}” the default`}
      />
    ) : null;

  const title = result ? 'Imported' : file && checked ? `Import from ${file.name}` : 'Import';
  return (
    <Modal opened={opened} onClose={close} title={title} size="xl">
      {result ? (
        <Stack>
          <Alert color="green">{importSummary(result)}</Alert>
          <Group justify="flex-end">
            <Button onClick={close}>Done</Button>
          </Group>
        </Stack>
      ) : checked && file ? (
        <Stack>
          <Text size="sm">
            {items.length === 1 ? '1 item' : `${items.length} items`}. Nothing is saved until you import them.
          </Text>
          {problem && <Alert color="orange">{problem}</Alert>}
          {conflicts.length > 0 && (
            <Stack gap="xs">
              <Group gap="xs">
                <Title order={4}>Conflicts</Title>
                <Badge color="orange">{conflicts.length}</Badge>
                <Text size="sm">Same name as something already here. Choose for each.</Text>
              </Group>
              {conflicts.map((item, n) => (
                <ImportConflict
                  key={item.index}
                  number={n + 1}
                  item={item}
                  choice={choices[item.index] ?? { action: 'keep-both' }}
                  onChoose={(choice) => chooseFor(item.index, choice)}
                  makeDefault={defaultSwitch(item)}
                />
              ))}
            </Stack>
          )}
          {fresh.length > 0 && (
            <Stack gap="xs">
              <Group gap="xs">
                <Title order={4}>New</Title>
                <Badge color="gray">{fresh.length}</Badge>
              </Group>
              <ImportList
                items={fresh}
                all={items}
                choices={choices}
                onChoose={chooseFor}
                makeDefault={defaultSwitch}
              />
            </Stack>
          )}
          {cant.length > 0 && (
            <Stack gap="xs">
              <Group gap="xs">
                <Title order={4}>Can’t import</Title>
                <Badge color="gray">{cant.length}</Badge>
              </Group>
              <ImportList items={cant} all={items} choices={choices} onChoose={chooseFor} makeDefault={() => null} />
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={startOver}>
              Back
            </Button>
            <Button onClick={() => void run()} loading={imported.isLoading} disabled={toImport === 0}>
              {toImport === 1 ? 'Import 1 item' : `Import ${toImport} items`}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Text size="sm">Choose a Rollcall export file (.zip). You’ll see what’s in it before anything is saved.</Text>
          <Group>
            <FileButton onChange={(picked) => void choose(picked)} accept=".zip,application/zip">
              {(props) => (
                <Button {...props} loading={preview.isLoading}>
                  Choose file
                </Button>
              )}
            </FileButton>
          </Group>
          {problem && <Alert color="red">{problem}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
```

In `packages/web-sdk/src/index.ts`:

Replace:

```ts
export { theme } from './theme.ts';
```
with:

```ts
export { theme } from './theme.ts';
export { ImportDialog, type ImportDialogProps } from './ImportDialog.tsx';
export { exportUrl, importSummary, useImportFileMutation, usePreviewImportMutation } from './transfer.ts';
```


In `.claude/rules/sdk.md`:

Replace:

```markdown
  - the form helpers `fieldErrors`, `pathErrors` and `problemWith`;
```
with:

```markdown
  - the form helpers `fieldErrors`, `pathErrors` and `problemWith`;
  - import and export (ADR-0024): the `ImportDialog` both apps open in place, and `exportUrl` for download links (`src/transfer.ts`);
```


- [ ] **Step 6: Run them and see them pass.**

Run: the command from Step 2.
Expected: PASS, 8 tests. `yarn test` passes 550.

Run: `yarn test:stories`
Expected: PASS, 34 tests, with no accessibility violations.

- [ ] **Step 7: Check and commit.**

```bash
yarn format && yarn check
git add packages/web-sdk .claude/rules
git commit -F - <<'EOF'
feat(sdk): the Import dialog

Both apps' pages open one Import dialog. Choose a Rollcall export file,
then see its conflicts side by side with the differences highlighted, its
new items, and what can't be imported. Choose Replace, Keep both or Skip
for each conflict, and turn on Make default for one theme. Nothing is
saved until Import. exportUrl gives download links for exports.

Refs #22

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: The Import / export page, and team exports

**Files:**
- Create: `rcl-core/web/src/pages/TransferPage.tsx`
- Modify: `rcl-core/contract/src/transfer.ts`, `rcl-core/server/src/routes/transfer.ts`, `rcl-core/web/src/api.ts`, `rcl-core/web/src/routes.tsx`, `rcl-core/web/src/pages/TeamsPage.tsx`, `rcl-core/web/src/pages/TeamPage.tsx`, `.claude/rules/rcl-core-web.md`
- Test: `rcl-core/web/src/pages/TransferPage.test.tsx` (new), `rcl-core/web/src/pages/TeamsPage.test.tsx`, `rcl-core/web/src/pages/TeamPage.test.tsx`, `rcl-core/server/src/routes/transfer.test.ts`

**Interfaces:**
- Consumes:
  - from Task 4: `hostedApps.kinds`, and the routes' permission check (`holds`);
  - from Task 6: `ImportDialog` and `exportUrl`.
- Produces:
  - `TransferKindInfoSchema` and `TransferKindInfo` (`{ kind, one, many, count, mayExport, mayImport }`);
  - `GET /api/core/transfer/kinds`: the kinds the caller may export or import, with how many items each has, leaving out kinds that travel only as needs;
  - `useGetTransferKindsQuery()` in rcl-core's `api.ts`;
  - `TransferPage` at `/core/transfer`, and the header link "Import / export", which needs `core:teams.manage`;
  - **Import…** and **Export all** on the Teams page, and **Export team** on the Team page.

- [ ] **Step 1: Write the failing tests.**

In `rcl-core/server/src/routes/transfer.test.ts`:

Replace:

```ts
  return { app, db, mediaDir, notes, exportOf, send, preview, importFile, allStars, uploadFont };
```
with:

```ts
  return { app, db, mediaDir, cookies, notes, exportOf, send, preview, importFile, allStars, uploadFont };
```


Replace:

```ts
const choose = (file: string, ...items: ImportChoices['items']): ImportChoices => ({ file, items });
```
with:

```ts
const choose = (file: string, ...items: ImportChoices['items']): ImportChoices => ({ file, items });

describe('the kinds of item', () => {
  it('lists those the caller may export or import, with counts, leaving out those that only travel with others', async () => {
    const admin = await as('admin', { demo: true });
    admin.allStars();
    const kinds = await admin.app.inject({ method: 'GET', url: '/api/core/transfer/kinds', cookies: admin.cookies });
    expect(kinds.json()).toEqual([
      { kind: 'core:team', one: 'Team', many: 'teams', count: 1, mayExport: true, mayImport: true },
      { kind: 'demo:note', one: 'Note', many: 'notes', count: 0, mayExport: true, mayImport: true },
    ]);
    const producer = await as('producer', { demo: true });
    const theirs = await producer.app.inject({
      method: 'GET',
      url: '/api/core/transfer/kinds',
      cookies: producer.cookies,
    });
    expect(theirs.json()).toEqual([
      { kind: 'core:team', one: 'Team', many: 'teams', count: 0, mayExport: true, mayImport: true },
    ]);
    const announcer = await as('announcer');
    const none = await announcer.app.inject({
      method: 'GET',
      url: '/api/core/transfer/kinds',
      cookies: announcer.cookies,
    });
    expect(none.json()).toEqual([]);
  });
});
```


Create `rcl-core/web/src/pages/TransferPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { TransferKindInfo } from '@rollcall/core-contract';
import { ADMIN, ANNOUNCER, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const KINDS: TransferKindInfo[] = [
  { kind: 'core:team', one: 'Team', many: 'teams', count: 12, mayExport: true, mayImport: true },
  { kind: 'producer:theme', one: 'Theme', many: 'themes', count: 3, mayExport: true, mayImport: true },
  { kind: 'producer:screen', one: 'Screen', many: 'screens', count: 0, mayExport: true, mayImport: true },
];

async function openTransfer(user = ADMIN, kinds = KINDS) {
  const server = signedIn(user, { 'GET /api/core/transfer/kinds': json(kinds) });
  openCore('/core/transfer');
  expect(await screen.findByRole('heading', { name: 'Import / export' })).toBeTruthy();
  return server;
}

const exportLink = () => screen.getByRole('link', { name: 'Export' }).getAttribute('href');

describe('the Import / export page', () => {
  it('exports the kinds ticked, every kind with something in it to start with', async () => {
    await openTransfer();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Teams (12)' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Themes (3)' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Screens (0)' }).disabled).toBe(true);
    expect(exportLink()).toBe('/api/core/transfer/export?kinds=core%3Ateam%2Cproducer%3Atheme');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Themes (3)' }));
    expect(exportLink()).toBe('/api/core/transfer/export?kinds=core%3Ateam');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Teams (12)' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Export' }).disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Import / export' })).toBeTruthy();
  });

  it('opens the Import dialog', async () => {
    await openTransfer();
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeTruthy();
  });

  it('offers only what the account may do', async () => {
    await openTransfer(PRODUCER, [
      { ...KINDS[0]!, mayImport: true },
      { ...KINDS[1]!, mayImport: false },
    ]);
    expect(screen.getByRole('checkbox', { name: 'Themes (3)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import…' })).toBeTruthy();
  });

  it('says so, with no link to it, when the account can import or export nothing', async () => {
    signedIn(ANNOUNCER, { 'GET /api/core/transfer/kinds': json([]) });
    openCore('/core/transfer');
    expect(await screen.findByText("Your account can't import or export anything.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Import / export' })).toBeNull();
  });
});
```

In `rcl-core/web/src/pages/TeamsPage.test.tsx`:

Replace:

```tsx
  });

  it('says when there are no teams yet', async () => {
```
with:

```tsx
  });

  it('exports every team, and opens the Import dialog, for those who may manage teams', async () => {
    signedIn(PRODUCER, { 'GET /api/core/teams': json(TEAMS) });
    openCore('/core/teams');
    await within(await screen.findByRole('table')).findByText('All Stars');
    expect(screen.getByRole('link', { name: 'Export all' }).getAttribute('href')).toBe(
      '/api/core/transfer/export?kinds=core%3Ateam',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeTruthy();
  });

  it('says when there are no teams yet', async () => {
```


Replace:

```tsx
    expect(screen.queryByRole('button', { name: 'Create team' })).toBeNull();
```
with:

```tsx
    expect(screen.queryByRole('button', { name: 'Create team' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import…' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Export all' })).toBeNull();
```


In `rcl-core/web/src/pages/TeamPage.test.tsx`:

Replace:

```tsx
  });

  it('uploads a logo as the image itself, with its own type', async () => {
```
with:

```tsx
  });

  it('exports the team', async () => {
    await openTeam();
    expect(screen.getByRole('link', { name: 'Export team' }).getAttribute('href')).toBe(
      '/api/core/transfer/export?items=core%3Ateam%3At1',
    );
  });

  it('uploads a logo as the image itself, with its own type', async () => {
```


Replace:

```tsx
    expect(document.querySelector('input[type="file"]')).toBeNull();
```
with:

```tsx
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Export team' })).toBeNull();
```


- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server/src/routes/transfer.test.ts rcl-core/web/src/pages/TransferPage.test.tsx rcl-core/web/src/pages/TeamsPage.test.tsx rcl-core/web/src/pages/TeamPage.test.tsx`
Expected: FAIL, 7 of 49 tests in 4 files.
- The route test "lists those the caller may export or import…": `GET /transfer/kinds` answers `{ error: 'not_found' }`.
- All 4 in `TransferPage.test.tsx`: `Unable to find role="heading" and name "Import / export"`.
- Teams page: there's no link named "Export all". Team page: there's no link named "Export team".

- [ ] **Step 3: The kinds route.**

In `rcl-core/contract/src/transfer.ts`:

Replace:

```ts
}

/** What to export: chosen items, or everything of some kinds. */
```
with:

```ts
}

/** A kind of item the caller may export or import, for the Import / export page. */
export const TransferKindInfoSchema = z.strictObject({
  kind: z.string(),
  /** For people, such as "Team" and "teams". */
  one: z.string(),
  many: z.string(),
  /** How many items of it there are here. */
  count: z.number().int().min(0),
  mayExport: z.boolean(),
  mayImport: z.boolean(),
});
export type TransferKindInfo = z.infer<typeof TransferKindInfoSchema>;

/** What to export: chosen items, or everything of some kinds. */
```


In `rcl-core/server/src/routes/transfer.ts`:

Replace:

```ts
  ImportPreviewSchema,
```
with:

```ts
  ImportPreviewSchema,
  TransferKindInfoSchema,
```


Replace:

```ts
) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
```
with:

```ts
) {
  fastify.withTypeProvider<ZodTypeProvider>().get(
    '/transfer/kinds',
    {
      ...SIGNED_IN,
      schema: {
        tags: TAGS,
        summary: 'The kinds of item you may export or import, with how many of each there are',
        response: { 200: TransferKindInfoSchema.array(), ...ERROR_RESPONSES },
      },
    },
    async (request) =>
      [...request.server.hostedApps.kinds.values()]
        .filter((kind) => !kind.onlyAsNeed)
        .map((kind) => ({
          kind: kind.name,
          one: kind.label.one,
          many: kind.label.many,
          count: kind.list().length,
          mayExport: holds(request, kind.exportPermission),
          mayImport: holds(request, kind.importPermission),
        }))
        .filter((info) => info.mayExport || info.mayImport),
  );

  fastify.withTypeProvider<ZodTypeProvider>().get(
```


- [ ] **Step 4: The page, its link, and the team pages' buttons.**

In `rcl-core/web/src/api.ts`:

Replace:

```ts
  TeamSummarySchema,
```
with:

```ts
  TeamSummarySchema,
  TransferKindInfoSchema,
```


Replace:

```ts
  type TeamSummary,
```
with:

```ts
  type TeamSummary,
  type TransferKindInfo,
```


Replace:

```ts
    }),
    removeFontFace: build.mutation<void, string>({
```
with:

```ts
    }),
    // The kinds of item you may export or import, for the Import / export page.
    getTransferKinds: build.query<TransferKindInfo[], void>({
      query: () => 'core/transfer/kinds',
      transformResponse: (response: unknown) => TransferKindInfoSchema.array().parse(response),
    }),
    removeFontFace: build.mutation<void, string>({
```


Replace:

```ts
  useRemoveFontFaceMutation,
```
with:

```ts
  useRemoveFontFaceMutation,
  useGetTransferKindsQuery,
```


Create `rcl-core/web/src/pages/TransferPage.tsx`:

```tsx
import { useState } from 'react';
import { Alert, Button, Checkbox, Loader, Stack, Text, Title } from '@mantine/core';
import { exportUrl, ImportDialog, problemWith } from '@rollcall/web-sdk';
import { useGetTransferKindsQuery } from '../api.ts';

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

// Import and export (docs/features/import-export.md): export whole kinds to a Rollcall export file, and import one
// through the Import dialog. The page offers only the kinds the server says you may export or import (hard rule 5).
export function TransferPage() {
  const kinds = useGetTransferKindsQuery();
  // The kinds ticked for export, until someone changes them: every kind that has something to export.
  const [ticked, setTicked] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  if (kinds.isError) return <Alert color="red">{problemWith(kinds.error)}</Alert>;
  if (!kinds.data) return <Loader />;
  if (kinds.data.length === 0) return <Alert color="gray">Your account can't import or export anything.</Alert>;

  const exportable = kinds.data.filter((kind) => kind.mayExport);
  const chosen = ticked ?? exportable.filter((kind) => kind.count > 0).map((kind) => kind.kind);
  const tick = (kind: string, on: boolean) =>
    setTicked(on ? [...chosen, kind] : chosen.filter((other) => other !== kind));
  return (
    <Stack maw={720}>
      <Title order={2}>Import / export</Title>
      <Text>
        Move teams and themes between Rollcall installs, or keep a backup. A file is a .zip with the data and its logos,
        photos and fonts.
      </Text>
      {exportable.length > 0 && (
        <Stack gap="xs">
          <Title order={3}>Export</Title>
          {exportable.map((kind) => (
            <Checkbox
              key={kind.kind}
              label={`${capitalized(kind.many)} (${kind.count})`}
              checked={chosen.includes(kind.kind)}
              disabled={kind.count === 0}
              onChange={(event) => tick(kind.kind, event.currentTarget.checked)}
            />
          ))}
          <Text size="sm">Uploaded fonts travel with the themes that use them.</Text>
          <div>
            {chosen.length > 0 ? (
              <Button component="a" href={exportUrl({ kinds: chosen })} download>
                Export
              </Button>
            ) : (
              <Button disabled>Export</Button>
            )}
          </div>
        </Stack>
      )}
      {kinds.data.some((kind) => kind.mayImport) && (
        <Stack gap="xs">
          <Title order={3}>Import</Title>
          <Text>
            Add teams and themes from a Rollcall export file. You'll see what's in it before anything is saved.
          </Text>
          <div>
            <Button variant="default" onClick={() => setImporting(true)}>
              Import…
            </Button>
          </div>
        </Stack>
      )}
      <ImportDialog opened={importing} onClose={() => setImporting(false)} onImported={() => void kinds.refetch()} />
    </Stack>
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
import { TransferPage } from './pages/TransferPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';

// Pages behind the sign-in gate share the app's header. Setup, sign-in and choosing a password come before it, at
// the addresses every rcl app sends people to (CORE_PAGES in the web SDK).
// Each is shown only to people holding its permission; the server checks every request anyway (hard rule 5).
const LINKS: readonly AppLink[] = [
  { label: 'Teams', to: '/teams', permission: 'core:teams.read' },
  { label: 'Fonts', to: '/fonts', permission: 'core:fonts.read' },
  // Everyone who may import or export teams may import or export something; the page shows what.
  { label: 'Import / export', to: '/transfer', permission: 'core:teams.manage' },
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
      { path: 'transfer', element: <TransferPage /> },
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

In `rcl-core/web/src/pages/TeamsPage.tsx`:

Replace:

```tsx
import { fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
```
with:

```tsx
import { exportUrl, fieldErrors, ImportDialog, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
```


Replace:

```tsx
  return (
    <Stack maw={980}>
      <Title order={2}>Teams</Title>
      {canManage && <NewTeam />}
```
with:

```tsx
  const [importing, setImporting] = useState(false);
  return (
    <Stack maw={980}>
      <Group justify="space-between">
        <Title order={2}>Teams</Title>
        {canManage && (
          <Group gap="xs">
            <Button variant="default" onClick={() => setImporting(true)}>
              Import…
            </Button>
            {teams.data && teams.data.length > 0 && (
              <Button variant="default" component="a" href={exportUrl({ kinds: ['core:team'] })} download>
                Export all
              </Button>
            )}
          </Group>
        )}
      </Group>
      {canManage && <NewTeam />}
      {canManage && (
        <ImportDialog opened={importing} onClose={() => setImporting(false)} onImported={() => void teams.refetch()} />
      )}
```


In `rcl-core/web/src/pages/TeamPage.tsx`:

Replace:

```tsx
import { apiError, fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
```
with:

```tsx
import { apiError, exportUrl, fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
```


Replace:

```tsx
      <Title order={2}>{data.name}</Title>
```
with:

```tsx
      <Group justify="space-between">
        <Title order={2}>{data.name}</Title>
        {canManage && (
          <Button
            variant="default"
            component="a"
            href={exportUrl({ items: [{ kind: 'core:team', id: data.id }] })}
            download
          >
            Export team
          </Button>
        )}
      </Group>
```


In `.claude/rules/rcl-core-web.md`:

Replace:

```markdown
- **Images** are sent as the raw file with its own type, never as JSON (`setLogo`, `setPhoto` in `src/api.ts`), and checked first with `imageProblem` (`src/pages/ImagePicker.tsx`). The server checks them again (ADR-0022).
```
with:

```markdown
- **Images** are sent as the raw file with its own type, never as JSON (`setLogo`, `setPhoto` in `src/api.ts`), and checked first with `imageProblem` (`src/pages/ImagePicker.tsx`). The server checks them again (ADR-0022).
- **Import and export** (ADR-0024): the Import / export page (`src/pages/TransferPage.tsx`) lists the kinds the server says you may export or import (`GET /api/core/transfer/kinds`); export buttons are links from `exportUrl`, and every Import… opens the web SDK's `ImportDialog`.
```


- [ ] **Step 5: Run them and see them pass.**

Run: the command from Step 2.
Expected: PASS, 49 tests. `yarn test` passes 557.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core .claude/rules
git commit -F - <<'EOF'
feat(rcl-core): the Import / export page, and team exports

An Import / export page at /core/transfer exports whole kinds, those
with something in them ticked to start with, and opens the Import
dialog. The Teams page has Import… and Export all, and each Team page
has Export team. GET /transfer/kinds says which kinds the caller may
export or import.

Refs #22

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Import and export on the Themes page

**Files:**
- Modify: `rcl-producer/web/src/pages/ThemesPage.tsx`, `.claude/rules/rcl-producer-web.md`
- Test: `rcl-producer/web/src/pages/ThemesPage.test.tsx`

**Interfaces:**
- Consumes: `ImportDialog` and `exportUrl` (Task 6), and the `producer:theme` kind (Task 5).
- Produces, on the Themes page:
  - every row has a menu, "Actions for <name>", with **Export**. Admins get the rest of the menu too;
  - **Export all** for everyone who sees themes, and **Import…** for Admins.

- [ ] **Step 1: Write the failing tests.**

In `rcl-producer/web/src/pages/ThemesPage.test.tsx`:

Replace:

```tsx
  it('is read-only for a Producer', async () => {
    await openThemes(PRODUCER);
    expect(screen.queryByRole('button', { name: 'Create theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull();
```
with:

```tsx
  it('is read-only for a Producer, who may still export themes', async () => {
    await openThemes(PRODUCER);
    expect(screen.queryByRole('button', { name: 'Create theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import…' })).toBeNull();
    fireEvent.click(within(rowOf('Derby Night')).getByRole('button', { name: 'Actions for Derby Night' }));
    expect((await screen.findByRole('menuitem', { name: 'Export' })).getAttribute('href')).toBe(
      '/api/core/transfer/export?items=producer%3Atheme%3At1',
    );
    expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Export all' }).getAttribute('href')).toBe(
      '/api/core/transfer/export?kinds=producer%3Atheme',
    );
  });

  it('opens the Import dialog for an Admin', async () => {
    await openThemes(ADMIN);
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeTruthy();
```


- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-producer/web/src/pages/ThemesPage.test.tsx`
Expected: FAIL, 2 of 9 tests.
- "is read-only for a Producer, who may still export themes": `Unable to find an accessible element with the role "button" and name "Actions for Derby Night"`.
- "opens the Import dialog for an Admin": no button named "Import…".

- [ ] **Step 3: The menu, Export all and Import….**

In `rcl-producer/web/src/pages/ThemesPage.tsx`:

Replace:

```tsx
import { fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
```
with:

```tsx
import { exportUrl, fieldErrors, ImportDialog, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
```


Replace:

```tsx
  return (
    <Stack maw={980}>
      <Title order={2}>Themes</Title>
```
with:

```tsx
  const [importing, setImporting] = useState(false);
  return (
    <Stack maw={980}>
      <Group justify="space-between">
        <Title order={2}>Themes</Title>
        <Group gap="xs">
          {canManage && (
            <Button variant="default" onClick={() => setImporting(true)}>
              Import…
            </Button>
          )}
          {themes.data && themes.data.length > 0 && (
            <Button variant="default" component="a" href={exportUrl({ kinds: ['producer:theme'] })} download>
              Export all
            </Button>
          )}
        </Group>
      </Group>
```


Replace:

```tsx
              {canManage && (
                <Table.Th>
                  <VisuallyHidden>Actions</VisuallyHidden>
                </Table.Th>
              )}
```
with:

```tsx
              <Table.Th>
                <VisuallyHidden>Actions</VisuallyHidden>
              </Table.Th>
```


Replace:

```tsx
                actions={canManage ? <ThemeMenu theme={theme} onDelete={setDeleting} onProblem={setProblem} /> : null}
```
with:

```tsx
                actions={
                  <ThemeMenu theme={theme} canManage={canManage} onDelete={setDeleting} onProblem={setProblem} />
                }
```


Replace:

```tsx
      {deleting && <DeleteTheme theme={deleting} onClose={() => setDeleting(null)} />}
```
with:

```tsx
      {deleting && <DeleteTheme theme={deleting} onClose={() => setDeleting(null)} />}
      {canManage && (
        <ImportDialog opened={importing} onClose={() => setImporting(false)} onImported={() => void themes.refetch()} />
      )}
```


Replace:

```tsx
      {actions && <Table.Td>{actions}</Table.Td>}
```
with:

```tsx
      <Table.Td>{actions}</Table.Td>
```


Replace:

```tsx
// A theme's row menu: Duplicate, Make default or Stop using as default, and Delete (which confirms first).
function ThemeMenu({
  theme,
```
with:

```tsx
// A theme's row menu: Export for anyone who can see it, then for those who may manage themes Duplicate, Make default
// or Stop using as default, and Delete (which confirms first).
function ThemeMenu({
  theme,
  canManage,
```


Replace:

```tsx
  theme: Theme;
```
with:

```tsx
  theme: Theme;
  canManage: boolean;
```


Replace:

```tsx
        <Menu.Item onClick={() => void run(duplicateTheme({ id: theme.id }))}>Duplicate</Menu.Item>
        {theme.isDefault ? (
          <Menu.Item onClick={() => void run(setDefaultTheme({ themeId: null }))}>Stop using as default</Menu.Item>
        ) : (
          <Menu.Item onClick={() => void run(setDefaultTheme({ themeId: theme.id }))}>Make default</Menu.Item>
        )}
        <Menu.Item color="red" onClick={() => onDelete(theme)}>
          Delete
        </Menu.Item>
```
with:

```tsx
        <Menu.Item component="a" href={exportUrl({ items: [{ kind: 'producer:theme', id: theme.id }] })} download>
          Export
        </Menu.Item>
        {canManage && (
          <>
            <Menu.Item onClick={() => void run(duplicateTheme({ id: theme.id }))}>Duplicate</Menu.Item>
            {theme.isDefault ? (
              <Menu.Item onClick={() => void run(setDefaultTheme({ themeId: null }))}>Stop using as default</Menu.Item>
            ) : (
              <Menu.Item onClick={() => void run(setDefaultTheme({ themeId: theme.id }))}>Make default</Menu.Item>
            )}
            <Menu.Item color="red" onClick={() => onDelete(theme)}>
              Delete
            </Menu.Item>
          </>
        )}
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
- **Themes** (`src/pages/Theme*.tsx`): the list, and the editor, whose preview puts the overlay's own `ThemeScope` and components on the page, so it matches the OBS overlay. The list exports themes (links from the web SDK's `exportUrl`) and opens the web SDK's `ImportDialog` for Admins (ADR-0024).
- **Overlay code** under `src/overlay/` has its own, stricter rule (`rcl-producer-overlay.md`).
- **Testing:** React Testing Library in jsdom, with `openProducer` (`src/test/open-producer.tsx`) and the fake server from `@rollcall/web-sdk/testing`; see `docs/guides/testing.md`. The Producer app's own components get a dashboard Storybook with their first story (split spec).
- **Feature pages:** `theme-builder`, `screen-builder`, `overlay-components`, `live-mode`, `obs-control` and `crg-automation` in `docs/features/`. Update the page in the same change as the behavior.
```

- [ ] **Step 4: Run them and see them pass.**

Run: the command from Step 2.
Expected: PASS, 9 tests. `yarn test` passes 558.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add rcl-producer/web .claude/rules
git commit -F - <<'EOF'
feat(rcl-producer): import and export on the Themes page

Each theme's row menu has Export, for Producers too, who see nothing
else in it. Export all downloads every theme with its uploaded fonts,
and Admins open the Import dialog with Import….

Refs #23

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: End to end, and the docs

**Files:**
- Modify: `e2e/tests/accounts.spec.ts`, `docs/features/import-export.md`, `docs/features/team-builder.md`, `docs/features/theme-builder.md`, `docs/features/users-and-access.md`, `docs/product/glossary.md`, `docs/architecture/README.md`, `rcl-core/CHANGELOG.md`, `rcl-producer/CHANGELOG.md`, and the generated `docs/features/README.md`

**Interfaces:**
- Consumes everything above.

- [ ] **Step 1: Add import and export to the end-to-end flow.**

The new test goes at the end of the ordered accounts flow, using the Admin, team and theme made before it:
1. The Admin uploads a font face (Anton's file, as the family "Rollerball") and makes it the theme's heading font.
2. They export every team and theme from the Import / export page.
3. They delete the team, the theme and the font face.
4. They import the file through the Import dialog, making the theme the default.
5. The team, the font and the theme (the default) are all back.

In `e2e/tests/accounts.spec.ts`:

Replace:

```ts
import { expect, test, type Page } from '@playwright/test';
```
with:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
```


Replace:

```ts
  await expect.poll(accent).toBe('#00c853');
});
```
with:

```ts
  await expect.poll(accent).toBe('#00c853');
});

// Import / export (import-export R1–R5), on the team and theme made above.
test('an Admin exports teams and themes with an uploaded font, deletes them, and imports them back', async ({
  page,
}, testInfo) => {
  await page.goto('/core/transfer');
  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: 'Import / export' })).toBeVisible();
  // An uploaded font for the theme's headings: Anton's file, under another family name.
  const ttf = readFileSync(fileURLToPath(new URL('../../rcl-core/server/fonts/anton/anton.ttf', import.meta.url)));
  const upload = await page.request.post('/api/core/fonts/faces?family=Rollerball&weight=400', {
    data: ttf,
    headers: { 'content-type': 'font/ttf' },
  });
  expect(upload.status()).toBe(201);
  const [night] = (await (await page.request.get('/api/producer/themes')).json()) as {
    id: string;
    tokens: { fonts: Record<string, unknown> };
  }[];
  const tokens = {
    ...night!.tokens,
    fonts: { ...night!.tokens.fonts, heading: { family: 'Rollerball', weight: 400 } },
  };
  expect((await page.request.patch(`/api/producer/themes/${night!.id}`, { data: { tokens } })).status()).toBe(200);

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Themes (1)' })).toBeChecked();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export', exact: true }).click();
  const file = testInfo.outputPath('rollcall-export.zip');
  await (await download).saveAs(file);

  // Gone: the team, the theme and the font.
  const [team] = (await (await page.request.get('/api/core/teams')).json()) as { id: string }[];
  await page.request.delete(`/api/core/teams/${team!.id}`);
  await page.request.delete(`/api/producer/themes/${night!.id}`);
  const families = (await (await page.request.get('/api/core/fonts')).json()) as {
    name: string;
    faces: { id: string }[];
  }[];
  const rollerball = families.find((family) => family.name === 'Rollerball')!;
  await page.request.delete(`/api/core/fonts/faces/${rollerball.faces[0]!.id}`);

  // Back, through the Import dialog, with the theme made the default again.
  await page.getByRole('button', { name: 'Import…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await expect(dialog.getByText('3 items. Nothing is saved until you import them.')).toBeVisible();
  await expect(dialog.getByText('used by Derby Night')).toBeVisible();
  await dialog.getByRole('switch', { name: 'Make theme “Derby Night” the default' }).check();
  await dialog.getByRole('button', { name: 'Import 3 items' }).click();
  await expect(dialog.getByText('Imported 3: 3 new.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.goto('/core/teams');
  await expect(page.getByRole('row', { name: /All Stars/ })).toBeVisible();
  await page.goto('/core/fonts');
  await expect(page.getByRole('row', { name: /Rollerball/ })).toBeVisible();
  await page.goto('/producer/themes');
  await expect(page.getByRole('row', { name: /Derby Night/ })).toContainText('Default');
});
```


Run: `yarn test:e2e`
Expected: PASS, 13 tests. The new test passes at once, because Tasks 1–8 built what it checks.

- [ ] **Step 2: Update the wiki and the changelogs.**

Replace `docs/features/import-export.md` with:

```markdown
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
     - **Keep both** adds the file's item as "<name> copy", "copy 2" and so on.
   - **New** items, each with a tick box. A font face identical to one here is reused instead; one named after a bundled family isn't imported, and themes use the bundled family.
   - **Can't import**, each with why: a kind this server doesn't know yet, a newer version, or a kind your account may not import.
   - **The default theme never changes on its own.** Each theme being imported has a **Make default** switch, off to start with; turning one on turns the others off. A theme that was the default where it was exported says so.
3. **Import** saves everything chosen in one go, or nothing. The dialog says what it did: "Imported 5: 3 new, 1 replaced, 1 kept as a copy (“All Stars copy”)." If something here changed since the file was checked, it's checked again for you to choose afresh.

**Who:** Admins import and export everything. Producers import and export teams, and export themes. Announcers do neither. See the [role matrix](users-and-access.md#role-matrix).

**Versions:** each kind's data has a version. An older one is brought up to date when it's imported, so an export always stays importable; a released version never changes (R4).

## Open questions

- Should importing a CRG team export (`crg-team-*.json` from CRG's read-only `GET /SaveJSON/`) be supported directly?
- Do events and games need export, e.g. to prepare a tournament on one machine and run it on another?
- Should API keys be able to export, for scripted backups?
```

In `docs/features/team-builder.md`:

Replace:

```markdown
R1–R5 and R7 are built. R6 comes with the [Import / Export](import-export.md) feature.
```
with:

```markdown
R1–R7 are built. Teams travel in [export files](import-export.md) (R6).
```


In `docs/features/theme-builder.md`:

Replace:

```markdown
Not built yet: exporting and importing themes (R6).
```
with:

```markdown
Themes travel in [export files](import-export.md), with the uploaded fonts they use (R6). Importing a theme never makes it the default on its own.
```


In `docs/features/users-and-access.md`:

Replace:

```markdown
| Import or export themes and screens | ✅ | ❓ | — |
```
with:

```markdown
| Import or export themes and screens | ✅ | Export only | — |
```


Delete:

```markdown
- May Producers import or export themes and screens they can't edit?
```


In `docs/product/glossary.md`:

Replace:

```markdown
| <a id="default-theme"></a>**Default theme** | The one theme the OBS overlay uses, chosen on the Themes page. With none, the overlay uses the built-in look. See [Theme Builder](../features/theme-builder.md#themes-rcl-producer). |
```
with:

```markdown
| <a id="default-theme"></a>**Default theme** | The one theme the OBS overlay uses, chosen on the Themes page. With none, the overlay uses the built-in look. See [Theme Builder](../features/theme-builder.md#themes-rcl-producer). |
| <a id="export-file"></a>**Export file** | A `.zip` of teams, themes and their logos, photos and fonts, made by exporting and read by importing, to move them between Rollcall installs or keep a backup. See [Import / Export](../features/import-export.md). |
```


In `docs/architecture/README.md`:

Replace:

```markdown
- [ADR-0023](../decisions/0023-core-data-services-for-apps.md): rcl-core shares its data with apps through read-only services on `AppContext`, fonts first; apps never read core's tables.
```
with:

```markdown
- [ADR-0023](../decisions/0023-core-data-services-for-apps.md): rcl-core shares its data with apps through read-only services on `AppContext`, fonts first; apps never read core's tables.
- [ADR-0024](../decisions/0024-import-export-kinds.md): rcl-core reads and writes export files at `/api/core/transfer/…`; each app owns its kinds of item, and one import is one transaction.
```


In `rcl-core/CHANGELOG.md`:

Replace:

```markdown
## [Unreleased]
```
with:

```markdown
## [Unreleased]

### Added

- Import and export: export teams and themes, with their logos, photos and fonts, to a file, and import it on another Rollcall. Before anything is saved, the Import dialog shows what's in the file, side by side with anything here of the same name, so you choose to replace it, keep both or skip it. An import saves everything or nothing. Admins and Producers import and export teams (#22)
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

- Themes travel in export files with the uploaded fonts they use: Export and Export all on the Themes page, and Import… for Admins. Importing a theme makes it the default only if you turn on its Make default switch. Producers can export themes (#23)
```


Then run `node scripts/check-docs.mjs --fix`. It updates the features table (Import / Export: shipped).

- [ ] **Step 3: Check and commit.**

```bash
yarn format && yarn check
git add e2e docs rcl-core/CHANGELOG.md rcl-producer/CHANGELOG.md
git commit -F - <<'EOF'
docs(repo): import and export shipped

The Import / Export page describes what's built: the export file, the
Import dialog, conflicts and the default theme. The Team and Theme
Builder pages mark R6 built, Producers export themes in the role matrix,
the glossary gains Export file, and both changelogs have their lines.
The end-to-end flow exports a team and a theme with an uploaded font,
deletes them, and imports them back.

Closes #22
Closes #23

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```
