import { describe, expect, it } from 'vitest';
import type { Role } from '@rollcall/core-contract';
import { createPermissions, deny, type Access, type PermissionDef, type Principal } from './access.ts';
import { CORE_PERMISSIONS } from './permissions.ts';

describe('createPermissions', () => {
  it('grants Admin every declared permission, and other roles only those that list them', () => {
    const permissions = createPermissions([
      { key: 'core:users.manage', summary: 'Manage users', roles: [] },
      { key: 'core:teams.edit', summary: 'Edit teams', roles: ['producer'] },
    ]);
    expect(permissions.granted('admin', 'core:users.manage')).toBe(true);
    expect(permissions.granted('producer', 'core:teams.edit')).toBe(true);
    expect(permissions.granted('producer', 'core:users.manage')).toBe(false);
    expect(permissions.granted('announcer', 'core:teams.edit')).toBe(false);
    expect(permissions.granted('admin', 'core:undeclared')).toBe(false);
  });

  it('refuses a permission declared twice, or one that is not app:action in lowercase', () => {
    const def: PermissionDef = { key: 'core:users.manage', summary: 'x', roles: [] };
    expect(() => createPermissions([def, def])).toThrow('Permission core:users.manage is declared twice');
    for (const key of ['users.manage', 'Core:users', 'core:', ':users'] as const) {
      // @ts-expect-error -- deliberately malformed keys; only some of them fail the type check
      expect(() => createPermissions([{ key, summary: 'x', roles: [] }]), key).toThrow('must look like app:action');
    }
  });
});

const session = (role: Role, mustChangePassword = false): Principal => ({
  kind: 'session',
  token: 't',
  user: { id: 'u', username: 'u', role, mustChangePassword },
});

describe('deny', () => {
  const permissions = createPermissions(CORE_PERMISSIONS);
  const manageUsers: Access = { permission: 'core:users.manage' };

  it('lets anyone use a public declaration', () => {
    expect(deny({ public: 'why' }, null, permissions)).toBeUndefined();
  });

  it('checks in order: signed in, then no pending password change, then the permission', () => {
    expect(deny(manageUsers, null, permissions)).toEqual({ status: 401, error: 'unauthenticated' });
    expect(deny(manageUsers, session('producer', true), permissions)).toEqual({
      status: 403,
      error: 'password_change_required',
    });
    expect(deny(manageUsers, session('producer'), permissions)).toEqual({ status: 403, error: 'forbidden' });
    expect(deny(manageUsers, session('admin'), permissions)).toBeUndefined();
  });

  it('lets a pending password change through only where the declaration allows it', () => {
    const pending = session('announcer', true);
    expect(deny({ signedIn: true }, pending, permissions)).toMatchObject({ error: 'password_change_required' });
    expect(deny({ signedIn: true, allowPendingPasswordChange: true }, pending, permissions)).toBeUndefined();
  });
});
