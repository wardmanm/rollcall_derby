# Team Builder (#17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins and Producers set up teams in rcl-core's admin app: name, league, short name, colors and logo, and the team's skaters and bench staff, with numbers, pronouns, roles and photos. Announcers can view teams. Images are served to anyone at unguessable `/media/<id>` addresses, so OBS overlays can show them.

**Architecture:**
- **The contract** (`rcl-core/contract/src/teams.ts`) holds the schemas, the role lists, the image limits and `memberProblem`, which the server and the browser both use.
- **Storage:**
  - three new tables in one migration: `media`, `teams` and `team_members`;
  - `src/media.ts`, which saves images (checking their bytes), removes them, sweeps up after a crash at startup, and serves `/media/<id>`.
- **Server:**
  - `src/teams/teams.ts` reads and writes teams and members;
  - `src/routes/teams.ts` has the routes for teams and members;
  - `src/routes/team-images.ts` has the logo and photo uploads, in a plugin of their own that takes raw image bodies of up to 5 MB.
- **Permissions:** `core:teams.read` (every role) and `core:teams.manage` (Admin and Producer). API keys can be given either.
- **Web:** a Teams list, a Team page, a member form and an image picker in rcl-core's admin app, with tests, stories and an end-to-end flow.

**Tech Stack:** Fastify 5, Drizzle 0.45 (one new migration), Zod 4, React 19 with Mantine 9 and RTK Query, Vitest, Storybook and Playwright. **No new dependencies.**

**Spec:** [`design-docs/specs/2026-10-23-team-builder-design.md`](../specs/2026-10-23-team-builder-design.md) (approved). Issue **#17**, milestone `rcl-core v0.2.0`.

**How this plan was checked:** the work was built on a throwaway branch, one commit per task.
- Every commit passed `yarn check`.
- The last commit also passed `yarn build`, the 21 story tests and the 11 e2e tests.
- App tests go from 307 to 373.
- Each task's tests were run against the previous task's code and failed as its "Expected: FAIL" says.
- Every code block below is copied from those commits. Every "Replace … with" instruction was checked mechanically: applied to the previous task's files, it gives this task's files exactly.

## Global Constraints

- **From the spec:**
  - **Images:** "PNG, JPEG or WebP up to 5 MB. No cropping or resizing; overlays fit images with CSS."
  - **Media ids:** "16 random bytes as 32 lowercase hex characters (128 bits), so addresses can't be guessed."
  - **What's accepted:** "the server reads the first bytes, not just the stated type. A file is accepted only if it starts like one of these, and is stored as the type its bytes show."
  - **`/media/<id>` replies** carry "the stored `Content-Type`; `X-Content-Type-Options: nosniff`; `Content-Security-Policy: default-src 'none'`; `Cache-Control: public, max-age=31536000, immutable`".
  - **Numbers:** "**text**, 1–4 letters or digits (`^[0-9A-Za-z]{1,4}$`). Skaters must have one, and bench staff must not. Numbers are unique among a team's skaters, as an exact match after trimming."
  - **Roles:** "A team has at most one `captain` and at most one `alt-captain`." Custom roles: "up to 3 strings, each 1–32 characters after trimming, with no duplicates."
  - **Permissions:** "Neither permission is `peopleOnly`." Announcers view only.
  - **Replies:** "Every change replies with the whole team."
  - **Errors:** `400 validation_failed`, `404 not_found`, `409 number_taken`, `409 role_taken`, `413 too_large`, `415 unsupported_image`.
- **Hard rules:**
  - Rule 4: works offline, so nothing loads from the internet and there are no new dependencies.
  - Rule 5: authorization happens on the server; the web app hides controls only for convenience.
  - Rule 6: server data lives only in RTK Query.
- **Database:** never edit an existing migration's SQL. The new tables come from `db:generate --name teams`.
- **TypeScript and lint:** no new dependencies, no `as` casts in source outside tests, and no new `oxlint-disable`.
- **Every commit passes `yarn format && yarn check`.** Task 5 also passes `yarn build && yarn test:stories`, and Task 6 `yarn test:e2e`.
- **Commits:**
  - Conventional Commits with scope `rcl-core`;
  - each body ends with `Refs #17`, except Task 6's, which says `Closes #17`;
  - then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Nothing is pushed** without Mike's explicit OK.

## Review Focus

1. **A custom role typed but not confirmed with Enter, then Save clicked.** The role must be kept, not silently dropped. Mantine's `TagsInput` keeps typed text when focus leaves it, and clicking Save moves the focus. Test in Task 5: "keeps a custom role typed without pressing Enter, when the focus moves on to Save".
2. **Someone else deletes the team while it's open.** The next save must say the team is gone, not "Something went wrong". Test in Task 5: "says so when someone else deleted the team in the meantime".
3. **A new skater refused (number taken) after a photo was picked.** No photo is uploaded, and nothing is orphaned. Test in Task 5: "shows the server's reason when a number or role is taken, and uploads no photo".
4. **A file that isn't what it says:** an SVG or HTML file labelled `image/png`, or a real JPEG labelled PNG. The first must be refused, and the second stored as what its bytes are. Tests in Task 4:
   - "refuses anything that is not a PNG, JPEG or WebP, by its bytes or its type, saving nothing";
   - "keeps an image as the type its bytes show, whatever it was labelled".
5. **Edges of the upload limit and access:**
   - an image of exactly 5 MB must be accepted, and one byte more refused;
   - an anonymous upload must get `401`, not `413` or `415`.

   Tests in Task 4: "accepts an image of exactly 5 MB and refuses one a byte over" and "refuses an Announcer, and anyone not signed in".

## Decisions this plan makes

The spec leaves these open. Each is decided here so implementers and reviewers don't have to guess.

**Contract and server:**
- **Request types use `z.input`,** so callers may leave out fields that have defaults. Response types use `z.infer`.
- **`memberProblem` lives in the contract:** the create schema and the server's check of a changed member share it.
- **Writes return the changed team** (`changedTeam` in `teams.ts`), so routes reply with it.
- **Order:**
  - skaters by number, using `Intl.Collator('en', { numeric: true })` with ties broken by plain string order;
  - bench staff, and the team list, by name the same way;
  - both sorted in code.
- **A unique index on (team, number)** backs the number check. It also serves lookups of a team's members, so there's no second index.
- **`MEDIA_REFERENCES`** (`db/schema.ts`) lists every column that points at media. The startup sweep keeps only images one of them names.
- **Uploads:**
  - **JSON still accepted:** the upload routes keep the JSON body parser, so an anonymous JSON request still gets `401` from the access check; a JSON body that gets past it is `415 unsupported_image`.
  - **Read before the access check:** bodies are read before access is checked, as on every route, and the 5 MB limit caps what a refused caller can send.
  - **Error codes:** the upload plugin's error handler turns `413` into `too_large` and `415` into `unsupported_image`; anything else goes to `sendApiError`.
  - **Missing team or member first:** an upload checks that the team or member exists before saving, so a `404` leaves nothing behind.
  - **Two uploads at once:** two uploads to the same logo at the same moment can leave one image orphaned until the next startup sweep.
- **Files are written synchronously,** with no `await` before a write, so no handler needs `recheckAccess()`.
- **`/media/<id>`** streams the file, with `Content-Length` from its row. Fastify answers `HEAD` too.
- **The API explorer** documents upload bodies as binary, for each type the route `consumes`. Its transform adds them; the routes have no body schema.
- **The `media` id:** an app with id `media` is skipped and logged, as the server already treats bad app ids, rather than stopping the server. The spec says "refuses to start"; either way the app is never hosted.
- **`testApp`'s media folder** is a temporary path, made when the first image is saved and deleted when the app closes.
- **The route inventory's key sweep** drops its test app (`KEYS_PROBE_APP`). The teams routes are now the routes a key may call.

**Web:**
- **Changes refresh the team and the list by tags,** rather than writing each reply into the cache. Replies are still checked against the contract.
- **An image is sent as the `File` itself,** with its own type as `Content-Type`. `fetchBaseQuery` sends it unchanged.
- **The fake server** (`@rollcall/web-sdk/testing`) records a non-JSON body as text, with its `contentType`. JSON requests are recorded as before.
- **Role fixtures:** `ADMIN` and `PRODUCER` hold the teams permissions, as on the server, and there's a new `ANNOUNCER`.
- **Stories:**
  - `ImagePicker`;
  - `MembersTable`, in edit and read-only modes.

  These are the Team page's parts that need no server. The spec asked for the Team page in both modes, and `MembersTable` shows both.
- **"No … yet" notes** use the normal text color: Mantine's dimmed gray fails the stories' contrast check.
- **When photos and logos change:** a new member's photo is uploaded after the member is created. An existing member's photo, and a logo, change as soon as one is picked.
- **One sentence for "it's gone"** (`GONE` in `MemberForm.tsx`) answers a `not_found` from any change on the Team page.

**Docs:**
- **ADR-0022** records public media.
- **The feature page** goes to `shipped`:
  - it gains R7, the team fields;
  - R3 gains pronouns, and R4 the fixed and custom roles;
  - the open questions it answers move into Behavior.
- **The rules files** say how images are handled.
- **rcl-core's changelog** gets an Added line ending in (#17).

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `rcl-core/contract/src/teams.ts` + test, `src/auth/permissions.ts`, users-and-access tables | Schemas, roles, image limits; the two permissions | 1 |
| `src/db/schema.ts`, migration `0003_teams`, `src/media.ts` + test, `src/{app,server,apps,testing}.ts` | The tables; the media store, `/media/<id>` and the startup sweep | 2 |
| `src/teams/teams.ts`, `src/routes/teams.ts` + test, `src/core-app.ts`, route inventory | Teams and members | 3 |
| `src/routes/team-images.ts` + test, `src/openapi.ts` | Logo and photo uploads | 4 |
| `rcl-core/web/src/{api.ts,routes.tsx}`, `pages/{TeamsPage,TeamPage,MemberForm,MembersTable,ImagePicker}.tsx`, stories, `packages/web-sdk/src/testing.ts` | The admin pages | 5 |
| `e2e/tests/accounts.spec.ts`, ADR-0022, `docs/**`, `.claude/rules/*`, `rcl-core/CHANGELOG.md` | End to end, and the docs | 6 |

`src/` means `rcl-core/server/src/`. All other paths are relative to the repo root.

---

### Task 1: The teams contract, and the two permissions

**Files:**
- Create: `rcl-core/contract/src/teams.ts`
- Modify: `rcl-core/contract/src/index.ts`, `rcl-core/server/src/auth/permissions.ts`, `docs/features/users-and-access.md`, `docs/features/team-builder.md` (status)
- Test: `rcl-core/contract/src/teams.test.ts` (new), `rcl-core/server/src/routes/auth.test.ts`, `rcl-core/server/src/routes/api-keys.test.ts`

**Interfaces:**
- Produces, from `@rollcall/core-contract`:
  - `IMAGE_TYPES`, `ImageTypeSchema`, `ImageType`, `MAX_IMAGE_BYTES` (5 242 880);
  - `MEMBER_KINDS`, `MemberKindSchema`, `MemberKind`;
  - `SKATER_ROLES`, `BENCH_ROLES`, `MemberRoleSchema`, `MemberRole`, `MEMBER_ROLE_NAMES`, `ONE_PER_TEAM`;
  - `ColorSchema`, `MemberNumberSchema`;
  - `TeamMemberSchema`, `TeamSummarySchema`, `TeamSchema` and their types;
  - `CreateTeamRequestSchema`, `UpdateTeamRequestSchema`, `CreateMemberRequestSchema`, `UpdateMemberRequestSchema` and their input types;
  - `MemberFields`, and `memberProblem(member): { field, message } | null`.
- `CORE_PERMISSIONS` gains `core:teams.read` (`roles: ['producer', 'announcer']`) and `core:teams.manage` (`roles: ['producer']`). Neither is `peopleOnly`.

- [ ] **Step 0: Branch, and commit the spec and this plan.**

```bash
git switch -c feat/team-builder
git add design-docs/specs/2026-10-23-team-builder-design.md design-docs/plans/2026-10-23-team-builder.md
git commit -F - <<'EOF'
docs(rcl-core): spec and plan for the Team Builder

Teams with their skaters and bench staff, logos and photos, in rcl-core.

Refs #17

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

Remind Mike, in one line, to move #17 to "In progress" on board #6.

- [ ] **Step 1: Write the failing tests.**

Create `rcl-core/contract/src/teams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CreateMemberRequestSchema,
  CreateTeamRequestSchema,
  MAX_IMAGE_BYTES,
  memberProblem,
  TeamSchema,
  TeamSummarySchema,
  UpdateMemberRequestSchema,
  UpdateTeamRequestSchema,
  type MemberFields,
} from './teams.ts';

const MEMBER = {
  id: 'm1',
  kind: 'skater',
  name: 'Jammy Dodger',
  number: '07',
  pronouns: 'she/her',
  roles: ['captain'],
  customRoles: ['Team MVP'],
  photoUrl: '/media/0123456789abcdef0123456789abcdef',
};
const TEAM = {
  id: 't1',
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  shortName: 'RCR',
  primaryColor: '#1a2b3c',
  secondaryColor: null,
  logoUrl: null,
  createdAt: '2026-10-23T10:00:00.000Z',
  updatedAt: '2026-10-23T11:00:00.000Z',
  members: [MEMBER],
};

describe('TeamSchema and TeamSummarySchema', () => {
  it('accept a team as the server sends it', () => {
    expect(TeamSchema.parse(TEAM)).toEqual(TEAM);
    const { createdAt: _createdAt, members: _members, ...summary } = TEAM;
    const listed = { ...summary, skaterCount: 1, benchCount: 0 };
    expect(TeamSummarySchema.parse(listed)).toEqual(listed);
  });

  it('refuse a member with a role that is not one of the fixed roles', () => {
    expect(TeamSchema.safeParse({ ...TEAM, members: [{ ...MEMBER, roles: ['mvp'] }] }).success).toBe(false);
  });
});

describe('CreateTeamRequestSchema', () => {
  it('trims, lowercases colors, and treats blank optional fields as none', () => {
    expect(
      CreateTeamRequestSchema.parse({
        name: '  All Stars ',
        leagueName: ' ',
        shortName: 'RCR',
        primaryColor: '#AABBCC',
      }),
    ).toEqual({ name: 'All Stars', leagueName: null, shortName: 'RCR', primaryColor: '#aabbcc', secondaryColor: null });
  });

  it('refuses a blank or overlong name, an overlong short name and a color that is not #rrggbb', () => {
    for (const request of [
      { name: '  ' },
      { name: 'x'.repeat(65) },
      { name: 'All Stars', leagueName: 'x'.repeat(65) },
      { name: 'All Stars', shortName: 'TOOLONGXX' },
      { name: 'All Stars', primaryColor: 'red' },
      { name: 'All Stars', secondaryColor: '#abc' },
      { name: 'All Stars', logoUrl: '/media/x' },
    ]) {
      expect(CreateTeamRequestSchema.safeParse(request).success, JSON.stringify(request)).toBe(false);
    }
  });
});

describe('UpdateTeamRequestSchema', () => {
  it('leaves out what is missing, and clears what is null or blank', () => {
    expect(UpdateTeamRequestSchema.parse({ shortName: null, secondaryColor: '' })).toEqual({
      shortName: null,
      secondaryColor: null,
    });
    expect(UpdateTeamRequestSchema.parse({})).toEqual({});
  });

  it("refuses to clear the team's name", () => {
    expect(UpdateTeamRequestSchema.safeParse({ name: null }).success).toBe(false);
    expect(UpdateTeamRequestSchema.safeParse({ name: ' ' }).success).toBe(false);
  });
});

describe('CreateMemberRequestSchema', () => {
  it('keeps a number as text, with its leading zeros, and fills in what is left out', () => {
    expect(CreateMemberRequestSchema.parse({ kind: 'skater', name: ' Jammy ', number: ' 00 ' })).toEqual({
      kind: 'skater',
      name: 'Jammy',
      number: '00',
      pronouns: null,
      roles: [],
      customRoles: [],
    });
  });

  it('accepts bench staff with no number, and up to 3 custom roles', () => {
    const coach = { kind: 'bench', name: 'Coach', roles: ['bench-coach'], customRoles: ['Lineups', 'Hype', 'Snacks'] };
    expect(CreateMemberRequestSchema.parse(coach)).toMatchObject(coach);
  });

  it('refuses each member that breaks a rule, naming the field', () => {
    const cases: [object, string][] = [
      [{ kind: 'skater', name: 'Jammy' }, 'number'],
      [{ kind: 'skater', name: 'Jammy', number: '12345' }, 'number'],
      [{ kind: 'skater', name: 'Jammy', number: '1 2' }, 'number'],
      [{ kind: 'bench', name: 'Coach', number: '7' }, 'number'],
      [{ kind: 'skater', name: 'Jammy', number: '7', roles: ['bench-coach'] }, 'roles'],
      [{ kind: 'bench', name: 'Coach', roles: ['captain'] }, 'roles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', roles: ['captain', 'captain'] }, 'roles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', customRoles: ['a', 'b', 'c', 'd'] }, 'customRoles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', customRoles: ['MVP', 'MVP'] }, 'customRoles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', customRoles: ['x'.repeat(33)] }, 'customRoles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', pronouns: 'x'.repeat(33) }, 'pronouns'],
      [{ kind: 'skater', name: ' ', number: '7' }, 'name'],
    ];
    for (const [request, field] of cases) {
      const result = CreateMemberRequestSchema.safeParse(request);
      expect(result.error?.issues[0]?.path[0], JSON.stringify(request)).toBe(field);
    }
  });
});

describe('UpdateMemberRequestSchema', () => {
  it('accepts any subset of fields, leaving the whole member to the server', () => {
    expect(UpdateMemberRequestSchema.parse({ number: '', kind: 'bench' })).toEqual({ number: null, kind: 'bench' });
    expect(UpdateMemberRequestSchema.safeParse({ photoUrl: null }).success).toBe(false);
  });
});

describe('memberProblem', () => {
  const skater: MemberFields = {
    kind: 'skater',
    name: 'Jammy',
    number: '7',
    pronouns: null,
    roles: [],
    customRoles: [],
  };

  it('says what is wrong with a member on its own, or nothing', () => {
    expect(memberProblem(skater)).toBeNull();
    expect(memberProblem({ ...skater, kind: 'bench' })).toEqual({
      field: 'number',
      message: 'Bench staff have no number',
    });
    expect(memberProblem({ ...skater, roles: ['bench-manager'] })).toEqual({
      field: 'roles',
      message: "Bench manager isn't a role for a skater",
    });
  });
});

describe('MAX_IMAGE_BYTES', () => {
  it('is 5 MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(5_242_880);
  });
});
```

An Admin and a Producer now hold the teams permissions, and API keys can be given them:

In `rcl-core/server/src/routes/auth.test.ts`:

Replace:

```ts
    expect(await permissionsOf('admin')).toEqual(['core:users.manage', 'core:api-keys.manage']);
    expect(await permissionsOf('producer1')).toEqual([]);
```
with:

```ts
    expect(await permissionsOf('admin')).toEqual([
      'core:users.manage',
      'core:api-keys.manage',
      'core:teams.read',
      'core:teams.manage',
    ]);
    expect(await permissionsOf('producer1')).toEqual(['core:teams.read', 'core:teams.manage']);
