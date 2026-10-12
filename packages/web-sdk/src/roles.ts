import type { Role } from '@rollcall/core-contract';

/** How each role is named to people, as on the users-and-access feature page. */
export const ROLE_NAMES: Record<Role, string> = { admin: 'Admin', producer: 'Producer', announcer: 'Announcer' };
