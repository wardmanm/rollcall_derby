import { defineConfig } from 'vitest/config';

// `yarn test` runs every workspace: Node for the apps' servers and contracts, jsdom + React for the web apps and the
// web SDK.
// Story tests have their own config (vitest.stories.config.ts), so this file never loads Storybook's plugin.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['rcl-*/contract/src/**/*.test.ts', 'rcl-*/server/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: './rcl-core/web/vite.config.ts',
        test: {
          name: 'core-web',
          root: './rcl-core/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['../../packages/web-sdk/src/test/setup.ts'],
        },
      },
      {
        extends: './rcl-producer/web/vite.config.ts',
        test: {
          name: 'producer-web',
          root: './rcl-producer/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['../../packages/web-sdk/src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'web-sdk',
          root: './packages/web-sdk',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
});
