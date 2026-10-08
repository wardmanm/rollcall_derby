# Rollcall move, Phases 0–2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move obs-producer out of GROBS into `wardmanm/rollcall_derby` with its history, set up issues and boards, then rename it to Rollcall and move its code into `rcl-core/`. It is still one app at the end of this plan.

**Architecture:**
- Phase 0 lands the last GROBS work and prepares GitHub: labels, milestones, issues and board automation.
- Phase 1 rewrites GROBS history with `git filter-repo`, so `obs-producer/` becomes the new repo's root and `#N` references become `wardmanm/GROBS#N`. One fix-up commit then makes it run from the root.
- Phase 2 renames runtime names (settings, cookie, database file, app name) with guards against old names. It then moves `apps/server`, `apps/web` and `packages/shared` into `rcl-core/{server,web,contract}` as `@rollcall/core-*`.

**Tech Stack:** git-filter-repo, gh CLI, Yarn 4 workspaces, TypeScript 7 run natively on Node 24, Fastify, Vitest, Playwright, the repo's `scripts/check-docs.mjs`.

**Spec:** `design-docs/specs/2026-10-07-rollcall-split-design.md`. Until Task 3 copies them into the new repo, it and this plan sit untracked in GROBS at `obs-producer/design-docs/`.

## Global Constraints

- **Ask Mike first** at every ⏸ step: each push, every GitHub setting, issue transfer or milestone change, and every board change. Never create release tags or GitHub Releases, or start the release workflow (hard rule 7).
- **Paths:** the new clone lives at `~/Documents/Repos/rollcall_derby`, with remote `git@github.com:wardmanm/rollcall_derby.git`. GROBS stays at `~/Documents/Repos/GROBS`.
- **Names after Phase 2:**

  | Thing | Name |
  |---|---|
  | Product | Rollcall |
  | Settings | `ROLLCALL_HOST`, `ROLLCALL_PORT`, `ROLLCALL_DATA_DIR`, `ROLLCALL_WEB_DIR`, `ROLLCALL_API_DOCS`, `ROLLCALL_DEV_SERVER` |
  | Cookie | `rollcall_session` |
  | Database file | `rollcall.db` |
  | Root package | `rollcall` |
  | Workspaces | `@rollcall/core-server` (`rcl-core/server`), `@rollcall/core-web` (`rcl-core/web`), `@rollcall/core-contract` (`rcl-core/contract`), `@rollcall/e2e` (`e2e`) |

- **Left alone until Phase 5:** the release tag prefix `obs-producer-v`, the milestone prefix `obs-producer v`, the "obs-producer release" workflow name, and the "Released in OBS Producer" wording in `release.yml`, `docs/guides/releasing.md` and `.claude/skills/release/`.
- **No new dependencies** in Phases 0–2.
- **Never edit:**
  - accepted ADRs, except a superseded ADR's `status`, `superseded_by` and pointer line;
  - existing `design-docs/` files;
  - the SQL of existing Drizzle migrations.
- **Commits:**
  - Conventional Commits with scope `repo` or `rcl-core`.
  - End the body with `Closes #N` where the task says so.
  - Last line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Checks:** every commit passes `yarn check`. Each phase ends with `yarn build && yarn test:stories && yarn test:e2e` passing too.
- **TypeScript:** erasable syntax only, `.ts` extensions on relative imports (ADR-0013).

## Review Focus

1. **A non-issue `#` in an old commit message, or a reference the rewrite misses.** History must keep every reference, and nothing else may change. Task 3 compares counts before and after the rewrite.
2. **A launch script that still sets `OBS_PRODUCER_PORT=6000`.** The server must refuse to start and name `ROLLCALL_PORT`, rather than silently listen on 5580. Task 7 tests this.
3. **A data folder that still holds `obs-producer.db`.** The server must refuse and explain how to keep the accounts. It must not open an empty `rollcall.db` that sends people to first-run setup. Task 8 tests this.
4. **`reset-password` run against the wrong folder.** It must refuse, print the path it checked and create nothing. Today it creates an empty database and says "No user named …". Task 8 tests this.
5. **Workflows, the release skill and rules files that still use old paths or package names.** No test runs them before a release. Tasks 4 and 9 grep for leftovers, and Task 5 needs a green first CI run.

---

## Phase 0: GROBS and GitHub setup

### Task 1: Land the Storybook work on GROBS `main` ⏸

**Files:** none changed. This fast-forwards `main` to `feat/storybook`.

- [ ] **Step 1: Confirm a fast-forward is possible and the checks pass**

```bash
cd ~/Documents/Repos/GROBS
git status --short            # expect only the two untracked design-docs files from this plan
git merge-base --is-ancestor main feat/storybook && echo ff-ok
cd obs-producer && yarn check && yarn build && yarn test:stories && yarn test:e2e
```
Expected: `ff-ok`, and every command exits 0.

- [ ] **Step 2: Fast-forward `main`**

```bash
cd ~/Documents/Repos/GROBS
git switch main && git merge --ff-only feat/storybook
git log --oneline -1          # f348bba docs(obs-producer): ADR-0015 and guides for Storybook and story tests
```

- [ ] **Step 3: ⏸ Ask Mike, then push `main`**

`git push origin main`. Then:
```bash
gh issue view 17 -R wardmanm/GROBS --json state --jq .state
```
Expected: `CLOSED`, because commit f348bba's body says `Closes #17`. Remind Mike to check that #17 is in "Done" on the closed board #4, if he cares about that board.

- [ ] **Step 4: Delete the merged local branch**

`git branch -d feat/storybook`. It was never pushed.

### Task 2: Labels, milestones, issues and boards for rollcall_derby ⏸

**Files:** none. Everything happens on GitHub.

**Produces:** issue numbers that later tasks cite. Expected `#1`–`#10` in the table order below, because issue numbers in a new repo start at 1. Record the actual numbers in Step 5.

- [ ] **Step 1: ⏸ Mike sets up the boards in the GitHub UI, before any issue exists**

Ask Mike to do the following and say when it's done:
- **Board #6 "Rollcall - Core":** ⋯ ▸ Workflows ▸ **Auto-add to project** ▸ repository `wardmanm/rollcall_derby`, filter `is:issue,pr label:rcl-core` ▸ turn it on. Also turn on **Item closed** (Status → Done) and **Pull request merged** (Status → Done).
- **Board #8 "Rollcall - Producer":** the same, with filter `is:issue,pr label:rcl-producer`.

GitHub Free allows one auto-add workflow, and each board needs only one. If GitHub won't save it, Mike adds the issues by hand after Step 4.

- [ ] **Step 2: ⏸ Ask Mike, then create the labels**

```bash
R=wardmanm/rollcall_derby
gh label list -R $R            # default labels (bug, enhancement, …) should already exist
gh label create rcl-core     -R $R --color 1D76DB --description "Rollcall Core (rcl-core/)"
gh label create rcl-producer -R $R --color 5319E7 --description "Rollcall Producer (rcl-producer/)"
gh label create chore        -R $R --color FEF2C0 --description "Maintenance: tooling, dependencies, refactoring, docs upkeep"
gh label create patch        -R $R --color D4C5F9 --description "Ship in the next patch release"
```

- [ ] **Step 3: Create the milestones**

```bash
gh api repos/$R/milestones -f title='rcl-core v0.1.0' \
  -f description='First Rollcall Core release: the move from GROBS, the rename, the access model, app modules, per-app releases and the auth web app.'
gh api repos/$R/milestones -f title='rcl-producer v0.2.0' \
  -f description='First Rollcall Producer release after the split: the producer web app at /producer/ and the overlay at /producer/overlay.'
```

- [ ] **Step 4: Create the issues, in this order**

Write each body below to `$TMPDIR/rcl-issue-N.md`, then run the matching `gh issue create`. `SPEC` is `https://github.com/wardmanm/rollcall_derby/blob/main/design-docs/specs/2026-10-07-rollcall-split-design.md`. The link starts working after Task 5's push.

**1. `Import obs-producer from GROBS with its history`**: `--label chore,rcl-core,rcl-producer --milestone 'rcl-core v0.1.0'`
```markdown
### Kind
Tooling / CI

### What needs doing
Import `obs-producer/` from [wardmanm/GROBS](https://github.com/wardmanm/GROBS) with its full history, then make it run from this repo's root. Phase 1 of the [Rollcall split spec](SPEC).

### Why now
Rollcall replaces OBS Producer in GROBS. The code is still a foundation, so moving it now is cheap.

### Done when
- [ ] `main` holds obs-producer's history, with `#N` in commit messages rewritten to `wardmanm/GROBS#N`
- [ ] The `obs-producer-v0.1.0` tag and its release stay in GROBS; this repo gets no `obs-producer` tag
- [ ] `yarn check`, `yarn build`, `yarn test:stories` and `yarn test:e2e` pass from the repo root
- [ ] The `app` and `docs` workflows pass on `main`
```

**2. `Rename to Rollcall and move the code into rcl-core/`**: `--label chore,rcl-core --milestone 'rcl-core v0.1.0'`
```markdown
### Kind
Refactor

### What needs doing
Phase 2 of the [Rollcall split spec](SPEC):
- Settings `OBS_PRODUCER_*` → `ROLLCALL_*`, cookie `rollcall_session`, database file `rollcall.db`, app name "Rollcall"
- `apps/server` → `rcl-core/server` (`@rollcall/core-server`), `apps/web` → `rcl-core/web` (`@rollcall/core-web`), `packages/shared` → `rcl-core/contract` (`@rollcall/core-contract`)
- `reset-password` refuses a data folder with no database, and prints the path it checked

### Done when
- [ ] ADR-0016 (naming) and ADR-0017 (layout, supersedes ADR-0012) are accepted
- [ ] The server refuses to start while an `OBS_PRODUCER_*` setting is set, or while the data folder holds only `obs-producer.db`
- [ ] No living doc, rule or workflow uses the old names or paths
- [ ] `yarn check`, `yarn build`, `yarn test:stories` and `yarn test:e2e` pass
```

**3. `Declarative access with per-app permissions`**: `--label enhancement,rcl-core --milestone 'rcl-core v0.1.0'`
```markdown
### Wiki feature page
docs/features/users-and-access.md

### Requirements covered
new

