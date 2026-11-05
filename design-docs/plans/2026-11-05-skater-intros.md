# Skater Intros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put each team's intros on stream before a game. A title banner comes first, then a card per person, in a centred row. It's run live from a phone-friendly control page and set up on a page that stands in for the Screen Builder.

**Architecture:**
- **rcl-core** gives apps a read-only `teams` service on `AppContext` (ADR-0023).
- **rcl-producer stores intros** in `producer_intros`.
- **The server owns the run.** A pure step machine (`intros/run.ts`) runs inside a per-app service (`intros/runs.ts`) that holds each intro's run in memory, along with its timer.
- **The OBS page** at `/producer/overlay/intros/<id>` joins that intro's room in the public `/producer/overlay` namespace. It renders the presentational `TeamRoster` component on a 1920×1080 canvas.
- **The control page** joins `/producer/intros`, a namespace that needs a permission. It presses Start, Next and Clear through API routes.

**Tech Stack:** TypeScript 7 (native Node, erasable syntax, `.ts` imports), Zod 4, Fastify 5 with the Zod type provider, Drizzle and SQLite, Socket.IO 4, React 19, Mantine 9 (Producer app pages only), RTK Query, Vitest and React Testing Library, Storybook (the overlay), Playwright.

**Spec:** `design-docs/specs/2026-11-05-skater-intros-design.md` (approved by Mike 2026-11-05). Mockups with sizes and animations are in `design-docs/specs/2026-11-05-skater-intros-mockups/`: `1-person-card.html` (card C), `2-row.html` (row A) and `3-title-card.html` (banner B).

## Global Constraints

- **Hard rules (root `AGENTS.md`):**
  - 3: browsers never reach OBS or CRG.
  - 4: no internet at runtime. No CDN, no hosted font, no remote image, including in stories.
  - 5: every route and namespace declares its access.
  - 6: server data lives in RTK Query, and overlay components take everything through props.
- **The overlay bundle** never imports Mantine, `@rollcall/web-sdk` or `src/pages`/`src/routes.tsx`/`src/main.tsx`. `src/overlay/bundle.test.ts` enforces this.
- **Overlay components style themselves only with CSS variables:** `--theme-*`, plus the new `--team-*`. No hard-coded colours or fonts. Each one gets a story in the overlay Storybook.
- **Spelling:** code identifiers and UI copy use American spelling, as the rest of the app does (`center`, `color`, "Bottom center"). The spec's British spellings are prose only.
- **Canvas:** 1920×1080, transparent. Largest card width: **420 px**. Gap between cards: **24 px**. Entrances take **about 400 ms**.
- **Settings and their ranges:**
  - **At once:** 1–20, or `'team'` ("Whole team").
  - **Timer:** 2–60 seconds per step.
  - **Edge distance:** 0–200 canvas px.
  - **Entrances:** `pop`, `slide-up`, `fade` and `wipe`.
- **Defaults:** at once `1`, moves on by Next, entrance `pop`, spot `bottom-center`, edge `48`.
- **Permissions:**
  - `producer:intros.run`: list and read intros, open the control page, and press Start, Next and Clear.
  - `producer:intros.manage`: create, set up and delete intros.

  Both are held by `producer`, with Admins holding everything, and both may be held by API keys.
- **Run `yarn check` before every commit** and act on its exit status. Commits use Conventional Commits with an app scope, and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Core's services don't announce changes (ADR-0023).** A member removed or a team deleted mid-run is noticed at the run's next step, timer tick, reload or state read, not the instant it happens. *(Plan ruling: the spec's "a run of that team ends" happens at that next touch.)*

## Review Focus

1. **Two control pages press Next on the same step.** The run moves on one step, not two. Pinned in Task 5: "ignores a Next pressed on a step that has passed".
2. **OBS reloads mid-intro.** The row on air comes back at once, with no entrance replayed. Pinned in Task 7: "on a reload, shows what's on air without entrances".
3. **A member's photo fails to load.** The card shows the logo fallback and still enters, and the run never stalls. Pinned in Task 6 ("a failed photo shows the team logo and is ready") and Task 7 ("a card waits for its photo before it enters").
4. **A 64-character name, or three custom roles plus pronouns.** The card keeps its width, and the name shrinks or wraps instead of spilling. Pinned in Task 6 by the `LongestName` story, which the story tests render with accessibility checks.
5. **A team is deleted, or a member removed, mid-run.** The run skips the missing person, or ends, without throwing. Pinned in Task 5: "skips a person removed mid-run, and ends the run when its team is deleted".

---

## File structure

**rcl-core and the SDK:**
- `packages/app-sdk/src/index.ts`: `TeamsService`, and `AppContext.teams`.
- `rcl-core/server/src/apps.ts`: builds `ctx.teams`.

**Contract (`rcl-producer/contract/src/`):**
- `intros.ts`: intro, roster options, placement, on-air and run schemas, plus the helpers that turn a team into roster data.
- `realtime.ts`: the `intro:state` and `intro:run` events, and the handshake.

**Server (`rcl-producer/server/`):**
- `src/db/schema.ts` and `drizzle/0001_intros.sql`: the `producer_intros` table.
- `src/intros/intros.ts`: intro rows (list, find, create, update, delete).
- `src/intros/run.ts`: the pure step machine.
- `src/intros/runs.ts`: runs per intro (memory, timers, fresh team reads).
- `src/intros/live.ts`: intro rooms in both namespaces, and announcements.
- `src/routes/intros.ts`: the setup routes.
- `src/routes/intro-runs.ts`: the run routes.
- `src/overlay.ts`: plain overlays move into a room, and theme announcements reach intro rooms too.
- `src/index.ts`: the new permissions, tags and wiring.

**OBS overlay (`rcl-producer/web/src/overlay/`):**
- `components/roster/layout.ts`: canvas constants, card width and anchors.
- `components/roster/team-colors.ts`: the `--team-*` variables, and black or white text on a team colour.
- `components/OverlayCanvas.tsx`: the 1920×1080 canvas, scaled.
- `components/PersonCard.tsx`, `TeamBanner.tsx` and `TeamRoster.tsx`, each with a `.module.css`, `.stories.tsx` and `.test.tsx`.
- `intro-path.ts`, `ThemeWhenLoaded.tsx` and `IntroOverlay.tsx`, plus changes to `live.ts`, `OverlayApp.tsx` and `main.tsx`.

**Producer app (`rcl-producer/web/src/`):**
- `api.ts`: the new endpoints.
- `pages/IntrosPage.tsx`, `IntroSetupPage.tsx`, `IntroPreview.tsx` and `IntroRunPage.tsx`, plus `routes.tsx`.

**Docs and end to end:**
- `docs/features/skater-intros.md`, the docs listed in the spec, `rcl-producer/CHANGELOG.md` and `e2e/tests/accounts.spec.ts`.