```


In `rcl-core/server/src/routes/api-keys.test.ts`:

Replace:

```ts
    expect(GrantablePermissionSchema.array().parse(res.json())).toEqual([
```
with:

```ts
    expect(GrantablePermissionSchema.array().parse(res.json())).toEqual([
      { key: 'core:teams.read', summary: 'View teams and their members' },
      { key: 'core:teams.manage', summary: 'Create, edit and delete teams, members, logos and photos' },
```


- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/contract/src/teams.test.ts rcl-core/server/src/routes/auth.test.ts rcl-core/server/src/routes/api-keys.test.ts`
Expected: FAIL.
- `teams.test.ts` doesn't load: `Cannot find module './teams.ts'`.
- `auth.test.ts` and `api-keys.test.ts` each have one failure: the permission lists are missing the teams permissions.

- [ ] **Step 3: Write the contract, the permissions and their table.**

Create `rcl-core/contract/src/teams.ts`:

```ts
import { z } from 'zod';

// Teams and their members (docs/features/team-builder.md). Server and web share these shapes. Logos and photos are
// media: uploaded images served at /media/<id> (ADR-0022).

/** The image types a logo or photo may be. The server checks a file's bytes, not just its stated type. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ImageTypeSchema = z.enum(IMAGE_TYPES);
export type ImageType = z.infer<typeof ImageTypeSchema>;

/** The largest logo or photo the server accepts: 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const MEMBER_KINDS = ['skater', 'bench'] as const;
export const MemberKindSchema = z.enum(MEMBER_KINDS);
export type MemberKind = z.infer<typeof MemberKindSchema>;

// The fixed roles, each for one kind of member. Members can have custom roles of their own as well.
export const SKATER_ROLES = ['captain', 'alt-captain'] as const;
export const BENCH_ROLES = ['bench-coach', 'bench-manager', 'bench-alt-captain'] as const;
export const MemberRoleSchema = z.enum([...SKATER_ROLES, ...BENCH_ROLES]);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const MEMBER_ROLE_NAMES: Record<MemberRole, string> = {
  captain: 'Captain',
  'alt-captain': 'Alt captain',
  'bench-coach': 'Bench coach',
  'bench-manager': 'Bench manager',
  'bench-alt-captain': 'Bench alt captain',
};

/** The roles a team has at most one of. */
export const ONE_PER_TEAM: readonly MemberRole[] = ['captain', 'alt-captain'];

const rolesFor = (kind: MemberKind): readonly MemberRole[] => (kind === 'skater' ? SKATER_ROLES : BENCH_ROLES);

// Optional text arrives as a string, empty or not, or null. Blank means none.
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable());

const TeamNameSchema = z.string().trim().min(1, 'Give the team a name').max(64, 'Use at most 64 characters');
const LeagueNameSchema = z.string().trim().max(64, 'Use at most 64 characters');
const ShortNameSchema = z.string().trim().max(8, 'Use at most 8 characters');
export const ColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, 'Use a color like #1a2b3c');

const MemberNameSchema = z.string().trim().min(1, 'Give a name').max(64, 'Use at most 64 characters');
/** A skater's number: text, so 00 and 07 keep their zeros. */
export const MemberNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]{1,4}$/, 'Use 1–4 letters or digits');
const PronounsSchema = z.string().trim().max(32, 'Use at most 32 characters');
const CustomRoleSchema = z.string().trim().min(1, 'Give the role a name').max(32, 'Use at most 32 characters');
const CustomRolesSchema = z
  .array(CustomRoleSchema)
  .max(3, 'Use at most 3 custom roles')
  .refine((roles) => new Set(roles).size === roles.length, 'Each custom role only once');

export const TeamMemberSchema = z.strictObject({
  id: z.string(),
  kind: MemberKindSchema,
  name: z.string(),
  number: z.string().nullable(),
  pronouns: z.string().nullable(),
  roles: z.array(MemberRoleSchema),
  customRoles: z.array(z.string()),
  photoUrl: z.string().nullable(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

const TeamFields = {
  id: z.string(),
  name: z.string(),
  leagueName: z.string().nullable(),
  shortName: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  logoUrl: z.string().nullable(),
  updatedAt: z.iso.datetime(),
};

export const TeamSummarySchema = z.strictObject({
  ...TeamFields,
  skaterCount: z.number().int(),
  benchCount: z.number().int(),
});
export type TeamSummary = z.infer<typeof TeamSummarySchema>;

/** A team with its members: skaters by number, then bench staff by name. */
export const TeamSchema = z.strictObject({
  ...TeamFields,
  createdAt: z.iso.datetime(),
  members: z.array(TeamMemberSchema),
});
export type Team = z.infer<typeof TeamSchema>;

export const CreateTeamRequestSchema = z.strictObject({
  name: TeamNameSchema,
  leagueName: optional(LeagueNameSchema).default(null),
  shortName: optional(ShortNameSchema).default(null),
  primaryColor: optional(ColorSchema).default(null),
  secondaryColor: optional(ColorSchema).default(null),
});
export type CreateTeamRequest = z.input<typeof CreateTeamRequestSchema>;

/** A missing field stays as it is; null (or blank) clears it. */
export const UpdateTeamRequestSchema = z.strictObject({
  name: TeamNameSchema.optional(),
  leagueName: optional(LeagueNameSchema).optional(),
  shortName: optional(ShortNameSchema).optional(),
  primaryColor: optional(ColorSchema).optional(),
  secondaryColor: optional(ColorSchema).optional(),
});
export type UpdateTeamRequest = z.input<typeof UpdateTeamRequestSchema>;

/** The fields of a member that a request sets. */
export interface MemberFields {
  kind: MemberKind;
  name: string;
  number: string | null;
  pronouns: string | null;
  roles: readonly MemberRole[];
  customRoles: readonly string[];
}

/**
 * What's wrong with a member on its own, or null: a skater needs a number and bench staff have none, and each role
 * must be one for the member's kind. Whether a number or role is already taken is the server's to check.
 */
export function memberProblem(member: MemberFields): { field: keyof MemberFields; message: string } | null {
  if (member.kind === 'skater' && member.number === null)
    return { field: 'number', message: 'Give the skater a number' };
  if (member.kind === 'bench' && member.number !== null)
    return { field: 'number', message: 'Bench staff have no number' };
  const allowed = rolesFor(member.kind);
  const wrong = member.roles.find((role) => !allowed.includes(role));
  if (wrong) {
    const who = member.kind === 'skater' ? 'a skater' : 'bench staff';
    return { field: 'roles', message: `${MEMBER_ROLE_NAMES[wrong]} isn't a role for ${who}` };
  }
  if (new Set(member.roles).size !== member.roles.length) return { field: 'roles', message: 'Each role only once' };
  return null;
}

export const CreateMemberRequestSchema = z
  .strictObject({
    kind: MemberKindSchema,
    name: MemberNameSchema,
    number: optional(MemberNumberSchema).default(null),
    pronouns: optional(PronounsSchema).default(null),
    roles: z.array(MemberRoleSchema).default([]),
    customRoles: CustomRolesSchema.default([]),
  })
  .superRefine((member, context) => {
    const problem = memberProblem(member);
    if (problem) context.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
  });
export type CreateMemberRequest = z.input<typeof CreateMemberRequestSchema>;

/** A missing field stays as it is. The server checks the member that results, as memberProblem says. */
export const UpdateMemberRequestSchema = z.strictObject({
  kind: MemberKindSchema.optional(),
  name: MemberNameSchema.optional(),
  number: optional(MemberNumberSchema).optional(),
  pronouns: optional(PronounsSchema).optional(),
  roles: z.array(MemberRoleSchema).optional(),
  customRoles: CustomRolesSchema.optional(),
});
export type UpdateMemberRequest = z.input<typeof UpdateMemberRequestSchema>;
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
export * from './teams.ts';
```

Replace `rcl-core/server/src/auth/permissions.ts` with:

```ts
import type { PermissionDef } from './access.ts';

// rcl-core's own permissions (ADR-0018). The users-and-access feature page lists the same table, and a test keeps
// the two in step.
export const CORE_APP_ID = 'core';

export const CORE_PERMISSIONS: readonly PermissionDef[] = [
  {
    key: 'core:users.manage',
    summary: 'Create users, change their roles, reset their passwords, sign them out and delete them',
    roles: [],
    peopleOnly: true,
  },
  {
    key: 'core:api-keys.manage',
    summary: 'Create, list and revoke API keys',
    roles: [],
    peopleOnly: true,
  },
  {
    key: 'core:teams.read',
    summary: 'View teams and their members',
    roles: ['producer', 'announcer'],
  },
  {
    key: 'core:teams.manage',
    summary: 'Create, edit and delete teams, members, logos and photos',
    roles: ['producer'],
  },
];
```

The feature page's permission table must match `CORE_PERMISSIONS` (a test checks it). Add a "View teams" row to the role matrix, and update the note about what an API key can hold:

In `docs/features/users-and-access.md`:

Replace:

```markdown
| Create or edit screens, component layout and options | ✅ | — (uses existing) | — |
```
with:

```markdown
| Create or edit screens, component layout and options | ✅ | — (uses existing) | — |
| View teams | ✅ | ✅ | ✅ |
```


Replace:

```markdown
| `core:api-keys.manage` | Create, list and revoke API keys | ✅ | — | — | — |
```
with:

```markdown
| `core:api-keys.manage` | Create, list and revoke API keys | ✅ | — | — | — |
| `core:teams.read` | View teams and their members | ✅ | ✅ | ✅ | ✅ |
| `core:teams.manage` | Create, edit and delete teams, members, logos and photos | ✅ | ✅ | — | ✅ |
```


Replace:

```markdown
  - Until features add permissions a key may hold, a key reaches public routes only.
```
with:

```markdown
  - A key can be given the teams permissions, so a device can read rosters, or a script can keep them up to date.
```


Work starts, so in `docs/features/team-builder.md`:

Replace:

```markdown
status: planned
```
with:

```markdown
status: in-progress
```


Then run `node scripts/check-docs.mjs --fix`, which updates the features table in `docs/features/README.md`.

- [ ] **Step 4: Run them and see them pass.**

Run: `yarn vitest run rcl-core/contract/src/teams.test.ts rcl-core/server/src/routes/auth.test.ts rcl-core/server/src/routes/api-keys.test.ts rcl-core/server/src/auth/permissions.test.ts`
Expected: PASS. `yarn test` passes 319.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core docs/features
git commit -F - <<'EOF'
feat(rcl-core): the teams contract, and permissions to view and manage teams

Schemas for teams and their members, the fixed roles, and the image
types and size limit, shared by server and web app. core:teams.read is
every role's, and core:teams.manage is for Admins and Producers. These
are the first permissions an API key can be given.

Refs #17

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: The tables, and the media store

**Files:**
- Modify: `rcl-core/server/src/db/schema.ts`, `rcl-core/server/src/app.ts`, `rcl-core/server/src/server.ts`, `rcl-core/server/src/apps.ts`, `rcl-core/server/src/testing.ts`
- Create: `rcl-core/server/src/media.ts`, migration `rcl-core/server/drizzle/0003_teams.sql` (generated)
- Test: `rcl-core/server/src/media.test.ts` (new), `rcl-core/server/src/server.test.ts`, `rcl-core/server/src/apps.test.ts`

**Interfaces:**
- Consumes from Task 1: `IMAGE_TYPES`, `MEMBER_KINDS`, `MemberRole`, `ImageType`.
- Produces:
  - tables `media`, `teams` and `team_members`, and `MEDIA_REFERENCES` (`db/schema.ts`);
  - from `media.ts`:
    - `imageTypeOf(bytes): ImageType | undefined`;
    - `saveMedia(db, dir, bytes): string | null`, returning the new id;
    - `removeMedia(db, dir, ids)`;
    - `sweepMedia(db, dir): { files, rows }`;
    - `mediaUrl(id | null): string | null`;
    - `serveMedia(app, { db, dir })`;
  - `AppOptions.mediaDir: string` (required);
  - `testApp()` returns `{ app, db, mediaDir }`, and `IMAGES` (`png`, `jpeg`, `webp` first bytes) from `testing.ts`.

- [ ] **Step 1: Write the failing tests.**

Create `rcl-core/server/src/media.test.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { media, teamMembers, teams } from './db/schema.ts';
import { imageTypeOf, mediaUrl, removeMedia, saveMedia, sweepMedia } from './media.ts';
import { IMAGES, testApp } from './testing.ts';

const NOW = '2026-10-23T10:00:00.000Z';
const apps: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

// An app on a fresh database and media folder.
function fresh() {
  const opened = testApp();
  apps.push(opened.app);
  return opened;
}

describe('imageTypeOf', () => {
  it('knows PNG, JPEG and WebP by their first bytes', () => {
    expect(imageTypeOf(IMAGES.png)).toBe('image/png');
    expect(imageTypeOf(IMAGES.jpeg)).toBe('image/jpeg');
    expect(imageTypeOf(IMAGES.webp)).toBe('image/webp');
  });

  it('refuses anything else, whatever it claims to be', () => {
    for (const bytes of [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      Buffer.from('<!doctype html><title>x</title>'),
      Buffer.from('GIF89a'),
      Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVE'),
      IMAGES.png.subarray(0, 4),
      Buffer.alloc(0),
    ]) {
      expect(imageTypeOf(bytes), bytes.toString('latin1')).toBeUndefined();
    }
  });
});

describe('saveMedia and removeMedia', () => {
  it('saves an image as a file named by a random 32-character id, with a row saying its type', () => {
    const { db, mediaDir } = fresh();
    const id = saveMedia(db, mediaDir, IMAGES.webp);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(readdirSync(mediaDir)).toEqual([id]);
    expect(db.select().from(media).all()).toEqual([
      { id, contentType: 'image/webp', size: IMAGES.webp.length, createdAt: expect.any(String) },
    ]);
    expect(mediaUrl(id)).toBe(`/media/${id}`);
    expect(mediaUrl(null)).toBeNull();
  });

  it('saves nothing that is not an image', () => {
    const { db, mediaDir } = fresh();
    expect(saveMedia(db, mediaDir, Buffer.from('<svg/>'))).toBeNull();
    expect(existsSync(mediaDir)).toBe(false);
    expect(db.select().from(media).all()).toEqual([]);
  });

  it('removes images, rows and files, skipping nulls', () => {
    const { db, mediaDir } = fresh();
    const kept = saveMedia(db, mediaDir, IMAGES.png)!;
    const gone = saveMedia(db, mediaDir, IMAGES.jpeg)!;
    removeMedia(db, mediaDir, [gone, null]);
    expect(readdirSync(mediaDir)).toEqual([kept]);
    expect(db.select({ id: media.id }).from(media).all()).toEqual([{ id: kept }]);
  });
});

describe('sweepMedia', () => {
  it('removes leftover files, rows with no file and rows nothing refers to, and keeps the rest', () => {
    const { db, mediaDir } = fresh();
    const logo = saveMedia(db, mediaDir, IMAGES.png)!;
    const photo = saveMedia(db, mediaDir, IMAGES.jpeg)!;
    saveMedia(db, mediaDir, IMAGES.webp); // referred to by nothing
    const missingFile = saveMedia(db, mediaDir, IMAGES.png)!;
    db.insert(teams).values({ id: 't1', name: 'All Stars', logoMediaId: logo, createdAt: NOW, updatedAt: NOW }).run();
    db.insert(teamMembers)
      .values([
        {
          id: 'm1',
          teamId: 't1',
          kind: 'skater',
          name: 'Jammy',
          number: '7',
          roles: [],
          customRoles: [],
          photoMediaId: photo,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: 'm2',
          teamId: 't1',
          kind: 'skater',
          name: 'Blocky',
          number: '8',
          roles: [],
          customRoles: [],
          photoMediaId: missingFile,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ])
      .run();
    removeMediaFile(mediaDir, missingFile);
    writeFileSync(join(mediaDir, 'abc.uploading'), 'half');
    writeFileSync(join(mediaDir, 'stray.txt'), 'x');
    mkdirSync(join(mediaDir, 'folder'));

    expect(sweepMedia(db, mediaDir)).toEqual({ files: 4, rows: 2 });
    expect(readdirSync(mediaDir).toSorted()).toEqual([logo, photo].toSorted());
    expect(
      db
        .select({ id: media.id })
        .from(media)
        .all()
        .map(({ id }) => id)
        .toSorted(),
    ).toEqual([logo, photo].toSorted());
    // The member whose photo was missing now has none, rather than a broken address.
    expect(db.select({ photo: teamMembers.photoMediaId }).from(teamMembers).all()).toEqual([
      { photo },
      { photo: null },
    ]);
    expect(sweepMedia(db, mediaDir)).toEqual({ files: 0, rows: 0 });
  });

  it('makes the media folder when there is none yet', () => {
    const { db, mediaDir } = fresh();
    expect(sweepMedia(db, mediaDir)).toEqual({ files: 0, rows: 0 });
    expect(existsSync(mediaDir)).toBe(true);
  });
});

// Deletes an image's file but not its row, as a crash or a hand-edited folder might.
const removeMediaFile = (dir: string, id: string) => rmSync(join(dir, id));

describe('GET /media/:id', () => {
  it('serves an image to anyone, with its type, and headers that keep it an image that is cached for good', async () => {
    const { app, db, mediaDir } = fresh();
    const id = saveMedia(db, mediaDir, IMAGES.png)!;
    const res = await app.inject({ method: 'GET', url: `/media/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(IMAGES.png)).toBe(true);
    expect(res.headers).toMatchObject({
      'content-type': 'image/png',
      'content-length': String(IMAGES.png.length),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'cache-control': 'public, max-age=31536000, immutable',
    });
    const head = await app.inject({ method: 'HEAD', url: `/media/${id}` });
    expect(head.statusCode).toBe(200);
    expect(head.headers['content-type']).toBe('image/png');
  });

  it('answers 404 for an unknown id, a malformed one, or a file that is gone', async () => {
    const { app, db, mediaDir } = fresh();
    const id = saveMedia(db, mediaDir, IMAGES.png)!;
    removeMediaFile(mediaDir, id);
    for (const path of [
      `/media/${'0'.repeat(32)}`,
      `/media/${id}`,
      `/media/${id.toUpperCase()}`,
      '/media/..%2Frollcall.db',
      '/media/abc',
      '/media/',
    ]) {
      expect((await app.inject({ method: 'GET', url: path })).statusCode, path).toBe(404);
    }
  });
});
```

In `rcl-core/server/src/server.test.ts`:

Replace:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
```
with:

```ts
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
```


Replace:

```ts
import { CORE_VERSION } from './testing.ts';
```
with:

```ts
import { saveMedia } from './media.ts';
import { CORE_VERSION, IMAGES } from './testing.ts';
```


Replace:

```ts
describe('startServer', () => {
  it('purges expired sessions at startup and serves setup status from the data directory', async () => {
```
with:

```ts
describe('startServer', () => {
  it('sweeps leftover media at startup: an image nothing refers to is gone, and so is a half-saved upload', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'op-server-'));
    const mediaDir = join(dataDir, 'media');
    const seed = openDatabase(dataDir);
    const orphan = saveMedia(seed.db, mediaDir, IMAGES.png);
    seed.sqlite.close();
    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(join(mediaDir, 'half.uploading'), 'x');

    running = await startServer(
      { host: '127.0.0.1', port: 0, dataDir, webDir: join(dataDir, 'no-web-build') },
      { version: '1.0.0', logger: false },
    );
    expect(readdirSync(mediaDir)).toEqual([]);
    expect((await fetch(`${running.url}/media/${orphan}`)).status).toBe(404);
  });

  it('purges expired sessions at startup and serves setup status from the data directory', async () => {
```


In `rcl-core/server/src/apps.test.ts`:

Replace:

```ts
      [app({ id: 'core' }), 'another app already uses the id "core"'],
```
with:

```ts
      [app({ id: 'core' }), 'another app already uses the id "core"'],
      [app({ id: 'media' }), 'its id "media" is a path the server uses itself'],
```


The test helpers give each test app its own media folder, and provide image bytes:

Replace `rcl-core/server/src/testing.ts` with:

```ts
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppModule } from '@rollcall/app-sdk';
import type { Role } from '@rollcall/core-contract';
import { buildApp, type AppOptions } from './app.ts';
import { migrateApp, migrationsTableFor } from './apps.ts';
import { openMemoryDatabase, type AppDatabase } from './db.ts';
import { hashPassword } from './auth/passwords.ts';
import pkg from '../package.json' with { type: 'json' };
import { createUser, type UserRecord } from './auth/users.ts';

/** This rcl-core's version, as main.ts passes it to the server. */
export const CORE_VERSION = pkg.version;

// Test helpers: an app on a private in-memory database, with its own media folder (made only when an image is saved,
// and deleted when the app closes), and a quick way to add users.
export function testApp(options: Partial<AppOptions> = {}) {
  const { db, sqlite } = openMemoryDatabase();
  const mediaDir = join(tmpdir(), `rollcall-media-${randomUUID()}`);
  const app = buildApp({ version: '1.0.0', db, mediaDir, ...options });
  app.addHook('onClose', async () => {
    sqlite.close();
    rmSync(mediaDir, { recursive: true, force: true });
  });
  return { app, db, mediaDir };
}

/** The first bytes of each image type: enough for the server, which checks an image's bytes, not its pixels. */
export const IMAGES = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([26, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
};

export async function addUser(
  db: AppDatabase,
  username: string,
  password: string,
  role: Role,
  options: { mustChangePassword?: boolean } = {},
): Promise<UserRecord> {
  return createUser(db, { username, passwordHash: await hashPassword(password), role, ...options });
}

/** The tables in the database, by name. */
export function tableNames(db: AppDatabase): string[] {
  return db.$client
    .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

/** The tables an app's migrations create, besides its migrations table, on a fresh database with core's tables. */
export function tablesCreatedBy(app: AppModule): string[] {
  const { db, sqlite } = openMemoryDatabase();
  try {
    const before = new Set(tableNames(db));
    migrateApp(app, db);
    return tableNames(db).filter((name) => !before.has(name) && name !== migrationsTableFor(app.id));
  } finally {
    sqlite.close();
  }
}
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server/src/media.test.ts rcl-core/server/src/server.test.ts rcl-core/server/src/apps.test.ts`
Expected: FAIL.
- `media.test.ts` and `server.test.ts` don't load: `Cannot find module './media.ts'`.
- In `apps.test.ts`, an app with id `media` is still hosted.

- [ ] **Step 3: Add the tables, and generate the migration.**

In `rcl-core/server/src/db/schema.ts`:

Replace:

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
```
with:

```ts
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { IMAGE_TYPES, MEMBER_KINDS, type MemberRole } from '@rollcall/core-contract';
```


Replace:

```ts
  lastUsedAt: text('last_used_at'),
});
```
with:

```ts
  lastUsedAt: text('last_used_at'),
});

// Uploaded images, such as team logos and member photos (ADR-0022). Each is a file named by its id in the data
// folder's media/ folder. The id is 128 random bits, so an image's address can't be guessed.
export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  contentType: text('content_type', { enum: IMAGE_TYPES }).notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
});

// Teams and their members (docs/features/team-builder.md).
export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  leagueName: text('league_name'),
  shortName: text('short_name'),
  primaryColor: text('primary_color'),
  secondaryColor: text('secondary_color'),
  logoMediaId: text('logo_media_id').references(() => media.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Skaters and bench staff. A number is text, so 00 and 07 keep their zeros; only skaters have one, and no two skaters
// on a team share it (bench staff's null numbers never clash).
export const teamMembers = sqliteTable(
  'team_members',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: MEMBER_KINDS }).notNull(),
    name: text('name').notNull(),
    number: text('number'),
    pronouns: text('pronouns'),
    roles: text('roles', { mode: 'json' }).$type<MemberRole[]>().notNull(),
    customRoles: text('custom_roles', { mode: 'json' }).$type<string[]>().notNull(),
    photoMediaId: text('photo_media_id').references(() => media.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  // Also serves lookups of a team's members.
  (table) => [uniqueIndex('team_members_team_number_idx').on(table.teamId, table.number)],
);

// Every column that refers to media. The startup sweep keeps only media that one of them refers to: add new ones here.
export const MEDIA_REFERENCES = [
  { table: teams, column: teams.logoMediaId },
  { table: teamMembers, column: teamMembers.photoMediaId },
] as const;
```


Then run:

```bash
yarn workspace @rollcall/core-server db:generate --name teams
```

Expected: it writes `rcl-core/server/drizzle/0003_teams.sql`, plus its snapshot and journal entry. The SQL should read:

```sql
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`number` text,
	`pronouns` text,
	`roles` text NOT NULL,
	`custom_roles` text NOT NULL,
	`photo_media_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_team_number_idx` ON `team_members` (`team_id`,`number`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`league_name` text,
	`short_name` text,
	`primary_color` text,
	`secondary_color` text,
	`logo_media_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`logo_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
```

- [ ] **Step 4: Write the media store, and wire it in.**

Create `rcl-core/server/src/media.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { eq, inArray, isNotNull } from 'drizzle-orm';
import type { ImageType } from '@rollcall/core-contract';
import type { AppDatabase, Queryable } from './db.ts';
import { media, MEDIA_REFERENCES } from './db/schema.ts';

// Uploaded images (ADR-0022): team logos and member photos now, theme and screen images later. Each is a file in the
// media folder named by its id, with a row saying its type. Images are public at /media/<id> so OBS overlays, which
// have no session, can load them: the id is 128 random bits, so an address can't be guessed, and nothing lists them.

const MEDIA_ID = /^[0-9a-f]{32}$/;
const UPLOADING = '.uploading';

/** Where an image is served. */
export const mediaUrl = (id: string | null): string | null => (id === null ? null : `/media/${id}`);

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  bytes.length >= at + prefix.length && prefix.every((byte, i) => bytes[at + i] === byte);
const ascii = (text: string) => Array.from(Buffer.from(text, 'latin1'));

/** The type an image's first bytes show it to be, or undefined when they aren't a PNG, JPEG or WebP. */
export function imageTypeOf(bytes: Uint8Array): ImageType | undefined {
  if (startsWith(bytes, [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return undefined;
}

/**
 * Saves an upload as a new image: its file, then its row. Returns its id, or null when the bytes aren't a PNG, JPEG
 * or WebP, saving nothing. The caller then points a logo or photo at it.
 */
export function saveMedia(db: Queryable, dir: string, bytes: Uint8Array): string | null {
  const contentType = imageTypeOf(bytes);
  if (!contentType) return null;
  mkdirSync(dir, { recursive: true });
  const id = randomBytes(16).toString('hex');
  // Written under a temporary name first, so a crash mid-write leaves nothing under a real id.
  writeFileSync(join(dir, `${id}${UPLOADING}`), bytes);
  renameSync(join(dir, `${id}${UPLOADING}`), join(dir, id));
  db.insert(media).values({ id, contentType, size: bytes.length, createdAt: new Date().toISOString() }).run();
  return id;
}

/** Deletes images, rows and files, once nothing points at them any more. Nulls are skipped. */
export function removeMedia(db: Queryable, dir: string, ids: readonly (string | null)[]): void {
  const doomed = ids.filter((id): id is string => id !== null);
  if (doomed.length === 0) return;
  db.delete(media).where(inArray(media.id, doomed)).run();
  for (const id of doomed) rmSync(join(dir, id), { force: true });
}

/**
 * Cleans up after a crash, at startup: deletes files with no row (including half-written uploads), rows with no file,
 * and rows nothing refers to. Returns how many of each it removed.
 */
export function sweepMedia(db: AppDatabase, dir: string): { files: number; rows: number } {
  mkdirSync(dir, { recursive: true });
  const referenced = new Set(
    MEDIA_REFERENCES.flatMap(({ table, column }) =>
      db
        .select({ id: column })
        .from(table)
        .where(isNotNull(column))
        .all()
        .flatMap(({ id }) => (id === null ? [] : [id])),
    ),
  );
  const files = new Set(readdirSync(dir));
  const rows = db.select({ id: media.id }).from(media).all();
  const orphanRows = rows.filter(({ id }) => !referenced.has(id) || !files.has(id)).map(({ id }) => id);
  if (orphanRows.length > 0) db.delete(media).where(inArray(media.id, orphanRows)).run();
  const kept = new Set(rows.map(({ id }) => id).filter((id) => !orphanRows.includes(id)));
  const orphanFiles = [...files].filter((name) => !kept.has(name));
  for (const name of orphanFiles) rmSync(join(dir, name), { force: true, recursive: true });
  return { files: orphanFiles.length, rows: orphanRows.length };
}

// Serves images at /media/<id>, to anyone (ADR-0022). An id that isn't 32 hex characters never reaches the file system.
// The replies can only ever be images: the type comes from the row, which saveMedia set from the file's own bytes.
export function serveMedia(app: FastifyInstance, { db, dir }: { db: AppDatabase; dir: string }): void {
  app.get<{ Params: { id: string } }>('/media/:id', async (request, reply) => {
    const { id } = request.params;
    const row = MEDIA_ID.test(id) ? db.select().from(media).where(eq(media.id, id)).get() : undefined;
    const file = join(dir, id);
    if (!row || !existsSync(file)) return reply.code(404).send({ error: 'not_found' });
    return reply
      .type(row.contentType)
      .header('content-length', row.size)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'")
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(file));
  });
}
```

In `rcl-core/server/src/app.ts`:

Replace:

```ts
import { installAuth } from './auth/guard.ts';
```
with:

```ts
import { installAuth } from './auth/guard.ts';
import { serveMedia } from './media.ts';
```


Replace:

```ts
  db: AppDatabase;
```
with:

```ts
  db: AppDatabase;
  /** Where uploaded images live: media/ in the data folder (ADR-0022). Created when the first one is saved. */
  mediaDir: string;
```


Replace:

```ts
  db,
  coreWebDir,
```
with:

```ts
  db,
  mediaDir,
  coreWebDir,
```


Replace:

```ts
  });

  const webPage = serveWebApps(app, hosted.webApps);
```
with:

```ts
  });

  serveMedia(app, { db, dir: mediaDir });
  const webPage = serveWebApps(app, hosted.webApps);
```


Replace `rcl-core/server/src/server.ts` with:

```ts
import { join } from 'node:path';
import type { Server } from 'socket.io';
import { buildApp } from './app.ts';
import { dummyHash } from './auth/passwords.ts';
import { purgeExpiredSessions } from './auth/sessions.ts';
import type { ServerConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { sweepMedia } from './media.ts';
import { attachRealtime } from './realtime.ts';
import { INSTALLED_APPS } from './installed-apps.ts';

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

// Wires the database, HTTP API and Socket.IO onto one port.
export async function startServer(
  config: ServerConfig,
  { version, logger = true }: { version: string; logger?: boolean },
): Promise<RunningServer> {
  const { db, sqlite } = openDatabase(config.dataDir);
  const mediaDir = join(config.dataDir, 'media');
  const app = buildApp({
    version,
    logger,
    db,
    mediaDir,
    coreWebDir: config.webDir,
    apps: INSTALLED_APPS,
    apiDocs: config.apiDocs,
  });

  // Images a crash left half-saved or orphaned (ADR-0022).
  const swept = sweepMedia(db, mediaDir);
  if (swept.files > 0 || swept.rows > 0) app.log.info(swept, 'Removed leftover media');

  // Expired sessions are already ignored; this just keeps the table small.
  purgeExpiredSessions(db);
  const purgeTimer = setInterval(
    () => {
      try {
        purgeExpiredSessions(db);
      } catch (error) {
        app.log.error({ err: error }, 'Expired-session purge failed');
      }
    },
    60 * 60 * 1000,
  );
  purgeTimer.unref();

  // Drop live connections first, or closing the HTTP server waits on them forever. Close the
  // transports rather than calling disconnectSockets(): clients treat a server "disconnect" as a
  // deliberate kick and never reconnect, which would leave OBS overlays stale after a restart.
  let io: Server | undefined;
  app.addHook('preClose', async () => {
    io?.engine.close();
  });
  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    sqlite.close();
  });

  try {
    io = attachRealtime(app.server, { db, log: app.log, hosted: app.hostedApps });
    // Hash the stand-in password now, so the first failed login takes as long as later ones.
    await dummyHash();
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    // The port is taken, or a route's or namespace's access declaration is wrong: release the database, timer and
    // sockets.
    await app.close();
    throw error;
  }
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error(`Unexpected server address: ${String(address)}`);
  const { port } = address;
  const host = config.host === '0.0.0.0' ? 'localhost' : config.host;
  return { url: `http://${host}:${port}`, close: () => app.close() };
}
```

In `rcl-core/server/src/apps.ts`:

Replace:

```ts
const APP_ID = /^[a-z][a-z0-9-]*$/;
```
with:

```ts
const APP_ID = /^[a-z][a-z0-9-]*$/;
// Ids the server's own paths use, so no app's web build at /<id>/ can collide with them.
const RESERVED_IDS = new Set(['media']);
```


Replace:

```ts
  if (!APP_ID.test(app.id)) return `its id "${app.id}" must be lowercase letters, digits and dashes`;
```
with:

```ts
  if (!APP_ID.test(app.id)) return `its id "${app.id}" must be lowercase letters, digits and dashes`;
  if (RESERVED_IDS.has(app.id)) return `its id "${app.id}" is a path the server uses itself`;
```


- [ ] **Step 5: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server/src/media.test.ts rcl-core/server/src/server.test.ts rcl-core/server/src/apps.test.ts`
Expected: PASS. `yarn test` passes 329.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server
git commit -F - <<'EOF'
feat(rcl-core): media store, and tables for teams and members

Uploaded images live in the data folder's media/, one file per image,
with a row giving its type. saveMedia keeps only real PNG, JPEG or WebP
bytes, and /media/<id> serves them to anyone, so OBS overlays can show
them (ADR-0022, in Task 6). At startup the server sweeps up files and
rows a crash left behind. media is a reserved app id.

Refs #17

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Teams and members

**Files:**
- Create: `rcl-core/server/src/teams/teams.ts`, `rcl-core/server/src/routes/teams.ts`
- Modify: `rcl-core/server/src/core-app.ts`, `rcl-core/server/src/app.ts`, `rcl-core/server/src/openapi.ts` (tag description)
- Test: `rcl-core/server/src/routes/teams.test.ts` (new), `rcl-core/server/src/auth/route-inventory.test.ts`, `rcl-core/server/src/realtime.test.ts` (core needs a media folder)

**Interfaces:**
- Consumes:
  - from Task 1: the schemas, `memberProblem`, `MEMBER_ROLE_NAMES` and `ONE_PER_TEAM`;
  - from Task 2: the tables, `mediaUrl` and `removeMedia`.
- Produces, in `teams/teams.ts`:
  - `listTeams(db): TeamSummary[]`, `findTeam(db, id): Team | undefined` and `findTeamRow(db, id)`;
  - `createTeam(db, details): Team` and `updateTeam(db, id, changes): Team | undefined`, where changes may include `logoMediaId`;
  - `deleteTeam(db, id)`, which returns the team's image ids, or undefined;
  - `findMember(db, teamId, memberId)`;
  - `memberConflict(db, teamId, member, memberId?): { status: 409, error, message } | null`;
  - `addMember(db, teamId, fields): Team` and `updateMember(db, teamId, memberId, changes): Team`, where changes may include `photoMediaId`;
  - `deleteMember(db, teamId, memberId): { team, photo }`;
  - `byNumber(a, b)`.
- Produces in the server:
  - `registerTeamRoutes(fastify, { db, mediaDir })`, and the teams routes below `/api/core/teams`;
  - `coreApp({ version, db, mediaDir, webDir? })`.

- [ ] **Step 1: Write the failing tests.**

Create `rcl-core/server/src/routes/teams.test.ts`:

```ts
import { readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { TeamSchema, TeamSummarySchema, type Role, type Team } from '@rollcall/core-contract';
import { createApiKey } from '../auth/api-keys.ts';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { media, teamMembers, teams } from '../db/schema.ts';
import { saveMedia } from '../media.ts';
import { addUser, IMAGES, testApp } from '../testing.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// An app with someone signed in as `role`, and a way to call it as them.
async function as(role: Role = 'producer') {
  const { app, db, mediaDir } = testApp();
  opened.push(app);
  const user = await addUser(db, `${role}1`, 'correct horse', role);
  const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
  const call = (method: InjectOptions['method'], url: string, payload?: object) =>
    app.inject({ method, url: `/api/core${url}`, cookies, ...(payload ? { payload } : {}) });
  const team = async (payload: object = { name: 'All Stars' }) =>
    TeamSchema.parse((await call('POST', '/teams', payload)).json());
  const member = async (teamId: string, payload: object) => call('POST', `/teams/${teamId}/members`, payload);
  return { app, db, mediaDir, call, team, member };
}

const skater = (name: string, number: string, more: object = {}) => ({ kind: 'skater', name, number, ...more });
const numbersOf = (team: Team) => team.members.map((m) => m.number ?? m.name);

describe('teams', () => {
  it('creates, lists, shows, changes and deletes a team', async () => {
    const { call, team } = await as();
    const created = await team({ name: ' All Stars ', leagueName: 'Rose City Rollers', primaryColor: '#AA0000' });
    expect(created).toMatchObject({
      name: 'All Stars',
      leagueName: 'Rose City Rollers',
      shortName: null,
      primaryColor: '#aa0000',
      secondaryColor: null,
      logoUrl: null,
      members: [],
    });
    await team({ name: 'B Team' });
    const listed = TeamSummarySchema.array().parse((await call('GET', '/teams')).json());
    expect(listed.map((t) => [t.name, t.skaterCount, t.benchCount])).toEqual([
      ['All Stars', 0, 0],
      ['B Team', 0, 0],
    ]);
    expect(TeamSchema.parse((await call('GET', `/teams/${created.id}`)).json())).toEqual(created);

    const changed = await call('PATCH', `/teams/${created.id}`, { shortName: 'RCR', leagueName: null });
    expect(changed.statusCode).toBe(200);
    expect(TeamSchema.parse(changed.json())).toMatchObject({ name: 'All Stars', shortName: 'RCR', leagueName: null });

    expect((await call('DELETE', `/teams/${created.id}`)).statusCode).toBe(204);
    expect((await call('GET', `/teams/${created.id}`)).statusCode).toBe(404);
  });

  it('answers 404 for a team that does not exist', async () => {
    const { call } = await as();
    for (const [method, payload] of [['GET'], ['PATCH', { name: 'X' }], ['DELETE']] as const) {
      const res = await call(method, '/teams/no-such-team', payload);
      expect(res.statusCode, method).toBe(404);
      expect(res.json(), method).toEqual({ error: 'not_found' });
    }
    expect((await call('POST', '/teams/no-such-team/members', skater('Jammy', '7'))).statusCode).toBe(404);
  });

  it('refuses a team with no name, in plain words', async () => {
    const { call } = await as();
    expect((await call('POST', '/teams', { name: '  ' })).json()).toEqual({
      error: 'validation_failed',
      message: 'Give the team a name',
    });
  });
});

describe('members', () => {
  it('lists skaters by number, keeping leading zeros, then bench staff by name', async () => {
    const { team, member, call } = await as();
    const { id } = await team();
    for (const [name, number] of [
      ['Twelve', '12'],
      ['Seven', '7'],
      ['Double zero', '00'],
      ['Oh seven', '07'],
      ['Zero', '0'],
    ]) {
      expect((await member(id, skater(name!, number!))).statusCode).toBe(201);
    }
    await member(id, { kind: 'bench', name: 'Zed', roles: ['bench-manager'] });
    await member(id, { kind: 'bench', name: 'Coach Amy', roles: ['bench-coach'] });
    const shown = TeamSchema.parse((await call('GET', `/teams/${id}`)).json());
    expect(numbersOf(shown)).toEqual(['0', '00', '07', '7', '12', 'Coach Amy', 'Zed']);
    const listed = TeamSummarySchema.array().parse((await call('GET', '/teams')).json());
    expect(listed[0]).toMatchObject({ skaterCount: 5, benchCount: 2 });
  });

  it('replies to every change with the whole team, and marks the team updated', async () => {
    const { team, member, call } = await as();
    const before = await team();
    const added = TeamSchema.parse((await member(before.id, skater('Jammy', '7', { pronouns: 'she/her' }))).json());
    expect(added.members).toEqual([
      {
        id: expect.any(String),
        kind: 'skater',
        name: 'Jammy',
        number: '7',
        pronouns: 'she/her',
        roles: [],
        customRoles: [],
        photoUrl: null,
      },
    ]);
    expect(added.updatedAt >= before.updatedAt).toBe(true);
    const memberId = added.members[0]!.id;
    const changed = await call('PATCH', `/teams/${before.id}/members/${memberId}`, {
      roles: ['captain'],
      customRoles: ['MVP'],
    });
    expect(TeamSchema.parse(changed.json()).members[0]).toMatchObject({
      name: 'Jammy',
      roles: ['captain'],
      customRoles: ['MVP'],
    });
    const removed = await call('DELETE', `/teams/${before.id}/members/${memberId}`);
    expect(TeamSchema.parse(removed.json()).members).toEqual([]);
  });

  it('refuses a number another skater has, on add and on change', async () => {
    const { team, member, call } = await as();
    const { id } = await team();
    await member(id, skater('Jammy', '07'));
    expect((await member(id, skater('Seven', '7'))).statusCode).toBe(201);
    const taken = await member(id, skater('Copycat', '07'));
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'number_taken', message: 'Another skater already has number 07' });
    const seven = TeamSchema.parse((await call('GET', `/teams/${id}`)).json()).members.find((m) => m.number === '7')!;
    const change = await call('PATCH', `/teams/${id}/members/${seven.id}`, { number: '07' });
    expect(change.json()).toMatchObject({ error: 'number_taken' });
    // Keeping your own number isn't a clash.
    expect((await call('PATCH', `/teams/${id}/members/${seven.id}`, { number: '7', name: 'Lucky' })).statusCode).toBe(
      200,
    );
  });

  it('lets two teams use the same number', async () => {
    const { team, member } = await as();
    const a = await team({ name: 'A' });
    const b = await team({ name: 'B' });
    expect((await member(a.id, skater('One', '1'))).statusCode).toBe(201);
    expect((await member(b.id, skater('Uno', '1'))).statusCode).toBe(201);
  });

  it('allows one Captain and one Alt captain per team', async () => {
    const { team, member, call } = await as();
    const { id } = await team();
    await member(id, skater('Cap', '1', { roles: ['captain'] }));
    await member(id, skater('Alt', '2', { roles: ['alt-captain'] }));
    const second = await member(id, skater('Wannabe', '3', { roles: ['captain'] }));
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'role_taken', message: 'This team already has a Captain' });
    const alt = TeamSchema.parse((await call('GET', `/teams/${id}`)).json()).members.find((m) => m.name === 'Alt')!;
    expect((await call('PATCH', `/teams/${id}/members/${alt.id}`, { roles: ['captain'] })).json()).toMatchObject({
      error: 'role_taken',
    });
    // Bench roles can be shared.
    await member(id, { kind: 'bench', name: 'Coach A', roles: ['bench-coach'] });
    expect((await member(id, { kind: 'bench', name: 'Coach B', roles: ['bench-coach'] })).statusCode).toBe(201);
  });

  it('checks the member a change makes, such as a skater moving to the bench', async () => {
    const { team, member, call } = await as();
    const { id } = await team();
    const added = TeamSchema.parse((await member(id, skater('Jammy', '7', { roles: ['captain'] }))).json());
    const memberId = added.members[0]!.id;
    const toBench = await call('PATCH', `/teams/${id}/members/${memberId}`, { kind: 'bench' });
    expect(toBench.json()).toEqual({ error: 'validation_failed', message: 'Bench staff have no number' });
    const stillCaptain = await call('PATCH', `/teams/${id}/members/${memberId}`, { kind: 'bench', number: null });
    expect(stillCaptain.json()).toEqual({
      error: 'validation_failed',
      message: "Captain isn't a role for bench staff",
    });
    const moved = await call('PATCH', `/teams/${id}/members/${memberId}`, {
      kind: 'bench',
      number: null,
      roles: ['bench-coach'],
    });
    expect(TeamSchema.parse(moved.json()).members[0]).toMatchObject({
      kind: 'bench',
      number: null,
      roles: ['bench-coach'],
    });
  });

  it("answers 404 for a member that isn't on that team", async () => {
    const { team, member, call } = await as();
    const a = await team({ name: 'A' });
    const b = await team({ name: 'B' });
    const onA = TeamSchema.parse((await member(a.id, skater('Jammy', '7'))).json()).members[0]!;
    expect((await call('PATCH', `/teams/${b.id}/members/${onA.id}`, { name: 'X' })).statusCode).toBe(404);
    expect((await call('DELETE', `/teams/${b.id}/members/${onA.id}`)).statusCode).toBe(404);
  });
});

describe('deleting', () => {
  it("removes a member's photo, and a team's logo and every photo, rows and files", async () => {
    const { team, member, call, db, mediaDir } = await as();
    const { id } = await team();
    const kept = TeamSchema.parse((await member(id, skater('Keeper', '1'))).json()).members[0]!;
    const gone = TeamSchema.parse((await member(id, skater('Leaver', '2'))).json()).members.find(
      (m) => m.name === 'Leaver',
    )!;
    const logo = saveMedia(db, mediaDir, IMAGES.png)!;
    const keptPhoto = saveMedia(db, mediaDir, IMAGES.jpeg)!;
    const gonePhoto = saveMedia(db, mediaDir, IMAGES.webp)!;
    db.update(teams).set({ logoMediaId: logo }).run();
    db.update(teamMembers).set({ photoMediaId: keptPhoto }).where(eq(teamMembers.id, kept.id)).run();
    db.update(teamMembers).set({ photoMediaId: gonePhoto }).where(eq(teamMembers.id, gone.id)).run();

    await call('DELETE', `/teams/${id}/members/${gone.id}`);
    expect(readdirSync(mediaDir).toSorted()).toEqual([logo, keptPhoto].toSorted());

    await call('DELETE', `/teams/${id}`);
    expect(readdirSync(mediaDir)).toEqual([]);
    expect(db.select().from(media).all()).toEqual([]);
    expect(db.select().from(teamMembers).all()).toEqual([]);
  });
});

describe('who may do what', () => {
  it('lets an Announcer look, and refuses every change', async () => {
    const { call, db } = await as('announcer');
    const now = new Date().toISOString();
    db.insert(teams).values({ id: 't1', name: 'All Stars', createdAt: now, updatedAt: now }).run();
    expect((await call('GET', '/teams')).statusCode).toBe(200);
    expect((await call('GET', '/teams/t1')).statusCode).toBe(200);
    for (const [method, url, payload] of [
      ['POST', '/teams', { name: 'Mine' }],
      ['PATCH', '/teams/t1', { name: 'Mine' }],
      ['DELETE', '/teams/t1'],
      ['POST', '/teams/t1/members', skater('Me', '1')],
    ] as const) {
      expect((await call(method, url, payload)).json(), `${method} ${url}`).toEqual({ error: 'forbidden' });
    }
  });

  it('lets an API key holding only teams.read look, and nothing more', async () => {
    const { app, db } = testApp();
    opened.push(app);
    const { key } = createApiKey(db, {
      name: 'Companion',
      permissions: ['core:teams.read'],
      expiresIn: 'never',
      createdBy: 'admin',
    });
    const headers = { authorization: `Bearer ${key}` };
    expect((await app.inject({ method: 'GET', url: '/api/core/teams', headers })).statusCode).toBe(200);
    const create = await app.inject({ method: 'POST', url: '/api/core/teams', headers, payload: { name: 'X' } });
    expect(create.json()).toEqual({ error: 'forbidden' });
  });
});
```

The route inventory's API key sweep now finds real routes a key may call, so its test app goes:

In `rcl-core/server/src/auth/route-inventory.test.ts`:

Delete:

```ts
import type { AppModule } from '@rollcall/app-sdk';
```


Replace:

```ts
const wrongKey = async (): Promise<Credentials> => ({ headers: { authorization: 'Bearer rcl_not-a-real-key' } });

// A hosted app with a permission an API key may hold, so the key sweeps have a route a key may call.
const KEYS_PROBE_APP: AppModule = {
  id: 'probe',
  title: 'Probe',
  version: '1.0.0',
  requiresCore: '*',
  permissions: [{ key: 'probe:things.read', summary: 'Read things', roles: [] }],
  register(api) {
    api.get('/things', { config: { access: { permission: 'probe:things.read' } } }, async () => ({ things: [] }));
  },
};
```
with:

```ts
const wrongKey = async (): Promise<Credentials> => ({ headers: { authorization: 'Bearer rcl_not-a-real-key' } });
```


Replace:

```ts
    const inv = await inventory({ apps: [...INSTALLED_APPS, KEYS_PROBE_APP] });
```
with:

```ts
    const inv = await inventory();
```


Replace:

```ts
    expect(keysOf(callable)).toEqual(['GET /api/probe/things']);
    for (const route of callable) expect((await inv.send(route, await key())).statusCode, route.key).toBe(200);
```
with:

```ts
    expect(keysOf(callable)).toEqual([
      'DELETE /api/core/teams/:id',
      'DELETE /api/core/teams/:id/members/:memberId',
      'GET /api/core/teams',
      'GET /api/core/teams/:id',
      'PATCH /api/core/teams/:id',
      'PATCH /api/core/teams/:id/members/:memberId',
      'POST /api/core/teams',
      'POST /api/core/teams/:id/members',
    ]);
    // A key gets through to each: no team exists, so most answer 404 or 400, but none refuses the key.
    const refusals = [];
    for (const route of callable) {
      const { statusCode } = await inv.send(route, await key());
      if (statusCode === 401 || statusCode === 403) refusals.push(`${route.key} → ${statusCode}`);
    }
    expect(refusals).toEqual([]);
    const list = callable.find((route) => route.key === 'GET /api/core/teams' && route.method === 'GET')!;
    expect((await inv.send(list, await key())).statusCode).toBe(200);
```


- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server/src/routes/teams.test.ts rcl-core/server/src/auth/route-inventory.test.ts`
Expected: FAIL, 13 tests. There are no teams routes yet: they answer `404`, and a key may call no route.

- [ ] **Step 3: Write the data access and the routes.**

Create `rcl-core/server/src/teams/teams.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import {
  MEMBER_ROLE_NAMES,
  ONE_PER_TEAM,
  type CreateTeamRequestSchema,
  type MemberFields,
  type Team,
  type TeamMember,
  type TeamSummary,
} from '@rollcall/core-contract';
import type { z } from 'zod';
import type { Queryable } from '../db.ts';
import { teamMembers, teams } from '../db/schema.ts';
import { mediaUrl } from '../media.ts';

// Teams and their members (docs/features/team-builder.md). Logos and photos are media (ADR-0022): a team or member
// holds an image's id, and the routes save and remove the images themselves.

type TeamRow = typeof teams.$inferSelect;
type MemberRow = typeof teamMembers.$inferSelect;
export type TeamDetails = z.output<typeof CreateTeamRequestSchema>;

// Skaters by number, numbers compared as people read them (7 before 12), then bench staff by name.
const NUMBERS = new Intl.Collator('en', { numeric: true });
const NAMES = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const plainOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const byNumber = (a: string, b: string) => NUMBERS.compare(a, b) || plainOrder(a, b);
const memberOrder = (a: MemberRow, b: MemberRow) => {
  if (a.kind !== b.kind) return a.kind === 'skater' ? -1 : 1;
  if (a.kind === 'skater') return byNumber(a.number ?? '', b.number ?? '');
  return NAMES.compare(a.name, b.name) || plainOrder(a.name, b.name);
};

const toMember = (row: MemberRow): TeamMember => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  number: row.number,
  pronouns: row.pronouns,
  roles: row.roles,
  customRoles: row.customRoles,
  photoUrl: mediaUrl(row.photoMediaId),
});

const teamFields = (row: TeamRow) => ({
  id: row.id,
  name: row.name,
  leagueName: row.leagueName,
  shortName: row.shortName,
  primaryColor: row.primaryColor,
  secondaryColor: row.secondaryColor,
  logoUrl: mediaUrl(row.logoMediaId),
  updatedAt: row.updatedAt,
});

const membersOf = (db: Queryable, teamId: string) =>
  db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all();

/** Every team, by name, with how many skaters and bench staff each has. */
export function listTeams(db: Queryable): TeamSummary[] {
  const counts = db
    .select({ teamId: teamMembers.teamId, kind: teamMembers.kind, members: count() })
    .from(teamMembers)
    .groupBy(teamMembers.teamId, teamMembers.kind)
    .all();
  const countOf = (teamId: string, kind: MemberRow['kind']) =>
    counts.find((row) => row.teamId === teamId && row.kind === kind)?.members ?? 0;
  return db
    .select()
    .from(teams)
    .all()
    .toSorted((a, b) => NAMES.compare(a.name, b.name) || plainOrder(a.name, b.name))
    .map((row) =>
      Object.assign(teamFields(row), { skaterCount: countOf(row.id, 'skater'), benchCount: countOf(row.id, 'bench') }),
    );
}

export const findTeamRow = (db: Queryable, id: string): TeamRow | undefined =>
  db.select().from(teams).where(eq(teams.id, id)).get();

/** A team with its members in order, or undefined when there's no such team. */
export function findTeam(db: Queryable, id: string): Team | undefined {
  const row = findTeamRow(db, id);
  if (!row) return undefined;
  return {
    ...teamFields(row),
    createdAt: row.createdAt,
    members: membersOf(db, id).toSorted(memberOrder).map(toMember),
  };
}

// The team a change was just made to, which therefore exists.
function changedTeam(db: Queryable, id: string): Team {
  const team = findTeam(db, id);
  if (!team) throw new Error(`Team ${id} vanished during a change`);
  return team;
}

export function createTeam(db: Queryable, details: TeamDetails): Team {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.insert(teams)
    .values({ id, ...details, createdAt: now, updatedAt: now })
    .run();
  return changedTeam(db, id);
}

/** Changes a team's details, and marks it updated. Returns the team, or undefined when there's no such team. */
export function updateTeam(
  db: Queryable,
  id: string,
  changes: Partial<TeamDetails> & { logoMediaId?: string | null },
): Team | undefined {
  const result = db
    .update(teams)
    .set({ ...changes, updatedAt: new Date().toISOString() })
    .where(eq(teams.id, id))
    .run();
  return result.changes > 0 ? changedTeam(db, id) : undefined;
}

/** Deletes a team and its members. Returns the ids of the images they had, for the caller to remove. */
export function deleteTeam(db: Queryable, id: string): (string | null)[] | undefined {
  const row = findTeamRow(db, id);
  if (!row) return undefined;
  const photos = membersOf(db, id).map((member) => member.photoMediaId);
  db.delete(teams).where(eq(teams.id, id)).run();
  return [row.logoMediaId, ...photos];
}

export const findMember = (db: Queryable, teamId: string, memberId: string): MemberRow | undefined =>
  db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
    .get();

/** Why `member` can't join or stay on a team: another skater has its number, or another member its one-per-team role. */
export function memberConflict(
  db: Queryable,
  teamId: string,
  member: MemberFields,
  memberId?: string,
): { status: 409; error: 'number_taken' | 'role_taken'; message: string } | null {
  const others = membersOf(db, teamId).filter((other) => other.id !== memberId);
  if (member.number !== null && others.some((other) => other.number === member.number)) {
    return { status: 409, error: 'number_taken', message: `Another skater already has number ${member.number}` };
  }
  const taken = member.roles.find((role) => ONE_PER_TEAM.includes(role) && others.some((o) => o.roles.includes(role)));
  if (taken)
    return { status: 409, error: 'role_taken', message: `This team already has a ${MEMBER_ROLE_NAMES[taken]}` };
  return null;
}

/** Adds a member to a team, marks the team updated and returns it. The caller has checked memberConflict. */
export function addMember(db: Queryable, teamId: string, fields: MemberFields): Team {
  const now = new Date().toISOString();
  db.insert(teamMembers)
    .values({
      id: randomUUID(),
      teamId,
      ...fields,
      roles: [...fields.roles],
      customRoles: [...fields.customRoles],
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return touchTeam(db, teamId);
}

/** Changes a member, marks the team updated and returns it. The caller has checked memberProblem and memberConflict. */
export function updateMember(
  db: Queryable,
  teamId: string,
  memberId: string,
  changes: Partial<MemberFields> & { photoMediaId?: string | null },
): Team {
  const { roles, customRoles, ...rest } = changes;
  db.update(teamMembers)
    .set({
      ...rest,
      ...(roles ? { roles: [...roles] } : {}),
      ...(customRoles ? { customRoles: [...customRoles] } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
    .run();
  return touchTeam(db, teamId);
}

/** Removes a member and marks the team updated. Returns the team, and their photo's id for the caller to remove. */
export function deleteMember(db: Queryable, teamId: string, memberId: string): { team: Team; photo: string | null } {
  const member = findMember(db, teamId, memberId);
  db.delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
    .run();
  return { team: touchTeam(db, teamId), photo: member?.photoMediaId ?? null };
}

// Marks a team updated after a change to its members, and returns it.
function touchTeam(db: Queryable, teamId: string): Team {
  db.update(teams).set({ updatedAt: new Date().toISOString() }).where(eq(teams.id, teamId)).run();
  return changedTeam(db, teamId);
}
```

Create `rcl-core/server/src/routes/teams.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateMemberRequestSchema,
  CreateTeamRequestSchema,
  memberProblem,
  TeamSchema,
  TeamSummarySchema,
  UpdateMemberRequestSchema,
  UpdateTeamRequestSchema,
  type MemberFields,
} from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import type { Access } from '../auth/access.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { removeMedia } from '../media.ts';
import {
  addMember,
  createTeam,
  deleteMember,
  deleteTeam,
  findMember,
  findTeam,
  listTeams,
  memberConflict,
  updateMember,
  updateTeam,
} from '../teams/teams.ts';

const READ: { config: { access: Access } } = { config: { access: { permission: 'core:teams.read' } } };
const MANAGE: { config: { access: Access } } = { config: { access: { permission: 'core:teams.manage' } } };
const TeamParamsSchema = z.strictObject({ id: z.string() });
const MemberParamsSchema = z.strictObject({ id: z.string(), memberId: z.string() });
const NOT_FOUND = { error: 'not_found' };
const TAGS = ['core/teams'];

// Teams and their members (docs/features/team-builder.md): anyone holding core:teams.read may look, and
// core:teams.manage may change them. Every change replies with the whole team, members in order, so the editor shows
// what the server has. Checks run with no `await` before their write, so two requests can't both take a number.
export function registerTeamRoutes(fastify: FastifyInstance, { db, mediaDir }: { db: AppDatabase; mediaDir: string }) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/teams',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'List teams, by name',
        response: { 200: TeamSummarySchema.array(), ...ERROR_RESPONSES },
      },
    },
    async () => listTeams(db),
  );

  api.get(
    '/teams/:id',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'A team with its members: skaters by number, then bench staff by name',
        params: TeamParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => findTeam(db, request.params.id) ?? reply.code(404).send(NOT_FOUND),
  );

  api.post(
    '/teams',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Create a team',
        body: CreateTeamRequestSchema,
        response: { 201: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => reply.code(201).send(createTeam(db, request.body)),
  );

  api.patch(
    '/teams/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: "Change a team's details: a missing field stays as it is, and null clears it",
        params: TeamParamsSchema,
        body: UpdateTeamRequestSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => updateTeam(db, request.params.id, request.body) ?? reply.code(404).send(NOT_FOUND),
  );

  api.delete(
    '/teams/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Delete a team, with its members, logo and photos',
        params: TeamParamsSchema,
        response: { 204: z.undefined(), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const images = deleteTeam(db, request.params.id);
      if (!images) return reply.code(404).send(NOT_FOUND);
      removeMedia(db, mediaDir, images);
      return reply.code(204).send();
    },
  );

  api.post(
    '/teams/:id/members',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Add a skater or member of bench staff',
        params: TeamParamsSchema,
        body: CreateMemberRequestSchema,
        response: { 201: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!findTeam(db, id)) return reply.code(404).send(NOT_FOUND);
      const conflict = memberConflict(db, id, request.body);
      if (conflict) return reply.code(conflict.status).send({ error: conflict.error, message: conflict.message });
      return reply.code(201).send(addMember(db, id, request.body));
    },
  );

  api.patch(
    '/teams/:id/members/:memberId',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Change a member: a missing field stays as it is',
        params: MemberParamsSchema,
        body: UpdateMemberRequestSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      const member = findMember(db, id, memberId);
      if (!member) return reply.code(404).send(NOT_FOUND);
      const changed: MemberFields = { ...member, ...request.body };
      const problem = memberProblem(changed);
      if (problem) return reply.code(400).send({ error: 'validation_failed', message: problem.message });
      const conflict = memberConflict(db, id, changed, memberId);
      if (conflict) return reply.code(conflict.status).send({ error: conflict.error, message: conflict.message });
      return updateMember(db, id, memberId, request.body);
    },
  );

  api.delete(
    '/teams/:id/members/:memberId',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Remove a member, with their photo',
        params: MemberParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      if (!findMember(db, id, memberId)) return reply.code(404).send(NOT_FOUND);
      const { team, photo } = deleteMember(db, id, memberId);
      removeMedia(db, mediaDir, [photo]);
      return team;
    },
  );
}
```

In `rcl-core/server/src/core-app.ts`:

Replace:

```ts
import { registerSetupRoutes } from './routes/setup.ts';
```
with:

```ts
import { registerSetupRoutes } from './routes/setup.ts';
import { registerTeamRoutes } from './routes/teams.ts';
```


Replace:

```ts
export function coreApp({ version, db, webDir }: { version: string; db: AppDatabase; webDir?: string }): AppModule {
```
with:

```ts
export function coreApp({
  version,
  db,
  mediaDir,
  webDir,
}: {
  version: string;
  db: AppDatabase;
  mediaDir: string;
  webDir?: string;
}): AppModule {
```


Replace:

```ts
      registerApiKeyRoutes(fastify, db);
```
with:

```ts
      registerApiKeyRoutes(fastify, db);
      registerTeamRoutes(fastify, { db, mediaDir });
```


In `rcl-core/server/src/app.ts`:

Replace:

```ts
    core: coreApp({ version, db, webDir: coreWebDir }),
```
with:

```ts
    core: coreApp({ version, db, mediaDir, webDir: coreWebDir }),
```


In `rcl-core/server/src/openapi.ts`:

Replace:

```ts
        { name: 'core/api-keys', description: 'API keys for devices and scripts (Admin only)' },
```
with:

```ts
        { name: 'core/api-keys', description: 'API keys for devices and scripts (Admin only)' },
        { name: 'core/teams', description: 'Teams, their skaters and bench staff, logos and photos' },
```


In `rcl-core/server/src/realtime.test.ts`:

Replace:

```ts
    core: coreApp({ version: CORE_VERSION, db: database.db }),
```
with:

```ts
    // Live connections never touch images, so the media folder is never made.
    core: coreApp({ version: CORE_VERSION, db: database.db, mediaDir: '/nonexistent/media' }),
```


- [ ] **Step 4: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server/src/routes/teams.test.ts rcl-core/server/src/auth/route-inventory.test.ts`
Expected: PASS. `yarn test` passes 342.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server
git commit -F - <<'EOF'
feat(rcl-core): routes for teams and their members

Create, list, show, change and delete teams, and add, change and remove
skaters and bench staff. Skaters are listed by number, numbers kept as
text; no two skaters share one, and a team has at most one Captain and
one Alt captain. Every change replies with the whole team.

Refs #17

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Logo and photo uploads

**Files:**
- Create: `rcl-core/server/src/routes/team-images.ts`
- Modify: `rcl-core/server/src/core-app.ts`, `rcl-core/server/src/openapi.ts`
- Test: `rcl-core/server/src/routes/team-images.test.ts` (new), `rcl-core/server/src/auth/route-inventory.test.ts`, `rcl-core/server/src/openapi.test.ts`

**Interfaces:**
- Consumes:
  - from Task 2: `saveMedia` and `removeMedia`;
  - from Task 3: `findTeamRow`, `findMember`, `updateTeam` and `updateMember`.
- Produces:
  - `PUT` and `DELETE` on `/api/core/teams/:id/logo` and on `/api/core/teams/:id/members/:memberId/photo`, each replying `200 Team`;
  - `registerTeamImageRoutes(fastify, { db, mediaDir })`.

- [ ] **Step 1: Write the failing tests.**

Create `rcl-core/server/src/routes/team-images.test.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, TeamSchema, type Role } from '@rollcall/core-contract';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { addUser, IMAGES, testApp } from '../testing.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// An app with a team that has one skater, and `role` signed in.
async function withTeam(role: Role = 'producer') {
  const { app, db, mediaDir } = testApp();
  opened.push(app);
  const user = await addUser(db, `${role}1`, 'correct horse', role);
  const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
  const producer = await addUser(db, 'setup', 'correct horse', 'producer');
  const setup = { [SESSION_COOKIE]: createSession(db, producer.id).token };
  const created = await app.inject({
    method: 'POST',
    url: '/api/core/teams',
    cookies: setup,
    payload: { name: 'All Stars' },
  });
  const teamId = TeamSchema.parse(created.json()).id;
  const added = await app.inject({
    method: 'POST',
    url: `/api/core/teams/${teamId}/members`,
    cookies: setup,
    payload: { kind: 'skater', name: 'Jammy', number: '7' },
  });
  const memberId = TeamSchema.parse(added.json()).members[0]!.id;
  const upload = (url: string, body: Buffer | string, contentType = 'image/png') =>
    app.inject({
      method: 'PUT',
      url: `/api/core${url}`,
      cookies,
      headers: { 'content-type': contentType },
      payload: body,
    });
  const remove = (url: string) => app.inject({ method: 'DELETE', url: `/api/core${url}`, cookies });
  const logo = `/teams/${teamId}/logo`;
  const photo = `/teams/${teamId}/members/${memberId}/photo`;
  return { app, mediaDir, cookies, teamId, memberId, upload, remove, logo, photo };
}

// A PNG padded out to `size` bytes.
const padded = (size: number) => Buffer.concat([IMAGES.png, Buffer.alloc(size - IMAGES.png.length)]);
const mediaIdOf = (url: string | null | undefined) => url?.replace('/media/', '');

describe('team logos', () => {
  it('sets a logo, serves it at its address, and replaces it, deleting the old file', async () => {
    const { app, upload, logo, mediaDir } = await withTeam();
    const first = TeamSchema.parse((await upload(logo, IMAGES.png)).json());
    expect(first.logoUrl).toMatch(/^\/media\/[0-9a-f]{32}$/);
    const served = await app.inject({ method: 'GET', url: first.logoUrl! });
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.rawPayload.equals(IMAGES.png)).toBe(true);

    const second = TeamSchema.parse((await upload(logo, IMAGES.webp, 'image/webp')).json());
    expect(second.logoUrl).not.toBe(first.logoUrl);
    expect(readdirSync(mediaDir)).toEqual([mediaIdOf(second.logoUrl)]);
    expect((await app.inject({ method: 'GET', url: first.logoUrl! })).statusCode).toBe(404);
  });

  it('removes a logo, file and all, and removing it again is fine', async () => {
    const { upload, remove, logo, mediaDir } = await withTeam();
    await upload(logo, IMAGES.jpeg, 'image/jpeg');
    const removed = await remove(logo);
    expect(TeamSchema.parse(removed.json()).logoUrl).toBeNull();
    expect(readdirSync(mediaDir)).toEqual([]);
    expect((await remove(logo)).statusCode).toBe(200);
  });

  it('answers 404 for a team that does not exist', async () => {
    const { upload, remove } = await withTeam();
    expect((await upload('/teams/no-such-team/logo', IMAGES.png)).statusCode).toBe(404);
    expect((await remove('/teams/no-such-team/logo')).statusCode).toBe(404);
  });
});

describe('member photos', () => {
  it('sets, replaces and removes a photo, leaving no old files behind', async () => {
    const { upload, remove, photo, mediaDir } = await withTeam();
    const first = TeamSchema.parse((await upload(photo, IMAGES.png)).json()).members[0]!;
    expect(first.photoUrl).toMatch(/^\/media\/[0-9a-f]{32}$/);
    const second = TeamSchema.parse((await upload(photo, IMAGES.jpeg, 'image/jpeg')).json()).members[0]!;
    expect(readdirSync(mediaDir)).toEqual([mediaIdOf(second.photoUrl)]);
    const removed = TeamSchema.parse((await remove(photo)).json()).members[0]!;
    expect(removed.photoUrl).toBeNull();
    expect(readdirSync(mediaDir)).toEqual([]);
  });

  it("answers 404 for a member that isn't on that team", async () => {
    const { upload, remove, teamId } = await withTeam();
    expect((await upload(`/teams/${teamId}/members/no-such-member/photo`, IMAGES.png)).statusCode).toBe(404);
    expect((await remove(`/teams/${teamId}/members/no-such-member/photo`)).statusCode).toBe(404);
  });
});

describe('what an upload may be', () => {
  it('keeps an image as the type its bytes show, whatever it was labelled', async () => {
    const { app, upload, logo } = await withTeam();
    const team = TeamSchema.parse((await upload(logo, IMAGES.jpeg, 'image/png')).json());
    expect((await app.inject({ method: 'GET', url: team.logoUrl! })).headers['content-type']).toBe('image/jpeg');
  });

  it('refuses anything that is not a PNG, JPEG or WebP, by its bytes or its type, saving nothing', async () => {
    const { upload, logo, mediaDir } = await withTeam();
    for (const [body, type] of [
      ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/png'],
      ['<!doctype html><script>alert(1)</script>', 'image/jpeg'],
      ['just text', 'image/webp'],
      [IMAGES.png, 'image/gif'],
      [IMAGES.png, 'image/svg+xml'],
      [IMAGES.png, 'application/octet-stream'],
      ['{}', 'application/json'],
    ] as const) {
      const res = await upload(logo, body, type);
      expect(res.statusCode, type).toBe(415);
      expect(res.json(), type).toEqual({ error: 'unsupported_image', message: 'Use a PNG, JPEG or WebP image' });
    }
    // Nothing was ever saved, so the media folder was never made.
    expect(existsSync(mediaDir)).toBe(false);
  });

  it('accepts an image of exactly 5 MB and refuses one a byte over', async () => {
    const { upload, logo } = await withTeam();
    expect((await upload(logo, padded(MAX_IMAGE_BYTES))).statusCode).toBe(200);
    const tooBig = await upload(logo, padded(MAX_IMAGE_BYTES + 1));
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json()).toEqual({ error: 'too_large', message: 'That image is over 5 MB' });
  });
});

describe('who may upload', () => {
  it('refuses an Announcer, and anyone not signed in', async () => {
    const { app, upload, remove, logo, photo } = await withTeam('announcer');
    expect((await upload(logo, IMAGES.png)).json()).toEqual({ error: 'forbidden' });
    expect((await remove(photo)).json()).toEqual({ error: 'forbidden' });
    const anonymous = await app.inject({
      method: 'PUT',
      url: `/api/core${logo}`,
      headers: { 'content-type': 'image/png' },
      payload: IMAGES.png,
    });
    expect(anonymous.json()).toEqual({ error: 'unauthenticated' });
  });
});
```

In `rcl-core/server/src/auth/route-inventory.test.ts`:

Replace:

```ts
      'DELETE /api/core/teams/:id/members/:memberId',
```
with:

```ts
      'DELETE /api/core/teams/:id/logo',
      'DELETE /api/core/teams/:id/members/:memberId',
      'DELETE /api/core/teams/:id/members/:memberId/photo',
```


Replace:

```ts
      'POST /api/core/teams/:id/members',
```
with:

```ts
      'POST /api/core/teams/:id/members',
      'PUT /api/core/teams/:id/logo',
      'PUT /api/core/teams/:id/members/:memberId/photo',
```


In `rcl-core/server/src/openapi.test.ts`:

Replace:

```ts
  });

  it('says when an API key that holds the permission may call an operation too', async () => {
```
with:

```ts
  });

  it("documents an upload's body as a file of each image type it accepts, so Try it out offers a file picker", async () => {
    const { app } = testApp({ apiDocs: true });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    for (const path of ['/api/core/teams/{id}/logo', '/api/core/teams/{id}/members/{memberId}/photo']) {
      const content = at(doc, 'paths', path, 'put', 'requestBody', 'content');
      expect(Object.keys(content ?? {}), path).toEqual(['image/png', 'image/jpeg', 'image/webp']);
      expect(at(content, 'image/png', 'schema'), path).toEqual({ type: 'string', format: 'binary' });
    }
    // JSON operations keep their own schemas.
    expect(
      at(doc, 'paths', '/api/core/teams', 'post', 'requestBody', 'content', 'application/json', 'schema', 'required'),
    ).toEqual(['name']);
  });

  it('says when an API key that holds the permission may call an operation too', async () => {
```


- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/server/src/routes/team-images.test.ts rcl-core/server/src/auth/route-inventory.test.ts rcl-core/server/src/openapi.test.ts`
Expected: FAIL, 9 tests. There are no upload routes yet: they answer `404`, and the explorer documents no upload body.

- [ ] **Step 3: Write the upload routes, and document their bodies.**

Create `rcl-core/server/src/routes/team-images.ts`:

```ts
import type { FastifyError, FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, TeamSchema } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import type { Access } from '../auth/access.ts';
import { ERROR_RESPONSES, sendApiError } from '../http.ts';
import { removeMedia, saveMedia } from '../media.ts';
import { findMember, findTeamRow, updateMember, updateTeam } from '../teams/teams.ts';

const MANAGE: { config: { access: Access } } = { config: { access: { permission: 'core:teams.manage' } } };
const TeamParamsSchema = z.strictObject({ id: z.string() });
const MemberParamsSchema = z.strictObject({ id: z.string(), memberId: z.string() });
const NOT_FOUND = { error: 'not_found' };
const UNSUPPORTED = { error: 'unsupported_image', message: 'Use a PNG, JPEG or WebP image' };
const TOO_LARGE = { error: 'too_large', message: 'That image is over 5 MB' };
const TAGS = ['core/teams'];

// The upload routes' options: the image arrives as the raw body, up to 5 MB, as one of the image types. The explorer
// lists those types (`consumes`).
const UPLOAD = { ...MANAGE, bodyLimit: MAX_IMAGE_BYTES } as const;

// Team logos and member photos (ADR-0022). An upload is the raw image, with its type as the Content-Type. The server
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
}

function imageRoutes(fastify: FastifyInstance, { db, mediaDir }: { db: AppDatabase; mediaDir: string }) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();
  // The upload as a new image, or null when the body isn't an image (such as JSON, or a renamed SVG).
  const save = (body: unknown) => (Buffer.isBuffer(body) ? saveMedia(db, mediaDir, body) : null);

  api.put(
    '/teams/:id/logo',
    {
      ...UPLOAD,
      schema: {
        tags: TAGS,
        summary: "Set the team's logo: the body is the image (PNG, JPEG or WebP, up to 5 MB)",
        consumes: [...IMAGE_TYPES],
        params: TeamParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const team = findTeamRow(db, request.params.id);
      if (!team) return reply.code(404).send(NOT_FOUND);
      const logo = save(request.body);
      if (!logo) return reply.code(415).send(UNSUPPORTED);
      const updated = updateTeam(db, team.id, { logoMediaId: logo });
      removeMedia(db, mediaDir, [team.logoMediaId]);
      return updated;
    },
  );

  api.delete(
    '/teams/:id/logo',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: "Remove the team's logo",
        params: TeamParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const team = findTeamRow(db, request.params.id);
      if (!team) return reply.code(404).send(NOT_FOUND);
      const updated = updateTeam(db, team.id, { logoMediaId: null });
      removeMedia(db, mediaDir, [team.logoMediaId]);
      return updated;
    },
  );

  api.put(
    '/teams/:id/members/:memberId/photo',
    {
      ...UPLOAD,
      schema: {
        tags: TAGS,
        summary: "Set a member's photo: the body is the image (PNG, JPEG or WebP, up to 5 MB)",
        consumes: [...IMAGE_TYPES],
        params: MemberParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      const member = findMember(db, id, memberId);
      if (!member) return reply.code(404).send(NOT_FOUND);
      const photo = save(request.body);
      if (!photo) return reply.code(415).send(UNSUPPORTED);
      const team = updateMember(db, id, memberId, { photoMediaId: photo });
      removeMedia(db, mediaDir, [member.photoMediaId]);
      return team;
    },
  );

  api.delete(
    '/teams/:id/members/:memberId/photo',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: "Remove a member's photo",
        params: MemberParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      const member = findMember(db, id, memberId);
      if (!member) return reply.code(404).send(NOT_FOUND);
      const team = updateMember(db, id, memberId, { photoMediaId: null });
      removeMedia(db, mediaDir, [member.photoMediaId]);
      return team;
    },
  );
}
```

In `rcl-core/server/src/core-app.ts`:

Replace:

```ts
import { registerSetupRoutes } from './routes/setup.ts';
```
with:

```ts
import { registerSetupRoutes } from './routes/setup.ts';
import { registerTeamImageRoutes } from './routes/team-images.ts';
```


Replace:

```ts
      registerTeamRoutes(fastify, { db, mediaDir });
```
with:

```ts
      registerTeamRoutes(fastify, { db, mediaDir });
      registerTeamImageRoutes(fastify, { db, mediaDir });
```


In `rcl-core/server/src/openapi.ts`:

Replace:

```ts
      const { schema, url } = jsonSchemaTransform(input);
```
with:

```ts
      const { schema: converted, url } = jsonSchemaTransform(input);
      // An upload's body is a file of one of the types it `consumes`, such as a team logo: documented as binary, so
      // "Try it out" offers a file picker. Its route has no body schema, since it's a raw buffer, not JSON.
      const uploads = converted?.consumes !== undefined && converted.body === undefined;
      const schema = uploads ? { ...converted, body: { type: 'string', format: 'binary' } } : converted;
```


- [ ] **Step 4: Run them and see them pass.**

Run: `yarn vitest run rcl-core/server/src/routes/team-images.test.ts rcl-core/server/src/auth/route-inventory.test.ts rcl-core/server/src/openapi.test.ts`
Expected: PASS. `yarn test` passes 352.

- [ ] **Step 5: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/server
git commit -F - <<'EOF'
feat(rcl-core): upload team logos and member photos

PUT the image itself, with its type, to a team's logo or a member's
photo; DELETE removes it. The server keeps an upload only if its bytes
are a PNG, JPEG or WebP, up to 5 MB, and deletes the image it replaces.
The API explorer offers a file picker for them.

Refs #17

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: The admin pages

**Files:**
- Create: `rcl-core/web/src/pages/TeamsPage.tsx`, `rcl-core/web/src/pages/TeamPage.tsx`, `rcl-core/web/src/pages/MemberForm.tsx`, `rcl-core/web/src/pages/MembersTable.tsx`, `rcl-core/web/src/pages/ImagePicker.tsx`, `rcl-core/web/src/pages/MembersTable.stories.tsx`, `rcl-core/web/src/pages/ImagePicker.stories.tsx`
- Modify: `rcl-core/web/src/api.ts`, `rcl-core/web/src/routes.tsx`, `rcl-core/web/.storybook/admin/main.ts`
- Test: `rcl-core/web/src/pages/TeamsPage.test.tsx` and `rcl-core/web/src/pages/TeamPage.test.tsx` (new); `packages/web-sdk/src/testing.ts` (test helpers)

**Interfaces:**
- Consumes:
  - from Task 1: the contract;
  - from Tasks 3 and 4: the routes.
- Produces:
  - hooks in `api.ts`:
    - `useGetTeamsQuery`, `useGetTeamQuery(id)`, `useCreateTeamMutation`, `useDeleteTeamMutation`, `useUpdateTeamMutation({ id, changes })`;
    - `useAddMemberMutation({ id, member })`, `useUpdateMemberMutation({ id, memberId, changes })`, `useRemoveMemberMutation({ id, memberId })`;
    - `useSetLogoMutation({ id, image })`, `useRemoveLogoMutation({ id })`, `useSetPhotoMutation({ id, memberId, image })`, `useRemovePhotoMutation({ id, memberId })`;
  - pages at `/core/teams` and `/core/teams/:id`, and the header link "Teams";
  - `imageProblem(file)` and `GONE`;
  - `ANNOUNCER` from `@rollcall/web-sdk/testing`.

- [ ] **Step 1: Write the failing tests.**

The fake server records image bodies, and the role fixtures hold the permissions they have on the server:

Replace `packages/web-sdk/src/testing.ts` with:

```ts
import { vi } from 'vitest';
import type { CurrentUser, SessionUser, SetupStatus } from '@rollcall/core-contract';

// Test helpers for rcl apps' web tests (`@rollcall/web-sdk/testing`).

type Answer = (request: Request) => Response | Promise<Response>;

/** A request the fake server received. A body that isn't JSON, such as an image, is its text, with its type. */
export interface ReceivedRequest {
  method: string;
  path: string;
  body: unknown;
  contentType?: string | null;
}

const parse = (text: string, contentType: string | null) =>
  contentType?.includes('json') ? { body: JSON.parse(text) as unknown } : { body: text, contentType };

/**
 * Stands in for the Rollcall server: answers each request from `routes`, keyed `'METHOD /path'`, and records it.
 * Anything not listed gets `404 not_found`, as the real server answers an unknown API path.
 */
export function fakeServer(routes: Record<string, Answer>) {
  const requests: ReceivedRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const path = new URL(input.url).pathname;
      const text = await input.clone().text();
      const received = text ? parse(text, input.headers.get('content-type')) : { body: undefined };
      requests.push({ method: input.method, path, ...received });
      const answer = routes[`${input.method} ${path}`];
      return answer ? answer(input) : Response.json({ error: 'not_found' }, { status: 404 });
    }),
  );
  return { requests };
}

export const json =
  (body: unknown, status = 200): Answer =>
  () =>
    Response.json(body, { status });

export const noContent: Answer = () => new Response(null, { status: 204 });

export const HEALTH = { status: 'ok', name: 'Rollcall', version: '0.1.0', uptimeSeconds: 5 };
export const SET_UP: SetupStatus = { needsSetup: false, canSetupHere: true };

export const ADMIN: CurrentUser = {
  id: 'u-admin',
  username: 'admin',
  role: 'admin',
  mustChangePassword: false,
  permissions: ['core:users.manage', 'core:api-keys.manage', 'core:teams.read', 'core:teams.manage'],
};
export const PRODUCER: CurrentUser = {
  id: 'u-producer',
  username: 'producer1',
  role: 'producer',
  mustChangePassword: false,
  permissions: ['core:teams.read', 'core:teams.manage'],
};
export const ANNOUNCER: CurrentUser = {
  id: 'u-announcer',
  username: 'announcer1',
  role: 'announcer',
  mustChangePassword: false,
  permissions: ['core:teams.read'],
};

/** The user as login, setup and password changes reply: without the permissions `me` adds. */
export const asSessionUser = ({ permissions: _permissions, ...user }: CurrentUser): SessionUser => user;

/** A server with one user signed in (or nobody, with `null`), plus `more` routes. */
export function signedIn(user: CurrentUser | null, more: Record<string, Answer> = {}) {
  return fakeServer({
    'GET /api/core/health': json(HEALTH),
    'GET /api/core/setup': json(SET_UP),
    'GET /api/core/auth/me': user ? json(user) : json({ error: 'unauthenticated' }, 401),
    'POST /api/core/auth/logout': noContent,
    ...more,
  });
}
```

Create `rcl-core/web/src/pages/TeamsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { Team, TeamSummary } from '@rollcall/core-contract';
import { ANNOUNCER, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore, whereIs } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const TEAMS: TeamSummary[] = [
  {
    id: 't1',
    name: 'All Stars',
    leagueName: 'Rose City Rollers',
    shortName: 'RCR',
    primaryColor: '#aa0000',
    secondaryColor: '#000000',
    logoUrl: '/media/0123456789abcdef0123456789abcdef',
    skaterCount: 14,
    benchCount: 2,
    updatedAt: '2026-10-23T10:00:00.000Z',
  },
  {
    id: 't2',
    name: 'B Team',
    leagueName: null,
    shortName: null,
    primaryColor: null,
    secondaryColor: null,
    logoUrl: null,
    skaterCount: 0,
    benchCount: 0,
    updatedAt: '2026-10-23T10:00:00.000Z',
  },
];
const NEW_TEAM: Team = {
  id: 't3',
  name: 'Visitors',
  leagueName: null,
  shortName: null,
  primaryColor: null,
  secondaryColor: null,
  logoUrl: null,
  createdAt: '2026-10-23T10:00:00.000Z',
  updatedAt: '2026-10-23T10:00:00.000Z',
  members: [],
};

const rowOf = (name: string) => within(screen.getByRole('table')).getByText(name).closest('tr')!;

describe('the Teams page', () => {
  it('lists each team with its league, short name, colors and member counts, linking to it', async () => {
    signedIn(PRODUCER, { 'GET /api/core/teams': json(TEAMS) });
    openCore('/core/teams');
    await within(await screen.findByRole('table')).findByText('All Stars');
    const stars = within(rowOf('All Stars'));
    expect(stars.getByRole('link', { name: 'All Stars' }).getAttribute('href')).toBe('/core/teams/t1');
    expect(stars.getByText('Rose City Rollers')).toBeTruthy();
    expect(stars.getByText('RCR')).toBeTruthy();
    expect(stars.getByLabelText('Color #aa0000')).toBeTruthy();
    expect(stars.getByText('14')).toBeTruthy();
    expect(stars.getByRole('img', { name: 'All Stars logo' }).getAttribute('src')).toBe(TEAMS[0]!.logoUrl);
    expect(screen.getByRole('link', { name: 'Teams' })).toBeTruthy();
  });

  it('says when there are no teams yet', async () => {
    signedIn(PRODUCER, { 'GET /api/core/teams': json([]) });
    openCore('/core/teams');
    expect(await screen.findByText('No teams yet.')).toBeTruthy();
  });

  it('creates a team from its name, then opens it', async () => {
    const { requests } = signedIn(PRODUCER, {
      'GET /api/core/teams': json(TEAMS),
      'POST /api/core/teams': json(NEW_TEAM, 201),
      'GET /api/core/teams/t3': json(NEW_TEAM),
    });
    const router = openCore('/core/teams');
    fireEvent.change(await screen.findByLabelText('New team'), { target: { value: ' Visitors ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByRole('heading', { name: 'Visitors' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/teams/t3');
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/teams',
      body: { name: 'Visitors', leagueName: null, shortName: null, primaryColor: null, secondaryColor: null },
    });
  });

  it('asks for a name before sending anything', async () => {
    const { requests } = signedIn(PRODUCER, { 'GET /api/core/teams': json(TEAMS) });
    openCore('/core/teams');
    fireEvent.click(await screen.findByRole('button', { name: 'Create team' }));
    expect(await screen.findByText('Give the team a name')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('lets an Announcer look, without the form to create one', async () => {
    signedIn(ANNOUNCER, { 'GET /api/core/teams': json(TEAMS) });
    openCore('/core/teams');
    await within(await screen.findByRole('table')).findByText('All Stars');
    expect(screen.queryByRole('button', { name: 'Create team' })).toBeNull();
  });

  it('hides the page and its link from someone who may not view teams', async () => {
    signedIn({ ...PRODUCER, permissions: [] });
    openCore('/core/teams');
    expect(await screen.findByText("Your account can't view teams.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Teams' })).toBeNull();
  });
});
```

Create `rcl-core/web/src/pages/TeamPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { MAX_IMAGE_BYTES, type Team } from '@rollcall/core-contract';
import { ANNOUNCER, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore, whereIs } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const NOW = '2026-10-23T10:00:00.000Z';
const TEAM: Team = {
  id: 't1',
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  shortName: 'RCR',
  primaryColor: '#aa0000',
  secondaryColor: null,
  logoUrl: null,
  createdAt: NOW,
  updatedAt: NOW,
  members: [
    {
      id: 'm1',
      kind: 'skater',
      name: 'Zero Cool',
      number: '00',
      pronouns: null,
      roles: ['captain'],
      customRoles: [],
      photoUrl: '/media/0123456789abcdef0123456789abcdef',
    },
    {
      id: 'm2',
      kind: 'skater',
      name: 'Jammy',
      number: '7',
      pronouns: 'she/her',
      roles: [],
      customRoles: ['MVP'],
      photoUrl: null,
    },
    {
      id: 'm3',
      kind: 'bench',
      name: 'Coach Amy',
      number: null,
      pronouns: null,
      roles: ['bench-coach'],
      customRoles: [],
      photoUrl: null,
    },
  ],
};
const withMember = (name: string, number: string): Team => ({
  ...TEAM,
  members: [
    ...TEAM.members,
    { id: `new-${number}`, kind: 'skater', name, number, pronouns: null, roles: [], customRoles: [], photoUrl: null },
  ],
});

// The team page for `user`, with `more` server routes.
async function openTeam(user = PRODUCER, more: Parameters<typeof signedIn>[1] = {}) {
  const server = signedIn(user, { 'GET /api/core/teams/t1': json(TEAM), ...more });
  const router = openCore('/core/teams/t1');
  await screen.findByRole('heading', { name: 'All Stars' });
  return { ...server, router };
}

// The skaters' table, and the bench staff's.
const tableAt = (i: number) => within(screen.getAllByRole('table')[i]!);
const skaters = () => tableAt(0);
const bench = () => tableAt(1);
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

// Opens a member's row menu and chooses an item. jsdom has no layout, so Mantine may hide an open menu: its items are
// found whether or not they're hidden.
async function chooseFor(name: string, item: string) {
  fireEvent.click(within(rowOf(name)).getByRole('button', { name: `Actions for ${name}` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: item, hidden: true }));
}

const fileInput = (inside: HTMLElement = document.body) =>
  inside.querySelector<HTMLInputElement>('input[type="file"]')!;
const pickFile = (input: HTMLInputElement, file: File) => fireEvent.change(input, { target: { files: [file] } });
const png = (name = 'logo.png') => new File(['\u0089PNG\r\n\u001a\n'], name, { type: 'image/png' });

describe('the Team page', () => {
  it('shows the details, then the skaters by number and the bench staff, with photos, pronouns and roles', async () => {
    await openTeam();
    expect(screen.getByLabelText<HTMLInputElement>('League').value).toBe('Rose City Rollers');
    const skaterRows = skaters().getAllByRole('row').slice(1);
    expect(skaterRows.map((row) => within(row).getAllByRole('cell')[1]!.textContent)).toEqual(['00', '7']);
    expect(within(rowOf('Zero Cool')).getByText('Captain')).toBeTruthy();
    expect(within(rowOf('Zero Cool')).getByRole('img', { name: 'Photo of Zero Cool' })).toBeTruthy();
    expect(within(rowOf('Jammy')).getByText('she/her')).toBeTruthy();
    expect(within(rowOf('Jammy')).getByText('MVP')).toBeTruthy();
    expect(bench().getByText('Bench coach')).toBeTruthy();
  });

  it('saves the details, sending blank fields as none', async () => {
    const { requests } = await openTeam(PRODUCER, { 'PATCH /api/core/teams/t1': json({ ...TEAM, leagueName: null }) });
    fireEvent.change(screen.getByLabelText('League'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(requests).toContainEqual({
      method: 'PATCH',
      path: '/api/core/teams/t1',
      body: { name: 'All Stars', leagueName: null, shortName: 'RCR', primaryColor: '#aa0000', secondaryColor: null },
    });
  });

  it('says so when someone else deleted the team in the meantime', async () => {
    await openTeam(PRODUCER, { 'PATCH /api/core/teams/t1': json({ error: 'not_found' }, 404) });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(
      await screen.findByText('This team or member no longer exists. Someone else may have deleted it.'),
    ).toBeTruthy();
  });

  it('adds skaters one after another with Save and add another', async () => {
    let added = 0;
    const { requests } = await openTeam(PRODUCER, {
      'POST /api/core/teams/t1/members': () => {
        added += 1;
        return Response.json(added === 1 ? withMember('Blocky', '12') : withMember('Pivot', '21'), { status: 201 });
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blocky' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and add another' }));
    await vi.waitFor(() => expect(within(dialog).getByLabelText<HTMLInputElement>('Name').value).toBe(''));
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Pivot' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '21' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const posted = requests.filter((r) => r.method === 'POST').map((r) => r.body);
    expect(posted).toEqual([
      { kind: 'skater', name: 'Blocky', number: '12', pronouns: null, roles: [], customRoles: [] },
      { kind: 'skater', name: 'Pivot', number: '21', pronouns: null, roles: [], customRoles: [] },
    ]);
  });

  it('asks for a skater’s number before sending anything', async () => {
    const { requests } = await openTeam();
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blocky' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Give the skater a number')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it("shows the server's reason when a number or role is taken, and uploads no photo", async () => {
    const { requests } = await openTeam(PRODUCER, {
      'POST /api/core/teams/t1/members': json(
        { error: 'number_taken', message: 'Another skater already has number 7' },
        409,
      ),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Copycat' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '7' } });
    pickFile(fileInput(dialog), png('copycat.png'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Another skater already has number 7')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it("uploads a new skater's photo once the skater exists", async () => {
    const { requests } = await openTeam(PRODUCER, {
      'POST /api/core/teams/t1/members': json(withMember('Blocky', '12'), 201),
      'PUT /api/core/teams/t1/members/new-12/photo': json(withMember('Blocky', '12')),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blocky' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '12' } });
    pickFile(fileInput(dialog), png('blocky.png'));
    expect(await within(dialog).findByText('blocky.png will be uploaded when you save.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(
      expect.arrayContaining(['POST /api/core/teams/t1/members', 'PUT /api/core/teams/t1/members/new-12/photo']),
    );
  });

  it("edits a member's roles", async () => {
    const { requests } = await openTeam(PRODUCER, { 'PATCH /api/core/teams/t1/members/m2': json(TEAM) });
    await chooseFor('Jammy', 'Edit');
    const dialog = await screen.findByRole('dialog', { name: 'Edit Jammy' });
    fireEvent.click(within(dialog).getByLabelText('Alt captain'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        method: 'PATCH',
        path: '/api/core/teams/t1/members/m2',
        body: {
          kind: 'skater',
          name: 'Jammy',
          number: '7',
          pronouns: 'she/her',
          roles: ['alt-captain'],
          customRoles: ['MVP'],
        },
      }),
    );
  });

  it('keeps a custom role typed without pressing Enter, when the focus moves on to Save', async () => {
    const { requests } = await openTeam(PRODUCER, { 'PATCH /api/core/teams/t1/members/m2': json(TEAM) });
    await chooseFor('Jammy', 'Edit');
    const dialog = await screen.findByRole('dialog', { name: 'Edit Jammy' });
    // As a browser does: focus the field and type, then clicking Save moves the focus away.
    const custom = within(dialog).getByLabelText(/^Custom roles/);
    custom.focus();
    fireEvent.change(custom, { target: { value: 'Lineups' } });
    fireEvent.blur(custom);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ customRoles: ['MVP', 'Lineups'] }),
        }),
      ),
    );
  });

  it('removes a member once you confirm', async () => {
    const { requests } = await openTeam(PRODUCER, { 'DELETE /api/core/teams/t1/members/m2': json(TEAM) });
    await chooseFor('Jammy', 'Remove');
    const confirm = await screen.findByRole('dialog', { name: 'Remove Jammy?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/core/teams/t1/members/m2', body: undefined }),
    );
  });

  it('uploads a logo as the image itself, with its own type', async () => {
    const { requests } = await openTeam(PRODUCER, { 'PUT /api/core/teams/t1/logo': json(TEAM) });
    pickFile(fileInput(), png());
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        method: 'PUT',
        path: '/api/core/teams/t1/logo',
        body: '\u0089PNG\r\n\u001a\n',
        contentType: 'image/png',
      }),
    );
  });

  it('refuses a file that is not an image, or is over 5 MB, before sending it', async () => {
    const { requests } = await openTeam();
    pickFile(fileInput(), new File(['GIF89a'], 'logo.gif', { type: 'image/gif' }));
    expect(await screen.findByText('Use a PNG, JPEG or WebP image')).toBeTruthy();
    pickFile(fileInput(), new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'huge.png', { type: 'image/png' }));
    expect(await screen.findByText('That image is over 5 MB')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it('deletes the team once you confirm, saying what goes with it, then goes back to the list', async () => {
    const { requests, router } = await openTeam(PRODUCER, {
      'DELETE /api/core/teams/t1': () => new Response(null, { status: 204 }),
      'GET /api/core/teams': json([]),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete team' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete All Stars?' });
    expect(
      within(confirm).getByText('Deletes the team, its 3 members, its logo and photos. This cannot be undone.'),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete team' }));
    expect(await screen.findByText('No teams yet.')).toBeTruthy();
    expect(whereIs(router)).toBe('/core/teams');
    expect(requests).toContainEqual({ method: 'DELETE', path: '/api/core/teams/t1', body: undefined });
  });

  it('is read-only for an Announcer', async () => {
    await openTeam(ANNOUNCER);
    expect(screen.getByText('League: Rose City Rollers')).toBeTruthy();
    for (const name of ['Save details', 'Add skater', 'Add bench staff', 'Delete team', 'Actions for Jammy']) {
      expect(screen.queryByRole('button', { name }), name).toBeNull();
    }
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('says when there is no such team', async () => {
    signedIn(PRODUCER, { 'GET /api/core/teams/gone': json({ error: 'not_found' }, 404) });
    openCore('/core/teams/gone');
    expect(await screen.findByText("There's no such team. It may have been deleted.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `yarn vitest run rcl-core/web/src/pages/TeamsPage.test.tsx rcl-core/web/src/pages/TeamPage.test.tsx`
Expected: FAIL, all 21. There are no teams pages: `/core/teams` shows "There's no page at this address".

- [ ] **Step 3: Write the endpoints and the pages.**

Replace `rcl-core/web/src/api.ts` with:

```ts
import {
  ApiKeySchema,
  CreateApiKeyResponseSchema,
  CreateUserResponseSchema,
  GrantablePermissionSchema,
  HostedAppSchema,
  PasswordResetResponseSchema,
  SessionUserSchema,
  TeamSchema,
  TeamSummarySchema,
  UserSchema,
  type ApiKey,
  type ChangePasswordRequest,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
  type CreateMemberRequest,
  type CreateTeamRequest,
  type CreateUserRequest,
  type CreateUserResponse,
  type GrantablePermission,
  type HostedApp,
  type LoginRequest,
  type PasswordResetResponse,
  type Role,
  type SessionUser,
  type SetupRequest,
  type Team,
  type TeamSummary,
  type UpdateMemberRequest,
  type UpdateTeamRequest,
  type User,
} from '@rollcall/core-contract';
import { api } from '@rollcall/web-sdk';

const teamUrl = (id: string) => `core/teams/${encodeURIComponent(id)}`;
const memberUrl = (id: string, memberId: string) => `${teamUrl(id)}/members/${encodeURIComponent(memberId)}`;
const imageHeaders = (image: File) => ({ 'content-type': image.type });
// A change to one team: that team, and the list that summarizes it.
const teamChanged = (_team: unknown, _error: unknown, { id }: { id: string }) => [
  { type: 'Teams' as const, id },
  { type: 'Teams' as const, id: 'LIST' },
];

// rcl-core's own endpoints, added to the shared base API. Each reply is checked against the contract (ADR-0019).
// Body-less POSTs send `{}`: the server refuses an empty body labelled as JSON.
const coreApi = api.enhanceEndpoints({ addTagTypes: ['Users', 'ApiKeys', 'Teams'] }).injectEndpoints({
  endpoints: (build) => ({
    setup: build.mutation<SessionUser, SetupRequest>({
      query: (body) => ({ url: 'core/setup', method: 'POST', body }),
      transformResponse: (response: unknown) => SessionUserSchema.parse(response),
      invalidatesTags: ['Setup', 'Me'],
    }),
    // Someone else may have been signed in on this browser: forget their user list too.
    login: build.mutation<SessionUser, LoginRequest>({
      query: (body) => ({ url: 'core/auth/login', method: 'POST', body }),
      transformResponse: (response: unknown) => SessionUserSchema.parse(response),
      invalidatesTags: ['Me', 'Users'],
    }),
    changePassword: build.mutation<SessionUser, ChangePasswordRequest>({
      query: (body) => ({ url: 'core/auth/password', method: 'POST', body }),
      transformResponse: (response: unknown) => SessionUserSchema.parse(response),
      invalidatesTags: ['Me'],
    }),
    getApps: build.query<HostedApp[], void>({
      query: () => 'core/apps',
      transformResponse: (response: unknown) => HostedAppSchema.array().parse(response),
    }),
    getUsers: build.query<User[], void>({
      query: () => 'core/users',
      transformResponse: (response: unknown) => UserSchema.array().parse(response),
      providesTags: ['Users'],
    }),
    createUser: build.mutation<CreateUserResponse, CreateUserRequest>({
      query: (body) => ({ url: 'core/users', method: 'POST', body }),
      transformResponse: (response: unknown) => CreateUserResponseSchema.parse(response),
      invalidatesTags: ['Users'],
    }),
    // Your own role may be the one changing, so who you are is asked again too.
    updateUserRole: build.mutation<User, { id: string; role: Role }>({
      query: ({ id, role }) => ({ url: `core/users/${encodeURIComponent(id)}`, method: 'PATCH', body: { role } }),
      transformResponse: (response: unknown) => UserSchema.parse(response),
      invalidatesTags: ['Users', 'Me'],
    }),
    resetPassword: build.mutation<PasswordResetResponse, string>({
      query: (id) => ({ url: `core/users/${encodeURIComponent(id)}/password-reset`, method: 'POST', body: {} }),
      transformResponse: (response: unknown) => PasswordResetResponseSchema.parse(response),
      invalidatesTags: ['Users'],
    }),
    signOutUser: build.mutation<void, string>({
      query: (id) => ({ url: `core/users/${encodeURIComponent(id)}/sign-out`, method: 'POST', body: {} }),
      invalidatesTags: ['Users', 'Me'],
    }),
    deleteUser: build.mutation<void, string>({
      query: (id) => ({ url: `core/users/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: ['Users'],
    }),
    getApiKeys: build.query<ApiKey[], void>({
      query: () => 'core/api-keys',
      transformResponse: (response: unknown) => ApiKeySchema.array().parse(response),
      providesTags: ['ApiKeys'],
    }),
    getGrantablePermissions: build.query<GrantablePermission[], void>({
      query: () => 'core/api-keys/grantable',
      transformResponse: (response: unknown) => GrantablePermissionSchema.array().parse(response),
    }),
    createApiKey: build.mutation<CreateApiKeyResponse, CreateApiKeyRequest>({
      query: (body) => ({ url: 'core/api-keys', method: 'POST', body }),
      transformResponse: (response: unknown) => CreateApiKeyResponseSchema.parse(response),
      invalidatesTags: ['ApiKeys'],
    }),
    revokeApiKey: build.mutation<void, string>({
      query: (id) => ({ url: `core/api-keys/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: ['ApiKeys'],
    }),
    getTeams: build.query<TeamSummary[], void>({
      query: () => 'core/teams',
      transformResponse: (response: unknown) => TeamSummarySchema.array().parse(response),
      providesTags: [{ type: 'Teams', id: 'LIST' }],
    }),
    getTeam: build.query<Team, string>({
      query: (id) => `core/teams/${encodeURIComponent(id)}`,
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      providesTags: (_team, _error, id) => [{ type: 'Teams', id }],
    }),
    createTeam: build.mutation<Team, CreateTeamRequest>({
      query: (body) => ({ url: 'core/teams', method: 'POST', body }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: [{ type: 'Teams', id: 'LIST' }],
    }),
    deleteTeam: build.mutation<void, string>({
      query: (id) => ({ url: `core/teams/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Teams', id: 'LIST' }],
    }),
    // Every change to a team replies with the whole team, and refreshes the list (counts, logo, when updated).
    updateTeam: build.mutation<Team, { id: string; changes: UpdateTeamRequest }>({
      query: ({ id, changes }) => ({ url: teamUrl(id), method: 'PATCH', body: changes }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    addMember: build.mutation<Team, { id: string; member: CreateMemberRequest }>({
      query: ({ id, member }) => ({ url: `${teamUrl(id)}/members`, method: 'POST', body: member }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    updateMember: build.mutation<Team, { id: string; memberId: string; changes: UpdateMemberRequest }>({
      query: ({ id, memberId, changes }) => ({ url: memberUrl(id, memberId), method: 'PATCH', body: changes }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    removeMember: build.mutation<Team, { id: string; memberId: string }>({
      query: ({ id, memberId }) => ({ url: memberUrl(id, memberId), method: 'DELETE' }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    // An image is sent as it is, with its own type as the Content-Type, never as JSON (ADR-0022).
    setLogo: build.mutation<Team, { id: string; image: File }>({
      query: ({ id, image }) => ({
        url: `${teamUrl(id)}/logo`,
        method: 'PUT',
        body: image,
        headers: imageHeaders(image),
      }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    removeLogo: build.mutation<Team, { id: string }>({
      query: ({ id }) => ({ url: `${teamUrl(id)}/logo`, method: 'DELETE' }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    setPhoto: build.mutation<Team, { id: string; memberId: string; image: File }>({
      query: ({ id, memberId, image }) => ({
        url: `${memberUrl(id, memberId)}/photo`,
        method: 'PUT',
        body: image,
        headers: imageHeaders(image),
      }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    removePhoto: build.mutation<Team, { id: string; memberId: string }>({
      query: ({ id, memberId }) => ({ url: `${memberUrl(id, memberId)}/photo`, method: 'DELETE' }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
  }),
});

export const {
  useSetupMutation,
  useLoginMutation,
  useChangePasswordMutation,
  useGetAppsQuery,
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserRoleMutation,
  useResetPasswordMutation,
  useSignOutUserMutation,
  useDeleteUserMutation,
  useGetApiKeysQuery,
  useGetGrantablePermissionsQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
  useGetTeamsQuery,
  useGetTeamQuery,
  useCreateTeamMutation,
  useDeleteTeamMutation,
  useUpdateTeamMutation,
  useAddMemberMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
  useSetLogoMutation,
  useRemoveLogoMutation,
  useSetPhotoMutation,
  useRemovePhotoMutation,
} = coreApi;
```

Create `rcl-core/web/src/pages/ImagePicker.tsx`:

```tsx
import { useState } from 'react';
import { Button, FileButton, Group, Image, Stack, Text } from '@mantine/core';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@rollcall/core-contract';

export interface ImagePickerProps {
  /** What the image is, such as "Logo" or "Photo". */
  label: string;
  /** The image's address (/media/<id>), or null when there's none. */
  imageUrl: string | null;
  /** Describes the image for people who can't see it, such as "All Stars logo". */
  alt: string;
  /** Called with a file that passed the checks below. */
  onPick: (file: File) => void;
  /** Removes the image. Without it, there's no Remove button. */
  onRemove?: () => void;
  /** While an upload or removal is under way. */
  busy?: boolean;
}

const isImageType = (type: string) => IMAGE_TYPES.some((allowed) => allowed === type);

/** Why a picked file can't be uploaded, or null. The server checks again, by the file's bytes (ADR-0022). */
export function imageProblem(file: File): string | null {
  if (!isImageType(file.type)) return 'Use a PNG, JPEG or WebP image';
  if (file.size > MAX_IMAGE_BYTES) return 'That image is over 5 MB';
  return null;
}

// A logo or photo: the image (or a note that there's none), a button to choose a new one, and Remove. A file is checked
// in the browser before it's sent, so the person hears at once what's wrong with it.
export function ImagePicker({ label, imageUrl, alt, onPick, onRemove, busy = false }: ImagePickerProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const pick = (file: File | null) => {
    if (!file) return;
    const found = imageProblem(file);
    setProblem(found);
    if (!found) onPick(file);
  };
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {label}
      </Text>
      {imageUrl ? (
        <Image src={imageUrl} alt={alt} w={96} h={96} fit="contain" radius="sm" />
      ) : (
        <Text size="sm">No {label.toLowerCase()} yet.</Text>
      )}
      <Group gap="xs">
        <FileButton onChange={pick} accept={IMAGE_TYPES.join(',')}>
          {(props) => (
            <Button {...props} variant="default" size="xs" loading={busy}>
              {imageUrl ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
            </Button>
          )}
        </FileButton>
        {imageUrl && onRemove && (
          <Button variant="subtle" color="red" size="xs" onClick={onRemove} disabled={busy}>
            Remove {label.toLowerCase()}
          </Button>
        )}
      </Group>
      {problem && (
        <Text size="sm" c="red" role="alert">
          {problem}
        </Text>
      )}
    </Stack>
  );
}
```

Create `rcl-core/web/src/pages/MembersTable.tsx`:

```tsx
import { ActionIcon, Avatar, Badge, Group, Menu, Table, Text, VisuallyHidden } from '@mantine/core';
import { MEMBER_ROLE_NAMES, type MemberKind, type TeamMember } from '@rollcall/core-contract';

export interface MembersTableProps {
  /** The team's skaters or its bench staff, in the server's order. */
  members: readonly TeamMember[];
  kind: MemberKind;
  /** Without these, the table is read-only: no row menus. */
  onEdit?: (member: TeamMember) => void;
  onRemove?: (member: TeamMember) => void;
}

// One kind of a team's members, as a table: photo, number (skaters only), name, pronouns and roles. With onEdit and
// onRemove, each row has a menu with Edit and Remove.
export function MembersTable({ members, kind, onEdit, onRemove }: MembersTableProps) {
  const editable = onEdit !== undefined && onRemove !== undefined;
  if (members.length === 0) {
    return <Text size="sm">{kind === 'skater' ? 'No skaters yet.' : 'No bench staff yet.'}</Text>;
  }
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>
            <VisuallyHidden>Photo</VisuallyHidden>
          </Table.Th>
          {kind === 'skater' && <Table.Th>Number</Table.Th>}
          <Table.Th>Name</Table.Th>
          <Table.Th>Pronouns</Table.Th>
          <Table.Th>Roles</Table.Th>
          {editable && (
            <Table.Th>
              <VisuallyHidden>Actions</VisuallyHidden>
            </Table.Th>
          )}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {members.map((member) => (
          <Table.Tr key={member.id}>
            <Table.Td>
              <Avatar src={member.photoUrl} alt={`Photo of ${member.name}`} name={member.name} radius="sm" />
            </Table.Td>
            {kind === 'skater' && <Table.Td>{member.number}</Table.Td>}
            <Table.Td>{member.name}</Table.Td>
            <Table.Td>{member.pronouns}</Table.Td>
            <Table.Td>
              <Group gap={4}>
                {member.roles.map((role) => (
                  <Badge key={role} variant="light">
                    {MEMBER_ROLE_NAMES[role]}
                  </Badge>
                ))}
                {member.customRoles.map((role) => (
                  <Badge key={role} variant="light" color="gray" tt="none">
                    {role}
                  </Badge>
                ))}
              </Group>
            </Table.Td>
            {editable && (
              <Table.Td>
                <Menu position="bottom-end" withInitialFocusPlaceholder={false}>
                  <Menu.Target>
                    <ActionIcon variant="subtle" aria-label={`Actions for ${member.name}`}>
                      ⋯
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => onEdit(member)}>Edit</Menu.Item>
                    <Menu.Item color="red" onClick={() => onRemove(member)}>
                      Remove
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
```

Create `rcl-core/web/src/pages/MemberForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Alert, Button, Checkbox, Group, Modal, Stack, TagsInput, Text, TextInput } from '@mantine/core';
import {
  BENCH_ROLES,
  CreateMemberRequestSchema,
  MEMBER_ROLE_NAMES,
  SKATER_ROLES,
  type MemberKind,
  type MemberRole,
  type Team,
  type TeamMember,
} from '@rollcall/core-contract';
import { useAddMemberMutation, useRemovePhotoMutation, useSetPhotoMutation, useUpdateMemberMutation } from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
import { ImagePicker } from './ImagePicker.tsx';

export interface MemberFormProps {
  team: Team;
  kind: MemberKind;
  /** The member being edited, or null to add one. */
  member: TeamMember | null;
  onClose: () => void;
}

/** What to say when a change finds the team or member gone: someone else deleted it meanwhile. */
export const GONE = { not_found: 'This team or member no longer exists. Someone else may have deleted it.' };

const ROLES: Record<MemberKind, readonly MemberRole[]> = { skater: SKATER_ROLES, bench: BENCH_ROLES };
const isRole = (value: string): value is MemberRole => Object.hasOwn(MEMBER_ROLE_NAMES, value);

// Adds or edits one skater or member of bench staff, in a dialog. Adding has "Save and add another", so a whole roster
// can be typed in without leaving the form. A new member's photo is uploaded once the member exists; an existing
// member's photo is uploaded as soon as it's picked.
export function MemberForm({ team, kind, member, onClose }: MemberFormProps) {
  const [addMember, adding] = useAddMemberMutation();
  const [updateMember, updating] = useUpdateMemberMutation();
  const [setPhoto, uploading] = useSetPhotoMutation();
  const [removePhoto, removing] = useRemovePhotoMutation();
  const [name, setName] = useState(member?.name ?? '');
  const [number, setNumber] = useState(member?.number ?? '');
  const [pronouns, setPronouns] = useState(member?.pronouns ?? '');
  const [roles, setRoles] = useState<string[]>(member ? [...member.roles] : []);
  const [customRoles, setCustomRoles] = useState<string[]>(member ? [...member.customRoles] : []);
  const [photo, setPendingPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  // The member as the server has it now, so a new photo shows at once.
  const current = member && (team.members.find((m) => m.id === member.id) ?? member);

  const clear = () => {
    setName('');
    setNumber('');
    setPronouns('');
    setRoles([]);
    setCustomRoles([]);
    setPendingPhoto(null);
  };

  const save = async (another: boolean) => {
    const checked = CreateMemberRequestSchema.safeParse({
      kind,
      name,
      number: kind === 'skater' ? number : null,
      pronouns,
      roles: roles.filter(isRole),
      customRoles,
    });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    setProblem(null);
    if (!checked.success) return;
    if (member) {
      const result = await updateMember({ id: team.id, memberId: member.id, changes: checked.data });
      if (result.error) setProblem(problemWith(result.error, GONE));
      else onClose();
      return;
    }
    const before = new Set(team.members.map((m) => m.id));
    const result = await addMember({ id: team.id, member: checked.data });
    if (result.error) {
      setProblem(problemWith(result.error, GONE));
      return;
    }
    const added = result.data.members.find((m) => !before.has(m.id));
    if (photo && added) {
      const uploaded = await setPhoto({ id: team.id, memberId: added.id, image: photo });
      if (uploaded.error) {
        setProblem(`${checked.data.name} was added, but the photo wasn't: ${problemWith(uploaded.error, GONE)}`);
        return;
      }
    }
    if (another) clear();
    else onClose();
  };

  // An existing member's photo changes at once, without waiting for Save.
  const changePhoto = async (change: Promise<{ error?: unknown }>) => {
    const result = await change;
    if (result.error) setProblem(problemWith(result.error, GONE));
  };

  const submit = (event: FormEvent, another = false) => {
    event.preventDefault();
    void save(another);
  };

  const title = member ? `Edit ${member.name}` : kind === 'skater' ? 'Add skater' : 'Add bench staff';
  return (
    <Modal opened onClose={onClose} title={title}>
      <form onSubmit={(event) => submit(event)} noValidate>
        <Stack gap="sm">
          <TextInput
            label="Name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={errors.name}
            data-autofocus
          />
          {kind === 'skater' && (
            <TextInput
              label="Number"
              description="1–4 letters or digits, such as 00 or 12A"
              value={number}
              onChange={(event) => setNumber(event.currentTarget.value)}
              error={errors.number}
              w={160}
            />
          )}
          <TextInput
            label="Pronouns"
            placeholder="she/her"
            value={pronouns}
            onChange={(event) => setPronouns(event.currentTarget.value)}
            error={errors.pronouns}
            w={240}
          />
          <Checkbox.Group label="Roles" value={roles} onChange={setRoles} error={errors.roles}>
            <Group mt="xs">
              {ROLES[kind].map((role) => (
                <Checkbox key={role} value={role} label={MEMBER_ROLE_NAMES[role]} />
              ))}
            </Group>
          </Checkbox.Group>
          <TagsInput
            label="Custom roles"
            description="Up to 3, such as Lineup manager. Press Enter after each."
            value={customRoles}
            onChange={setCustomRoles}
            maxTags={3}
            error={errors.customRoles}
          />
          {current ? (
            <ImagePicker
              label="Photo"
              imageUrl={current.photoUrl}
              alt={`Photo of ${current.name}`}
              busy={uploading.isLoading || removing.isLoading}
              onPick={(image) => void changePhoto(setPhoto({ id: team.id, memberId: current.id, image }))}
              onRemove={() => void changePhoto(removePhoto({ id: team.id, memberId: current.id }))}
            />
          ) : (
            <Stack gap={4}>
              <ImagePicker label="Photo" imageUrl={null} alt="" onPick={setPendingPhoto} />
              {photo && <Text size="sm">{photo.name} will be uploaded when you save.</Text>}
            </Stack>
          )}
          {problem && <Alert color="red">{problem}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            {!member && (
              <Button variant="default" onClick={(event) => submit(event, true)} loading={adding.isLoading}>
                Save and add another
              </Button>
            )}
            <Button type="submit" loading={adding.isLoading || updating.isLoading}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
```

Create `rcl-core/web/src/pages/TeamsPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Alert,
  Anchor,
  Avatar,
  Button,
  ColorSwatch,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { CreateTeamRequestSchema, type TeamSummary } from '@rollcall/core-contract';
import { useGetMeQuery } from '@rollcall/web-sdk';
import { useCreateTeamMutation, useGetTeamsQuery } from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';

// The teams (docs/features/team-builder.md). Anyone holding core:teams.read sees the list; core:teams.manage can
// create teams too. Hiding things is only for convenience: the server checks every request (hard rule 5).
export function TeamsPage() {
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('core:teams.read')) return <Alert color="gray">Your account can't view teams.</Alert>;
  return <TeamList canManage={me.permissions.includes('core:teams.manage')} />;
}

function TeamList({ canManage }: { canManage: boolean }) {
  const teams = useGetTeamsQuery();
  return (
    <Stack maw={980}>
      <Title order={2}>Teams</Title>
      {canManage && <NewTeam />}
      {teams.isError && <Alert color="red">{problemWith(teams.error)}</Alert>}
      {teams.data?.length === 0 && <Text c="dimmed">No teams yet.</Text>}
      {teams.data && teams.data.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <VisuallyHidden>Logo</VisuallyHidden>
              </Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>League</Table.Th>
              <Table.Th>Short name</Table.Th>
              <Table.Th>Colors</Table.Th>
              <Table.Th>Skaters</Table.Th>
              <Table.Th>Bench staff</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {teams.data.map((team) => (
              <TeamRow key={team.id} team={team} />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

function TeamRow({ team }: { team: TeamSummary }) {
  return (
    <Table.Tr>
      <Table.Td>
        <Avatar src={team.logoUrl} alt={`${team.name} logo`} name={team.name} radius="sm" />
      </Table.Td>
      <Table.Td>
        <Anchor component={Link} to={`/teams/${encodeURIComponent(team.id)}`}>
          {team.name}
        </Anchor>
      </Table.Td>
      <Table.Td>{team.leagueName}</Table.Td>
      <Table.Td>{team.shortName}</Table.Td>
      <Table.Td>
        <Group gap={4}>
          {[team.primaryColor, team.secondaryColor].map(
            (color, i) =>
              color && <ColorSwatch key={color + String(i)} color={color} size={18} aria-label={`Color ${color}`} />,
          )}
        </Group>
      </Table.Td>
      <Table.Td>{team.skaterCount}</Table.Td>
      <Table.Td>{team.benchCount}</Table.Td>
    </Table.Tr>
  );
}

// Creates a team from its name, then opens it to fill in the rest.
function NewTeam() {
  const [createTeam, { isLoading, error }] = useCreateTeamMutation();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = CreateTeamRequestSchema.safeParse({ name });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) return;
    const result = await createTeam(checked.data);
    if (result.data) void navigate(`/teams/${encodeURIComponent(result.data.id)}`);
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Group align="end">
        <TextInput
          label="New team"
          placeholder="Team name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          error={errors.name}
          w={320}
        />
        <Button type="submit" loading={isLoading}>
          Create team
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

Create `rcl-core/web/src/pages/TeamPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Anchor,
  Button,
  ColorInput,
  ColorSwatch,
  Group,
  Image,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { UpdateTeamRequestSchema, type MemberKind, type Team, type TeamMember } from '@rollcall/core-contract';
import { apiError, useGetMeQuery } from '@rollcall/web-sdk';
import {
  useDeleteTeamMutation,
  useGetTeamQuery,
  useRemoveLogoMutation,
  useRemoveMemberMutation,
  useSetLogoMutation,
  useUpdateTeamMutation,
} from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
import { ImagePicker } from './ImagePicker.tsx';
import { GONE, MemberForm } from './MemberForm.tsx';
import { MembersTable } from './MembersTable.tsx';

// One team (docs/features/team-builder.md): its details and logo, its skaters and its bench staff. With
// core:teams.manage it's an editor; with only core:teams.read it's read-only. The server checks every change anyway.
export function TeamPage() {
  const { id = '' } = useParams();
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('core:teams.read')) return <Alert color="gray">Your account can't view teams.</Alert>;
  return <TeamView id={id} canManage={me.permissions.includes('core:teams.manage')} />;
}

function TeamView({ id, canManage }: { id: string; canManage: boolean }) {
  const team = useGetTeamQuery(id);
  const [editing, setEditing] = useState<{ kind: MemberKind; member: TeamMember | null } | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [removeMember] = useRemoveMemberMutation();
  const [problem, setProblem] = useState<string | null>(null);

  if (team.isError) {
    return (
      <Stack maw={980}>
        <BackToTeams />
        <Alert color={apiError(team.error)?.code === 'not_found' ? 'gray' : 'red'}>
          {problemWith(team.error, { not_found: "There's no such team. It may have been deleted." })}
        </Alert>
      </Stack>
    );
  }
  if (!team.data) return <Loader aria-label="Loading the team" />;
  const { data } = team;

  const remove = async () => {
    const member = removing;
    setRemoving(null);
    if (!member) return;
    setProblem(null);
    const result = await removeMember({ id: data.id, memberId: member.id });
    if (result.error) setProblem(problemWith(result.error, { not_found: 'That member was already removed.' }));
  };

  const section = (kind: MemberKind, heading: string, add: string) => (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={3} size="h4">
          {heading}
        </Title>
        {canManage && (
          <Button variant="default" size="xs" onClick={() => setEditing({ kind, member: null })}>
            {add}
          </Button>
        )}
      </Group>
      <MembersTable
        members={data.members.filter((member) => member.kind === kind)}
        kind={kind}
        {...(canManage ? { onEdit: (member: TeamMember) => setEditing({ kind, member }), onRemove: setRemoving } : {})}
      />
    </Stack>
  );

  return (
    <Stack maw={980}>
      <BackToTeams />
      <Title order={2}>{data.name}</Title>
      {canManage ? <TeamDetailsForm key={data.id} team={data} /> : <TeamDetails team={data} />}
      {problem && (
        <Alert color="red" withCloseButton closeButtonLabel="Dismiss" onClose={() => setProblem(null)}>
          {problem}
        </Alert>
      )}
      {section('skater', 'Skaters', 'Add skater')}
      {section('bench', 'Bench staff', 'Add bench staff')}
      {canManage && <DeleteTeam team={data} />}
      {editing && (
        <MemberForm
          key={editing.member?.id ?? `new-${editing.kind}`}
          team={data}
          kind={editing.kind}
          member={editing.member}
          onClose={() => setEditing(null)}
        />
      )}
      <Modal opened={removing !== null} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? ''}?`}>
        <Stack>
          <Text>Their photo is deleted too.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void remove()}>
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

const BackToTeams = () => (
  <Anchor component={Link} to="/teams" size="sm">
    ← Teams
  </Anchor>
);

// The team's details, read-only.
function TeamDetails({ team }: { team: Team }) {
  const rows: [string, string | null][] = [
    ['League', team.leagueName],
    ['Short name', team.shortName],
  ];
  return (
    <Group align="start" gap="xl">
      {team.logoUrl && <Image src={team.logoUrl} alt={`${team.name} logo`} w={96} h={96} fit="contain" />}
      <Stack gap={4}>
        {rows.map(
          ([label, value]) =>
            value && (
              <Text key={label} size="sm">
                {label}: {value}
              </Text>
            ),
        )}
        <Group gap={4}>
          {[team.primaryColor, team.secondaryColor].map(
            (color, i) =>
              color && <ColorSwatch key={color + String(i)} color={color} size={18} aria-label={`Color ${color}`} />,
          )}
        </Group>
      </Stack>
    </Group>
  );
}

// The team's details as a form, with its logo.
function TeamDetailsForm({ team }: { team: Team }) {
  const [updateTeam, saving] = useUpdateTeamMutation();
  const [setLogo, uploading] = useSetLogoMutation();
  const [removeLogo, removing] = useRemoveLogoMutation();
  const [name, setName] = useState(team.name);
  const [leagueName, setLeagueName] = useState(team.leagueName ?? '');
  const [shortName, setShortName] = useState(team.shortName ?? '');
  const [primaryColor, setPrimaryColor] = useState(team.primaryColor ?? '');
  const [secondaryColor, setSecondaryColor] = useState(team.secondaryColor ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = UpdateTeamRequestSchema.safeParse({ name, leagueName, shortName, primaryColor, secondaryColor });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    setProblem(null);
    setSaved(false);
    if (!checked.success) return;
    const result = await updateTeam({ id: team.id, changes: checked.data });
    if (result.error) setProblem(problemWith(result.error, GONE));
    else setSaved(true);
  };
  const logoProblem = (result: { error?: unknown }) => {
    if (result.error) setProblem(problemWith(result.error, GONE));
  };

  return (
    <Group align="start" gap="xl">
      <ImagePicker
        label="Logo"
        imageUrl={team.logoUrl}
        alt={`${team.name} logo`}
        busy={uploading.isLoading || removing.isLoading}
        onPick={(image) => void setLogo({ id: team.id, image }).then(logoProblem)}
        onRemove={() => void removeLogo({ id: team.id }).then(logoProblem)}
      />
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Stack gap="sm">
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            error={errors.name}
            w={320}
          />
          <TextInput
            label="League"
            value={leagueName}
            onChange={(e) => setLeagueName(e.currentTarget.value)}
            error={errors.leagueName}
            w={320}
          />
          <TextInput
            label="Short name"
            description="Up to 8 characters, such as RCR"
            value={shortName}
            onChange={(e) => setShortName(e.currentTarget.value)}
            error={errors.shortName}
            w={160}
          />
          <Group>
            <ColorInput
              label="Primary color"
              value={primaryColor}
              onChange={setPrimaryColor}
              error={errors.primaryColor}
              w={160}
            />
            <ColorInput
              label="Secondary color"
              value={secondaryColor}
              onChange={setSecondaryColor}
              error={errors.secondaryColor}
              w={160}
            />
          </Group>
          {problem && <Alert color="red">{problem}</Alert>}
          <Group>
            <Button type="submit" loading={saving.isLoading}>
              Save details
            </Button>
            {saved && (
              <Text component="output" size="sm" c="dimmed">
                Saved.
              </Text>
            )}
          </Group>
        </Stack>
      </form>
    </Group>
  );
}

// Deletes the team, after saying what goes with it.
function DeleteTeam({ team }: { team: Team }) {
  const [deleteTeam, { isLoading }] = useDeleteTeamMutation();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const navigate = useNavigate();
  const count = team.members.length;
  const members = count === 1 ? '1 member' : `${count} members`;

  const confirm = async () => {
    const result = await deleteTeam(team.id);
    setConfirming(false);
    if (result.error) setProblem(problemWith(result.error, GONE));
    else void navigate('/teams');
  };

  return (
    <Stack gap="xs" align="start">
      <Button color="red" variant="light" onClick={() => setConfirming(true)}>
        Delete team
      </Button>
      {problem && <Alert color="red">{problem}</Alert>}
      <Modal opened={confirming} onClose={() => setConfirming(false)} title={`Delete ${team.name}?`}>
        <Stack>
          <Text>Deletes the team, its {members}, its logo and photos. This cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button color="red" loading={isLoading} onClick={() => void confirm()}>
              Delete team
            </Button>
          </Group>
        </Stack>
      </Modal>
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

- [ ] **Step 4: Run them and see them pass.**

Run: `yarn vitest run rcl-core/web packages/web-sdk`
Expected: PASS. `yarn test` passes 373.

- [ ] **Step 5: Add the stories.**

These are rcl-core's first stories, so the admin Storybook now looks in `rcl-core/web/src` too:

Replace `rcl-core/web/.storybook/admin/main.ts` with:

```ts
import type { StorybookConfig } from '@storybook/react-vite';

// The admin Storybook: shared Mantine components from the web SDK and the admin app (ADR-0015). Overlay components
// have their own Storybook, so Mantine never loads next to them (ADR-0006). Nothing here calls home: telemetry, crash
// reports and update notices are off.
const config: StorybookConfig = {
  stories: ['../../../../packages/web-sdk/src/**/*.stories.tsx', '../../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true, enableCrashReports: false },
  // The overlay Storybook runs on its own (port 6007) and appears here as its own section (ADR-0015).
  refs: { overlay: { title: 'Overlay', url: 'http://localhost:6007' } },
};

export default config;
```

Create `rcl-core/web/src/pages/ImagePicker.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ImagePicker } from './ImagePicker.tsx';

// A stand-in logo, inline so the story loads nothing from outside (hard rule 4).
const LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="#aa0000"/>' +
      '<text x="48" y="58" font-size="28" text-anchor="middle" fill="#fff" font-family="sans-serif">RCR</text></svg>',
  );

const meta = {
  title: 'Teams/ImagePicker',
  component: ImagePicker,
  args: { label: 'Logo', alt: 'All Stars logo', onPick: fn(), onRemove: fn() },
} satisfies Meta<typeof ImagePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoImageYet: Story = { args: { imageUrl: null } };

export const WithImage: Story = { args: { imageUrl: LOGO } };

export const Uploading: Story = { args: { imageUrl: LOGO, busy: true } };
```

Create `rcl-core/web/src/pages/MembersTable.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { TeamMember } from '@rollcall/core-contract';
import { MembersTable } from './MembersTable.tsx';

const SKATERS: TeamMember[] = [
  {
    id: 'm1',
    kind: 'skater',
    name: 'Zero Cool',
    number: '00',
    pronouns: 'he/him',
    roles: ['captain'],
    customRoles: [],
    photoUrl: null,
  },
  {
    id: 'm2',
    kind: 'skater',
    name: 'Jammy Dodger',
    number: '7',
    pronouns: 'she/her',
    roles: ['alt-captain'],
    customRoles: ['MVP'],
    photoUrl: null,
  },
  {
    id: 'm3',
    kind: 'skater',
    name: 'Blocky Balboa',
    number: '12A',
    pronouns: null,
    roles: [],
    customRoles: [],
    photoUrl: null,
  },
];
const BENCH: TeamMember[] = [
  {
    id: 'm4',
    kind: 'bench',
    name: 'Coach Amy',
    number: null,
    pronouns: 'they/them',
    roles: ['bench-coach'],
    customRoles: ['Lineups'],
    photoUrl: null,
  },
];

const meta = {
  title: 'Teams/MembersTable',
  component: MembersTable,
} satisfies Meta<typeof MembersTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What Admins and Producers see: each row has a menu with Edit and Remove. */
export const Editable: Story = { args: { members: SKATERS, kind: 'skater', onEdit: fn(), onRemove: fn() } };

/** What Announcers see: no row menus. */
export const ReadOnly: Story = { args: { members: SKATERS, kind: 'skater' } };

export const BenchStaff: Story = { args: { members: BENCH, kind: 'bench', onEdit: fn(), onRemove: fn() } };

export const NoSkatersYet: Story = { args: { members: [], kind: 'skater' } };
```

Run: `yarn build && yarn test:stories`
Expected: PASS, 21 story tests, with no accessibility violations.

- [ ] **Step 6: Check and commit.**

```bash
yarn format && yarn check
git add rcl-core/web packages/web-sdk/src/testing.ts
git commit -F - <<'EOF'
feat(rcl-core): Teams pages in the admin app

A Teams list, and a page for each team with its details, logo, skaters
and bench staff. Adding members has Save and add another, so a roster
goes in quickly. Logos and photos are checked in the browser before
they're sent. Announcers see the same pages read-only.

Refs #17

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: End to end, and the docs

**Files:**
- Modify: `e2e/tests/accounts.spec.ts`
- Create: `docs/decisions/0022-public-media.md`
- Modify:
  - `docs/features/team-builder.md`, `docs/architecture/README.md`, `docs/architecture/data-model.md`;
  - `docs/product/glossary.md`, `docs/guides/local-development.md`, `docs/guides/testing.md`;
  - `.claude/rules/rcl-core-server.md`, `.claude/rules/rcl-core-web.md`;
  - `rcl-core/CHANGELOG.md`;
  - the generated indexes `docs/features/README.md` and `docs/decisions/README.md`.

**Interfaces:**
- Consumes everything above. ADR-0022 is the decision the code comments already cite.

- [ ] **Step 1: Add the teams steps to the end-to-end flow.**

They go at the end of the ordered accounts flow, on the Admin made at its start:
1. an Admin creates a team, sets a logo and adds a skater with a photo;
2. the photo loads with no session;
3. an Announcer sees the team read-only.

In `e2e/tests/accounts.spec.ts`:

Replace:

```ts
  expect((await page.request.get('/api/core/users', withKey(key))).status()).toBe(401);
});
```
with:

```ts
  expect((await page.request.get('/api/core/users', withKey(key))).status()).toBe(401);
});

// Teams (team-builder R1–R5), on the accounts made above.
const ANNOUNCER = { username: 'announcer1', password: 'announcer password 1' };
// A real 1×1 PNG, so the browser can show it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
let photoUrl = '';

test('an Admin creates a team, sets its logo and adds a skater with a photo', async ({ page }) => {
  await page.goto('/core/teams');
  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
  await page.getByLabel('New team').fill('All Stars');
  await page.getByRole('button', { name: 'Create team' }).click();
  await expect(page.getByRole('heading', { name: 'All Stars' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name: 'All Stars logo' })).toBeVisible();

  await page.getByRole('button', { name: 'Add skater' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add skater' });
  await dialog.getByLabel('Name').fill('Zero Cool');
  await dialog.getByLabel(/^Number/).fill('00');
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'zero.png', mimeType: 'image/png', buffer: PNG });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Zero Cool/ })).toContainText('00');
  const photo = page.getByRole('img', { name: 'Photo of Zero Cool' });
  await expect(photo).toBeVisible();
  photoUrl = (await photo.getAttribute('src')) ?? '';
  expect(photoUrl).toMatch(/^\/media\/[0-9a-f]{32}$/);
});

test("a team's images load without signing in, so OBS overlays can show them", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL });
  const image = await anonymous.get(photoUrl);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/png');
  expect(Buffer.from(await image.body()).equals(PNG)).toBe(true);
  // The team itself still needs signing in.
  expect((await anonymous.get('/api/core/teams')).status()).toBe(401);
  await anonymous.dispose();
});

test('an Announcer can look at a team, but not change it', async ({ page }) => {
  await page.goto('/core/users');
  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.getByLabel('Username').fill(ANNOUNCER.username);
  await page.getByLabel('Role', { exact: true }).selectOption('announcer');
  await page.getByRole('button', { name: 'Create' }).click();
  const dialog = page.getByRole('dialog', { name: `Temporary password for ${ANNOUNCER.username}` });
  const temporary = await dialog.getByLabel('Temporary password').inputValue();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'admin Admin' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();

  await page.goto('/core/teams');
  await signIn(page, { username: ANNOUNCER.username, password: temporary });
  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
  await page.getByLabel('Temporary password').fill(temporary);
  await page.getByLabel('New password', { exact: true }).fill(ANNOUNCER.password);
  await page.getByLabel('Repeat new password').fill(ANNOUNCER.password);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/core\/teams$/);
  await page.getByRole('link', { name: 'All Stars' }).click();
  await expect(page.getByRole('heading', { name: 'All Stars' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Zero Cool/ })).toBeVisible();
  for (const name of ['Save details', 'Add skater', 'Delete team', 'Actions for Zero Cool']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
});
```


Run: `yarn test:e2e`
Expected: PASS, 11 tests. The teams steps pass at once, because Tasks 1–5 built what they check.

- [ ] **Step 2: Record the decision.**

Create `docs/decisions/0022-public-media.md`:

```markdown
---
title: Uploaded images are public at unguessable addresses
status: accepted
date: 2026-10-23
---
# 0022. Uploaded images are public at unguessable addresses

## Context

The [Team Builder](../features/team-builder.md) adds the first uploaded files: team logos and member photos. Themes and screens will add more images later. Overlays show these images, and an overlay is an OBS browser source: it has no session, and output token URLs aren't built yet ([ADR-0018](0018-declared-access-and-permissions.md)). So an image an overlay shows can't require signing in.

Options considered:
- **Images behind a session, like the API.** Rejected: OBS couldn't load them.
- **Images inside overlay data, as data URLs.** Rejected: every live update would resend every image, and the database would carry megabytes per photo.
- **Images stored in the database.** Rejected: the database grows by megabytes per photo, every image is read through a query, and the architecture already plans "SQLite plus media files".

## Decision

- **Uploaded images are files** in the data folder's `media/` folder, one per image, each with a row in the `media` table giving its type and size. rcl-core's `media.ts` saves, removes and serves them. Teams use it now; later features use it too.
- **They're served at `/media/<id>` to anyone,** with no session, so overlays and OBS can load them.
- **An address can't be guessed or listed:**
  - an image's id is 128 random bits, as 32 hex characters;
  - nothing lists images;
  - an address appears only in the data of the team that uses it, which needs `core:teams.read`.
- **Only images are ever served:**
  - an upload is kept only if its first bytes are a PNG, JPEG or WebP, and is stored as the type its bytes show;
  - SVG, HTML and anything else are refused;
  - replies carry `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`.
- **An image belongs to exactly one logo or photo.**
  - Replacing or removing it deletes its file and row.
  - Deleting a team deletes all of its images.
  - At startup, the server deletes files with no row, rows with no file, and rows that nothing refers to.
- **Images are cached for good** (`immutable`), because an id is never reused.
- **`media` is a reserved app id,** so no app's web build at `/<id>/` can collide with `/media/`.

## Consequences

- OBS overlays can show logos and photos with no session.
- **Images aren't secret.** Anyone on the venue network who has an image's address can load it, as with the overlay itself. Don't upload anything that must stay private.
- **Backups:** the data folder now holds `rollcall.db` and `media/`, and they must be copied together.
- **When output token URLs arrive,** decide whether images should require a token too.
- **A new table that refers to images** adds its column to `MEDIA_REFERENCES` (`rcl-core/server/src/db/schema.ts`), or the startup sweep deletes its images.
```

- [ ] **Step 3: Update the wiki, the rules and the changelog.**

Replace `docs/features/team-builder.md` with:

```markdown
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
  - A new member's photo is uploaded when the member is saved. An existing member's photo, and a logo, change as soon as one is picked.
  - Replacing or removing an image deletes the old one. Deleting a team deletes its logo and every photo.
- **Two people editing the same team** each save their own changes; the last save wins.
- **The API** is below `/api/core/teams`; every change replies with the whole team. See [trying the API](../guides/local-development.md#trying-the-api).

## Related

- CRG's own saved teams (`PreparedTeam`) and its skater flags: [CRG integration: teams and rosters](../architecture/integrations/crg-scoreboard.md#teams-and-rosters)
- [Data model](../architecture/data-model.md)

## Open questions

- Game rosters: does each game pick a subset of the team's members, or use the whole team? Where is that done: here or in [Live Mode](live-mode.md)?
- Should we offer a read-only import of a team from a CRG `PreparedTeam` (via `GET /SaveJSON/`) so rosters don't have to be retyped? Importing from a spreadsheet is a candidate too.
- How do we match our members to CRG's skaters during a game so overlays can show photos? By roster number?
- Should team colors feed theme tokens? See [Theme Builder](theme-builder.md).
```

In `docs/architecture/README.md`:

Replace:

```markdown
- [ADR-0020](../decisions/0020-api-keys.md): API keys for devices and scripts, with their own permissions and never people-only ones; the `Authorization` header beats the cookie.
```
with:

```markdown
- [ADR-0020](../decisions/0020-api-keys.md): API keys for devices and scripts, with their own permissions and never people-only ones; the `Authorization` header beats the cookie.
- [ADR-0022](../decisions/0022-public-media.md): Uploaded images are files in the data folder, served to anyone at unguessable `/media/<id>` addresses, so OBS overlays can show them.
```


In `docs/architecture/data-model.md`:

Replace:

```markdown
  TEAM ||--o{ TEAM_MEMBER : has
```
with:

```markdown
  TEAM ||--o{ TEAM_MEMBER : has
  TEAM }o--o| MEDIA : "logo"
  TEAM_MEMBER }o--o| MEDIA : "photo"
```


Replace:

```markdown
| Team member | A skater or a member of bench staff, with number, roles and photo | [Team Builder](../features/team-builder.md) |
```
with:

```markdown
| Team member | A skater or a member of bench staff, with number, pronouns, roles and photo | [Team Builder](../features/team-builder.md) |
| Media | An uploaded image, such as a team logo or a member photo: a file in the data folder's `media/`, with its type ([ADR-0022](../decisions/0022-public-media.md)) | [Team Builder](../features/team-builder.md) |
```


Replace:

```markdown
- **Persisted** (SQLite and media files): everything in the table above.
```
with:

```markdown
- **Persisted** (SQLite, and media files in the data folder's `media/`): everything in the table above.
```


In `docs/product/glossary.md`:

Replace:

```markdown
| <a id="permission"></a>**Permission** | A named right in one rcl app, such as `core:users.manage`. Routes and live connections check permissions; a role is a set of them, and Admins hold them all. See [users and access](../features/users-and-access.md#permissions). |
```
with:

```markdown
| <a id="permission"></a>**Permission** | A named right in one rcl app, such as `core:users.manage`. Routes and live connections check permissions; a role is a set of them, and Admins hold them all. See [users and access](../features/users-and-access.md#permissions). |
| <a id="media"></a>**Media** | An uploaded image, such as a team logo or a member photo. rcl-core keeps it in the data folder and serves it at `/media/<id>` to anyone, so OBS overlays can show it ([ADR-0022](../decisions/0022-public-media.md)). |
```


In `docs/guides/local-development.md`:

Replace:

```markdown
Migrations run automatically when the server starts. To start from an empty database, stop the server and delete `data/`.

Upgrading from OBS Producer? Rollcall is a new clone, so copy your old checkout's `obs-producer/data/` folder to `data/` here (or point `ROLLCALL_DATA_DIR` at it). The server then refuses to start while `data/` holds only `obs-producer.db`: stop it and rename that file, plus any `-wal` and `-shm` files next to it, to `rollcall.db`, or delete it to start fresh.
```
with:

```markdown
Migrations run automatically when the server starts. To start from an empty database, stop the server and delete `data/`.

`data/` holds the database, `rollcall.db`, and uploaded images, `media/` ([ADR-0022](../decisions/0022-public-media.md)). Back them up together: each image belongs to the database row that names it.

Upgrading from OBS Producer? Rollcall is a new clone, so copy your old checkout's `obs-producer/data/` folder to `data/` here (or point `ROLLCALL_DATA_DIR` at it). The server then refuses to start while `data/` holds only `obs-producer.db`: stop it and rename that file, plus any `-wal` and `-shm` files next to it, to `rollcall.db`, or delete it to start fresh.
```


In `docs/guides/testing.md`:

Replace:

```markdown
    - A key holding every permission a key may hold is refused with `forbidden` on routes for any signed-in user and on people-only permissions, and gets through elsewhere. A test app supplies a route a key may call.
```
with:

```markdown
    - A key holding every permission a key may hold is refused with `forbidden` on routes for any signed-in user and on people-only permissions, and gets through elsewhere. The teams routes are the ones a key may call (`core:teams.read` and `core:teams.manage`).
```


Replace:

```markdown
- **Which Storybook:** the admin Storybook (`rcl-core/web/.storybook/admin`) shows the web SDK's components, and rcl-core's own once it has some: its first story also adds `../../src/**/*.stories.tsx` to that Storybook's `main.ts`, since Storybook warns about a pattern that matches nothing. Overlay components (`rcl-producer/web/src/overlay`) go in the overlay Storybook (`rcl-producer/web/.storybook/overlay`). The Producer app's other components get a dashboard Storybook with their first story.
```
with:

```markdown
- **Which Storybook:** the admin Storybook (`rcl-core/web/.storybook/admin`) shows the web SDK's components and rcl-core's own (`rcl-core/web/src/**/*.stories.tsx`). Overlay components (`rcl-producer/web/src/overlay`) go in the overlay Storybook (`rcl-producer/web/.storybook/overlay`). The Producer app's other components get a dashboard Storybook with their first story.
```


In `.claude/rules/rcl-core-server.md`:

Replace:

```markdown
  - A new permission sets `peopleOnly: true` if a leaked API key holding it could take over accounts or make more keys.
```
with:

```markdown
  - A new permission sets `peopleOnly: true` if a leaked API key holding it could take over accounts or make more keys.
- **Uploaded images** go through `src/media.ts` (ADR-0022): `saveMedia` keeps only real PNG, JPEG or WebP bytes, and `removeMedia` deletes the row and file once nothing points at them.
  - A new column that refers to media goes in `MEDIA_REFERENCES` (`src/db/schema.ts`), or the startup sweep deletes its images.
  - `/media/<id>` is public, outside `/api`, and `media` is a reserved app id.
  - Upload routes take the raw image body in a plugin of their own, with the image content types and a 5 MB `bodyLimit` (`src/routes/team-images.ts`).
```


In `.claude/rules/rcl-core-web.md`:

Replace:

```markdown
- **Shared admin components** get a story next to them, in the admin Storybook (ADR-0015). The first one also adds `'../../src/**/*.stories.tsx'` to `.storybook/admin/main.ts`. See `docs/guides/testing.md#stories`.
```
with:

```markdown
- **Shared admin components** get a story next to them, in the admin Storybook (ADR-0015). See `docs/guides/testing.md#stories`.
- **Images** are sent as the raw file with its own type, never as JSON (`setLogo`, `setPhoto` in `src/api.ts`), and checked first with `imageProblem` (`src/pages/ImagePicker.tsx`). The server checks them again (ADR-0022).
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

- Team Builder: Admins and Producers create teams with a league, short name, colors and logo, and their skaters and bench staff, with numbers (`00` keeps its zeros), pronouns, roles and photos. **Save and add another** makes typing in a roster quick. Announcers can view teams, and API keys can be given access to them. Logos and photos are stored on the server and shown to OBS overlays without signing in, so don't upload anything private (#17)
```


Then run `node scripts/check-docs.mjs --fix`. It updates the features table (Team Builder: shipped) and the decisions table (ADR-0022).

- [ ] **Step 4: Check and commit.**

```bash
yarn format && yarn check
git add e2e docs .claude/rules rcl-core/CHANGELOG.md
git commit -F - <<'EOF'
docs(rcl-core): ADR-0022, and the Team Builder shipped

Uploaded images are public at unguessable addresses, so OBS overlays can
show them (ADR-0022). The Team Builder page describes what's built; the
data model, architecture, glossary, guides and rules cover media. The
end-to-end flow creates a team with a logo and a photographed skater,
loads the photo with no session, and checks an Announcer's read-only view.

Closes #17

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

