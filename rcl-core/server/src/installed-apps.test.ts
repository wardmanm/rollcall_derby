import { describe, expect, it } from 'vitest';
import { satisfies } from 'semver';
import { INSTALLED_APPS } from './installed-apps.ts';
import { CORE_VERSION, tablesCreatedBy } from './testing.ts';

// Bumping rcl-core's version, or an app's requiresCore, is a deliberate decision for both (split spec): before 1.0,
// ^0.1.0 excludes 0.2.0, so this fails until each app says it works with the new core.
describe('the installed apps', () => {
  it('all work with this rcl-core version', () => {
    for (const app of INSTALLED_APPS) {
      expect(satisfies(CORE_VERSION, app.requiresCore), `${app.id} needs rcl-core ${app.requiresCore}`).toBe(true);
    }
  });

  it('only create tables named after themselves (<id>_…)', () => {
    for (const app of INSTALLED_APPS) {
      expect(
        tablesCreatedBy(app).filter((table) => !table.startsWith(`${app.id}_`)),
        app.id,
      ).toEqual([]);
    }
  });
});