---

### Task 1: Teams for apps (rcl-core)

**Files:**
- Modify: `packages/app-sdk/src/index.ts` (the `AppContext` block, and its comment "Teams, CRG and OBS come later")
- Modify: `rcl-core/server/src/apps.ts:90-95` (`newContext`)
- Modify: `rcl-producer/server/src/testing.ts` (`testProducer` takes teams)
- Test: `rcl-core/server/src/apps.test.ts`
- Modify: `docs/architecture/README.md` ("How apps are hosted": `ctx.teams` joins `ctx.fonts`)
- Create: `docs/features/skater-intros.md` from `docs/templates/feature.md`, with `status: in-progress`, `app: rcl-producer`, and the spec's Goal, decisions and requirements, numbered R1… Link it from `docs/product/roadmap.md` Phase 2, listed before the Screen Builder. Then run `node scripts/check-docs.mjs --fix`.

**Interfaces:**
- Produces, in `@rollcall/app-sdk`:
  - `interface TeamsService { list(): TeamSummary[]; get(id: string): Team | undefined }`, with the types from `@rollcall/core-contract`;
  - `AppContext.teams: TeamsService`.
- Produces `testProducer({ fonts?: FontFamily[]; teams?: Team[] })`. Its `ctx.teams.get` looks the id up in a live array, so tests can change it mid-run: `testProducer` returns `teams` (the same array) alongside `api`, `ctx` and `client`. Its `list()` maps each team to its summary, with `skaterCount` and `benchCount` counted from `members`.

- [ ] **Step 1: Write the failing test** in `apps.test.ts`: "gives each app core's teams, read-only, as the teams routes return them". Create a team with two members using core's `createTeam` and `addMember`. Then:

```ts
expect(ctx.teams.list()).toEqual(listTeams(db));
expect(ctx.teams.get(team.id)).toEqual(findTeam(db, team.id));
expect(ctx.teams.get('nope')).toBeUndefined();
```

- [ ] **Step 2:** Run `yarn vitest run rcl-core/server/src/apps.test.ts`. Expected: FAIL, because `teams` is undefined (and a type error).
- [ ] **Step 3: Implement.** Add `TeamsService` and `teams` to `AppContext`. In `newContext`: `teams: { list: () => listTeams(db), get: (id) => findTeam(db, id) }`. Update `testProducer` to match.
- [ ] **Step 4:** Run `yarn vitest run rcl-core/server/src/apps.test.ts rcl-producer/server`. Expected: PASS.
- [ ] **Step 5: Commit** after `yarn check`, as `feat(rcl-core): read-only teams service for apps`.

### Task 2: Intros contract

**Files:**
- Create: `rcl-producer/contract/src/intros.ts` and `rcl-producer/contract/src/intros.test.ts`
- Modify: `rcl-producer/contract/src/realtime.ts` and `rcl-producer/contract/src/index.ts` (re-export)

**Interfaces (Produces, all exported from `@rollcall/producer-contract`):**

**Constants:**
- `ROSTER_ENTRANCES = ['pop', 'slide-up', 'fade', 'wipe'] as const`, giving `RosterEntranceSchema` and `RosterEntrance`.
- `ROSTER_SPOTS = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const`, giving `RosterSpotSchema` and `RosterSpot`.
- `INTRO_TEAM_SLOTS = ['a', 'b'] as const`, giving `IntroTeamSlotSchema` and `IntroTeamSlot`.

**Settings:**
- `RosterOptionsSchema`, a strict object:
  - `atOnce: int 1–20 | literal 'team'`;
  - `advance: { mode: 'next' } | { mode: 'timer'; seconds: int 2–60 }`, a discriminated union on `mode`;
  - `entrance`.

  `DEFAULT_ROSTER_OPTIONS = { atOnce: 1, advance: { mode: 'next' }, entrance: 'pop' }`.
- `IntroPlacementSchema = { spot, edge: int 0–200 }`. `DEFAULT_PLACEMENT = { spot: 'bottom-center', edge: 48 }`.

**Intros and requests:**
- `IntroSchema = { id, name, teamAId: string | null, teamBId: string | null, themeId: string | null, placement, options, createdAt: iso, updatedAt: iso }`.
- `CreateIntroRequestSchema = { name }`. The name is trimmed: `'Give the intro a name'` when empty, `'Use at most 64 characters'` over 64.
- `UpdateIntroRequestSchema`: every Intro field except id and the timestamps, each optional. A refine on `teamBId` gives `'Pick two different teams'` when both team ids are given, non-null and equal.
- `StartIntroRequestSchema = { team: IntroTeamSlot }`.
- `NextIntroRequestSchema = { revision?: int ≥ 0 }`.

**On air:**
- `RosterTeamSchema = { name, leagueName, logoUrl, primaryColor, secondaryColor }`. Everything but `name` is nullable.
- `RosterCardSchema = { id, kind: MemberKind, name, number: string | null, roleLine: string, photoUrl: string | null }`.
- `RosterOnAirSchema = { team: RosterTeam, title: boolean, cards: RosterCard[], upNext: RosterCard | null, slots: int ≥ 1, entrance, placement }`.
- `IntroOverlayStateSchema = { revision: int ≥ 0, onAir: RosterOnAir | null }`.

**The control page's run:**
- `IntroRunSchema` has:
  - `revision: int ≥ 0`;
  - `team: IntroTeamSlot | null`;
  - `title: boolean`;
  - `onAir: boolean`;
  - `people: { id, name, number: string | null, kind }[]`;
  - `onScreen: string[]`, the member ids on screen;
  - `next: string | null`, the member id coming next;
  - `done: boolean`;
  - `timerMsLeft: int ≥ 0 | null`.

**Helpers:**
- `roleLine(member: TeamMember): string`: the member's fixed roles by `MEMBER_ROLE_NAMES` (from `@rollcall/core-contract`), then their custom roles, then their pronouns, joined with `' · '` and skipping empty parts.
- `rosterCard(member: TeamMember): RosterCard`.
- `rosterTeam(team: Team | TeamSummary): RosterTeam`.

**In `realtime.ts`:**
- `INTRO_STATE_EVENT = 'intro:state'`, whose payload is `IntroOverlayStateSchema`.
- `INTRO_RUN_EVENT = 'intro:run'`, whose payload is `IntroRunSchema`.
- `IntroHandshakeSchema = z.object({ intro: z.string().min(1) })`, for `socket.handshake.auth`.

