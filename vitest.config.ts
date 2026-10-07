import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// `yarn test` runs every workspace: Node for server and shared, jsdom + React for the web app.
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

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: './apps/web/vite.config.ts',
        test: {
          name: 'web',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
        },
      },
      storybookProject('admin'),
    ],
  },
});
