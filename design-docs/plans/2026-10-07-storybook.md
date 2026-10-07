# Storybook (#17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add two Storybooks to the web app, composed into one window. The admin Storybook shows Mantine components; the overlay Storybook shows overlay components without Mantine. Every story also runs as a browser test with accessibility checks in CI.

**Architecture:**
- **Configs.** Each Storybook has its own config directory: `apps/web/.storybook/admin/` and `apps/web/.storybook/overlay/`.
  - The admin Storybook's preview loads Mantine and composes the overlay Storybook through `refs`.
  - The overlay Storybook's preview loads only the overlay's theme CSS, so Mantine can't leak into it.
- **Story tests.** `@storybook/addon-vitest` turns each Storybook's stories into a Vitest browser project that runs in Playwright's Chromium: `storybook-admin` and `storybook-overlay`.
- **Commands.**
  - `yarn test:stories` runs both story-test projects.
  - `yarn test` keeps running only the `node` and `web` projects.
  - `yarn storybook` starts both Storybook dev servers.

**Tech Stack:**
- Storybook 10.6: `storybook`, `@storybook/react-vite`, `@storybook/addon-docs`, `@storybook/addon-a11y`, `@storybook/addon-vitest`
- Vitest 5 browser mode, with `@vitest/browser-playwright` and Playwright 1.63
- Vite 8, React 19, Mantine 9
- Yarn 4 (its script shell runs background jobs with `&`)

**Spec:** [`obs-producer/design-docs/specs/2026-10-07-storybook-design.md`](../specs/2026-10-07-storybook-design.md). Issue #17, milestone `obs-producer v0.2.0`.

## Global Constraints

- **New dev dependencies.**
  - **`apps/web`:** `storybook`, `@storybook/react-vite`, `@storybook/addon-docs`, `@storybook/addon-a11y` and `@storybook/addon-vitest`, all at `^10.6.1`.
  - **The root workspace `obs-producer`:**
    - `@storybook/addon-vitest@^10.6.1`, because the root Vitest config imports it;
    - `@vitest/browser-playwright@^5.0.3`;
    - `playwright@^1.63.0`, matching the e2e workspace's `@playwright/test`, so both use the same installed Chromium.
  - **Upgrade:** `vitest` goes to `^5.0.3`. `@vitest/browser-playwright` 5.0.3 requires that exact version.
  - **Version check:** run `npm view <pkg> version` first, and use the newest version outside Yarn's 24-hour quarantine.
- **Configs:** `apps/web/.storybook/admin/` and `apps/web/.storybook/overlay/`.
  - Admin stories come from `src/components/` and `src/layout/`.
  - Overlay stories come from `src/overlay/`.
  - Stories sit next to their components as `*.stories.tsx`.
- **Servers:**
  - **Ports:** admin on 6006, overlay on 6007.
  - **Host:** `localhost` only.
  - **Phoning home is off:** `core.disableTelemetry: true`, `core.disableWhatsNewNotifications: true`, `core.enableCrashReports: false`, and the CLI flag `--no-version-updates`.
- **The overlay Storybook never imports Mantine or admin-app code** (ADR-0006).
- **Story tests:**
  - They live in the Vitest projects `storybook-admin` and `storybook-overlay`.
  - Accessibility violations fail a story (`parameters.a11y.test = 'error'`).
  - `yarn test` (and so `yarn check`) runs only `--project node --project web`.
  - `yarn test:stories` runs both story projects.
- **Nothing that ships changes.** The app's build and server stay the same. The OBS overlay page renders exactly as before: transparent, with the same default theme values.
- **Sample themes** are CSS classes.
  - They set only the six existing variables: `--theme-font-family`, `--theme-color-text`, `--theme-color-surface`, `--theme-color-accent`, `--theme-radius` and `--theme-border-width`.
  - The Default sample sets nothing.
- **Code rules:**
  - TypeScript follows ADR-0013: `.ts`/`.tsx` extensions on relative imports, erasable syntax only, `import type` for types.
  - No `as` casts in app code under `src/`. If story files need casts, add `**/*.stories.tsx` to the test-files override in `.oxlintrc.json`.
  - No new inline `oxlint-disable` comments.
- **Commits:** every commit passes `yarn check`. Use Conventional Commits, each ending with the committer's `Co-Authored-By` line. The last commit says `Closes #17`.

