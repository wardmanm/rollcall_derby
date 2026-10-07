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
- **Every story is a test.** Storybook's Vitest add-on renders each story in Playwright's Chromium, and the test fails on a render error, a failed `play` check or an accessibility violation. `yarn test:stories` runs them, and CI runs it on every change. `yarn test` and `yarn check` don't start a browser. They live in their own Vitest config, `vitest.stories.config.ts`, so `yarn test` never loads Storybook.
- **Overlay stories prove they're isolated.** Each one checks for no Mantine variables or stylesheet on the page, and that theme variables reach the story.
- **Sample themes until the Theme Builder.** Light and high-contrast sample themes, plus backdrops (checkerboard, dark, bright), are switched from the toolbar. The default theme's values live only in `theme-defaults.css`, which the real overlay page also uses.
- **Offline and private.** Telemetry, crash reports and update checks are off.

## Consequences

- A new shared component needs a story, and the story must pass the accessibility check.
- Components that read server data get canned responses in their stories, the same way unit tests stub `fetch`.
- In development, the admin window shows the overlay section only while the overlay Storybook is running. `yarn storybook` starts both.
- When the Theme Builder lands, real themes replace the sample themes.