- [ ] **Step 1: Write failing tests** in `intros.test.ts`:
  - "accepts the defaults and every entrance and spot".
  - "refuses out-of-range settings". Cases: `atOnce: 0`, `21`, `'all'`; timer `seconds: 1` and `61`; `edge: -1` and `201`.
  - "trims an intro's name and explains an empty or long one": `'  Bout 1 '` → `'Bout 1'`. The messages are exactly as above.
  - "refuses the same team for A and B": the issue's message is `'Pick two different teams'`, and its path is `['teamBId']`. `{ teamAId: 't1', teamBId: null }` is accepted.
  - "writes a member's roles, custom roles and pronouns as one line":

    ```ts
    expect(roleLine(member({ roles: ['captain'], customRoles: ['Jammer'], pronouns: 'she/her' })))
      .toBe('Captain · Jammer · she/her');
    expect(roleLine(member({ roles: [], customRoles: [], pronouns: null }))).toBe('');
    expect(roleLine(member({ kind: 'bench', roles: ['bench-coach'], pronouns: null }))).toBe('Bench coach');
    ```

  - "makes roster data from a team and its members": `rosterCard` keeps `number` and `photoUrl` as given, and `rosterTeam` keeps the five fields.
  - "the run and overlay state schemas accept a run in progress and nothing on air": a parse round trip.

- [ ] **Step 2:** Run `yarn vitest run rcl-producer/contract`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the schemas and helpers above in `intros.ts`, and add the events to `realtime.ts`.
- [ ] **Step 4:** Run `yarn vitest run rcl-producer/contract`. Expected: PASS.
- [ ] **Step 5: Commit** after `yarn check`, as `feat(rcl-producer): intros contract`.

### Task 3: Intros storage and setup routes

**Files:**
- Modify: `rcl-producer/server/src/db/schema.ts`. Add `producerIntros`, with columns:
  - `id` (pk);
  - `name` (`notNull().unique()`);
  - `teamAId` (`team_a_id`, nullable) and `teamBId` (`team_b_id`, nullable);
  - `themeId` (`theme_id`, `references(() => producerThemes.id, { onDelete: 'set null' })`);
  - `placement` and `options` (json, typed);
  - `createdAt` and `updatedAt`.
- Create: the migration, with `yarn workspace @rollcall/producer-server db:generate --name intros`.
- Create: `rcl-producer/server/src/intros/intros.ts` and `rcl-producer/server/src/routes/intros.ts`
- Test: `rcl-producer/server/src/routes/intros.test.ts`
- Modify: `rcl-producer/server/src/index.ts`:
  - **Permissions:** `producer:intros.run` ("See intros, open their control page, and start, step through and clear them"), then `producer:intros.manage` ("Create, set up and delete intros"), both with `roles: ['producer']`.
  - **Tag:** `'producer/intros': 'Skater intros: saved setups, and running them live'`.
  - **Wiring:** `registerIntroRoutes`, with no-op `onSaved`/`onDeleted` until Task 5.
- Modify: `rcl-core/server/src/auth/route-inventory.test.ts`. Add the five setup routes to the API-key-callable list, in its sorted order.
- Modify: `docs/features/users-and-access.md`, whose permission table is kept in step by a test: two rows, ✅ for Admin, Producer and API keys, and — for Announcer.
- Modify: `docs/architecture/data-model.md`: an **Intro** entity (rcl-producer), with its fields and a link to the feature page.

**Interfaces:**
- Consumes: `ProducerDatabase` (`themes/themes.ts`), `findTheme`, `TeamsService` (Task 1), and the intro schemas (Task 2).
- Produces, in `intros/intros.ts`:
  - `listIntros(db): Intro[]`, by name ignoring case, as themes are listed;
  - `findIntro(db, id): Intro | undefined`;
  - `createIntro(db, { name }): Intro`, with `DEFAULT_PLACEMENT`, `DEFAULT_ROSTER_OPTIONS` and null teams and theme;
  - `updateIntro(db, id, changes: UpdateIntroRequest): Intro | undefined`;
  - `deleteIntro(db, id): Intro | undefined`;
  - `introNameTaken(db, name, exceptId?): boolean`.
- Produces `registerIntroRoutes(fastify, { db, teams, onSaved, onDeleted }: { db: ProducerDatabase; teams: TeamsService; onSaved: (before: Intro | undefined, after: Intro) => void; onDeleted: (id: string) => void })`, with:
  - `GET /intros` and `GET /intros/:id`, which need run;
  - `POST /intros` (201), `PATCH /intros/:id` and `DELETE /intros/:id` (204), which need manage;
  - tags `['producer/intros']`.
- Error replies:
  - `404 { error: 'not_found' }`;
  - `409 { error: 'name_taken', message: 'That name is already taken' }`;
  - `400 { error: 'same_team', message: 'Pick two different teams' }`, checked against the stored intro merged with the change;
  - `400 { error: 'unknown_team', message: 'That team no longer exists' }`;
  - `400 { error: 'unknown_theme', message: 'That theme no longer exists' }`.

- [ ] **Step 1: Write failing tests** in `routes/intros.test.ts`, with `testProducer({ teams: [ALL_STARS, WRECKERS] })`:
  - "creates an intro with the defaults, no teams and the default theme". Expect 201, `placement` equal to `DEFAULT_PLACEMENT`, `options` equal to `DEFAULT_ROSTER_OPTIONS`, and `teamAId`, `teamBId` and `themeId` null.
  - "lists intros by name, ignoring case".
  - "saves teams, a theme and settings, keeping what isn't sent". After a PATCH with only `options`, the earlier `teamAId` stays.
  - "refuses the same team twice, even across two saves". PATCH `teamAId: t1`, then PATCH `teamBId: t1`, gives 400 `same_team`.
  - "refuses a team or theme that doesn't exist": 400 `unknown_team` and 400 `unknown_theme`.
  - "refuses a name another intro has" (409), and "answers 404 for an unknown intro" on GET, PATCH and DELETE.
  - "falls back to the default theme when its theme is deleted". DELETE `/themes/:id`, then the intro's `themeId` is null.
  - "tells the server after each save and delete": `onSaved` gets the before and after values, and `onDeleted` gets the id.
