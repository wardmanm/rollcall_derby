import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the real production setup: the web build served by the Rollcall server.
const port = 5590; // separate from the dev server's 5580
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
// A fresh data folder for each run, so the accounts flow starts on a fresh install. It's kept in the environment
// because Playwright loads this file again in each worker, and they must all use the same folder.
process.env.ROLLCALL_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'rollcall-e2e-'));

export default defineConfig({
  testDir: './tests',
  globalTeardown: './global-teardown.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'yarn build && yarn start',
    cwd: projectRoot,
    url: `http://127.0.0.1:${port}/api/core/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ROLLCALL_HOST: '127.0.0.1',
      ROLLCALL_PORT: String(port),
      ROLLCALL_DATA_DIR: process.env.ROLLCALL_E2E_DATA_DIR,
    },
  },
});