## Review Focus

1. **An overlay component that only looks right because of Mantine's global styles.** Its story must fail in the overlay Storybook. The isolation check is proved in Task 2 by temporarily loading Mantine into the overlay preview and watching the stories fail.
2. **A component or sample theme with poor contrast or a missing label.** Its story fails the accessibility check.
   - The light and high-contrast sample themes get their own stories, pinned with story `globals`, so CI checks them (Task 2).
   - An existing component that fails gets fixed, not excused (Task 1).
3. **A story's canned server response leaking into the next story.** Each stub restores the real `fetch` when its story ends (Task 1).
4. **`yarn test` or `yarn check` starting a browser,** and slowing every commit. They must run only the `node` and `web` projects (Task 1).
5. **Stopping `yarn storybook` and leaving the overlay server running on port 6007,** so the next start fails. Ctrl-C must stop both servers (Task 3).

---

## File map

All paths are relative to `obs-producer/`.

| File | Responsibility | Task |
|---|---|---|
| `package.json`, `apps/web/package.json`, `yarn.lock` | Dependencies; the `test` and `test:stories` scripts | 1 |
| `vitest.config.ts` | `storybook-admin` and `storybook-overlay` projects | 1, 2 |
| `apps/web/.storybook/admin/main.ts`, `preview.tsx` | Admin Storybook: Mantine, light/dark, accessibility | 1 |
| `apps/web/src/components/ServerStatus.stories.tsx` | Online, Unreachable and Checking stories | 1 |
| `apps/web/tsconfig.json` | Type-check `.storybook/` | 1 |
| `apps/web/src/overlay/overlay.css`, `theme-defaults.css`, `themes/sample-themes.css` | Theme defaults in one home; sample themes | 2 |
| `apps/web/.storybook/overlay/main.ts`, `preview.tsx`, `frame.css` | Overlay Storybook: no Mantine, theme and backdrop toolbar, isolation check | 2 |
| `apps/web/src/overlay/components/PlaceholderCard.stories.tsx` | PlaceholderCard stories, including the sample themes | 2 |
| `apps/web/.storybook/admin/main.ts` (`refs`), `package.json` scripts, `.github/workflows/obs-producer-app.yml`, `.gitignore` | Composition, `yarn storybook`, CI | 3 |
| `docs/…`, `AGENTS.md`, `../.claude/rules/obs-producer-{web,overlay}.md` | ADR-0015, guides, rules | 4 |

---

### Task 1: The admin Storybook, with story tests

**Files:**
- Modify: `package.json` (root), `apps/web/package.json`, `vitest.config.ts`, `apps/web/tsconfig.json`, `yarn.lock`
- Create: `apps/web/.storybook/admin/main.ts`, `apps/web/.storybook/admin/preview.tsx`, `apps/web/src/components/ServerStatus.stories.tsx`

**Interfaces:**
- Consumes:
  - `ServerStatus` (`src/components/ServerStatus.tsx`). It uses `useGetHealthQuery`, shows `<Loader aria-label="Checking server" />` while loading, `Server unreachable` on error, and `Server v{version}` on success.
  - `makeStore()` (`src/store/store.ts`).
  - The RTK Query base URL, `${window.location.origin}/api/`.
- Produces:
  - the `storybookProject(name)` helper and the `storybook-admin` project in `vitest.config.ts`;
  - the root `test` and `test:stories` scripts;
  - the admin `preview.tsx`, with the `colorScheme` global and `a11y.test = 'error'`.

- [ ] **Step 1: Add the dependencies.** From `obs-producer/`, check the latest versions first with `npm view <pkg> version`. Then run:

```bash
yarn up vitest@^5.0.3
yarn add -D @storybook/addon-vitest@^10.6.1 @vitest/browser-playwright@^5.0.3 playwright@^1.63.0
yarn workspace @obs-producer/web add -D storybook@^10.6.1 @storybook/react-vite@^10.6.1 @storybook/addon-docs@^10.6.1 @storybook/addon-a11y@^10.6.1 @storybook/addon-vitest@^10.6.1
```

Expected: done, with no quarantine error, no peer-dependency warning about `vitest` or `playwright`, and `yarn check` still passing. If Yarn warns about another missing peer, report it rather than guessing.