- [ ] **Step 2:** Run `yarn vitest run rcl-producer/server/src/routes/intros.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the table, migration, row functions and routes. Check `teams.get` for each non-null team id sent, and `findTheme` for a non-null `themeId`.
- [ ] **Step 4:** Run `yarn vitest run rcl-producer/server rcl-core/server/src/auth`. Expected: PASS, including the route inventory with the new pins, and `rcl-core/server/src/installed-apps.test.ts` for the table name.
- [ ] **Step 5: Commit** after `yarn check`, as `feat(rcl-producer): store intros and set them up`.

### Task 4: The run's step machine

**Files:**
- Create: `rcl-producer/server/src/intros/run.ts` and `rcl-producer/server/src/intros/run.test.ts`

**Interfaces (Produces):**

```ts
export interface Run {
  revision: number;            // bumps on every change, never on a no-op
  team: IntroTeamSlot | null;  // the slot started last; null before any Start or after the run ends
  teamId: string | null;       // the team that slot held at Start
  people: readonly string[];   // member ids in team page order, fixed at Start
  slots: number;               // cards per row, fixed at Start: atOnce, or max(1, people.length) for 'team'
  step: number;                // 0: title card; k ≥ 1: people[k-1] is the latest shown
  rowStart: number;            // index in people of the row's first card
  onAir: boolean;              // false after Clear
  entrance: RosterEntrance;
  placement: IntroPlacement;
  seconds: number | null;      // timer seconds fixed at Start, or null for Next
}
export const NO_RUN: Run;  // revision 0, team null, people [], step 0, onAir false, defaults for the rest
export function startRun(run: Run, start: { team: IntroTeamSlot; teamId: string; people: readonly string[]; options: RosterOptions; placement: IntroPlacement }): Run;
export function nextStep(run: Run, isPresent: (id: string) => boolean): Run;  // the same object when nothing changes
export function clearRun(run: Run): Run;  // the same object when already off air
export function endRun(run: Run): Run;    // NO_RUN with revision + 1
export function shown(run: Run, isPresent: (id: string) => boolean): { title: boolean; people: string[] };
export function upNext(run: Run, isPresent: (id: string) => boolean): string | null;
export function isDone(run: Run, isPresent: (id: string) => boolean): boolean;
```

**The rules, from the spec's "What each button does":**
- **Start** puts the title card on air: step 0, `onAir` true.
- **Next** goes to the next *present* person. It's a fresh row (`rowStart` = that person's index) when:
  - the title card was up;
  - the run was cleared;
  - or the row already holds `slots` cards.

  Otherwise the person joins the row.
- **After the last present person,** Next is a no-op.
- **`shown`** filters out absent people. It's empty when `onAir` is false.

- [ ] **Step 1: Write the failing tests.** Use `P = ['p1','p2','p3','p4','p5','p6']`, `atOnce: 4`, and `all = () => true`:
  - "Start shows the title card and bumps the revision": `shown` is `{ title: true, people: [] }`, `upNext` is `'p1'`, and the revision is 1.
  - "each Next adds a person to the row until it's full, then starts a new row". After 4 Nexts, `people` is `['p1','p2','p3','p4']`. After the 5th, `['p5']`. After the 6th, `['p5','p6']`.
  - "Next after the last person changes nothing, and the run is done": `nextStep(r, all) === r`, and `isDone` is true.
  - "Clear keeps the place: the next Next starts a fresh row". After 2 Nexts and a Clear, `shown` gives `people: []`. Next gives `['p3']`, then `['p3','p4']`.
  - "Clear while the title card is up, then Next, shows the first person".
  - "skips people who are no longer present". `isPresent = id => id !== 'p2'`: after `p1`, Next shows `['p1','p3']`, and `upNext` skips `p2`.
  - "'Whole team' makes one row of everyone": `slots` is 6 for P, and 1 for `[]`.
  - "a team with no one present is done at its title card".
  - "Start mid-run begins the other team from its title card".
  - "endRun takes everything off air and forgets the team".
- [ ] **Step 2:** Run `yarn vitest run rcl-producer/server/src/intros/run.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions above as pure functions. They never mutate their input.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit** after `yarn check`, as `feat(rcl-producer): the intro run's step machine`.

### Task 5: Runs, run routes and live rooms

**Files:**
- Create: `rcl-producer/server/src/intros/runs.ts`, `rcl-producer/server/src/intros/live.ts` and `rcl-producer/server/src/routes/intro-runs.ts`
- Test: `rcl-producer/server/src/routes/intro-runs.test.ts` and `rcl-producer/server/src/intros/live.test.ts`
- Modify: `rcl-producer/server/src/overlay.ts`. Plain overlays join room `overlay:default`, and `announceDefaultTheme` emits to that room only, so intro overlays in the same namespace never get the default theme meant for them.
- Modify: `rcl-producer/server/src/overlay.test.ts`. The stand-in namespace gains `to(room)`, and the stand-in socket gains `join(room)` and `handshake: { auth }`. The existing five tests keep their meaning, with "broadcasts" now meaning emits to `overlay:default`.
- Modify: `rcl-producer/server/src/routes/themes.ts`. Add `onThemeChanged: (themeId: string) => void`, called after every successful PATCH and DELETE of a theme. `onDefaultChanged` is unchanged.
- Modify: `rcl-producer/server/src/index.ts`. Wire it together: one `IntroRuns` per context (a `WeakMap<AppContext, IntroRuns>`, like `overlays`), shared by `register()` and `realtime()`.
- Modify: `rcl-core/server/src/auth/route-inventory.test.ts`. Pin `GET /api/producer/intros/:id/run` and `POST /api/producer/intros/:id/{start,next,clear}`.

**Interfaces:**
- Consumes: `run.ts` (Task 4), the intro rows (Task 3), the schemas and events (Task 2), and `ctx.teams` (Task 1).
- Produces `introRuns({ db, teams, onChange }): IntroRuns`, where `onChange: (introId: string) => void` and:

  ```ts
  interface IntroRuns {
    run(intro: Intro): IntroRun;
    overlay(intro: Intro): IntroOverlayState;
    start(intro: Intro, team: IntroTeamSlot): IntroRun | 'no_team';
    next(intro: Intro, revision?: number): IntroRun;
    clear(intro: Intro): IntroRun;
    forget(introId: string): void;
    close(): void;
  }
  ```

- **How `runs` behaves:**
  - **Fresh reads.** Every method first reads `teams.get(run.teamId)`. A missing team means `endRun`. `isPresent` is "the member is still on the team".
  - **What `overlay()` sends.** `onAir` is built from fresh members with `rosterCard`/`rosterTeam`. It holds only the cards shown plus `upNext`, never the whole team.
  - **The timer.** `setTimeout(seconds × 1000)` runs after Start and after every step that leaves the run not done. It's cleared by Clear, by `forget`, and when the run is done.
  - **Stale presses.** A `next` whose `revision` isn't the current one changes nothing.
  - **Notifying.** `onChange` runs after every change, including a timer step and a run ended by a missing team.
- Produces `registerIntroRunRoutes(fastify, { db, runs })`. Its routes all need `producer:intros.run` and reply with `IntroRunSchema`:
  - `GET /intros/:id/run`;
  - `POST /intros/:id/start` with `StartIntroRequestSchema`;
  - `POST /intros/:id/next` with `NextIntroRequestSchema`;
  - `POST /intros/:id/clear` with `{}`.

  The errors are 404 `not_found`, and `409 { error: 'no_team', message: 'Pick team A first' }` (or "team B").
