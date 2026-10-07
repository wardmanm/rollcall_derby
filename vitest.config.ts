import { defineConfig } from 'vitest/config';

// `yarn test` runs every workspace: Node for server and shared, jsdom + React for the web app.
// Story tests have their own config (vitest.stories.config.ts), so this file never loads Storybook's plugin.
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
    ],
  },
});
