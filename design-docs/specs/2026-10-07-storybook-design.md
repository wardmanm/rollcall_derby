# Storybook for shared components and themes: design

**Date:** 2026-10-07 · **Status:** approved in chat, written for review · **Milestone:** `obs-producer v0.2.0` · **Issue:** #17

## Goal

Developers can view the web app's shared components and styling one at a time, outside the app, in every state that matters: the admin app's Mantine components, and the overlay components that OBS renders.

The overlay components are shown on a page that behaves like the real OBS output page. So a component that only looks right because of Mantine's global styles shows up in Storybook as broken, and doesn't reach OBS. Every story is also a test in CI.

## Decisions (confirmed with Mike)

| Topic | Decision |
|---|---|
| Scope | Shared components and styling, **not full pages** |
| Separation | **Two Storybooks**, admin and overlay, shown together in one window through Storybook composition. The overlay one never loads Mantine (ADR-0006) |
| Story tests | **Yes, in CI.** Every story renders in a real browser, with accessibility checks, through `yarn test:stories`. `yarn check` stays as fast as today |
| Theme toolbar | **Sample themes plus backdrops** for overlay stories, and Mantine **light/dark** for admin stories. The Theme Builder later replaces the sample themes |

Storybook 10.6 supports this stack: Vite 8, React 19 and Vitest 5. All its packages are well outside Yarn's 24-hour quarantine.

## Scope

**In scope:**
- Both Storybooks and their composition.
- The first stories: `ServerStatus` (admin) and `PlaceholderCard` (overlay).
- Sample themes and backdrops.
- Story tests in CI.
- Docs and ADR-0015.

**Out of scope:**
- Stories for full pages.
- A published or static Storybook.
- Visual-regression screenshots.
- Real themes, which arrive with the Theme Builder.
- Any change to what ships to a venue.

## Layout and running

- **Configs** live in `apps/web/.storybook/admin/` and `apps/web/.storybook/overlay/`. Each has its own `main.ts` and preview.
- **Stories sit next to their components** as `*.stories.tsx`.
  - The overlay Storybook collects stories under `src/overlay/`.
  - The admin Storybook collects stories from the rest of `src/` and never from `src/overlay/`.
- **`yarn storybook`** starts both Storybooks.
  - The overlay Storybook runs on port **6007** in the background, without opening a browser.
  - The admin Storybook runs on port **6006** and opens the browser. It composes the overlay Storybook, which appears as its own "Overlay" section in the sidebar.
- **Both listen only on `localhost` and work offline.** Storybook's telemetry, crash reports and "what's new" notifications are turned off, so nothing calls out to the internet.
- **It's a development tool.** The app's build, server and output are unchanged. Storybook's build output and log files are git-ignored.

## The admin Storybook

- **Mantine.** The preview loads Mantine's stylesheet once, globally, and wraps every story in `MantineProvider`, as `App.tsx` does.
- **Light/dark toolbar.** A toolbar control switches between light and dark, and sets Mantine's color scheme for the story.
- **Server data without a server.** Components that read server data through RTK Query, such as `ServerStatus`, get a fresh copy of the app's real Redux store for each story (`makeStore()`). Each story supplies canned responses by stubbing `fetch` for that story, and restores it afterwards. That's the same technique the unit tests use. No server and no mocking library are needed.
- **`ServerStatus` stories:**
  - **Online:** `/api/health` answers, and the badge shows "Server v0.2.0".
  - **Unreachable:** the request fails, and the badge shows "Server unreachable".
  - **Checking:** the request never answers, and the spinner shows.
- **Docs pages.** Storybook's docs add-on generates a Docs page for each component, listing its props.

## The overlay Storybook

- **No Mantine.** The preview loads neither Mantine's CSS nor `MantineProvider`, matching the real overlay page (ADR-0006).
- **The default theme has one home.**
  - Today `overlay.css` holds two things: the page rules (a transparent, non-scrolling page) and the default `--theme-*` values. The default values move into a new `theme-defaults.css`.
  - The real overlay page imports both files, so OBS sees no change.
  - The overlay Storybook imports only `theme-defaults.css`. The page rules would break Storybook's canvas.
- **Sample themes** live in one small file under `src/overlay/`. Each sets the same six variables that overlay components already use: `--theme-font-family`, `--theme-color-text`, `--theme-color-surface`, `--theme-color-accent`, `--theme-radius` and `--theme-border-width`.
  - **Default** sets nothing, so it uses `theme-defaults.css` unchanged.
  - **Light** has a light surface with dark text.
  - **High contrast** is black and yellow, with thick borders.
- **Toolbar:**
  - **Theme:** Default, Light or High contrast. It sets the variables on the story's frame, the way a screen's root element will (ADR-0006).
  - **Backdrop:** what shows behind the transparent overlay, for checking legibility on stream. The options are checkerboard (the default, which shows transparency), dark (like game footage) and bright (like a light arena).
- **`PlaceholderCard` stories:** with a subtitle, without one, and with a very long title, to check wrapping.

## Story tests

- **Setup.** Storybook's Vitest add-on makes every story a test that renders in Playwright's Chromium, the same browser the e2e tests use. It adds two Vitest projects, `storybook-admin` and `storybook-overlay`, alongside `node` and `web`.
- **What every story checks:**
  - it renders without errors;
  - it has **no accessibility violations**. The accessibility add-on runs axe and fails the test on any violation, such as poor color contrast or a missing label. That includes the sample themes.
  - any behavior the story defines. `ServerStatus` "Online" must show the version, and "Unreachable" must show the warning.
- **Overlay isolation check.** Every overlay story also checks two things: the page has no Mantine variables (`--mantine-color-body` is empty), and the theme variables are applied. This is the check the e2e test makes on the real overlay page.
  - Each story file runs in its own browser frame, so a leak can't hide behind another story.
- **Commands:**
  - `yarn test:stories` runs both Storybooks' story tests.
  - `yarn test` and `yarn check` run only the `node` and `web` projects, exactly as now.
- **CI.** The app workflow installs Playwright's Chromium before the story tests, then runs `yarn test:stories` and `yarn test:e2e`.
- **Existing checks keep passing.** In particular, the overlay bundle test and the e2e overlay checks stay green after the `overlay.css` split.

## Docs

- **ADR-0015, "Storybook for shared components, admin and overlay kept apart".** It records:
  - the two composed Storybooks, and why not one;
  - stories next to their components;
  - story tests with accessibility checks in CI;
  - sample themes until the Theme Builder;
  - telemetry turned off.
- **`guides/local-development.md`:** `yarn storybook` and its ports. It also explains reloading if something looks stale.
- **`guides/testing.md`:**
  - a "Story tests" row in the layers table (`yarn test:stories`);
  - a short section on writing stories: canned server responses, the toolbar globals, and the overlay isolation check.
- **`AGENTS.md`:**
  - `yarn storybook` and `yarn test:stories` in the commands table;
  - the definition of done gains "new shared components get a story".
- **`.claude/rules/obs-producer-web.md` and `obs-producer-overlay.md`:** new shared admin components get a story in the admin Storybook, and new overlay components get one in the overlay Storybook.
- **`.gitignore`:** Storybook's build output and log files.
- **No CHANGELOG line.** This is developer tooling that never ships to a venue, and chores only get a line when users would notice.