- Produces `live.ts`:
  - `introRoom(id) = \`intro:${id}\``;
  - `openIntroControl(rt, ctx, runs)`, which opens the namespace `/producer/intros` with access `{ permission: 'producer:intros.run' }`;
  - `announceIntro(ctx, runs, introId)`, which emits `intro:state` to the overlay room and `intro:run` to the control room;
  - `announceIntroThemes(ctx, which: 'default' | string)`, which sends `theme:changed` to every intro room using the default theme, or the given theme.

  `openOverlay` reads `socket.handshake.auth` with `IntroHandshakeSchema`:
  - **For a known intro:** join `introRoom(id)`, then emit `server:hello`, then `theme:changed` with the intro's theme (its own, or the default when `themeId` is null), then `intro:state`.
  - **For an unknown intro:** the same, with `onAir: null` and the default theme.
  - **With no intro:** join `overlay:default`, as today.
- **Wiring in `index.ts`:**
  - `onChange` goes to `announceIntro`.
  - Theme routes' `onDefaultChanged` goes to `announceDefaultTheme` plus `announceIntroThemes(ctx, 'default')`.
  - `onThemeChanged(id)` goes to `announceIntroThemes(ctx, id)`.
  - `themeKind`'s `announce` does both default announcements.
  - Intro `onSaved(before, after)` calls `announceIntroThemes` for that intro when `themeId` changed, and `announceIntro`.
  - `onDeleted(id)` calls `runs.forget(id)`, then emits `intro:state` with `onAir: null` to its overlay room.

- [ ] **Step 1: Write failing tests** in `routes/intro-runs.test.ts`. Use fake timers (`vi.useFakeTimers()`), a team of six members, and an intro with team A set to that team and `atOnce: 4`.
  - "starts a team with its title card, then shows people in team page order": `run.title` is true; after one Next, `onScreen` is `[m1]` and `next` is `m2`.
  - "answers 409 no_team for an empty slot or a deleted team".
  - **Review Focus 1:** "ignores a Next pressed on a step that has passed":

    ```ts
    const { revision } = await start('a');
    const first = await next({ revision });
    const second = await next({ revision });
    expect(second.revision).toBe(first.revision);
    expect(second.onScreen).toEqual([m1]);
    ```

  - "a Next without a revision always moves on".
  - "keeps the place after Clear: the next Next starts a fresh row". After 2 Nexts and a Clear, `onAir` is false and `onScreen` is `[]`. After a Next, `onScreen` is `[m3]`.
  - "on the timer, moves on by itself and stops after the last person". With `advance: { mode: 'timer', seconds: 5 }`: `vi.advanceTimersByTime(5000)` gives `onScreen` `[m1]`. After 6 more steps' time, `done` is true and `timerMsLeft` is null.
  - "Next during the timer restarts the countdown". Advance 4000, press Next, advance 4000: still one step on. Advance 1000: the next step.
  - **Review Focus 5:** "skips a person removed mid-run, and ends the run when its team is deleted". Remove `m2` from the live `teams` array after the first Next; the next Next shows `[m1, m3]`. Splice the team out; the next call gives `team: null` and `onAir: false`.
  - "reads details fresh: a photo changed mid-run shows in the next overlay state".
  - "settings saved mid-run take effect at the next Start": PATCH `atOnce: 2` mid-run; the row still fills to 4, and after a Start, to 2.
  - "deleting an intro forgets its run".
- [ ] **Step 2: Write failing tests** in `intros/live.test.ts`, with a stand-in namespace like `overlay.test.ts`'s:
  - "an overlay for an intro joins its room and gets hello, the intro's theme and its state; an unknown intro gets nothing on air".
  - "each change reaches the intro's overlay room and control room".
  - "a theme edit reaches only the intro rooms using that theme, and a new default reaches only those on Default theme".
  - "the overlay is sent only what's on air and who's next". After 2 Nexts on a team of six, the payload's cards are `[m1, m2]`, `upNext` is `m3`, and nothing else names `m4`–`m6`.
  - "the control namespace needs producer:intros.run" (its declared access).
- [ ] **Step 3:** Run `yarn vitest run rcl-producer/server`. Expected: the new tests FAIL. The existing `overlay.test.ts` passes once its stand-in gains rooms.
- [ ] **Step 4: Implement** `runs.ts`, `live.ts`, `intro-runs.ts` and the wiring above.
- [ ] **Step 5:** Run `yarn vitest run rcl-producer/server rcl-core/server`. Expected: PASS. That includes `realtime.test.ts`: the public namespaces are still just `/producer/overlay`, and anonymous clients are refused on `/producer/intros`.
- [ ] **Step 6: Commit** after `yarn check`, as `feat(rcl-producer): run intros live from the server`.

### Task 6: Overlay building blocks: canvas, card and banner

**Files:**
- Create in `rcl-producer/web/src/overlay/components/`:
  - `roster/layout.ts` and `roster/layout.test.ts`;
  - `roster/team-colors.ts` and `roster/team-colors.test.ts`;
  - `OverlayCanvas.tsx`, `OverlayCanvas.module.css` and `OverlayCanvas.test.tsx`;
  - `PersonCard.tsx`, `PersonCard.module.css`, `PersonCard.test.tsx` and `PersonCard.stories.tsx`;
  - `TeamBanner.tsx`, `TeamBanner.module.css`, `TeamBanner.test.tsx` and `TeamBanner.stories.tsx`.

**Interfaces (Produces):**
- **`layout.ts`:**
  - `CANVAS_WIDTH = 1920`, `CANVAS_HEIGHT = 1080`, `MAX_CARD_WIDTH = 420`, `CARD_GAP = 24`;
  - `cardWidth(boxWidth: number, slots: number): number`: `min(420, floor((boxWidth − 24 × (slots − 1)) / slots))`;
  - `anchor(spot: RosterSpot): { justifyContent: 'flex-start' | 'center' | 'flex-end'; alignItems: 'flex-start' | 'center' | 'flex-end' }`. The horizontal part of the spot gives `justifyContent`, and the vertical part gives `alignItems`.
- **`team-colors.ts`:**
  - `readableOn(hex: string): '#000000' | '#ffffff'`: whichever has the higher WCAG contrast ratio against `hex`;
  - `teamColorVariables(team: RosterTeam): Record<'--team-primary' | '--team-secondary' | '--team-on-primary', string>`.

  The fallbacks are `var(--theme-color-accent)`, `var(--theme-color-border)` and `var(--theme-color-on-accent)`.
- **`OverlayCanvas({ children, scale }: { children: ReactNode; scale?: number })`:**
  - a 1920×1080 box, `transform: scale(s)` from its top left, centred in the window;
  - `s` is `scale`, or `min(innerWidth / 1920, innerHeight / 1080)`, kept up to date on `resize`;
  - transparent.
