import type { PermissionDef } from './access.ts';

// rcl-core's own permissions (ADR-0018). The users-and-access feature page lists the same table, and a test keeps
// the two in step.
export const CORE_APP_ID = 'core';

export const CORE_PERMISSIONS: readonly PermissionDef[] = [
  {
    key: 'core:users.manage',
    summary: 'Create users, change their roles, reset their passwords, sign them out and delete them',
    roles: [],
  },
];
