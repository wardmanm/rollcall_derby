import { rmSync } from 'node:fs';

// Removes this run's data folder (see playwright.config.ts) once every test has finished.
export default function globalTeardown(): void {
  const dataDir = process.env.ROLLCALL_E2E_DATA_DIR;
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
}