- [ ] **Step 2: Keep `yarn test` browser-free.** In the root `package.json`:
  - change `"test"` to `"vitest run --project node --project web"`;
  - add `"test:stories": "vitest run --project storybook-admin"`. Task 2 adds the overlay project to it.

Run `yarn test` and confirm the output names only the `node` and `web` projects.

- [ ] **Step 3: Configure the admin Storybook.** Create `apps/web/.storybook/admin/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/react-vite';

// The admin Storybook: shared Mantine components from the admin app (ADR-0015). Overlay components have their
// own Storybook, so Mantine never loads next to them (ADR-0006). Nothing here calls home: telemetry, crash
// reports and update notices are off.
const config: StorybookConfig = {
  stories: ['../../src/components/**/*.stories.tsx', '../../src/layout/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true, enableCrashReports: false },
};

export default config;
```

Create `apps/web/.storybook/admin/preview.tsx`:

```tsx
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import type { Preview } from '@storybook/react-vite';

// Every admin story renders inside MantineProvider, as App.tsx does. The toolbar switches light and dark.
const preview: Preview = {
  globalTypes: {
    colorScheme: {
      description: 'Mantine color scheme',
      toolbar: {
        title: 'Color scheme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { colorScheme: 'light' },
  // Story tests fail on any accessibility violation (ADR-0015).
  parameters: { a11y: { test: 'error' } },
  tags: ['autodocs'],
  decorators: [
    (Story, { globals }) => (
      <MantineProvider forceColorScheme={globals.colorScheme === 'dark' ? 'dark' : 'light'}>
        <Story />
      </MantineProvider>
    ),
  ],
};

export default preview;
```

In `apps/web/tsconfig.json`, change `"include": ["src"]` to `"include": ["src", ".storybook"]`.

- [ ] **Step 4: Add the admin story-test project.** In the root `vitest.config.ts`:
  1. Add these imports:

     ```ts
     import { fileURLToPath } from 'node:url';
     import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
     import { playwright } from '@vitest/browser-playwright';
     ```
  2. Add the helper below above `export default`.
  3. Add `storybookProject('admin'),` to `test.projects`, after the `web` project.
  4. Update the file's opening comment to mention `yarn test:stories`.

```ts
// Story tests (ADR-0015): every story of one Storybook renders in Playwright's Chromium, with accessibility checks.
// `yarn test:stories` runs them; `yarn test` runs only the node and web projects.
const storybookProject = (name: 'admin' | 'overlay') => ({
  extends: './apps/web/vite.config.ts',
  plugins: [storybookTest({ configDir: fileURLToPath(new URL(`./apps/web/.storybook/${name}`, import.meta.url)) })],
  test: {
    name: `storybook-${name}`,
    root: './apps/web',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' as const }],
    },
  },
});
```

Playwright's Chromium must be installed. It already is if you've run the e2e tests; otherwise run `yarn workspace @obs-producer/e2e playwright install chromium`.

- [ ] **Step 5: Write the stories.** Create `apps/web/src/components/ServerStatus.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { expect } from 'storybook/test';
import { makeStore } from '../store/store.ts';
import { ServerStatus } from './ServerStatus.tsx';

const HEALTH = { status: 'ok', name: 'OBS Producer', version: '0.2.0', uptimeSeconds: 42 };

// Stories run without a server: each one answers the app's requests itself, then puts the real fetch back.
function answerRequests(respond: () => Promise<Response>) {
  return () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = respond;
    return () => {
      globalThis.fetch = realFetch;
    };
  };
}

const meta = {
  title: 'Components/ServerStatus',
  component: ServerStatus,
  // A fresh copy of the app's store for each story, so RTK Query starts empty every time.
  decorators: [
    (Story) => (
      <Provider store={makeStore()}>
        <Story />
      </Provider>
    ),
  ],
} satisfies Meta<typeof ServerStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = {
  beforeEach: answerRequests(async () => Response.json(HEALTH)),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Server v0.2.0')).toBeVisible();
  },
};

export const Unreachable: Story = {
  beforeEach: answerRequests(async () => {
    throw new TypeError('Failed to fetch');
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Server unreachable')).toBeVisible();
  },
};

export const Checking: Story = {
  beforeEach: answerRequests(() => new Promise<Response>(() => undefined)),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Checking server')).toBeVisible();
  },
};
```