### What and why
Phase 3 of the [Rollcall split spec](SPEC). Every `/api` route declares its `access`: public (with a reason), signed in, or a namespaced permission such as `core:users.manage`. Core enforces it in one place and denies by default. This replaces `PUBLIC_API_ROUTES`, `requireUser` and `requireRole`, so later apps, API keys and output tokens fit one model.

### Acceptance criteria
- [ ] A route with no `access`, an undeclared permission, or another app's permission prefix stops the server at startup (tested)
- [ ] Built-in roles map to permission sets; Admin holds every permission
- [ ] Socket.IO namespaces are created only with an `access` declaration; `/` refuses every connection
- [ ] The route inventory test covers anonymous (401), missing permission (403) and pending password change, each with a negative control
- [ ] ADR-0018 supersedes ADR-0008; hard rule 5 is reworded; the feature page has the permission matrix
```

**4. `Producer web app and shared web SDK; the overlay moves to /producer/overlay`**: `--label enhancement,rcl-producer --milestone 'rcl-producer v0.2.0'`
```markdown
### Wiki feature page
docs/features/overlay-components.md

### Requirements covered
new

### What and why
Phase 4a of the [Rollcall split spec](SPEC). Create `rcl-producer/web` (Vite base `/producer/`) with a minimal Mantine shell, and move the OBS overlay entry into it. Add `packages/web-sdk` for the shell, `ServerStatus` and the RTK base API, shared with core's web app (base `/core/`).

### Acceptance criteria
- [ ] Core serves `/core/`, `/producer/` and `/producer/overlay`; `/` redirects to `/core/`
- [ ] `yarn dev` serves both web apps with working hot reload (spike the front-door proxy first)
- [ ] The overlay bundle holds no Mantine and no web-sdk code (bundle test)
- [ ] Storybooks are split by app; e2e covers all three pages
- [ ] The CHANGELOG notes the OBS URL change from `/overlay` to `/producer/overlay`
```

**5. `Core hosts rcl apps as modules`**: `--label enhancement,rcl-core,rcl-producer --milestone 'rcl-core v0.1.0'`
```markdown
### Wiki feature page
docs/architecture/README.md (architecture; there is no feature page)

### Requirements covered
new

### What and why
Phase 4b of the [Rollcall split spec](SPEC). rcl-core hosts rcl apps as modules (`packages/app-sdk`). Each module mounts its routes at `/api/<id>`, its namespaces at `/<id>` and its web build at `/<id>/`. Each runs its own migrations and declares the core versions it supports. Core registers itself as module `core`, and producer's server code lives in `rcl-producer/server`.

### Acceptance criteria
- [ ] Core routes move under `/api/core/*`; the overlay namespace becomes `/producer/overlay`
- [ ] A module whose `requiresCore` doesn't match is skipped with a logged error while core keeps running (tested)
- [ ] Each app's migrations use their own migrations table, and app tables are prefixed `<id>_` (tested)
- [ ] A boundary test stops apps depending on `core-server` or on each other
- [ ] Unknown `/api/*` paths return `404 {error:'not_found'}`
- [ ] ADR-0019 supersedes ADR-0004 and ADR-0007
```

**6. `Per-app releases: tags, changelogs, workflows, going public`**: `--label chore,rcl-core,rcl-producer --milestone 'rcl-core v0.1.0'`
```markdown
### Kind
Tooling / CI

### What needs doing
Phase 5 of the [Rollcall split spec](SPEC): per-app releases.
- `scripts/release.mjs --app rcl-core|rcl-producer`
- A CHANGELOG per app, tag prefixes `rcl-core-v` / `rcl-producer-v`, milestone prefixes `rcl-core v` / `rcl-producer v`
- One release workflow per app, each calling a shared one
- Feature pages get `app:` frontmatter; each app gets its own AGENTS.md and rules

### Why now
Must land before the first Rollcall release (`rcl-core v0.1.0`).

### Done when
- [ ] ADR-0020 supersedes ADR-0010, and hard rule 7 is restated
- [ ] `node scripts/release.mjs check 0.1.0 --app rcl-core` passes once that version is prepared
- [ ] The repo is public, and the `release` environment (required reviewer), the tag ruleset on `refs/tags/*-v*` and immutable releases are recreated
```

**7. `API keys for devices and scripts`**: `--label enhancement,rcl-core --milestone 'rcl-core v0.1.0'`
```markdown
### Wiki feature page
docs/features/users-and-access.md

### Requirements covered
new

### What and why
Devices and scripts on the venue network (Stream Deck, Bitfocus Companion, scripts) need to call rcl-core without a browser session. Admins create API keys scoped to permissions, and requests send `Authorization: Bearer <key>`. The design is in ADR-0018 (Phase 3).

### Acceptance criteria
- [ ] Admins can create, list and revoke keys; a key is shown once and stored only as a hash
- [ ] A bearer request is checked against the key's permissions; the session cookie is ignored and the Origin check doesn't apply
- [ ] The route inventory test covers key-authenticated requests
```

**8. `Auth hardening deferred from the access-control review`**: `--label chore,rcl-core --milestone 'rcl-core v0.1.0'`
```markdown
### Kind
Refactor