- **`PersonCard({ card, width, logoUrl, onReady }: { card: RosterCard; width: number; logoUrl: string | null; onReady?: () => void })`:**
  - The photo area is 4:3 and covered. It shows `photoUrl`; failing that, `logoUrl` on `--team-primary`; failing that, `--team-primary` alone.
  - The badge shows `card.number` on `--team-primary` with `--team-on-primary` text. There's no badge when `number` is null.
  - The name uses `--theme-font-heading` and `--theme-heading-transform`. A long name shrinks to fit one line down to 60% of its size, then wraps to two (a container-query font size).
  - The role line uses `--team-secondary`, and keeps its height when empty.
  - The image has `alt=""`, and the card has the accessible name `card.name`.
  - `onReady` fires once: on the image's load, or when it fails over to the fallback, or at once when there's no image to load.
- **`TeamBanner({ team, onReady }: { team: RosterTeam; onReady?: () => void })`:**
  - a bar on `--team-primary`, with the logo in a circle (when there is one), the name, the league (when there is one), and an underline in `--team-secondary`;
  - the same `onReady` contract as `PersonCard`, for the logo.

- [ ] **Step 1: Write failing tests:**
  - `layout`:
    - `cardWidth(1824, 1) === 420`;
    - `cardWidth(1824, 4) === 420`;
    - `cardWidth(1824, 10) === 160`;
    - `cardWidth(1824, 20) === 68`;
    - `anchor('bottom-center')` is `{ justifyContent: 'center', alignItems: 'flex-end' }`;
    - `anchor('top-left')` is `{ 'flex-start', 'flex-start' }`.
  - `team-colors`:
    - `readableOn('#b3123f') === '#ffffff'`;
    - `readableOn('#f5c518') === '#000000'`;
    - a team with no colors gets the three `var(--theme-…)` fallbacks.
  - `OverlayCanvas`: with `innerWidth = 1280` and `innerHeight = 720`, the transform is `scale(0.6666…)`. A `resize` to 1920×1080 gives `scale(1)`, and `scale={0.25}` gives `scale(0.25)`.
  - `PersonCard`:
    - "shows the number badge for a skater and none for bench staff";
    - **Review Focus 3:** "a failed photo shows the team logo and is ready". `fireEvent.error(img)` gives an `img` with the logo's `src`, and `onReady` called once;
    - "with no photo and no logo, is ready at once";
    - "is ready when its photo loads" (`fireEvent.load`).
  - `TeamBanner`: "shows the name and league, and leaves out a missing logo or league".
- [ ] **Step 2:** Run `yarn vitest run rcl-producer/web/src/overlay/components`. Expected: FAIL.
- [ ] **Step 3: Implement** the components and CSS modules, sized as in `1-person-card.html` and `3-title-card.html`, scaled to the canvas.
- [ ] **Step 4: Write the stories.** Images are inline SVG data URIs, never network files.
  - `PersonCard`: `Skater`, `BenchStaff`, `NoPhoto`, `NoPhotoNoLogo`, and **`LongestName`** (Review Focus 4: a 64-character name, three 32-character custom roles and pronouns, at width 160).
  - `TeamBanner`: `WithLogo`, `NoLogo` and `NoLeague`.
- [ ] **Step 5:** Run `yarn vitest run rcl-producer/web/src/overlay` and `yarn test:stories`. Expected: PASS, with accessibility checks clean.
- [ ] **Step 6: Commit** after `yarn check`, as `feat(rcl-producer): overlay canvas, person card and team banner`.

### Task 7: The team roster component

**Files:**
- Create in `rcl-producer/web/src/overlay/components/`: `TeamRoster.tsx`, `TeamRoster.module.css`, `TeamRoster.test.tsx`, `TeamRoster.stories.tsx` and `roster/continues-row.ts`, with its test.

**Interfaces:**
- Consumes: `PersonCard`, `TeamBanner`, `cardWidth`, `anchor`, `teamColorVariables` and `CANVAS_*` (Task 6), and `RosterOnAir` (Task 2).
- Produces `continuesRow(shown: RosterOnAir | null, next: RosterOnAir | null): boolean`. It's true when both are non-null, neither is a title, both are the same team (by `team.name`), and the shown card ids are a prefix of the next card ids. That's the case when the next state only adds cards or changes details.
- Produces `TeamRoster({ onAir }: { onAir: RosterOnAir | null })`, which fills the canvas:
  - **The box** is the canvas inset by `placement.edge` on every side, laid out with `anchor(placement.spot)`.
  - **Every card** is `cardWidth(1920 − 2 × edge, slots)` wide.
  - **Row behaviour** (row A in `2-row.html`): a new card's place opens with a width transition, so the cards already up slide aside, and then the card plays its entrance.
  - **When the next state doesn't continue the row:** the shown row (or title) gets `data-leaving` and plays its entrance in reverse. On `animationend` of the last leaving element, the next state is shown.
  - **A card or banner is `data-state="waiting"`** (no width, invisible) until its `onReady`. Then it's `data-state="entering"` with `data-entrance={onAir.entrance}`, then `"shown"`.
  - **The first state at mount** renders `data-state="shown"` with no entrance. That's a reload.
  - **Preloading:** `<link rel="preload" as="image" href={upNext.photoUrl}>` when there is one.
  - **Team colours:** `teamColorVariables(onAir.team)` is set on the root.

- [ ] **Step 1: Write the failing tests.** jsdom doesn't animate, so drive it with `fireEvent.animationEnd` and `fireEvent.load`.
  - `continuesRow`: true for adding a card; false for title → row, for row → a new row, and for another team; true for the same cards with a new photo.
  - "shows the title card, then on the first person the title leaves before the card comes in". After the switch, the banner is `data-leaving` and no card is shown. After `animationEnd`, the card is waiting, then entering after `load`.
  - "adds a card to the row without the others leaving".
  - "clears a full row before the next row's first card comes in".
  - **Review Focus 3:** "a card waits for its photo before it enters". It's `data-state="waiting"` until `fireEvent.load`, or until `fireEvent.error`, which shows the logo and enters.
  - **Review Focus 2:** "on a reload, shows what's on air without entrances". A mount with a two-card row gives both `data-state="shown"`, and no element has `data-entrance`.
  - "sizes every card for the run's slots": edge 48 with slots 10 gives each card `width: 160px`.
  - "anchors the row to its spot": `bottom-right` gives `justify-content: flex-end` and `align-items: flex-end`.
  - "when nothing is on air, whatever is up leaves".
  - "preloads the next person's photo".
- [ ] **Step 2:** Run `yarn vitest run rcl-producer/web/src/overlay/components/TeamRoster.test.tsx rcl-producer/web/src/overlay/components/roster`. Expected: FAIL.
- [ ] **Step 3: Implement** `continuesRow` and `TeamRoster`, with the four entrances as CSS keyframes and their reverses under `[data-leaving]`, about 400 ms each, as in the mockups.
- [ ] **Step 4: Write the stories** `TitleCard`, `RowOfThreeOfFour`, `FullRowOfFour`, `WholeTeamOfFifteen` and `TopLeft`.
- [ ] **Step 5:** Run `yarn vitest run rcl-producer/web/src/overlay` and `yarn test:stories`. Expected: PASS.
- [ ] **Step 6: Commit** after `yarn check`, as `feat(rcl-producer): team roster overlay component`.

