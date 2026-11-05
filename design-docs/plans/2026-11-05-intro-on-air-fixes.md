# Intro OBS page fixes (#26, on air) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what a producer could notice on air in skater intros' OBS page: hanging loads, a removed member's card, cards entering out of order, the first card's needless wait, the banner's text contrast and stray animation events. Also add the overlay tests, a stepping story and the overlay tidy-ups from #26.

**Architecture:** The roster's state machine moves out of `TeamRoster.tsx` into a pure module (`components/roster/roster-state.ts`) and gains three phases. `ready` means the picture is on show and the card waits its turn. `going` is a removed card playing its exit. `closing` means its place is shutting. One fallback timer moves any stuck piece on. Readiness gets a 4 s limit in `useReadyOnce` and `ThemeWhenLoaded`. The banner's fade target becomes a team colour variable.

**Tech Stack:** React 19, CSS modules, Vitest + React Testing Library (jsdom), Storybook (overlay, no Mantine).

**Spec:** [#26](https://github.com/wardmanm/rollcall_derby/issues/26) ("On air" section, plus the overlay lines of "Tests" and "Docs and tidy-up", and the `PersonCard.module.css` comment). One "On air" item, the duplicate `theme:changed` on deleting the default theme, is server code, so `fix/intro-server` fixes it. Behavior: `docs/features/skater-intros.md`. Decisions (Mike, 2026-11-05): the banner fades toward black or white, whichever is opposite its text. A removed member's card leaves on its own, then its gap closes. Defaults stated to Mike: a 4 s limit, no new changelog lines.

## Global Constraints

- Overlay code never imports Mantine, `@rollcall/web-sdk` or `src/pages` (`.claude/rules/rcl-producer-overlay.md`; `bundle.test.ts` enforces it).
- Overlay CSS uses `--theme-*` and `--team-*` custom properties only. Literal colors come from TypeScript as variables, as `readableOn` already does.
- `LOAD_LIMIT_MS = 4000`: a photo, logo or theme font that has neither loaded nor failed by then counts as failed. The limit is per piece, counted from when it mounts.
- Timings that stay as they are: a place opens in 300 ms, a piece enters or leaves in 400 ms, and the `FALLBACK_MS = 1000` fallback stays.
- No changelog lines (intros are unreleased; the #25 line covers this). Don't edit `.claude/status.md` in task commits.
- `docs/features/skater-intros.md`: edit only R8, the "Readiness" and "Opening" bullets, and the colour sentence of the title-card bullet. `fix/intro-server` edits "Running it" and the title-card bullet's replay sentence, and owns `overlay-components.md` and `theme-builder.md`.
- Commits: `fix(rcl-producer): …`, `test(rcl-producer): …` or `refactor(rcl-producer): …`, body ending `Refs #26`, a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `yarn check` before each commit. `transfer.test.ts` "builds a big file…" is known flaky: re-run once.

## Review Focus

1. **Production keyframe names.** The animation filter compares `animationName` with the CSS module's exported keyframe names (`classes['pop-out']`). If the build didn't export them, every exit would be ignored and the row would leave only on the 1 s fallback. Task 2 tests that the four exit names are distinct and non-empty, and Task 9 checks a real build in Chromium.
2. **Removing the first card of a centred row.** `.place + .place` margins would leave a 24 px gap, shifting the row by 12 px. Task 4 adds the negative end margin and a test that the closing first place carries `data-state="closing"` at `:first-child`. Task 9 checks it by eye.
3. **A browser source hidden mid-step** (no animation or transition events). A going or closing card must still clear. Task 4 tests the stuck timer dropping a closing card.
4. **A theme whose fonts hang, followed by a newer theme.** The old theme's 4 s timer must not apply it. Task 5 tests it.
5. **A photo slower than 4 s.** The card comes in with the logo and stays on it, even if the photo arrives later. The same card stays on the logo until its `photoUrl` changes. Task 5 pins this.

---

### Task 1: Move the roster's state machine into its own module

A refactor with no behavior change except the three small fixes named here.

**Files:**
- Create: `rcl-producer/web/src/overlay/components/roster/roster-state.ts`
- Modify: `rcl-producer/web/src/overlay/components/TeamRoster.tsx` (lines 16–144 move out)
- Modify: `rcl-producer/web/src/overlay/components/TeamRoster.module.css` (visibility rule)
- Modify: `rcl-producer/web/src/overlay/components/roster/layout.ts`, `layout.test.ts`

**Interfaces:**
- Produces, from `roster-state.ts`:
  - `type Phase = 'waiting' | 'opening' | 'entering' | 'shown'` (Tasks 3 and 4 add phases)
  - `const TITLE = 'title'`
  - `interface RosterState`, the same fields as today
  - `type RosterAction` with these members:
    - `{ type: 'onAir'; onAir: RosterOnAir | null }`
    - `{ type: 'ready'; key: string; screen: number }`
    - `{ type: 'placeEnd'; key: string }` (was `opened`)
    - `{ type: 'animationEnd'; key: string }`
    - `{ type: 'stuckTimeout'; screen: number }` (was `openTimeout`)
    - `{ type: 'leaveTimeout'; screen: number }`
  - `startRoster(onAir: RosterOnAir | null): RosterState`
  - `reduceRoster(state: RosterState, action: RosterAction): RosterState`
  - `keysOf(onAir: RosterOnAir | null): string[]`
  - `isUp(phase: Phase | undefined): boolean`
  - `FALLBACK_MS = 1000`

- [ ] **Step 1: Write the failing test.** In `layout.test.ts`, add `it('never gives a card less than 1px, however many there are')`: `expect(cardWidth(1824, 64)).toBeGreaterThanOrEqual(1)` and `expect(cardWidth(1824, 200)).toBe(1)`.
- [ ] **Step 2: Run** `yarn vitest run --project producer-web src/overlay/components/roster/layout.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `cardWidth` returns `Math.max(1, …)`.
  - Move the reducer, its types and helpers into `roster-state.ts` under the names above.
  - Make the `switch` exhaustive: an explicit `case 'leaveTimeout'`, then `default` assigning the action to `never` and returning `state`.
  - In `TeamRoster.module.css`, invert the visibility rule: `.piece { visibility: hidden }`, then `visibility: visible` only for `[data-state='entering']` and `[data-state='shown']`, so a missing or unknown state stays hidden.
  - `TeamRoster.tsx` imports what it needs and keeps rendering, effects and listeners.
- [ ] **Step 4: Run** `yarn vitest run --project producer-web src/overlay`. Expected: PASS, with every existing `TeamRoster` test unchanged.
- [ ] **Step 5: Commit** `refactor(rcl-producer): move the intro roster's state machine into its own module`.

### Task 2: Only a piece's own animation counts

**Files:**
- Create: `rcl-producer/web/src/overlay/components/roster/animations.ts`
- Modify: `TeamRoster.tsx` (the native listener), `roster-state.ts`
- Test: `TeamRoster.test.tsx`, `roster/animations.test.ts`

**Interfaces:**
- Consumes: Task 1's `RosterAction`.
- Produces: `{ type: 'animationEnd'; key: string; exit: boolean }`. `exit` is true when `animationName` is one of `EXIT_ANIMATIONS`, a `ReadonlySet<string>` exported from `roster/animations.ts` (not from the component file, which may only export components) and built from `classes['pop-out']`, `classes['slide-up-out']`, `classes['fade-out']` and `classes['wipe-out']`.
- Produces (tests): helpers `endAnimation(piece, name, target = piece.firstElementChild)`, `entered(piece)` (name `classes['pop-in']`) and `exited(piece)` (name `classes['pop-out']`). They dispatch a bubbling `Event('animationend')` with `animationName` set by `Object.defineProperty`, inside `act`. jsdom has no `AnimationEvent`.

- [ ] **Step 1: Write the failing tests.** Replace every `fireEvent.animationEnd(x)` in `TeamRoster.test.tsx` with `entered(x)` or `exited(x)`. Then add:
  - `'ignores an animation that ends inside a piece'`: a card entering, `endAnimation(card, classes['pop-in'], img(card))` leaves it `entering`. During a row leave, an exit end fired on the image doesn't count: the row is still there.
  - `"an entrance that ends after the row starts leaving doesn't count as leaving"`: `reload(row(1))`, add card 2 and bring it to `entering`, rerender `null`, `entered(card2)`. Card 2 is still in the document, and `exited` on both removes the row.
  - `"a transition inside a card's place doesn't open it"`: `fireEvent.transitionEnd(img(card2))` leaves it `opening`.
  - In `animations.test.ts`, `'exit names are distinct'`: `EXIT_ANIMATIONS` holds four distinct non-empty strings.
- [ ] **Step 2: Run** the roster tests. Expected: the new tests FAIL. The converted old ones pass, except where the target or name now matters.
- [ ] **Step 3: Implement.**
  - The listener dispatches `animationEnd` only when `event.target.parentElement` is the piece and the target has `classes.motion`, passing `exit`.
  - The reducer counts an end as leaving only when `exit` is true, and moves `entering → shown` only when it's false.
  - `transitionend` stays as it is (the target must be the piece), now dispatching `placeEnd`.
- [ ] **Step 4: Run** `yarn vitest run --project producer-web src/overlay`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(rcl-producer): count only a roster piece's own entrance or exit`.

### Task 3: Cards enter in order, and a screen's first card comes straight in

**Files:**
- Modify: `roster-state.ts`, `TeamRoster.tsx` (`data-open`), `TeamRoster.module.css`
- Test: `TeamRoster.test.tsx`
- Docs: `docs/features/skater-intros.md`, the "Opening" bullet

**Interfaces:**
- Produces:
  - `Phase` gains `'ready'`: the picture is on show and the card waits for every earlier card.
  - `RosterState` gains `opener: string | null`. `show()` sets it to the screen's first card id, or null for a title. `startRoster` sets null, since a reload is all quiet.
  - The opener's place renders `data-open` and is never closed while waiting.
  - `advance(state: RosterState): RosterState`, internal, runs after every non-leaving change. Walk the cards in order. A `ready` card moves on only while every earlier card is `entering`, `shown`, `going` or `closing` (Task 4 adds the last two). It moves to `entering` if it's the opener, otherwise to `opening`.

- [ ] **Step 1: Write the failing tests.**
  - `'the first card of a new screen enters without waiting for its place'`: from `title`, go to `row(1)`, `exited(banner)`, then load the image. Card 1 is `entering`, never `opening`, and its place has `data-open`.
  - `'a card whose photo loads first waits for the cards before it'`: `reload(row(1))`, then rerender `row(1,2)` and `row(1,2,3)`, and load card 3's image first. Card 3 is `ready` and hidden. Load card 2's: card 2 is `opening`, card 3 still `ready`. `placeEnd` on card 2: card 2 `entering`, card 3 `opening`.
  - Update two existing tests where card 1 is now the opener and goes straight to `entering` after loading, with no `opening` or `transitionEnd` step: "shows the title card…" and "a card waits for its photo before it enters". In the second, card 2 still goes `waiting` → `opening`.
- [ ] **Step 2: Run** the roster tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The `ready` action: quiet → `shown`, the title → `entering`, a card → `ready`, then `advance`. Call `advance` after `placeEnd`, `stuckTimeout` and a continuing `onAir` too.
  - CSS: a place is closed (`width: 0; margin-inline-start: 0`) when `[data-state='waiting']` or `[data-state='ready']` without `[data-quiet]` or `[data-open]`. `ready` is hidden by Task 1's rule.
- [ ] **Step 4: Run** `yarn vitest run --project producer-web src/overlay`. Expected: PASS.
- [ ] **Step 5: Docs.** In the Opening bullet, add: "A row's first card has nothing to slide aside, so it comes straight in. Cards come in in row order: one whose picture is ready first waits for every card before it."
- [ ] **Step 6: Commit** `fix(rcl-producer): bring intro cards in in order, and a row's first card straight in`.

### Task 4: A removed member's card leaves on its own, then its place closes

**Files:**
- Modify: `components/roster/continues-row.ts`, `continues-row.test.ts`, `roster-state.ts`, `TeamRoster.tsx`, `TeamRoster.module.css`
- Test: `TeamRoster.test.tsx`
- Docs: `skater-intros.md`, the "Opening" bullet

**Interfaces:**
- Produces:
  - `continuesRow(shown, next)`, same signature with a new rule: same team, neither a title, at least one of `shown`'s cards still in `next`, and `next.cards` is those kept cards in their order followed only by cards not in `shown`.
  - `joinRow(shown: RosterOnAir, next: RosterOnAir): RosterOnAir`, in `continues-row.ts`: `next` with its cards replaced by `shown`'s cards in order (each replaced by `next`'s copy when it has one), then `next`'s new cards. Ids never come back once removed (people are fixed at Start).
  - `Phase` gains `'going'` (visible, playing its exit) and `'closing'` (hidden, its place shutting). `isUp` is true for `entering`, `shown` and `going`.
  - The reducer compares with `live(state)`: `shown` minus `going` and `closing` cards.
  - On a continuing `onAir`, each removed live card moves:
    - a card that's up → `going`
    - an `opening` card, or a waiting or ready card whose place is open (quiet or opener) → `closing`
    - any other card is dropped at once, from both `shown.cards` and `phases`
  - `animationEnd` with `exit` on a `going` card → `closing`. `placeEnd` on a `closing` card drops it.
  - `stuckTimeout` (the timer runs while any piece is `opening`, `going` or `closing`, and restarts when that set changes) moves `opening → entering`, `going → closing` and drops `closing` cards, then calls `advance`.
  - While the row leaves, a `going` card counts as up, and its exit end counts as left.
  - Attributes: a `going` piece gets `data-leaving` and `data-entrance`.
  - CSS: add `[data-state='going']` to Task 1's visible states. `[data-state='closing']` gets `width: 0; margin-inline-start: 0`. `.place[data-state='closing']:first-child` gets `margin-inline-end: calc(-1 * var(--card-gap))`, so the next place's gap closes too.

- [ ] **Step 1: Write the failing tests.**
  - `continues-row.test.ts` cases, each with its expected result:

    | `shown` | `next` | Result |
    |---|---|---|
    | [1,2,3] | [1,3,4] | continues |
    | [1,2] | [2] | continues |
    | [1,2] | [3] | doesn't (nothing kept: a new row) |
    | [1,2] | [2,1] | doesn't (reordered) |
    | [1,2] | another team's [1,2,3] | doesn't |

    `joinRow` of [1,2,3] and [1,3,4] gives ids [1,2,3,4], with card 1's details from `next`.
  - `'a member removed mid-row leaves alone and the others stay'`: `reload(row(1,2,3))`, then rerender `onAir({ cards: [1,3,4] })`. Card 2 has `data-leaving` and is `going`; cards 1 and 3 stay `shown` and aren't leaving; card 4 is `waiting`. `exited(card2)` makes it `closing`. `fireEvent.transitionEnd(card2)` removes it from the document.
  - `'a removed card clears even with no animation or transition events'`, with fake timers: the same setup, then `advanceTimersByTime(1000)` twice. Card 2 is gone.
  - `'removing the first card closes its gap too'`: `reload(row(1,2))`, rerender `[2,3]`, `exited(card1)`. Card 1 is `closing`, and it's its box's first child.
  - `'the row leaving takes a going card with it'`: card 2 `going`, then rerender `null`. All of `[1,2,3]` are leaving. The row clears once `exited` has fired for 1, 2 and 3.
- [ ] **Step 2: Run** the roster and continues-row tests. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces above.
- [ ] **Step 4: Run** `yarn vitest run --project producer-web src/overlay`. Expected: PASS.
- [ ] **Step 5: Docs.** In the Opening bullet, add: "A member removed while their card is up is noticed at the next step: their card leaves on its own and its place closes while the next person's opens."
- [ ] **Step 6: Commit** `fix(rcl-producer): let a removed member's card leave on its own instead of replaying the row`.

### Task 5: A load that hangs counts as failed after 4 s

**Files:**
- Create: `rcl-producer/web/src/overlay/load-limit.ts`
- Modify: `components/useReadyOnce.ts`, `components/PersonCard.tsx`, `components/TeamBanner.tsx`, `ThemeWhenLoaded.tsx`
- Test: `PersonCard.test.tsx`, `TeamBanner.test.tsx`, `ThemeWhenLoaded.test.tsx`, `TeamRoster.test.tsx`
- Docs: `skater-intros.md`, R8 and "Readiness"

**Interfaces:**
- Produces:
  - `export const LOAD_LIMIT_MS = 4000` in `load-limit.ts`.
  - `useReadyOnce(onReady?: () => void, onLimit?: () => void): () => void`. It starts a `LOAD_LIMIT_MS` timer at mount, cleared on unmount. If the timer fires before `ready()` has run, it calls the latest `onLimit`, then `ready()`.
  - `PersonCard` replaces the `photoFailed` boolean with `failedUrl: string | null`, so `showPhoto = card.photoUrl !== null && card.photoUrl !== failedUrl`. Its `onLimit` sets `failedUrl` to the photo while the photo is showing.

- [ ] **Step 1: Write the failing tests**, with fake timers where timed.
  - PersonCard: `'a photo that hangs counts as failed after 4 s: the logo shows and the card is ready'` (`advanceTimersByTime(3999)`: not ready; one more ms: ready, `src` is the logo).
  - PersonCard: `'tries a new photo when the photo address changes'` (an error on `/a.png`, then rerender `photoUrl: '/b.png'`: `src` is `/b.png`).
  - PersonCard: `'is ready once, however many loads follow'`.
  - TeamBanner: `'a logo that hangs makes the banner ready after 4 s'`.
  - ThemeWhenLoaded: `'applies a theme whose fonts hang after 4 s'`.
  - ThemeWhenLoaded: `"a newer theme wins: the old theme's fonts finishing don't apply it"`. `fonts.load` returns a deferred per font string. Render `RED` (Inter), then rerender `withAccent('#ffd700', 'Oswald')`, then resolve Inter's load: the accent is still `undefined` (nothing applied). Resolve Oswald's: the accent is `#ffd700`.
  - ThemeWhenLoaded: `"the old theme's 4 s limit doesn't apply it after a newer theme"`.
  - ThemeWhenLoaded: `'nothing happens after unmount'` (unmount, resolve, advance 4 s: no React warning, via a `console.error` spy).
  - TeamRoster: `"a shown card's new photo swaps in place without the card coming in again"` (`reload(row(1))`, rerender with card 1's `photoUrl` changed: still `shown`, no `data-entrance`, `img` has the new `src`).
- [ ] **Step 2: Run** the overlay tests. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** `ThemeWhenLoaded` races `Promise.all(loads)` against a `LOAD_LIMIT_MS` timeout, and clears that timeout in the effect's cleanup.
- [ ] **Step 4: Run** `yarn vitest run --project producer-web src/overlay`. Expected: PASS.
- [ ] **Step 5: Docs.** R8: "…a failed load, or one still hanging after 4 seconds, shows the fallback instead of stalling the run." Readiness bullet: "A picture or font that has neither loaded nor failed after 4 seconds counts as failed: a card shows the logo, a banner comes in without it, and a theme is applied with whatever fonts have loaded."
- [ ] **Step 6: Commit** `fix(rcl-producer): stop a hanging photo, logo or font from holding an intro off air`.

### Task 6: The banner fades toward black or white

**Files:**
- Modify: `components/roster/team-colors.ts`, `team-colors.test.ts`, `components/TeamBanner.module.css`
- Docs: `skater-intros.md`, the title-card bullet's colour sentence

**Interfaces:**
- Produces: `teamColorVariables(team)` also returns `'--team-fade'`.
  - It's `'#000000'` when `--team-on-primary` is white, and `'#ffffff'` when it's black, so contrast only grows along the bar.
  - For a team without a valid primary colour it's `'var(--team-primary)'`: a plain bar in the theme's accent, since the theme's accent and text-on-accent pair is the readable one.
  - A primary colour that isn't 3- or 6-digit hex counts as missing.

- [ ] **Step 1: Write the failing tests.**
  - `'readableOn reads 3-digit colours'`: `readableOn('#fff')` is `'#000000'`, and `readableOn('#000')` is `'#ffffff'`.
  - `'fades toward the colour opposite the text'`: `#b3123f` gives `--team-fade` `#000000`, and `#f5c518` gives `#ffffff`.
  - `'treats a malformed colour as no colour'`: `primaryColor: 'nonsense'` gives the theme fallbacks, with `--team-fade` `var(--team-primary)`.
  - `'a team with no colours gets a plain bar'`.
- [ ] **Step 2: Run** `yarn vitest run --project producer-web src/overlay/components/roster/team-colors.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `TeamBanner.module.css`, the gradient's second stop becomes `color-mix(in srgb, var(--team-primary) 60%, var(--team-fade))`.
- [ ] **Step 4: Run** the overlay tests. Expected: PASS.
- [ ] **Step 5: Docs.** Title card: "…a wide bar in the team's primary colour, fading toward black or white, whichever is opposite its text, so the text reads all the way along. A team without colours gets a plain bar in the theme's accent."
- [ ] **Step 6: Commit** `fix(rcl-producer): keep the intro banner's text readable along its fade`.

### Task 7: Overlay tests for races, and tidy-ups

**Files:**
- Modify: `TeamRoster.test.tsx`, `OverlayApp.tsx`, `OverlayApp.test.tsx`, `overlay/live.ts`, `overlay/main.tsx`, `ThemeWhenLoaded.tsx` (comment), `components/PersonCard.module.css` (comment)

**Interfaces:**
- Produces: `export const OVERLAY_NAMESPACE = '/producer/overlay'` in `live.ts`, used by `makeOverlayStore`'s default and by `main.tsx`.

- [ ] **Step 1: Write the tests.** These pin behavior that should already hold; any that fail are bugs to fix in this task.
  - `'the latest state wins after a leave'`: during a leave, rerender `title`, then `row(5)`. After every `exited`, card 5 is `waiting` and no banner shows.
  - `'another team started mid-row: the row leaves, then their title comes in'`: the team-B title arrives mid-row.
  - `'a team-B row never continues a team-A row'`, even with the same card ids.
- [ ] **Step 2: Run** them. Expected: PASS, or a failure that shows a real bug to fix here.
- [ ] **Step 3: Tidy.**
  - `OverlayApp`: move the placeholder and its `useMemo` into a `DefaultOverlay({ server, theme })` component, so the intro path computes no CSS.
  - `ThemeWhenLoaded.tsx`: fold the detached comment at line 6 into the component's doc comment.
  - `PersonCard.module.css`: reword the comment above `.name` to "Every card in a row is the same height, so the text area is fixed: two lines for the name and two for the role line."
  - Use `OVERLAY_NAMESPACE` in `main.tsx`.
- [ ] **Step 4: Run** `yarn check`. Expected: PASS. The `OverlayApp` split is a refactor, so it needs no new test; its existing tests cover both paths.
- [ ] **Step 5: Commit** `test(rcl-producer): pin the intro roster's races, and tidy the overlay`.

### Task 8: A stepping story that shows the motion

**Files:**
- Modify: `components/TeamRoster.stories.tsx`

**Interfaces:**
- Consumes: the story's existing `people`, `team` and `row()`.
- Produces: `export const Stepping: Story`. Its `render` keeps a small run in `useState`: people, step, row start, slots 4, title, on air. Plain `<button>`s labelled Start, Next, Clear and "Remove a member" sit in a fixed bar above the canvas. "Remove a member" drops the first card on screen from `people`, and the next Next shows it going. They drive `<TeamRoster onAir={…} />`. It starts with nothing on air, and its `play` only checks the buttons render.

- [ ] **Step 1: Add the story.** Check it in the overlay Storybook (`yarn workspace @rollcall/producer-web storybook`, port 6007): Start, then Next ×5 (the row fills and a new row starts), Remove a member, Next, then Clear.
- [ ] **Step 2: Run** `yarn test:stories`. Expected: PASS, including the accessibility checks.
- [ ] **Step 3: Commit** `test(rcl-producer): add a stepping intro roster story that shows the motion`.

### Task 9: Check in a real browser

- [ ] **Step 1:** Run `yarn build`. Then start the server on a spare port with a throwaway data folder: `ROLLCALL_PORT=5599 ROLLCALL_DATA_DIR=$(mktemp -d) yarn workspace @rollcall/core-server start`.
- [ ] **Step 2:** Set up an Admin, a team of six with photos (one photo missing), a light primary colour (`#f5c518`) and a dark one on a second team, and an intro with 3 at once, centre bottom.
- [ ] **Step 3:** Open the OBS URL in Chromium at 1920×1080 next to the control page. Check each of these:
  - The title banner's text reads along the whole fade, on both teams.
  - The first card comes straight in.
  - Next ×2 slides the earlier cards aside.
  - Removing the second member in Team Builder, then pressing Next: that card leaves alone, its gap closes, the new card joins, and the row doesn't shift off centre.
  - Removing the first member of a row: the same, with no 12 px drift.
  - A reload mid-row brings no entrances back.
- [ ] **Step 4:** Run `yarn check` and `yarn test:stories`. After merging the other two branches, run `yarn test:e2e`. Delete any `.playwright-mcp/` folder before committing.
