import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROLES } from '@rollcall/core-contract';
import { INSTALLED_APPS } from '../installed-apps.ts';
import { createPermissions } from './access.ts';
import { CORE_APP_ID, CORE_PERMISSIONS } from './permissions.ts';

const FEATURE_PAGE = new URL('../../../../docs/features/users-and-access.md', import.meta.url);

// The rows of the feature page's Permissions table: permission, what it allows, then ✅ or — for each role.
function documentedPermissions(): string[][] {
  const page = readFileSync(FEATURE_PAGE, 'utf8');
  const section = page.split(/^## /m).find((s) => s.startsWith('Permissions\n')) ?? '';
  return section
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

describe('core permissions', () => {
  it('are well formed and all belong to core', () => {
    const permissions = createPermissions(CORE_PERMISSIONS);
    for (const { key } of permissions.all) expect(key.startsWith(`${CORE_APP_ID}:`), key).toBe(true);
  });
});

describe("every installed app's permissions, core's first", () => {
  it('match the table on the users-and-access feature page', () => {
    const defs = [...CORE_PERMISSIONS, ...INSTALLED_APPS.flatMap((app) => app.permissions)];
    const permissions = createPermissions(defs);
    const expected = defs.map(({ key, summary }) =>
      [`\`${key}\``, summary].concat(ROLES.map((role) => (permissions.granted(role, key) ? '✅' : '—'))),
    );
    expect(documentedPermissions()).toEqual(expected);
  });
});