### Task 8: The intro's OBS page

**Files:**
- Create in `rcl-producer/web/src/overlay/`: `intro-path.ts` and `intro-path.test.ts`; `ThemeWhenLoaded.tsx` and `ThemeWhenLoaded.test.tsx`; `IntroOverlay.tsx`.
- Modify: `live.ts`, `OverlayApp.tsx`, `OverlayApp.test.tsx` and `main.tsx` there.

**Interfaces:**
- Consumes: `TeamRoster` and `OverlayCanvas` (Tasks 6–7), `ThemeScope`, `themeToCss`, `fontFaceRules`, `familiesUsedBy` and `INTRO_STATE_EVENT` (Task 2).
- Produces `introIdFromPath(pathname: string): string | null`. It matches `^/producer/overlay/intros/([^/]+)/?$` and decodes the id.
- `LiveState` gains `intro: IntroOverlayState | null`. The new state is applied only when its `revision` isn't older than the cached one.
- `makeOverlayStore(connect)` is unchanged. `main.tsx` passes `() => io('/producer/overlay', introId ? { auth: { intro: introId } } : {})`, and renders `<OverlayApp introId={introId} />`.
- `OverlayApp({ introId }: { introId: string | null })`:
  - With an `introId`, it renders `<IntroOverlay state={data.intro} theme={data.theme} />`, once the server has spoken.
  - Without one, it renders today's placeholder, unchanged.
- `ThemeWhenLoaded({ theme, children }: { theme: ThemeChanged; children: ReactNode })`:
  - It renders `<ThemeScope css=…>` with the last theme whose fonts have loaded.
  - For a new theme, it first adds that theme's `@font-face` rules in a `<style data-pending-fonts>`, then awaits `document.fonts.load('1em "<family>"')` for each family it uses, then switches.
  - With no `document.fonts`, it switches at once. A failed load also switches, so the theme is never stuck.
- `IntroOverlay({ state, theme })` renders `OverlayCanvas`, then `ThemeWhenLoaded`, then `TeamRoster onAir={state?.onAir ?? null}`.

- [ ] **Step 1: Write the failing tests:**
  - `intro-path`:
    - `'/producer/overlay/intros/abc'` gives `'abc'`;
    - a trailing slash gives `'abc'`;
    - `'/producer/overlay'` gives null;
    - `'/producer/overlay/some-output-token'` gives null;
    - `'/producer/overlay/intros/a%20b'` gives `'a b'`.
  - `OverlayApp`:
    - "at an intro's address, shows the roster the server sends, and nothing before". After a `FakeSocket` emits `server:hello`, `theme:changed` and `intro:state` with the title on air, the banner's team name is shown.
    - "ignores an intro state older than the one shown".
    - The existing placeholder tests are unchanged.
  - `ThemeWhenLoaded`:
    - "holds the old theme until the new theme's fonts load". Stub `document.fonts = { load: vi.fn(() => pending) }`: the accent stays old until `pending` resolves, then switches.
    - "switches at once without a font loading API".
- [ ] **Step 2:** Run `yarn vitest run rcl-producer/web/src/overlay`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4:** Run `yarn vitest run rcl-producer/web/src/overlay` (including `bundle.test.ts`). Expected: PASS.
- [ ] **Step 5: Commit** after `yarn check`, as `feat(rcl-producer): intro OBS page`.

### Task 9: Intros list and setup page