- [ ] **Step 6: Prove the story tests can fail.**
  1. Temporarily change the Online story's expected text to `'Server v9.9.9'`.
  2. Run `yarn test:stories`.
  3. Expected: FAIL in `Online`. Revert the change.

- [ ] **Step 7: Run the story tests**

Run: `yarn test:stories`
Expected: PASS for all three stories, with no accessibility violations.

If the accessibility check reports a violation in `ServerStatus` itself (Mantine's filled green badge with white text can fall below 4.5:1 contrast), fix the component, not the check:
- use a badge `variant` or `color` that passes, and keep the same texts;
- re-run `yarn vitest run apps/web/src` to make sure its unit tests still pass;
- add a `### Fixed` line under `## [Unreleased]` in `CHANGELOG.md`: `- The header's server badge has enough contrast to read (#17)`.

Report what you changed.

- [ ] **Step 8: Run the whole check**

Run: `yarn check`
Expected: PASS, with no browser started.

If Oxlint objects to something in the story file (for example the empty promise executor), make the smallest change that doesn't alter behavior. Adding `**/*.stories.tsx` to the test-files override in `.oxlintrc.json` is fine. Report it.

- [ ] **Step 9: Commit**

```bash
git add obs-producer/package.json obs-producer/apps/web obs-producer/vitest.config.ts obs-producer/yarn.lock
git commit -m "feat(obs-producer): admin Storybook with ServerStatus stories, run as browser tests"
```

Also stage `obs-producer/.oxlintrc.json` and `obs-producer/CHANGELOG.md` if you changed them.

---

### Task 2: The overlay Storybook, with sample themes and the isolation check

**Files:**
- Create:
  - `apps/web/src/overlay/theme-defaults.css`
  - `apps/web/src/overlay/themes/sample-themes.css`
  - `apps/web/.storybook/overlay/main.ts`, `preview.tsx` and `frame.css`
  - `apps/web/src/overlay/components/PlaceholderCard.stories.tsx`
- Modify: `apps/web/src/overlay/overlay.css`, `vitest.config.ts`, `package.json` (root, the `test:stories` script)

**Interfaces:**
- Consumes:
  - `storybookProject(name)` (Task 1);
  - `PlaceholderCard` (`src/overlay/components/PlaceholderCard.tsx`), with props `{ title: string; subtitle?: string }`;
  - the six `--theme-*` variables.
- Produces:
  - `theme-defaults.css`, the single home of the default theme values;
  - the `.sample-theme-light` and `.sample-theme-high-contrast` classes;
  - the overlay `preview.tsx`, with the `overlayTheme` and `backdrop` globals, the `[data-overlay-root]` element, and the isolation check in `afterEach`.

- [ ] **Step 1: Give the default theme one home.**
  - Move the `:root { --theme-… }` block, with its comment, out of `apps/web/src/overlay/overlay.css` into a new `apps/web/src/overlay/theme-defaults.css`.
  - Put `@import './theme-defaults.css';` as the first line of `overlay.css`. The overlay page then still gets both parts, unchanged.

Then run `yarn vitest run apps/web/src/overlay` and `yarn test:e2e --grep overlay`.
Expected: PASS. The overlay is still transparent, shows its version, and loads no Mantine.

- [ ] **Step 2: Add the sample themes.** Create `apps/web/src/overlay/themes/sample-themes.css`:

```css
/* Sample themes for the overlay Storybook, until the Theme Builder makes real ones (ADR-0015).
   They set only the --theme-* variables overlay components use. "Default" sets nothing: theme-defaults.css applies. */
.sample-theme-light {
  --theme-color-text: #14171f;
  --theme-color-surface: rgb(255 255 255 / 0.94);
  --theme-color-accent: #1864ab;
}

.sample-theme-high-contrast {
  --theme-color-text: #ffe600;
  --theme-color-surface: #000000;
  --theme-color-accent: #ffe600;
  --theme-radius: 0;
  --theme-border-width: 4px;
}
```

- [ ] **Step 3: Configure the overlay Storybook.** Create `apps/web/.storybook/overlay/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/react-vite';

// The overlay Storybook (ADR-0015): overlay components exactly as OBS renders them, so no Mantine anywhere
// (ADR-0006). Telemetry, crash reports and update notices are off.
const config: StorybookConfig = {
  stories: ['../../src/overlay/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true, enableCrashReports: false },
};

export default config;
```

Create `apps/web/.storybook/overlay/frame.css`:

```css
/* What sits behind the transparent overlay, to check legibility the way it will look on stream (ADR-0015). */
.overlay-frame {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 2rem;
}

.backdrop-checkerboard {
  background: repeating-conic-gradient(#d0d4da 0% 25%, #ffffff 0% 50%) 0 0 / 24px 24px;
}

.backdrop-dark {
  background: #16191f;
}

.backdrop-bright {
  background: #f4f1ea;
}
```

Create `apps/web/.storybook/overlay/preview.tsx`:

```tsx
import '../../src/overlay/theme-defaults.css';
import '../../src/overlay/themes/sample-themes.css';
import './frame.css';
import type { Preview } from '@storybook/react-vite';
import { expect } from 'storybook/test';

const THEME_CLASSES: Record<string, string> = {
  default: '',
  light: 'sample-theme-light',
  'high-contrast': 'sample-theme-high-contrast',
};

const BACKDROP_CLASSES: Record<string, string> = {
  checkerboard: 'backdrop-checkerboard',
  dark: 'backdrop-dark',
  bright: 'backdrop-bright',
};

const classFor = (classes: Record<string, string>, value: unknown, fallback: string) =>
  (typeof value === 'string' ? classes[value] : undefined) ?? classes[fallback] ?? '';

// Overlay stories render the way OBS shows them: no Mantine, theme variables set on the root element
// (ADR-0006), over a backdrop.
const preview: Preview = {
  globalTypes: {
    overlayTheme: {
      description: 'Sample theme (until the Theme Builder makes real ones)',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'default', title: 'Default' },
          { value: 'light', title: 'Light' },
          { value: 'high-contrast', title: 'High contrast' },
        ],
        dynamicTitle: true,
      },
    },
    backdrop: {
      description: 'What is behind the transparent overlay',
      toolbar: {
        title: 'Backdrop',
        icon: 'photo',
        items: [
          { value: 'checkerboard', title: 'Checkerboard' },
          { value: 'dark', title: 'Dark (game footage)' },
          { value: 'bright', title: 'Bright (light arena)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { overlayTheme: 'default', backdrop: 'checkerboard' },
  // Story tests fail on any accessibility violation (ADR-0015).
  parameters: { a11y: { test: 'error' }, layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story, { globals }) => (
      <div className={`overlay-frame ${classFor(BACKDROP_CLASSES, globals.backdrop, 'checkerboard')}`}>
        <div data-overlay-root className={classFor(THEME_CLASSES, globals.overlayTheme, 'default')}>
          <Story />
        </div>
      </div>
    ),
  ],
  // ADR-0006 in Storybook: no Mantine on the page, and theme variables reach the story's root.
  afterEach: async ({ canvasElement }) => {
    await expect(getComputedStyle(document.documentElement).getPropertyValue('--mantine-color-body')).toBe('');
    const root = canvasElement.querySelector('[data-overlay-root]');
    await expect(root).not.toBeNull();
    if (root) await expect(getComputedStyle(root).getPropertyValue('--theme-color-text').trim()).not.toBe('');
  },
};

export default preview;
```

- [ ] **Step 4: Add the overlay story-test project.**
  - In `vitest.config.ts`, add `storybookProject('overlay'),` after `storybookProject('admin'),`.
  - In the root `package.json`, change `test:stories` to `"vitest run --project storybook-admin --project storybook-overlay"`.

- [ ] **Step 5: Write the stories.** Create `apps/web/src/overlay/components/PlaceholderCard.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlaceholderCard } from './PlaceholderCard.tsx';

const meta = {
  title: 'Components/PlaceholderCard',
  component: PlaceholderCard,
  args: { title: 'OBS Producer', subtitle: 'v0.2.0' },
} satisfies Meta<typeof PlaceholderCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSubtitle: Story = {};

export const WithoutSubtitle: Story = { args: { subtitle: undefined } };

export const LongTitle: Story = {
  args: { title: 'Grand Raggidy Roller Derby vs. Gotham Girls Roller Derby: Championship Final' },
};

// Pinned to each sample theme, so the accessibility check covers them in CI as well.
export const LightTheme: Story = { globals: { overlayTheme: 'light' } };

export const HighContrastTheme: Story = { globals: { overlayTheme: 'high-contrast' } };
```

- [ ] **Step 6: Prove the isolation check works.**
  1. Temporarily add `import '@mantine/core/styles.css';` as the first line of `apps/web/.storybook/overlay/preview.tsx`.
  2. Run `yarn vitest run --project storybook-overlay`.
  3. Expected: FAIL in every overlay story, on the `--mantine-color-body` assertion.
  4. Remove the line, run again, and expect PASS. Put both outputs in your report.

If the failure doesn't come from `afterEach`, report that rather than moving on. This would be the case if this Storybook version doesn't fail a story test when `afterEach` throws. The check must be able to fail.

- [ ] **Step 7: Run the story tests**

Run: `yarn test:stories`
Expected: PASS for both projects (8 stories), with no accessibility violations. If a sample theme fails contrast, change its colors, not the check, and report the change.

- [ ] **Step 8: Run the whole check** with `yarn check`. Expected: PASS. Also run `yarn test:e2e`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add obs-producer/apps/web obs-producer/vitest.config.ts obs-producer/package.json
git commit -m "feat(obs-producer): overlay Storybook without Mantine, with sample themes and backdrops"
```

---

### Task 3: One window, `yarn storybook`, and CI

**Files:**
- Modify:
  - `apps/web/.storybook/admin/main.ts` (`refs`)
  - `apps/web/package.json` and the root `package.json` (`storybook` scripts)
  - `../.github/workflows/obs-producer-app.yml` (repo root)
  - `.gitignore` (the `obs-producer` one, if it exists; otherwise the repo root's)

**Interfaces:**
- Consumes: both Storybook configs (Tasks 1–2).
- Produces:
  - `yarn storybook`, which runs the overlay on 6007 and the admin, with the composed window, on 6006;
  - the CI step `yarn test:stories`.

- [ ] **Step 1: Compose the overlay into the admin window.** In `apps/web/.storybook/admin/main.ts`, add this to `config`:

```ts
  // The overlay Storybook runs on its own (port 6007) and appears here as its own section (ADR-0015).
  refs: { overlay: { title: 'Overlay', url: 'http://localhost:6007' } },
```

- [ ] **Step 2: Add the scripts.** Yarn's script shell runs `&` background jobs on every OS.
  - In `apps/web/package.json`:

    ```json
        "storybook": "storybook dev -c .storybook/overlay -p 6007 --host localhost --exact-port --no-open --no-version-updates & storybook dev -c .storybook/admin -p 6006 --host localhost --exact-port --no-version-updates",
    ```
  - In the root `package.json`:

    ```json
        "storybook": "yarn workspace @obs-producer/web storybook",
    ```

- [ ] **Step 3: Try it for real.** From `obs-producer/`, run:

```bash
yarn storybook > /tmp/op-storybook.log 2>&1 &
SB=$!
for i in $(seq 1 90); do curl -sf http://localhost:6006/index.json > /dev/null && curl -sf http://localhost:6007/index.json > /dev/null && break; sleep 1; done
curl -s http://localhost:6006/index.json | grep -o '"components-serverstatus--[a-z-]*"' | sort -u
curl -s http://localhost:6007/index.json | grep -o '"components-placeholdercard--[a-z-]*"' | sort -u
curl -sI -H 'Origin: http://localhost:6006' http://localhost:6007/index.json | grep -i '^access-control-allow-origin'
kill -INT $SB; sleep 5
lsof -nP -iTCP:6006 -iTCP:6007 -sTCP:LISTEN || echo "both stopped"
```

Expected:
- the `ServerStatus` ids `…--online`, `…--unreachable` and `…--checking`;
- the five `PlaceholderCard` ids, from `…--with-subtitle` to `…--high-contrast-theme`;
- each component's auto-generated `…--docs` entry, listed alongside the stories;
- an `access-control-allow-origin` header, which composition needs;
- `both stopped`.

If a server is still listening after the interrupt, stop it by its port and report what happened rather than working around it. That would mean Yarn didn't pass the stop on to the background job. Put the output in your report.

- [ ] **Step 4: Run story tests in CI.** In `.github/workflows/obs-producer-app.yml`, after the `yarn build` step, move the step that installs Playwright's Chromium (`yarn workspace @obs-producer/e2e playwright install --with-deps chromium`) so it runs before both browser test steps. Add `- run: yarn test:stories` right after it, before `- run: yarn test:e2e`. Leave every other step unchanged.

- [ ] **Step 5: Ignore Storybook's output.** Add `storybook-static/` and `*storybook.log` to the `obs-producer` `.gitignore`. If there isn't one, use the repo root's.
  - Also add `__screenshots__/` if a failing story test leaves screenshots behind; Vitest browser mode saves them on failure.
  - Run `git status` after the steps above to see what appeared.

- [ ] **Step 6: Run the whole check** with `yarn check` and `yarn test:stories`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add obs-producer/apps/web obs-producer/package.json .github/workflows/obs-producer-app.yml
git commit -m "feat(obs-producer): yarn storybook shows both Storybooks in one window; story tests run in CI"
```

Also stage whichever `.gitignore` you changed.

---

### Task 4: Docs, and ADR-0015

**Files:**
- Create: `docs/decisions/0015-storybook-admin-and-overlay-kept-apart.md`
- Modify:
  - `docs/decisions/README.md` (generated)
  - `docs/guides/local-development.md` and `docs/guides/testing.md`
  - `AGENTS.md`
  - `../.claude/rules/obs-producer-web.md` and `../.claude/rules/obs-producer-overlay.md`
  - the spec's status line

- [ ] **Step 1: Write ADR-0015.** Run `yarn docs:check --next-adr` and check that it prints `0015`. Then create `docs/decisions/0015-storybook-admin-and-overlay-kept-apart.md`:

```markdown
---
title: Storybook for shared components, admin and overlay kept apart
status: accepted
date: 2026-10-07
---
# 0015. Storybook for shared components, admin and overlay kept apart

## Context

Shared components need to be seen in every state that matters, outside the app: admin components in light and dark, overlay components across themes and over different backdrops. Overlay components must render without Mantine ([ADR-0006](0006-one-overlay-renderer-css-variable-theming.md)). But Mantine's stylesheet sets global styles, so a single Storybook that loads it can make an overlay component look right there and wrong in OBS.

Options considered:
- **One Storybook with Mantine loaded globally.** Rejected: it hides exactly the leak ADR-0006 is about.
- **One Storybook where only admin stories load Mantine.** Rejected: once loaded, Mantine's CSS stays on the page while you browse, so the interactive view can still mislead.
- **Two Storybooks, admin and overlay, composed into one window.** Chosen.

## Decision

- **Two Storybooks** in `apps/web/.storybook/admin/` and `apps/web/.storybook/overlay/`. The admin one loads Mantine and composes the overlay one, which never loads Mantine. `yarn storybook` starts both: admin on port 6006, overlay on 6007, `localhost` only.
- **Scope.** Stories sit next to their components (`*.stories.tsx`). Shared components get stories; full pages don't.
- **Every story is a test.** Storybook's Vitest add-on renders each story in Playwright's Chromium, and the test fails on a render error, a failed `play` check or an accessibility violation. `yarn test:stories` runs them, and CI runs it on every change. `yarn test` and `yarn check` don't start a browser.
- **Overlay stories prove they're isolated.** Each one checks that no Mantine variables are on the page and that theme variables reach the story.
- **Sample themes until the Theme Builder.** Light and high-contrast sample themes, plus backdrops (checkerboard, dark, bright), are switched from the toolbar. The default theme's values live only in `theme-defaults.css`, which the real overlay page also uses.
- **Offline and private.** Telemetry, crash reports and update checks are off.

## Consequences

- A new shared component needs a story, and the story must pass the accessibility check.
- Components that read server data get canned responses in their stories, the same way unit tests stub `fetch`.
- In development, the admin window shows the overlay section only while the overlay Storybook is running. `yarn storybook` starts both.
- When the Theme Builder lands, real themes replace the sample themes.
```

- [ ] **Step 2: Update the guides.**
  - **`docs/guides/local-development.md`:** add this subsection after "Trying the API":

    ```markdown
    ### Storybook

    `yarn storybook` shows the web app's shared components, one at a time, outside the app ([ADR-0015](../decisions/0015-storybook-admin-and-overlay-kept-apart.md)). It opens `http://localhost:6006`, the admin components. The overlay components appear in the same window under **Overlay**, served from port 6007.

    - **Admin stories:** switch light and dark from the toolbar.
    - **Overlay stories:** switch the **Theme** (sample themes until the Theme Builder) and the **Backdrop** behind the transparent overlay.
    - Ctrl-C stops both. If a port is still in use, stop that process: `lsof -nP -iTCP:6007 -sTCP:LISTEN`.
    ```
  - **`docs/guides/testing.md`:**
    - Add this row to the Layers table after "React components":

      ```markdown
      | Stories | Storybook + Vitest browser mode (Playwright's Chromium) | `apps/web/src/**/*.stories.tsx` | `yarn test:stories` |
      ```
    - Add `yarn test:stories` to the sentence that lists what CI runs.
    - Add this section before "## Playwright":

      ```markdown
      ## Stories

      Shared components get a story next to them (`Component.stories.tsx`), and every story is also a test ([ADR-0015](../decisions/0015-storybook-admin-and-overlay-kept-apart.md)). `yarn test:stories` renders each one in Chromium and fails on a render error, a failed `play` check, or an accessibility violation.

      - **Which Storybook:** admin components (`src/components`, `src/layout`) go in the admin Storybook; overlay components (`src/overlay`) in the overlay one.
      - **Server data:** give each story its own answer with a `beforeEach` that stubs `fetch` and restores it (see `ServerStatus.stories.tsx`). A fresh `makeStore()` per story keeps RTK Query empty.
      - **Themes in CI:** a story pinned to a sample theme with `globals: { overlayTheme: 'light' }` is checked for contrast like any other.
      - **Isolation:** every overlay story checks that no Mantine variables are on the page and that theme variables reach it, the same check the e2e test makes on the real overlay page.
      ```
- [ ] **Step 3: Update `AGENTS.md` and the rules.**
  - **`AGENTS.md`:**
    - Add these rows to the Commands table, after `yarn test:e2e`:

      ```markdown
      | `yarn test:stories` | Story tests: every Storybook story rendered in Chromium, with accessibility checks ([ADR-0015](docs/decisions/0015-storybook-admin-and-overlay-kept-apart.md)) |
      | `yarn storybook` | Both Storybooks in one window at `http://localhost:6006` (admin), with the overlay section from port 6007 |
      ```
    - In "Definition of done", add the bullet `- New shared components have a story, and \`yarn test:stories\` passes.` after the tests bullet.
  - **`.claude/rules/obs-producer-web.md`**, at the repo root: add the bullet `- **Shared admin components** (\`src/components\`, \`src/layout\`) get a story next to them, in the admin Storybook (ADR-0015). See \`obs-producer/docs/guides/testing.md#stories\`.`
  - **`.claude/rules/obs-producer-overlay.md`**: add the bullet `- **Overlay components** get a story next to them, in the overlay Storybook, which never loads Mantine (ADR-0015).`
  - **The spec:** in `design-docs/specs/2026-10-07-storybook-design.md`, change the status line to `**Date:** 2026-10-07 · **Status:** approved · **Milestone:** \`obs-producer v0.2.0\` · **Issue:** #17`.

- [ ] **Step 4: Regenerate and check the docs**

Run: `yarn docs:check --fix`, then `yarn docs:check`
Expected: ADR 0015 appears in the index; `check-docs: OK`.

- [ ] **Step 5: Run everything**

Run: `yarn check`, `yarn test:stories` and `yarn test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add obs-producer .claude/rules/obs-producer-web.md .claude/rules/obs-producer-overlay.md
git commit -m "docs(obs-producer): ADR-0015 and guides for Storybook and story tests

Closes #17"
```

---

## Done when

- `yarn check`, `yarn test:stories` and `yarn test:e2e` pass, and CI runs `yarn test:stories`.
- `yarn storybook` opens one window. The admin stories switch light and dark. The **Overlay** section switches sample themes and backdrops. Ctrl-C stops both servers.
- Every item in the #17 issue's "Done when" list is backed by a step above:

| #17 "Done when" item | Where |
|---|---|
| `yarn storybook` shows the stories | Tasks 1–3 |
| Admin stories render inside Mantine; overlay stories render without it | Tasks 1–2, including the isolation check |
| Works offline, and story tests run in CI | Tasks 1 and 3 |
| An ADR and the guides | Task 4 |