### What needs doing
Small fixes deferred from the access-control review (wardmanm/GROBS#14):
- **In-flight Admin actions outlive a demotion.** If an Admin is demoted or deleted while their `POST /api/users` or password-reset request is still hashing, the request still completes. Re-check the caller after the `await`.
- **Warm `dummyHash()` at startup**, so the first failed login takes as long as later ones.
- **Clean up if `app.listen()` throws** in `startServer`: close the database and Socket.IO.

### Done when
- [ ] Each item has a test that fails before its fix
```

**9. `CORS allowlist for rcl apps on other origins`**: `--label enhancement,rcl-core` (no milestone)
```markdown
### Wiki feature page
docs/features/users-and-access.md

### Requirements covered
new

### What and why
An rcl app hosted elsewhere (another machine or origin) needs to call rcl-core from a browser. Add an Admin-managed list of allowed origins, off by default. Cross-origin calls use bearer tokens only, never cookies, so `credentials` stays off. The design is in ADR-0018; build it when the first remote app exists.

### Acceptance criteria
- [ ] With no origins listed, cross-origin requests get no CORS headers
- [ ] A listed origin gets CORS headers, without `Access-Control-Allow-Credentials`
```

**10. `Output token URLs for OBS browser sources`**: `--label enhancement,rcl-producer` (no milestone)
```markdown
### Wiki feature page
docs/features/live-mode.md

### Requirements covered
new

### What and why
OBS browser sources can't sign in. Each Live Mode output gets an unguessable token URL (`/producer/overlay/<token>`) that only allows viewing that output. It replaces today's public overlay namespace (ADR-0008, ADR-0018). Build it with Live Mode's Output entity.

### Acceptance criteria
- [ ] An output token grants only its own output's data, over HTTP and Socket.IO
- [ ] Without a valid token, the overlay namespace refuses the connection
- [ ] It's decided whether tokens can be rotated without re-adding OBS sources (open question on the users-and-access page)
```

Each command follows this form, filling in the title, labels and milestone listed with that issue (example for issue 1):
```bash
gh issue create -R $R --title "Import obs-producer from GROBS with its history" \
  --label chore,rcl-core,rcl-producer --milestone 'rcl-core v0.1.0' --body-file "$TMPDIR/rcl-issue-1.md"
```
Before creating each issue, replace `SPEC` in its body with the URL above.

- [ ] **Step 5: Record the numbers and check the boards**

```bash
gh issue list -R $R --state all --limit 20 --json number,title,labels,milestone \
  --jq '.[] | "#\(.number) \(.title) [\([.labels[].name]|join(","))] \(.milestone.title // "-")"'
gh project item-list 6 --owner wardmanm --limit 50
gh project item-list 8 --owner wardmanm --limit 50
```
Expected:
- Issue numbers 1–10 in the order above.
- Board 6 lists 1, 2, 3, 5, 6, 7, 8 and 9.
- Board 8 lists 1, 4, 5, 6 and 10.

**If the numbers differ, use the actual import and rename numbers wherever later tasks say `#1` or `#2`.** If a board is missing items, tell Mike which ones to add.

---

## Phase 1: Import with history

### Task 3: Import obs-producer's history into a new clone

**Files:**
- Create: `~/Documents/Repos/rollcall_derby/` (a filtered clone of GROBS)
- Create in the clone: `design-docs/specs/2026-10-07-rollcall-split-design.md`, `design-docs/plans/2026-10-07-rollcall-move.md` (copied from GROBS's untracked files)

- [ ] **Step 1: Install git-filter-repo**

```bash
brew info git-filter-repo | head -3 && brew install git-filter-repo
git filter-repo --version
```
Expected: a version string.

- [ ] **Step 2: Clone GROBS and count the issue references in the history being kept**

```bash
cd ~/Documents/Repos
git clone git@github.com:wardmanm/GROBS.git rollcall_derby
cd rollcall_derby
git log --format=%B -- obs-producer .github .claude LICENSE \
  | perl -ne '$c++ while /(?<![\w\/&])#(\d+)\b/g; END { print $c+0, "\n" }'
```
Write down the count as `BEFORE`.

- [ ] **Step 3: Filter**

```bash
git filter-repo \
  --path obs-producer/ --path .github/ --path .claude/ --path LICENSE \
  --path-rename obs-producer/: \
  --message-callback 'import re
return re.sub(rb"(?<![\w/&])#(\d+)\b", rb"wardmanm/GROBS#\1", message)'
```
Expected: filter-repo reports success and removes the `origin` remote.

- [ ] **Step 3b: Drop the rewritten tag**

The 0.1.0 release and its tag stay in GROBS (Mike, 2026-10-08). Rollcall only ever gets `rcl-<app>-v…` tags.
```bash
git tag -d obs-producer-v0.1.0
```

- [ ] **Step 4: Check the rewrite**

```bash
git log --format=%B | perl -ne '$c++ while /wardmanm\/GROBS#\d+\b/g; END { print $c+0, "\n" }'   # AFTER
git log --format=%B | perl -ne 'print if /(?<![\w\/&])#\d+\b/'                                   # nothing
git log --format=%B | grep -n 'wardmanm/GROBS#' | head -20                                        # eyeball them
ls -A                                  # .claude .github .gitignore … AGENTS.md CHANGELOG.md … apps docs e2e packages scripts
git tag                                # nothing: Step 3b deleted the rewritten obs-producer-v0.1.0
git log --oneline | wc -l              # roughly 80-100
```
Expected:
- `AFTER` equals `BEFORE`.
- The second command prints nothing.
- Every printed reference refers to a real GROBS issue (1–17).
- No `obs-producer/` folder; GROBS's `README.md` is not at the root (the root `README.md` is obs-producer's); `simple-ip-camera-controls/` is absent.

If `AFTER` ≠ `BEFORE`, stop and find the difference before going on.

- [ ] **Step 5: Compare the tree with GROBS**

```bash
diff -rq ~/Documents/Repos/GROBS/obs-producer . \
  -x .git -x node_modules -x .yarn -x data -x dist -x .github -x .claude -x LICENSE -x design-docs
```
Expected: no output. `design-docs` is excluded because the two new files in GROBS are still untracked.

- [ ] **Step 6: Add the remote and commit the spec and plan**

```bash
git remote add origin git@github.com:wardmanm/rollcall_derby.git
mkdir -p design-docs/specs design-docs/plans
cp ~/Documents/Repos/GROBS/obs-producer/design-docs/specs/2026-10-07-rollcall-split-design.md design-docs/specs/
cp ~/Documents/Repos/GROBS/obs-producer/design-docs/plans/2026-10-07-rollcall-move.md design-docs/plans/
git add design-docs && git commit -m "docs(repo): Rollcall split spec and the plan for Phases 0–2

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Run from the repo root

**Files:**
- Rename: `.github/workflows/obs-producer-app.yml` → `.github/workflows/app.yml`, `obs-producer-docs.yml` → `docs.yml`, `obs-producer-release.yml` → `release.yml`
- Modify:
  - `.github/ISSUE_TEMPLATE/{bug,chore,feature,config}.yml`, `.github/pull_request_template.md`
  - `.claude/rules/*.md`, `.claude/skills/release/SKILL.md`
  - `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `CHANGELOG.md`
  - `docs/README.md`, `docs/wiki-guide.md`, `docs/guides/local-development.md`, `docs/guides/testing.md`, `docs/guides/releasing.md`, `docs/product/roadmap.md`
  - `apps/server/src/config.ts`, `scripts/release.mjs`
- Test: `apps/server/src/config.test.ts`

**Interfaces:**
- Produces: workflow files `app.yml` (name `app`), `docs.yml` (name `docs`) and `release.yml` (name still `obs-producer release`). Task 9 and Phase 5 edit them.

- [ ] **Step 1: Make the config test independent of the clone's folder name**

The current test checks that the data dir ends in `obs-producer/data`, so it fails in a clone called `rollcall_derby` and in CI. Replace the first test in `apps/server/src/config.test.ts`, and add the imports it needs:
```ts
import { describe, expect, it } from 'vitest';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.ts';

// The repo root, whatever the clone's folder is called.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('loadConfig', () => {
  it('listens on every interface on port 5580 by default, with data and web dirs under the repo root', () => {
    const config = loadConfig({});
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(5580);
    expect(isAbsolute(config.dataDir)).toBe(true);
    expect(config.dataDir).toBe(join(repoRoot, 'data'));
    expect(isAbsolute(config.webDir)).toBe(true);
    expect(config.webDir).toBe(join(repoRoot, 'apps/web/dist'));
    expect(config.apiDocs).toBe(false);
  });
```
Leave the other tests as they are.

- [ ] **Step 2: Install, and run the test to see it pass**

```bash
corepack enable && yarn install --immutable
yarn vitest run apps/server/src/config.test.ts
```
Expected: PASS.

The old test failed only because the clone's folder isn't called `obs-producer`. To prove that, run `git stash && yarn vitest run apps/server/src/config.test.ts`: it fails on `endsWith('obs-producer/data')`. Then run `git stash pop`.

- [ ] **Step 3: Fix the comment in `apps/server/src/config.ts`**

Change line 13 to:
```ts
// data/ at the repo root (git-ignored), resolved from this file so it doesn't depend on the working directory.
```

- [ ] **Step 4: Workflows**

```bash
git mv .github/workflows/obs-producer-app.yml .github/workflows/app.yml
git mv .github/workflows/obs-producer-docs.yml .github/workflows/docs.yml
git mv .github/workflows/obs-producer-release.yml .github/workflows/release.yml
```

Replace `.github/workflows/app.yml` with:
```yaml
# Checks the app on every push and pull request: types, lint, formatting, unit tests, build, story tests, and
# Playwright end-to-end tests against the real server. The docs lint runs in docs.yml.
name: app

on:
  push:
  pull_request:

# A newer run on the same branch or PR replaces an older one (the repo is private, so minutes count).
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - name: Enable Corepack (Yarn 4 from packageManager)
        run: corepack enable

      - run: yarn install --immutable
      - run: yarn typecheck
      - run: yarn lint
      - run: yarn format:check
      - run: yarn test
      - run: yarn build

      - name: Install Playwright's Chromium
        run: yarn workspace @obs-producer/e2e playwright install --with-deps chromium

      - run: yarn test:stories
      - run: yarn test:e2e

      - name: Upload the Playwright report
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: e2e/playwright-report
          retention-days: 7
```

Replace `.github/workflows/docs.yml` with:
```yaml
# Keeps the wiki healthy: docs-lint tests, then the lint itself.
# What the lint checks: docs/wiki-guide.md#the-docs-lint
name: docs

on:
  push:
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - name: Test the docs lint
        run: node --test "scripts/*.test.mjs"
      - name: Lint the wiki
        run: node scripts/check-docs.mjs
```

In `release.yml`, change only paths:
```bash
perl -ni -e 'print unless /^\s+working-directory: obs-producer\s*$/' .github/workflows/release.yml
perl -pi -e 's#node obs-producer/scripts/release\.mjs#node scripts/release.mjs#g; s#^\# Guide: obs-producer/docs/#\# Guide: docs/#' .github/workflows/release.yml
grep -nE '(^|[^@])obs-producer/' .github/workflows/*.yml
```
Expected: the grep prints nothing. `@obs-producer/e2e` is a package name; Task 9 renames it.

- [ ] **Step 5: Issue forms, PR template, rules and the release skill**

```bash
perl -pi -e 's#https://github\.com/wardmanm/GROBS/blob/main/obs-producer/#https://github.com/wardmanm/rollcall_derby/blob/main/#g; s#obs-producer/(docs|scripts)/#$1/#g; s#, "obs-producer"\]#]#' .github/ISSUE_TEMPLATE/*.yml
perl -pi -e 's#`obs-producer/CHANGELOG\.md`#`CHANGELOG.md`#; s# \(run from `obs-producer/`\)##; s#`obs-producer/AGENTS\.md`#`AGENTS.md`#' .github/pull_request_template.md
perl -pi -e 's#(?<!@)obs-producer/##g' .claude/rules/*.md   # keeps package names like @obs-producer/shared
perl -pi -e 's#From `obs-producer/`, run#From the repo root, run#; s#repos/wardmanm/GROBS/#repos/wardmanm/rollcall_derby/#; s#obs-producer/(CHANGELOG\.md|docs/)#$1#g' .claude/skills/release/SKILL.md
grep -rnE '(^|[^@])obs-producer/|wardmanm/GROBS' .github .claude
```
Expected: the grep prints nothing.

- [ ] **Step 6: `.gitignore` gains GROBS's root entries**

Append to `.gitignore`:
```gitignore

# Editors and OS
.DS_Store

# Storybook and Vitest browser-mode output
storybook-static/
*storybook.log
__screenshots__/

# Personal agent settings (not shared)
CLAUDE.local.md
.claude/settings.local.json
```

- [ ] **Step 7: `AGENTS.md`**

- **Line 10:** change to `These rules apply to AI agents and human contributors alike.`. This drops the sentence linking `../AGENTS.md`.
- **Layout block:** change the first line `obs-producer/` to `rollcall_derby/`.
- **Commands:** `Run from \`obs-producer/\`:` → `Run from the repo root:`. In the `@obs-producer/server start` row, `(default \`obs-producer/data/\`, git-ignored)` → `(default \`data/\`, git-ignored)`.
- **New section:** insert this right before `## Documentation rules`:
```markdown
## Git workflow

- Work on a branch; don't commit directly to `main`. Name branches `<type>/<short-topic>`, e.g. `feat/team-builder`, `docs/data-model`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) with a scope: the app (`rcl-core`, `rcl-producer`), `sdk` for shared packages, or `repo` for repo-wide work, e.g. `feat(rcl-core): API keys`.
- Reference issues in the commit or PR that completes them: `Closes #12`. Issue numbers belong to this repo; history imported from GROBS refers to its issues as `wardmanm/GROBS#N`.
- Only the release workflow creates release tags. Releases are always deliberate; see the [releasing guide](docs/guides/releasing.md).
- GitHub Actions in `.github/workflows/` use the current major version of every action (e.g. `actions/checkout@v7`). Dependabot (`.github/dependabot.yml`) opens a weekly `ci:` PR when a new version is out; review and merge it like any other change.
- Don't push, open PRs, or rewrite published history unless asked.
```

- [ ] **Step 8: Replace `CLAUDE.md` with:**

```markdown
@AGENTS.md

## Claude Code notes

Shared rules live in `AGENTS.md` (imported above) so every agent reads the same instructions. Only Claude-specific notes go in this file.

- **Where superpowers output goes.** This overrides the skills' default `docs/superpowers/` location:
  - Brainstorming specs: `design-docs/specs/YYYY-MM-DD-<topic>-design.md`
  - Implementation plans: `design-docs/plans/YYYY-MM-DD-<topic>.md`

  These are working papers. When a spec settles something durable, move it into the wiki (a feature page, an architecture page or an ADR) in the same change.
- **Read wiki pages when a task needs them.** Don't `@`-import them into this file, because imports load into every session.
- **Integration pages record the upstream versions they were checked against.** These are `docs/architecture/integrations/crg-scoreboard.md` and `obs-websocket.md`. If you build against a newer CRG or obs-websocket, re-check the facts you rely on and update the "Verified against" line.
- **Path-scoped rules** in `.claude/rules/obs-producer-*.md` (server, web, overlay, shared, e2e) map each code area to its hard rules, ADRs and wiki pages. They load when Claude reads matching files. When code moves, docs are renamed or a new code area appears, update or add a rule in the same change.
- **Releases:** `/release <version>` (`.claude/skills/release/`) prepares a release. Only the user can start it. Never publish (hard rule 7). The process is in `docs/guides/releasing.md`.

### Maintaining agent instructions

How the instruction files are layered, so they stay small and don't contradict each other:

- **`AGENTS.md`** is the source of truth at each level: the repo root, and each `rcl-*` app folder once it has one. **`CLAUDE.md`** starts with `@AGENTS.md` and adds only Claude-specific notes. Never copy rules between the two; import them.
- **Nested files add to the root; they don't replace it.** Claude loads the root `CLAUDE.md` at launch, and an app's `CLAUDE.md` (e.g. `rcl-core/CLAUDE.md`) when it first reads a file inside that folder.
- **Keep each `CLAUDE.md`/`AGENTS.md` under ~200 lines.** Anything longer belongs somewhere else:
  - Multi-step procedures go in a skill: `.claude/skills/<name>/SKILL.md`.
  - Rules that only matter for certain files go in `.claude/rules/<topic>.md`, with `paths:` globs in the frontmatter so they load only when matching files are read.
  - Reference material stays in the wiki and gets linked, never `@`-imported. Imports load into every session.
- **`CLAUDE.local.md`** is for personal notes and is gitignored. The `@AGENTS.md` import keeps shared rules loading even if one exists.
- Run `/doctor prompt-audit` to catch stale or conflicting instructions after large edits.
```

- [ ] **Step 9: README, CHANGELOG, release helper and docs**

```bash
perl -pi -e 's#\]\(\.\./LICENSE\)#](LICENSE)#' README.md
perl -pi -e 's/(?<![\w\/&\[])#(\d+)\b/wardmanm\/GROBS#$1/g unless /^\[/; s#^\[Unreleased\]: .*#[Unreleased]: https://github.com/wardmanm/rollcall_derby/commits/main#' CHANGELOG.md
perl -pi -e "s#^export const REPO_URL = 'https://github\.com/wardmanm/GROBS';#export const REPO_URL = 'https://github.com/wardmanm/rollcall_derby';#" scripts/release.mjs
```

In `CHANGELOG.md`:
- `[0.1.0]: https://github.com/wardmanm/GROBS/releases/tag/obs-producer-v0.1.0` stays as it is, because that release lives in GROBS.
- Check that `(#13)` became `(wardmanm/GROBS#13)` and `(#6, #8)` became `(wardmanm/GROBS#6, wardmanm/GROBS#8)`.

Docs, with exact replacements:
- **`docs/README.md`:** ``3. From `obs-producer/`, run`` → ``3. From the repo root, run``
- **`docs/wiki-guide.md`:**
  - `They live in \`obs-producer/design-docs/\`, outside this wiki` → `They live in \`design-docs/\`, outside this wiki`
  - ``Run it from `obs-producer/`.`` → `Run it from the repo root.`
  - ``CI runs both on every push that touches `obs-producer/` (`.github/workflows/obs-producer-docs.yml`).`` → ``CI runs both on every push and pull request (`.github/workflows/docs.yml`).``
- **`docs/guides/local-development.md`:**
  - ``Commands run from `obs-producer/` unless`` → ``Commands run from the repo root unless``
  - The clone block becomes `git clone git@github.com:wardmanm/rollcall_derby.git` / `cd rollcall_derby`
  - In the settings table and the database paragraph, `` `obs-producer/data/` `` → `` `data/` `` (2 places)
- **`docs/guides/testing.md`:**
  - ``on every push that touches `obs-producer/`, via `.github/workflows/obs-producer-app.yml` and `obs-producer-docs.yml`.`` → ``on every push and pull request, via `.github/workflows/app.yml` and `docs.yml`.``
  - ``Never touch `obs-producer/data/`.`` → ``Never touch `data/`.``
- **`docs/guides/releasing.md`:** in the issue-forms bullet, `They add the \`obs-producer\` label and ask which wiki page` → `Add the app label (\`rcl-core\` or \`rcl-producer\`) when triaging. The forms ask which wiki page`
- **`docs/product/roadmap.md`:** ``(see `obs-producer/CLAUDE.md`)`` → ``(see `CLAUDE.md`)``

- [ ] **Step 10: Look for leftovers**

```bash
git grep -nE '(^|[^@])obs-producer/|obs-producer-(app|docs|release)\.yml|wardmanm/GROBS(/|\.git)' -- ':!design-docs' ':!docs/decisions/00*' ':!CHANGELOG.md'
```
Expected: nothing. ADRs 0009 and 0010 still say `obs-producer/CHANGELOG.md`, because accepted ADRs aren't edited; ADR-0016 covers those names.

- [ ] **Step 11: Run everything**

```bash
yarn check && yarn build && yarn test:stories && yarn test:e2e
```
Expected: every command exits 0. `yarn.lock` is unchanged (`git status` shows no `yarn.lock`).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore(repo): run from the repo root after the move from GROBS

Workflows, issue forms, agent rules and docs no longer assume an obs-producer/ subfolder,
and GROBS's root instructions are merged into AGENTS.md, CLAUDE.md and .gitignore.

Closes #1

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: Publish and hand over from GROBS ⏸

**Files:** none in the repo. GitHub changes, plus the Claude memory folder.

- [ ] **Step 1: ⏸ Ask Mike, then push**

```bash
cd ~/Documents/Repos/rollcall_derby
git push -u origin main          # no tags: obs-producer-v0.1.0 stays in GROBS
gh repo view wardmanm/rollcall_derby --json defaultBranchRef --jq .defaultBranchRef.name   # main
```

- [ ] **Step 2: Watch the first CI runs**

```bash
gh run list -R wardmanm/rollcall_derby --limit 5
gh run watch -R wardmanm/rollcall_derby <run-id of "app">
```
Expected: `app` and `docs` both succeed. If one fails, use superpowers:systematic-debugging, fix it in a new commit and push it (⏸).

- [ ] **Step 3: Check that #1 closed and reached both boards**

```bash
gh issue view 1 -R wardmanm/rollcall_derby --json state --jq .state     # CLOSED
gh project item-list 6 --owner wardmanm --format json --jq '.items[] | select(.content.number==1) | .status'
gh project item-list 8 --owner wardmanm --format json --jq '.items[] | select(.content.number==1) | .status'
```
Expected: `CLOSED`, and `Done` on both boards. If it isn't `Done`, remind Mike to move it and to check the "Item closed" workflow.

- [ ] **Step 4: ⏸ Mike makes the Actions token read-only**

Settings ▸ Actions ▸ General ▸ Workflow permissions ▸ **Read repository contents and packages permissions**. The release workflow's `publish` job asks for the write permissions it needs.

- [ ] **Step 5: ⏸ Ask Mike, then transfer GROBS #15 and add its carry-overs**

```bash
gh issue transfer 15 wardmanm/rollcall_derby -R wardmanm/GROBS        # prints the new URL; expect #11
N=<new number>
gh issue edit $N -R wardmanm/rollcall_derby --add-label rcl-core --milestone 'rcl-core v0.1.0'
gh issue comment $N -R wardmanm/rollcall_derby --body-file "$TMPDIR/rcl-15-carryovers.md"
```

`$TMPDIR/rcl-15-carryovers.md`:
```markdown
Moved from wardmanm/GROBS. This now builds core's web app: setup, sign-in, password and users pages, plus the `SignInGate` in `packages/web-sdk` once that exists (Phase 4a of the split spec).

Carried over from the GROBS reviews of #13 and #14:
- [ ] **Logout is idempotent:** return 204 and always clear the cookie, even with a stale session (today it's a 401 that leaves the cookie).
- [ ] **The setup page says where to go:** "server machine" means a loopback IP and a loopback name, so tell people to open `http://localhost:<port>`. 127.0.1.1, the machine's hostname and its LAN IP are refused.
- [ ] **Body-less POSTs** (logout, sign-out, password reset) send `{}` or no content type; Fastify answers an empty JSON body with 400.
- [ ] **Friendly validation messages:** build them from `error.validation[]` instead of showing Fastify's `body/username …` text.
- The Vite dev proxy keeps the Host header (fixed in GROBS #16, pinned by `dev-proxy.test.ts`), so writes through `:5173` pass the CSRF check.
```

- [ ] **Step 6: ⏸ Ask Mike, then close the GROBS milestone**

```bash
gh api 'repos/wardmanm/GROBS/milestones?state=all' --jq '.[] | select(.title=="obs-producer v0.2.0") | {number, open_issues}'
gh api -X PATCH repos/wardmanm/GROBS/milestones/<number> -f state=closed \
  -f description='Continues in Rollcall (wardmanm/rollcall_derby) as rcl-core v0.1.0 and rcl-producer v0.2.0.'
```
Expected: `open_issues` is 0 before closing.

- [ ] **Step 7: Move Claude's memory**

```bash
ls ~/.claude/projects | grep -i rollcall     # created the first time Claude Code opens the clone; open it once if missing
cp ~/.claude/projects/-Users-mwardman-Documents-Repos-GROBS/memory/*.md ~/.claude/projects/<rollcall folder>/memory/
```
Then, in both memory folders:
- Delete `auth-plan-carryovers.md` and its `MEMORY.md` line. Its items now live in issues #8 and #N, Task 8 of this plan, and Phase 3/4b.
- In `rollcall-pivot.md`, record that Phase 1 is done.

### Task 6: Leave a pointer in GROBS ⏸

**Files (in `~/Documents/Repos/GROBS`):**
- Delete: `obs-producer/`, `.github/`, `.claude/`
- Modify: `README.md`, `AGENTS.md`, `CLAUDE.md`

- [ ] **Step 1: ⏸ Ask Mike about his dev database, then branch and delete**

`obs-producer/data/` is git-ignored and holds Mike's local accounts. If he wants to keep them, copy the folder before anything is deleted. After Task 8, the server will explain how to rename the file:
```bash
cp -R ~/Documents/Repos/GROBS/obs-producer/data ~/Documents/Repos/rollcall_derby/
```

```bash
cd ~/Documents/Repos/GROBS
git switch -c chore/obs-producer-moved
rm -rf obs-producer/design-docs/specs/2026-10-07-rollcall-split-design.md obs-producer/design-docs/plans/2026-10-07-rollcall-move.md  # untracked; now in rollcall_derby
git rm -r -q obs-producer .github .claude
```

- [ ] **Step 2: `README.md`**

Replace the whole `## OBS Producer *(in development)*` section, from that heading up to the next `---`, with:
```markdown
## OBS Producer → Rollcall
OBS Producer moved to its own repository and is now **Rollcall**, a suite of apps for producing roller derby events and streams. The repository is private while the apps are split, and opens with its first release. Its history up to `obs-producer-v0.1.0` is in this repo's history and releases.
```

- [ ] **Step 3: `AGENTS.md`**

- Delete the `obs-producer/` row from the repository map.
- Under the table, add: `OBS Producer moved to Rollcall (wardmanm/rollcall_derby); its history and the obs-producer-v0.1.0 release stay here.`
- In "Git workflow":
  - change the branch example to `feat/sicc-presets`;
  - change the commit examples to `feat(sicc): preset colors`;
  - change the tag line to `- Release tags are \`<tool>-v<semver>\`, and only that tool's release workflow creates them.`;
  - delete the GitHub Actions/Dependabot bullet, since no workflows are left.

- [ ] **Step 4: `CLAUDE.md`**

In "Maintaining agent instructions":
- change the nested-files bullet to: `- **Nested files add to the root; they don't replace it.** Write a tool's own CLAUDE.md as additions to this one.`
- change the skill bullet's "next to the tool they serve" to "at the repo root".

- [ ] **Step 5: Check and commit**

```bash
git grep -n 'obs-producer' -- . ':!README.md' ':!AGENTS.md'   # nothing
git add -A && git commit -m "chore(repo): obs-producer moved to Rollcall

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: ⏸ Ask Mike, then merge and push**

Run `git switch main && git merge --ff-only chore/obs-producer-moved && git push origin main && git branch -d chore/obs-producer-moved`.

Keep:
- GROBS's tag ruleset, which protects `obs-producer-v0.1.0`;
- the `obs-producer` label;
- the `release` environment. Mike may delete the environment from Settings ▸ Environments, since no workflow uses it now.

---

## Phase 2: Rename to Rollcall and move into rcl-core

Work in `~/Documents/Repos/rollcall_derby` on branch `chore/rename-to-rollcall`. Remind Mike to move issue #2 to "In progress" on board #6.

### Task 7: Rename to Rollcall

**Files:**
- Modify, by perl substitution: every tracked file that matches, except `design-docs/`, `docs/decisions/00*`, `docs/guides/releasing.md`, `.github/workflows/release.yml`, `.claude/skills/release/`, `yarn.lock` and `.yarn/`
- Modify by hand: `apps/server/src/config.ts`, `package.json`, `AGENTS.md`, `docs/README.md`, `docs/product/vision.md`, `docs/product/glossary.md`, `docs/architecture/README.md`, `docs/architecture/integrations/crg-scoreboard.md`, `docs/guides/releasing.md`, `docs/wiki-guide.md`, `CHANGELOG.md`, and the comments in `apps/web/src/components/ServerStatus.tsx`, `apps/web/vite.config.ts`, `e2e/playwright.config.ts`, `scripts/check-docs.mjs` and `scripts/release.mjs`
- Create: `docs/decisions/0016-obs-producer-becomes-rollcall.md`
- Test: `apps/server/src/config.test.ts` and every test, story or spec that asserts an old name

**Interfaces:**
- Produces:
  - Settings `ROLLCALL_HOST|PORT|DATA_DIR|WEB_DIR|API_DOCS` (server) and `ROLLCALL_DEV_SERVER` (Vite).
  - `SESSION_COOKIE = 'rollcall_session'`, `APP_NAME = 'Rollcall'`, database file `rollcall.db`.
  - `loadConfig()` throws `"<OLD> was renamed to ROLLCALL_<REST> (ADR-0016). Rename it and start again."`.

- [ ] **Step 1: Branch**

`git switch -c chore/rename-to-rollcall`

- [ ] **Step 2: Rename the tests first**

```bash
MAP='s/OBS_PRODUCER_/ROLLCALL_/g; s/obs_producer_session/rollcall_session/g; s/obs-producer\.db/rollcall.db/g; s/obs-producer-e2e-data/rollcall-e2e-data/g; s/obs-producer-overlay-route/rollcall-overlay-route/g; s/OBS Producer API/Rollcall API/g; s/OBS Producer overlay/Rollcall overlay/g; s/OBS Producer/Rollcall/g'
git grep -lzE 'OBS_PRODUCER_|obs_producer_session|obs-producer\.db|OBS Producer' -- '*.test.ts' '*.test.tsx' '*.spec.ts' '*.stories.tsx' | xargs -0 perl -pi -e "$MAP"
```

Then add this test to `apps/server/src/config.test.ts`, inside `describe('loadConfig')`:
```ts
  it('refuses to start while an old OBS_PRODUCER_* setting is present, naming its replacement', () => {
    expect(() => loadConfig({ OBS_PRODUCER_PORT: '6000' })).toThrow(
      'OBS_PRODUCER_PORT was renamed to ROLLCALL_PORT (ADR-0016). Rename it and start again.',
    );
    expect(() => loadConfig({ ROLLCALL_PORT: '6000', OBS_PRODUCER_API_DOCS: '' })).toThrow(/OBS_PRODUCER_API_DOCS/);
  });
```

- [ ] **Step 3: Run the tests and watch them fail**

Run `yarn test`.

Expected: FAIL in `config.test.ts` (it reads `ROLLCALL_*`), `db.test.ts` (`rollcall.db`), `openapi.test.ts` (cookie and title), `App.test.tsx` (heading "Rollcall") and the overlay and live tests ("Rollcall").

- [ ] **Step 4: Rename the sources**

Shell variables don't carry over between steps, so set `MAP` again. Test files are excluded here: Step 2 already renamed them, and its new test must keep saying `OBS_PRODUCER_PORT`.
```bash
MAP='s/OBS_PRODUCER_/ROLLCALL_/g; s/obs_producer_session/rollcall_session/g; s/obs-producer\.db/rollcall.db/g; s/obs-producer-e2e-data/rollcall-e2e-data/g; s/obs-producer-overlay-route/rollcall-overlay-route/g; s/OBS Producer API/Rollcall API/g; s/OBS Producer overlay/Rollcall overlay/g; s/OBS Producer/Rollcall/g'
git grep -lzE 'OBS_PRODUCER_|obs_producer_session|obs-producer\.db|obs-producer-e2e-data|obs-producer-overlay-route|OBS Producer' -- . \
  ':!design-docs' ':!docs/decisions/00*' ':!docs/guides/releasing.md' ':!.github/workflows/release.yml' ':!.claude/skills/release' ':!yarn.lock' ':!.yarn' \
  ':!*.test.ts' ':!*.test.tsx' ':!*.spec.ts' ':!*.stories.tsx' \
  | xargs -0 perl -pi -e "$MAP"
perl -pi -e 's/the obs-producer server/the Rollcall server/' apps/web/src/components/ServerStatus.tsx apps/web/vite.config.ts e2e/playwright.config.ts
perl -pi -e 's/^\/\/ Docs lint for the obs-producer wiki\./\/\/ Docs lint for the Rollcall wiki./' scripts/check-docs.mjs
perl -pi -e 's/^\/\/ Release helper for obs-producer\./\/\/ Release helper for Rollcall./' scripts/release.mjs
perl -pi -e 's/"name": "obs-producer"/"name": "rollcall"/; s/--exclude obs-producer/--exclude rollcall/g' package.json
```

The substitution leaves this code alone, so its names stay until Phase 5: `TAG_PREFIX`, `MILESTONE_PREFIX` and the `prepare` hint in `release.mjs`, `release.yml`, the release skill and `releasing.md`.

- [ ] **Step 5: Add the old-name guard to `apps/server/src/config.ts`**

Add this above `loadConfig`:
```ts
// The prefix settings had before the rename to Rollcall (ADR-0016). A leftover old name would be silently ignored,
// so the server stops instead.
const OLD_PREFIX = 'OBS_PRODUCER_';
```

Make these the first lines of `loadConfig`'s body:
```ts
  const old = Object.keys(env)
    .filter((key) => key.startsWith(OLD_PREFIX) && env[key] !== undefined)
    .toSorted()[0];
  if (old) {
    throw new Error(`${old} was renamed to ROLLCALL_${old.slice(OLD_PREFIX.length)} (ADR-0016). Rename it and start again.`);
  }
```

- [ ] **Step 6: Run the tests and see them pass**

Run `yarn test`.

Expected: PASS.

- [ ] **Step 7: Prose the substitution can't do**

- **`AGENTS.md`:** replace the title and the opening up to and including `These rules apply to AI agents and human contributors alike.` with:
```markdown
# Rollcall — agent instructions

Rollcall is a suite of apps for producing roller derby events and streams, hosted on the venue's local network ([ADR-0016](docs/decisions/0016-obs-producer-becomes-rollcall.md)):
- **rcl-core** is the server: accounts, shared data such as teams, the CRG and OBS connections, and an admin GUI for that data.
- **rcl-producer** builds and runs overlays: themes, screens, Live Mode and producer dashboards. Each screen is loaded into OBS as a browser source.

**Status:** moved from GROBS, where it was OBS Producer, and being split into rcl-core and rcl-producer ([spec](design-docs/specs/2026-10-07-rollcall-split-design.md)). Until the split, all code is one app. Features start with Phase 1 on the [roadmap](docs/product/roadmap.md). To run it locally, see [local development](docs/guides/local-development.md).

These rules apply to AI agents and human contributors alike.
```
- **`docs/README.md`:** `Rollcall is a web app, hosted on the local network,` → `Rollcall is a suite of apps, hosted on the local network,`. Then, after the sentence ending `feeds live game data in.`, add: `The apps are **rcl-core** (the server, accounts and shared data) and **rcl-producer** (themes, screens, Live Mode and dashboards); see [ADR-0016](decisions/0016-obs-producer-becomes-rollcall.md).`
- **`docs/product/vision.md`:** after the "Why" bullet list, add this paragraph:
  `Rollcall is a suite of apps. **rcl-core** holds accounts, shared data such as teams, and the CRG and OBS connections. **rcl-producer** builds and runs the overlays. More rcl apps can join later, each hosted by rcl-core.`
- **`docs/product/glossary.md`:** add these rows at the top of the "This app" table:
```markdown
| **Rollcall** | This suite of apps for producing roller derby events and streams, in the `wardmanm/rollcall_derby` repository. It was called OBS Producer until [ADR-0016](../decisions/0016-obs-producer-becomes-rollcall.md). |
| **rcl app** | One app in the suite. It's named `rcl-<app>` and kept in a root folder of the same name. |
| **rcl-core** | The host app: the one server process, accounts, shared data such as teams, and the CRG and OBS connections, with an admin GUI for that data. |
| **rcl-producer** | The app that builds and runs overlays: themes, screens, Live Mode and dashboards. Call it "the Producer app", never just "Producer", which is a [role](#roles). |
```
- **`docs/architecture/README.md`:** in the mermaid block, `subgraph server["obs-producer server (Node)"]` → `subgraph server["rcl-core server (Node)"]`.
- **`docs/architecture/integrations/crg-scoreboard.md`:** `` `?source=obs-producer` `` → `` `?source=rollcall` ``.
- **`docs/guides/releasing.md`:** rename the forms only: `**OBS Producer: feature**` → `**Rollcall: feature**`, `**OBS Producer: bug**` → `**Rollcall: bug**`, `**OBS Producer: chore**` → `**Rollcall: chore**`, and `File OBS Producer work` → `File Rollcall work`. The `Released in OBS Producer v…` lines stay until Phase 5.
- **`docs/wiki-guide.md`:** in "Recording decisions (ADRs)", after the bullet list under "An accepted ADR is never rewritten", add: `Older ADRs use the names of their time. ADR-0016 and later ADRs map them to today's names.`

- [ ] **Step 8: Write ADR-0016**

Run `node scripts/check-docs.mjs --next-adr` and expect `0016`. Then create `docs/decisions/0016-obs-producer-becomes-rollcall.md`, with `date:` set to today (`date +%F`):
```markdown
---
title: OBS Producer becomes Rollcall, a suite of rcl apps
status: accepted
date: 2026-10-07
---
# 0016. OBS Producer becomes Rollcall, a suite of rcl apps

## Context

OBS Producer outgrew one app. Accounts, shared data such as teams and logos, and the CRG and OBS connections serve more than overlay production. The maintainer is building a suite, **Rollcall**, in its own repository, with apps named `rcl-<app>` ([spec](../../design-docs/specs/2026-10-07-rollcall-split-design.md)).

Options considered:
- **A fresh repository with the files copied over.** Rejected: it loses `git blame` and the commit trail behind every ADR.
- **Stay in the GROBS monorepo.** Rejected: GROBS holds unrelated tools that share no code, while Rollcall's apps share a server and its contract.
- **Import with history** using `git filter-repo`. Chosen.

## Decision

- **Name and repository.** The product is **Rollcall**, in `wardmanm/rollcall_derby`. Its history was imported from `obs-producer/` in `wardmanm/GROBS`. Issue numbers here start again at 1, so `#N` in imported commit messages was rewritten to `wardmanm/GROBS#N`. The tag `obs-producer-v0.1.0` and its GitHub Release stay in GROBS; this repo only gets `rcl-<app>-v…` tags.
- **Apps.** Each app is an **rcl app** named `rcl-<app>`:
  - **rcl-core** is the host: the one server process, accounts and access, shared data (teams, players, logos), and the CRG and OBS connections. Its GUI holds setup, sign-in, users, connections and data editors.
  - **rcl-producer** builds and runs overlays: themes, screens, overlay components, Live Mode and dashboards. It has no server process of its own; its server code runs inside rcl-core, as a later ADR records.
- **URLs once the apps split:** `/core/` and `/api/core/*` for rcl-core, `/producer/` and `/api/producer/*` for rcl-producer, `/producer/overlay` for OBS outputs, and `/docs` for the API explorer. Until the split, today's paths stay.
- **Runtime names.**
  - Settings are `ROLLCALL_HOST`, `ROLLCALL_PORT`, `ROLLCALL_DATA_DIR`, `ROLLCALL_WEB_DIR`, `ROLLCALL_API_DOCS` and `ROLLCALL_DEV_SERVER`. The server refuses to start while any `OBS_PRODUCER_*` setting is present, and names the replacement.
  - The session cookie is `rollcall_session`, so everyone signs in again once.
  - The database file is `rollcall.db`.

### Names used in earlier ADRs

Accepted ADRs are never rewritten ([ADR-0001](0001-record-decisions-as-adrs.md)). Read their names as:

| Earlier name | Now |
|---|---|
| OBS Producer, obs-producer (the app) | Rollcall (the suite and repo), or rcl-core / rcl-producer (one app) |
| `OBS_PRODUCER_*` settings | `ROLLCALL_*` |
| `obs_producer_session` cookie | `rollcall_session` |
| `obs-producer.db` | `rollcall.db` |
| `obs-producer/CHANGELOG.md` | `CHANGELOG.md` |

## Consequences

- Existing setups rename their settings, sign in again, and rename the database file to keep their accounts.
- Imported history and the 0.1.0 CHANGELOG refer to GROBS issues as `wardmanm/GROBS#N`. The release workflow only comments on bare `#N` references, so it never touches them.
- No release is cut until per-app releases are decided in a later ADR. Until then the release tooling still names the old `obs-producer-v` prefix, unused.
- OBS browser sources keep their URL until the split moves the overlay.
```
Run `node scripts/check-docs.mjs --fix`.

- [ ] **Step 9: CHANGELOG**

Under `## [Unreleased]`, add a `### Changed` line (the section exists) above the overlay line. Use the actual number of issue #2:
```markdown
- OBS Producer is now **Rollcall**, in its own repository. Settings are renamed from `OBS_PRODUCER_*` to `ROLLCALL_*`; the server refuses to start while an old name is still set, so update any launch scripts. Sign in again after upgrading, because the session cookie is renamed (#2)
```

- [ ] **Step 10: Look for leftovers**

```bash
git grep -nE 'OBS_PRODUCER|obs_producer|OBS Producer|obs-producer\.db|the obs-producer' -- . \
  ':!design-docs' ':!docs/decisions/00*' ':!docs/guides/releasing.md' ':!.github/workflows/release.yml' ':!.claude/skills/release' ':!yarn.lock'
```
Expected hits, and nothing else:
- `config.ts`: the `OLD_PREFIX` lines.
- `config.test.ts`: the old-name test.
- `CHANGELOG.md`: the new line.
- `docs/product/glossary.md`: the Rollcall row's "OBS Producer".
- `AGENTS.md`: "where it was OBS Producer".

- [ ] **Step 11: Run everything and commit**

```bash
yarn check && yarn build && yarn test:stories && yarn test:e2e
git add -A && git commit -m "feat(repo): rename to Rollcall

Settings become ROLLCALL_* (an old OBS_PRODUCER_* setting stops the server), the session cookie
becomes rollcall_session, the database file rollcall.db, and the app is called Rollcall. ADR-0016.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: Refuse an old or missing database

**Files:**
- Modify: `apps/server/src/db.ts`, `apps/server/src/cli/reset-password.ts`, `docs/features/users-and-access.md`, `docs/guides/local-development.md`, `CHANGELOG.md`
- Test: `apps/server/src/db.test.ts`, `apps/server/src/cli/reset-password.test.ts`

**Interfaces:**
- Produces: `export const DATABASE_FILE = 'rollcall.db'` and `export function oldDatabaseProblem(dataDir: string): string | null` in `db.ts`. `openDatabase(dataDir)` throws `new Error(oldDatabaseProblem(dataDir))` when that isn't null.

- [ ] **Step 1: Write the failing tests**

In `apps/server/src/db.test.ts`, add `writeFileSync` to the `node:fs` import and `oldDatabaseProblem` to the `./db.ts` import. Then add inside `describe('openDatabase')`:
```ts
  it('refuses a data dir that holds only the old obs-producer.db, and creates nothing', () => {
    const dataDir = tempDir();
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, 'obs-producer.db'), '');
    expect(() => openDatabase(dataDir)).toThrow(
      `${join(dataDir, 'obs-producer.db')} is from before the rename to Rollcall. Stop the server, then rename it ` +
        '(and any -wal and -shm files next to it) to rollcall.db to keep your accounts, or delete it to start fresh.',
    );
    expect(existsSync(join(dataDir, 'rollcall.db'))).toBe(false);
  });

  it('opens rollcall.db even when an old obs-producer.db is still next to it', () => {
    const dataDir = tempDir();
    openDatabase(dataDir).sqlite.close();
    writeFileSync(join(dataDir, 'obs-producer.db'), '');
    expect(oldDatabaseProblem(dataDir)).toBeNull();
    openDatabase(dataDir).sqlite.close();
  });
```
Add `mkdirSync` to the `node:fs` import too.

In `apps/server/src/cli/reset-password.test.ts`:
- Add `existsSync` and `writeFileSync` to the `node:fs` import.
- Change the expectation in `'reports an unknown user'` to:
```ts
    expect(await run(['nobody'], dir)).toEqual({ code: 1, lines: [`No user named "nobody" in ${join(dir, 'rollcall.db')}.`] });
```
- Add:
```ts
  it('refuses a data folder with no database, says where it looked, and creates nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcl-reset-empty-'));
    dataDir = dir;
    const file = join(dir, 'rollcall.db');
    expect(await run(['admin'], dir)).toEqual({
      code: 1,
      lines: [`No Rollcall database at ${file}. Set ROLLCALL_DATA_DIR to the server's data folder.`],
    });
    expect(existsSync(file)).toBe(false);
  });

  it('explains how to keep an old obs-producer.db', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcl-reset-old-'));
    dataDir = dir;
    writeFileSync(join(dir, 'obs-producer.db'), '');
    const { code, lines } = await run(['admin'], dir);
    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringContaining('is from before the rename to Rollcall')]);
  });
```

- [ ] **Step 2: Run the tests and watch them fail**

Run `yarn vitest run apps/server/src/db.test.ts apps/server/src/cli/reset-password.test.ts`.

Expected: FAIL. `oldDatabaseProblem` isn't exported, nothing refuses the old file, and the messages differ.

- [ ] **Step 3: Implement in `apps/server/src/db.ts`**

Change the `node:fs` import to `import { existsSync, mkdirSync } from 'node:fs';`, then replace `openDatabase` and its comment with:
```ts
export const DATABASE_FILE = 'rollcall.db';
// The database file's name before the rename to Rollcall (ADR-0016).
const OLD_DATABASE_FILE = 'obs-producer.db';

/** Why `dataDir` can't be opened as it is: it holds only the database from before the rename. Null when it can. */
export function oldDatabaseProblem(dataDir: string): string | null {
  const oldFile = join(dataDir, OLD_DATABASE_FILE);
  if (existsSync(join(dataDir, DATABASE_FILE)) || !existsSync(oldFile)) return null;
  return (
    `${oldFile} is from before the rename to Rollcall. Stop the server, then rename it ` +
    `(and any -wal and -shm files next to it) to ${DATABASE_FILE} to keep your accounts, or delete it to start fresh.`
  );
}

// Opens (creating if needed) <dataDir>/rollcall.db and applies any pending migrations. A folder that still holds
// only obs-producer.db is refused, so accounts never silently vanish after the rename.
export function openDatabase(dataDir: string) {
  const problem = oldDatabaseProblem(dataDir);
  if (problem) throw new Error(problem);
  mkdirSync(dataDir, { recursive: true });
  return connect(join(dataDir, DATABASE_FILE));
}
```

- [ ] **Step 4: Implement in `apps/server/src/cli/reset-password.ts`**

Add these imports: `import { existsSync } from 'node:fs';`, `import { join } from 'node:path';`, and change the db import to `import { DATABASE_FILE, oldDatabaseProblem, openDatabase, type AppDatabase } from '../db.ts';`. In `runResetPassword`, after the usage check:
```ts
  const file = join(dataDir, DATABASE_FILE);
  // Opening a missing database would create an empty one and report "no such user"; say where we looked instead.
  if (!existsSync(file)) {
    print(oldDatabaseProblem(dataDir) ?? `No Rollcall database at ${file}. Set ROLLCALL_DATA_DIR to the server's data folder.`);
    return 1;
  }
```
And change the unknown-user line to:
```ts
      print(`No user named "${username.trim().toLowerCase()}" in ${file}.`);
```

- [ ] **Step 5: Run the tests and see them pass**

Run `yarn vitest run apps/server/src/db.test.ts apps/server/src/cli/reset-password.test.ts`, then `yarn test`.

Expected: PASS.

- [ ] **Step 6: Docs and CHANGELOG**

- **`docs/features/users-and-access.md`, "Locked out?" bullet:** append ` It refuses if \`ROLLCALL_DATA_DIR\` has no \`rollcall.db\`, and prints the path it checked.`
- **`docs/guides/local-development.md`, database section:** after the migrations paragraph, add: `Upgrading from OBS Producer? The server refuses to start while \`data/\` holds only \`obs-producer.db\`. Stop it and rename that file, plus any \`-wal\` and \`-shm\` files next to it, to \`rollcall.db\`. Or delete it to start fresh.`
- **`CHANGELOG.md`, `### Changed`:** add, using the actual number of issue #2:
```markdown
- The database file is now `rollcall.db`. The server refuses to start while the data folder holds only the old `obs-producer.db`, and explains how to keep your accounts. `reset-password` refuses a folder with no database and prints the path it checked (#2)
```

- [ ] **Step 7: Check and commit**

```bash
yarn check
git add -A && git commit -m "fix(rcl-core): refuse an old or missing database instead of starting empty

openDatabase refuses a data folder holding only obs-producer.db, and reset-password refuses
one with no rollcall.db, printing the path it checked.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 9: Move the code into rcl-core

**Files:**
- Move: `apps/server` → `rcl-core/server`, `apps/web` → `rcl-core/web`, `packages/shared` → `rcl-core/contract`
- Move: `.claude/rules/obs-producer-{server,web,overlay,shared,e2e}.md` → `.claude/rules/{rcl-core-server,rcl-core-web,rcl-core-overlay,rcl-core-contract,e2e}.md`
- Modify:
  - every tracked file that names `@obs-producer/*`, `apps/server`, `apps/web` or `packages/shared`, except `design-docs/`, `docs/decisions/00*`, `docs/product/roadmap.md`, `scripts/`, `CHANGELOG.md` and `yarn.lock`
  - by hand: `package.json`, `vitest.config.ts`, `vitest.stories.config.ts`, `AGENTS.md`, `CLAUDE.md`, `docs/decisions/0012-typescript-7-and-oxlint.md`
- Create: `rcl-core/AGENTS.md`, `rcl-core/CLAUDE.md`, `docs/decisions/0017-rcl-app-workspace-layout.md`
- Regenerate: `yarn.lock`
- Test: `rcl-core/server/src/config.test.ts`. Its `webDir` expectation becomes `rcl-core/web/dist`.

**Interfaces:**
- Consumes: the Task 7 names.
- Produces:
  - workspaces `@rollcall/core-server`, `@rollcall/core-web`, `@rollcall/core-contract`, `@rollcall/e2e`;
  - imports `from '@rollcall/core-contract'`;
  - root `workspaces: ["rcl-core/*", "e2e"]`.

  Phase 3 builds on these paths.

- [ ] **Step 1: Point the config test at the new path, and watch it fail**

In `apps/server/src/config.test.ts`, change `join(repoRoot, 'apps/web/dist')` to `join(repoRoot, 'rcl-core/web/dist')`.

Run `yarn vitest run apps/server/src/config.test.ts`.

Expected: FAIL. It still resolves `apps/web/dist`.

- [ ] **Step 2: Move the folders**

```bash
mkdir rcl-core
git mv apps/server rcl-core/server
git mv apps/web rcl-core/web
git mv packages/shared rcl-core/contract
rmdir apps packages
git mv .claude/rules/obs-producer-server.md .claude/rules/rcl-core-server.md
git mv .claude/rules/obs-producer-web.md .claude/rules/rcl-core-web.md
git mv .claude/rules/obs-producer-overlay.md .claude/rules/rcl-core-overlay.md
git mv .claude/rules/obs-producer-shared.md .claude/rules/rcl-core-contract.md
git mv .claude/rules/obs-producer-e2e.md .claude/rules/e2e.md
```

- [ ] **Step 3: Rename package names and paths everywhere they're referenced**

```bash
git grep -lzE '@obs-producer/|apps/(server|web)|packages/shared' -- . \
  ':!design-docs' ':!docs/decisions/00*' ':!docs/product/roadmap.md' ':!scripts' ':!CHANGELOG.md' ':!yarn.lock' ':!.yarn' \
  | xargs -0 perl -pi -e 's#\@obs-producer/shared#\@rollcall/core-contract#g; s#\@obs-producer/server#\@rollcall/core-server#g; s#\@obs-producer/web#\@rollcall/core-web#g; s#\@obs-producer/e2e#\@rollcall/e2e#g; s#apps/server#rcl-core/server#g; s#apps/web#rcl-core/web#g; s#packages/shared#rcl-core/contract#g'
perl -pi -e 's/^# obs-producer server /# rcl-core server /; s/^# obs-producer web app /# rcl-core web app /; s/^# obs-producer OBS overlay /# rcl-core OBS overlay /; s/^# obs-producer shared contract /# rcl-core contract /; s/^# obs-producer end-to-end tests /# End-to-end tests /; s/`obs-producer-overlay\.md`/`rcl-core-overlay.md`/' .claude/rules/*.md
```

- [ ] **Step 4: Root configs by hand**

- **`package.json`:** `"workspaces": ["rcl-core/*", "e2e"]`. The scripts already say `@rollcall/core-web`, `@rollcall/core-server` and `@rollcall/e2e`.
- **`vitest.config.ts`:** `include: ['rcl-core/contract/src/**/*.test.ts', 'rcl-core/server/src/**/*.test.ts']`. The web project already says `./rcl-core/web`.
- **`vitest.stories.config.ts`:** delete the stale sentence `Task 2 adds \`storybookProject('overlay')\` to the projects list.`. The paths already say `rcl-core/web`.
- **Check:** `grep -n 'apps/\|packages/' package.json vitest*.ts .oxlintrc.json .prettierignore` prints nothing.

- [ ] **Step 5: Install, and run the tests and see them pass**

```bash
yarn install
# The npm packages that get installed must be exactly the same; only workspace entries may move.
git show HEAD:yarn.lock | grep -E '^  resolution: ' | grep -v 'workspace:' | sort > "$TMPDIR/lock-before"
grep -E '^  resolution: ' yarn.lock | grep -v 'workspace:' | sort > "$TMPDIR/lock-after"
diff "$TMPDIR/lock-before" "$TMPDIR/lock-after" && echo "same npm packages"
yarn vitest run rcl-core/server/src/config.test.ts && yarn test
```
Expected:
- `same npm packages`.
- Both test runs pass.

- [ ] **Step 6: App instruction files**

Create `rcl-core/AGENTS.md`:
````markdown
# rcl-core — agent instructions

rcl-core is Rollcall's host: the one server process, accounts and access, shared data such as teams, the CRG and OBS connections, and the admin web app for that data ([ADR-0016](../docs/decisions/0016-obs-producer-becomes-rollcall.md)). Until the split, it also holds the OBS overlay entry, which moves to rcl-producer.

These rules add to the repo-root [AGENTS.md](../AGENTS.md). Its hard rules apply here.

## Layout

```
rcl-core/
├── server/     @rollcall/core-server: Fastify API, Socket.IO, OBS/CRG connections, SQLite
├── web/        @rollcall/core-web: React SPA (admin + dashboards) and the OBS overlay entry
└── contract/   @rollcall/core-contract: Zod schemas and types, used as TypeScript source (no build step)
```

## Commands

Run from the repo root.

| Command | What it does |
|---|---|
| `yarn workspace @rollcall/core-server start` | Server alone. Listens on `ROLLCALL_HOST`:`ROLLCALL_PORT` (default `0.0.0.0:5580`), data in `ROLLCALL_DATA_DIR` (default `data/` at the repo root, git-ignored), web build from `ROLLCALL_WEB_DIR` (default `rcl-core/web/dist/`); set `ROLLCALL_API_DOCS=1` to serve the API explorer at `/docs`; the overlay is at `/overlay`. It refuses to start while an old `OBS_PRODUCER_*` setting is set |
| `yarn workspace @rollcall/core-web dev` | Vite alone on port 5173, proxying `/api`, `/socket.io` and `/docs` to `ROLLCALL_DEV_SERVER` (default `http://localhost:5580`) |
| `yarn workspace @rollcall/core-server db:generate --name <change>` | Generate a Drizzle migration after editing `server/src/db/schema.ts`. Migrations run automatically at startup |
| `yarn workspace @rollcall/core-server reset-password <username>` | On the server machine: give a locked-out user (usually the only Admin) a temporary password, forcing a new one at their next login. Uses `ROLLCALL_DATA_DIR` like the server, and refuses a folder with no `rollcall.db` |
````

Create `rcl-core/CLAUDE.md`:
```markdown
@AGENTS.md

## Claude Code notes

These add to the repo-root `CLAUDE.md`. Shared rules belong in `AGENTS.md` above, not here.

- **Path-scoped rules** for this app are `.claude/rules/rcl-core-{server,web,overlay,contract}.md` at the repo root. Update them in the same change when code here moves.
```

- [ ] **Step 7: Root `AGENTS.md` and `CLAUDE.md`**

- **`AGENTS.md`, Status:** `Until the split, all code is one app.` → `Until the split, all code is in [rcl-core](rcl-core/AGENTS.md).`
- **`AGENTS.md`, Layout:** replace the three `rcl-core/...` lines that the substitution produced with:
```
├── rcl-core/          the host app: server, admin web app and contract (see rcl-core/AGENTS.md)
├── e2e/               @rollcall/e2e: Playwright tests against the real production build
```
- **`AGENTS.md`, Commands:**
  - Delete the four rows that start with `` `yarn workspace @rollcall/core-server start` ``, `` `yarn workspace @rollcall/core-web dev` ``, `` `yarn workspace @rollcall/core-server db:generate`` `` and `` `yarn workspace @rollcall/core-server reset-password`` ``. They now live in `rcl-core/AGENTS.md`.
  - Under the table, add: `App-specific commands (the server alone, migrations, reset-password) are in each app's AGENTS.md, e.g. [rcl-core](rcl-core/AGENTS.md#commands).`
- **`CLAUDE.md`:** change the path-scoped rules bullet to:
  `- **Path-scoped rules** in \`.claude/rules/\` map each code area to its hard rules, ADRs and wiki pages: \`rcl-core-{server,web,overlay,contract}.md\` and \`e2e.md\`. They load when Claude reads matching files. When code moves, docs are renamed or a new code area appears, update or add a rule in the same change.`

- [ ] **Step 8: ADR-0017, and mark ADR-0012 superseded**

Create `docs/decisions/0017-rcl-app-workspace-layout.md`. Use today's date, and copy ADR-0012's Decision table rows unchanged except the "Package manager and repo layout" row:
```markdown
---
title: Technology stack, with rcl apps in one workspace
status: accepted
date: 2026-10-07
---
# 0017. Technology stack, with rcl apps in one workspace

Supersedes [ADR-0012](0012-typescript-7-and-oxlint.md).

## Context

Rollcall is a suite of rcl apps ([ADR-0016](0016-obs-producer-becomes-rollcall.md)). The apps share a server, its contract and some web code, so they need a layout that keeps each app together and still shares tooling.

Options considered:
- **`apps/` by layer** (`apps/core-server`, `apps/producer-web`, …). Rejected: one app's parts end up far apart, and its rcl name shows only in package names.
- **A separate Yarn project per app.** Rejected: the shared contract and SDKs would have to be published or linked across projects.
- **One folder per app at the root, all in one Yarn workspace.** Chosen.

Everything else in ADR-0012 stands. It is restated below so this ADR is complete on its own.

## Decision

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript 7** (native compiler), `strict` mode, everywhere | Latest compiler and much faster type-checking. One type system from the database to the overlay |
| Package manager and repo layout | **Yarn 4**, pinned with the `packageManager` field and installed through Corepack, with `nodeLinker: node-modules` and `yarn.lock` committed. **One Yarn workspace** for the repo. Each rcl app is a root folder `rcl-<app>/` with `server/`, `web/` and `contract/` workspaces; libraries shared across apps go in `packages/`. The root `package.json` lists each app folder (`"rcl-core/*"`), never a wildcard folder name. Packages use the `@rollcall/` scope: `@rollcall/core-server`, `@rollcall/core-web`, `@rollcall/core-contract`, `@rollcall/e2e` | Each app's parts stay together under the name people use for it. One install, one lockfile and one set of checks for the suite. `scripts/release.mjs` reads `dir/*` patterns only |
| Runtime | **Node ≥ 24 LTS** | Current LTS line. Node 25+ doesn't bundle Corepack, so the dev setup explains how to install it |
| Web app | **Vite + React** single-page app, **React Router** | Fast dev loop, standard React tooling |
| Admin UI kit | **Mantine** | Batteries included. Overlays don't use it ([ADR-0006](0006-one-overlay-renderer-css-variable-theming.md)) |
| Client state | **Redux Toolkit + RTK Query** | See [ADR-0003](0003-client-state-with-redux-toolkit.md) |
| Server | **Fastify** | Fast, TypeScript-friendly, plugin model, schema validation |
| Real-time | **Socket.IO** | Rooms, automatic reconnection and acknowledgements. Reconnection matters for OBS browser sources |
| Storage | **SQLite** via **Drizzle ORM** (`better-sqlite3`), with migrations | Single-file database with no server to run; typed schema. Media is stored as files in a data directory |
| Testing | **Vitest** (unit and integration), **React Testing Library** (UI), **Playwright** (end-to-end: outputs, dashboards) | Vitest fits Vite; Playwright can check real rendered overlays |
| Linting | **Oxlint**, with type-aware linting through `oxlint-tsgolint` | Works with TypeScript 7 today, and runs many times faster than ESLint. Includes TypeScript, React, jsx-a11y and import rules |
| Formatting | **Prettier** | Stable and independent of the TypeScript version |

Library versions are pinned in `package.json`, not in this ADR.

### Names used in earlier ADRs

| Earlier name | Now |
|---|---|
| `apps/server`, `@obs-producer/server` | `rcl-core/server`, `@rollcall/core-server` |
| `apps/web`, `@obs-producer/web` | `rcl-core/web`, `@rollcall/core-web` |
| `packages/shared`, `@obs-producer/shared` | `rcl-core/contract`, `@rollcall/core-contract` |

## Consequences

- An app's workspaces sit at the same depth as before (`rcl-core/server` like `apps/server`), so relative paths such as the default data folder and `tsconfig` `extends` didn't change.
- Adding an app means adding its folder to the root `workspaces`, the Vitest projects, the lint and format ignores, and `.claude/rules`.
- The ADR-0012 consequences about Oxlint, `oxlint-tsgolint`, TypeScript 7's missing API and `types` defaults still apply.
```

In `docs/decisions/0012-typescript-7-and-oxlint.md`:
- Frontmatter: change `status: accepted` to `status: superseded` and add `superseded_by: "0017"`.
- Right after the `# 0012.` title, add:
`> **Superseded by [ADR-0017](0017-rcl-app-workspace-layout.md):** the workspaces move into rcl app folders (\`rcl-core/server\`, \`rcl-core/web\`, \`rcl-core/contract\`) under the \`@rollcall/\` scope. The rest of the stack is unchanged.`

Point the instructions at the current stack ADR. Accepted wiki pages keep their links, which still resolve:
```bash
perl -pi -e 's#0012-typescript-7-and-oxlint\.md#0017-rcl-app-workspace-layout.md#g; s#ADR-0012#ADR-0017#g' AGENTS.md .claude/rules/*.md
```

Run `node scripts/check-docs.mjs --fix`.

- [ ] **Step 9: Look for leftovers**

```bash
git grep -nE '@obs-producer/|apps/(server|web)|packages/shared|obs-producer-(server|web|overlay|shared|e2e)\.md' -- . \
  ':!design-docs' ':!docs/decisions/00*' ':!docs/product/roadmap.md' ':!yarn.lock'
git grep -n 'obs-producer' -- . ':!design-docs' ':!docs/decisions/00*' ':!yarn.lock'
```
Expected:
- The first command prints only `scripts/release.test.mjs`'s fixtures (`apps/web/package.json` and so on). Those are generic examples and stay as they are.
- The second prints only these, all about the release prefix or history, which Phase 5 handles:
  - `TAG_PREFIX`, `MILESTONE_PREFIX` and the `prepare` hint in `scripts/release.mjs`;
  - `scripts/release.test.mjs` fixtures;
  - `.github/workflows/release.yml`;
  - `.github/ISSUE_TEMPLATE/bug.yml`'s version placeholder;
  - `.claude/skills/release/SKILL.md`;
  - `docs/guides/releasing.md`;
  - the CHANGELOG footer links;
  - `docs/product/roadmap.md`'s `obs-producer v0.1.0` milestone.

- [ ] **Step 10: Run everything and commit**

```bash
yarn check && yarn build && yarn test:stories && yarn test:e2e
git add -A && git commit -m "refactor(repo): move the app into rcl-core

apps/server, apps/web and packages/shared become rcl-core/server, rcl-core/web and
rcl-core/contract (@rollcall/core-*). ADR-0017 supersedes ADR-0012.

Closes #2

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 10: Phase 2 hand-off ⏸

- [ ] **Step 1: Review the whole branch**

Run `git log --oneline main..` (three commits) and `git diff --stat main..`.

Then use superpowers:requesting-code-review on the branch, and fix what it confirms.

- [ ] **Step 2: Check `yarn dev` by hand**

Run `yarn dev`, open `http://localhost:5173`. Check that:
- the header says **Rollcall** and the badge reads "Server v0.1.0";
- `/overlay` shows the "Rollcall" placeholder card;
- `ROLLCALL_API_DOCS` is on in dev, so `/docs` loads.

Stop the server. Then:
```bash
OBS_PRODUCER_PORT=6000 yarn start
```
Expected: it stops at once with `OBS_PRODUCER_PORT was renamed to ROLLCALL_PORT (ADR-0016). Rename it and start again.`

- [ ] **Step 3: ⏸ Ask Mike, then merge and push**

```bash
git switch main && git merge --ff-only chore/rename-to-rollcall
git push origin main && git branch -d chore/rename-to-rollcall
```
Then:
- Check that issue #2 closed, and that its card is in "Done" on board #6.
- Update `rollcall-pivot.md` in memory to say Phases 0–2 are done.
- Tell Mike that Phase 3 (access model, issue #3) is next, with its own plan.