**Files:**
- Modify: `rcl-producer/web/src/api.ts` and `rcl-producer/web/src/routes.tsx`. In `routes.tsx`, add the link `{ label: 'Intros', to: '/intros', permission: 'producer:intros.run' }` and the routes `intros`, `intros/:id` and `intros/:id/run` (the last one is Task 10's page).
- Create: `rcl-producer/web/src/pages/IntrosPage.tsx` and its test, `pages/IntroSetupPage.tsx` and its test, and `pages/IntroPreview.tsx`

**Interfaces:**
- Produces, in `api.ts`, with tag types `'Intros'` and `'Teams'`:
  - `useGetTeamsQuery` (`core/teams`, `TeamSummarySchema.array()`) and `useGetTeamQuery(id)` (`core/teams/:id`, `TeamSchema`);
  - `useGetIntrosQuery`, `useGetIntroQuery(id)` and `useCreateIntroMutation`;
  - `useUpdateIntroMutation({ id, changes })` and `useDeleteIntroMutation({ id })`;
  - `imported()` also invalidates `'Teams'`.
- **`IntrosPage` (`/producer/intros`):**
  - It has the heading "Intros".
  - Each row shows the name, "<Team A> vs <Team B>" (or "No teams yet"), and links: "Set up" (only with manage) and "Run".
  - "New intro" (only with manage) takes a name and opens the setup page.
  - Delete (only with manage) confirms first: "Delete intro “<name>”? Its OBS browser source will show nothing."
  - Permission checks follow `ThemesPage`: `me.permissions.includes(…)`.
- **`IntroSetupPage` (`/producer/intros/:id`) labels, exactly:**
  - "Name";
  - "Team A" and "Team B";
  - "Theme", with "Default theme" first, then themes by name;
  - "How many at once", with "1"–"20" and "Whole team";
  - "Moves on", either "When I press Next" or "On a timer", plus "Seconds per step" (2–60) shown only for the timer;
  - "Entrance", with "Pop", "Slide up", "Fade" and "Wipe";
  - "Position", a 3×3 radio grid labelled "Top left" … "Bottom right";
  - "Distance from the edge (px)", 0–200;
  - "Save".
- **The rest of the setup page:**
  - A deleted team shows "This team was deleted. Pick another."
  - The section "OBS browser source" shows `${location.origin}/producer/overlay/intros/<id>`, a "Copy" button, and "Add it to OBS as a browser source sized 1920×1080."
  - The form checks itself with `UpdateIntroRequestSchema` before sending, as the theme editor does.
- **`IntroPreview({ team, options, placement, theme })`:**
  - It renders `OverlayCanvas scale={0.25}`, then `ThemeScope`, then `TeamRoster`.
  - It steps a demo `RosterOnAir` every 1.2 s: the title, then team A's first `min(slots, 4)` people (built with `rosterTeam` and `rosterCard`), then over again.
  - The theme is the chosen theme's tokens, or the default theme's.

- [ ] **Step 1: Write the failing tests**, with `openProducer` and `signedIn(PRODUCER, { … })`:
  - `IntrosPage`:
    - "lists intros with their teams";
    - "creates an intro by name and opens its setup page" (`whereIs(router)` is `/producer/intros/<id>`);
    - "asks before deleting";
    - "without intros.manage, shows Run but not Set up, New intro or Delete".
  - `IntroSetupPage`:
    - "shows the saved settings";
    - "saves the changes it sends": the PATCH body holds only changed fields;
    - "refuses the same team twice before sending", with the field error "Pick two different teams" and no request;
    - "says when a team was deleted";
    - "shows the OBS address to copy";
    - "previews team A's title card": the banner shows team A's name.
- [ ] **Step 2:** Run `yarn vitest run rcl-producer/web/src/pages`. Expected: FAIL.
- [ ] **Step 3: Implement** the endpoints, routes and pages.
- [ ] **Step 4:** Run `yarn vitest run rcl-producer/web`. Expected: PASS.
- [ ] **Step 5: Commit** after `yarn check`, as `feat(rcl-producer): intros list and setup page`.

### Task 10: The control page

**Files:**
- Modify: `rcl-producer/web/src/api.ts`
- Create: `rcl-producer/web/src/pages/IntroRunPage.tsx` and `rcl-producer/web/src/pages/IntroRunPage.test.tsx`

**Interfaces:**
- Produces `useGetIntroRunQuery(id)`. Its data is `{ connected: boolean; run: IntroRun; receivedAt: number }`, fetched from `producer/intros/:id/run`.
  - Its `onCacheEntryAdded` opens `io('/producer/intros', { auth: { intro: id } })`.
  - `connect` and `disconnect` set `connected`.
  - `intro:run` replaces `run` (and `receivedAt`) only when its `revision` is newer.
- Produces `useStartIntroMutation({ id, team })`, `useNextIntroMutation({ id, revision })` and `useClearIntroMutation({ id })`. Each writes its reply into the `getIntroRun` cache with `updateQueryData`, under the same newer-revision rule.
- **`IntroRunPage` (`/producer/intros/:id/run`), phone first:**
  - It has the intro's name as its heading.
  - Buttons:
    - "Start <Team A name>" and "Start <Team B name>", each disabled when its slot is empty or its team is no longer in `useGetTeamsQuery` (with the label "Start team A" or "Start team B" then);
    - "Next", full width and large, which sends the shown `revision`. It's labelled "Team done" and disabled when `run.done`, and disabled when no team has started;
    - "Clear", set apart below, subtle and red.
  - While disconnected, it shows "Reconnecting… The buttons come back when the connection does." and every button is disabled.
  - "Title card is up" shows when `run.title`.
  - The people list shows each person's number and name, with a badge "On screen" or "Next".
  - On the timer, it shows "Next in N s", counting down from `timerMsLeft` and `receivedAt` with a 250 ms interval.
  - A 409 `no_team` shows its message.

- [ ] **Step 1: Write the failing tests**, with `vi.mock('socket.io-client', () => ({ io: () => socket }))` using the overlay's `FakeSocket`:
  - "starts a team and marks who's on screen and who's next, as the server says";
  - "sends the revision it shows with Next" (the request body is `{ revision: 3 }`);
  - "shows a newer state from the socket and ignores an older one";
  - "disables the buttons while the connection is down";
  - "says the team is done after the last person";
  - "counts down to the next step on the timer" (fake timers: "Next in 5 s", then "Next in 3 s" after 2000 ms).
- [ ] **Step 2:** Run `yarn vitest run rcl-producer/web/src/pages/IntroRunPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the endpoints and the page.
- [ ] **Step 4:** Run `yarn vitest run rcl-producer/web`. Expected: PASS.
- [ ] **Step 5: Commit** after `yarn check`, as `feat(rcl-producer): intro control page`.

### Task 11: Docs, changelog and end to end

**Files:**
- Modify: `docs/features/skater-intros.md`. Set `status: shipped`, write the **Behavior** section from what was built, and move answered questions into the body.
- Modify:
  - `docs/features/overlay-components.md`: the Team roster requirements (its title card, its options schema, and its live controls Start/Next/Clear), with the long-rosters open question answered.
  - `docs/features/screen-builder.md`: intros stand in until the Screen Builder; the canvas is 1920×1080, scaled to fit; the roster's options schema carries over.
  - `docs/features/live-mode.md`: active rosters, picked when an event starts, bench staff included.
  - `docs/features/team-builder.md`: the game-roster question points to Live Mode.
  - `docs/features/theme-builder.md`: team colours are answered (`--team-*`), and theme edits reach intro overlays.
  - `docs/product/glossary.md`: **Intro**, **Title card** and **Active roster** (planned).
  - `docs/decisions/0006-…`: no change; it's linked from the feature page.
- Modify: `.claude/rules/rcl-producer-overlay.md`, `.claude/rules/rcl-producer-server.md` and `.claude/rules/rcl-producer-web.md`. Name the new files, the `overlay:default` room, the intro rooms, and `testProducer({ teams })`.
- Modify: `rcl-producer/CHANGELOG.md`, under Unreleased, Added. Issue #25:
  > Skater intros: before a game, put each team's people on stream as the announcer calls them. A title banner for the team comes first, then a card per person with their photo, number, name, roles and pronouns, in one row along the bottom. Set up the two teams, a theme, how many cards show at once, the entrance and where the row sits, add the intro's address to OBS as a browser source, and run it from the control page on a laptop or phone: Start each team when you're ready, then Next for each person, or let a timer move it on. Admins and Producers set up and run intros. It shows the whole team for now (#25)
- Modify: `e2e/tests/accounts.spec.ts`. Append a step after the last one: "an Admin sets up a skater intro and runs it on the OBS page".
  1. Sign in as ADMIN, then create a team with one skater through `page.request`.
  2. Create an intro on `/producer/intros`, then pick the team as Team A and Save.
  3. Open the OBS URL in a second page.
  4. On `/producer/intros/<id>/run`, press "Start <team>". The OBS page shows the team name.
  5. Press "Next". The OBS page shows the skater's name, and the control page marks them "On screen".
- Modify: `.claude/status.md`. Add the release-order note to Loose ends: rcl-producer uses `ctx.teams`, so before rcl-producer's next release, rcl-core with `teams` (0.4.0) must be released, and rcl-producer's `requiresCore` raised to `^0.4.0`.

- [ ] **Step 1:** Run `node scripts/check-docs.mjs --fix`, then `yarn docs:check`. Expected: `check-docs: OK`.
- [ ] **Step 2:** Run `yarn test:e2e`. Expected: every test passes, including the new step and the three existing overlay tests.
- [ ] **Step 3:** Run `yarn test:stories`. Expected: PASS.
- [ ] **Step 4: Commit** after `yarn check`, as `docs(rcl-producer): skater intros`.
