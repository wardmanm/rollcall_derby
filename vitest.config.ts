import { defineConfig } from 'vitest/config';

// One test run for every workspace. Web-specific settings (DOM environment, React) arrive with #10.
export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
