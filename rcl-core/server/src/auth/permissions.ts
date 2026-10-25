import type { PermissionDef } from './access.ts';

// rcl-core's own permissions (ADR-0018). The users-and-access feature page lists the same table, and a test keeps
// the two in step.
export const CORE_APP_ID = 'core';

export const CORE_PERMISSIONS: readonly PermissionDef[] = [
  {
    key: 'core:users.manage',
    summary: 'Create users, change their roles, reset their passwords, sign them out and delete them',
    roles: [],
    peopleOnly: true,
  },
  {
    key: 'core:api-keys.manage',
    summary: 'Create, list and revoke API keys',
    roles: [],
    peopleOnly: true,
  },
  {
    key: 'core:teams.read',
    summary: 'View teams and their members',
    roles: ['producer', 'announcer'],
  },
  {
    key: 'core:teams.manage',
    summary: 'Create, edit and delete teams, members, logos and photos',
    roles: ['producer'],
  },
  {
    key: 'core:fonts.read',
    summary: 'List the fonts in the font library',
    roles: ['producer', 'announcer'],
  },
  {
    key: 'core:fonts.manage',
    summary: 'Upload and remove fonts',
    roles: [],
  },
];
