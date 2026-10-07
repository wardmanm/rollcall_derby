import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Story tests (ADR-0015): every story of one Storybook renders in Playwright's Chromium, with accessibility
// checks. Kept out of vitest.config.ts so `yarn test`/`yarn check` never load Storybook's plugin.
// `yarn test:stories` runs this file. Task 2 adds `storybookProject('overlay')` to the projects list.
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

export default defineConfig({
  test: {
    projects: [storybookProject('admin')],
  },
});
