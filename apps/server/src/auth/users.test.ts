import { describe, expect, it } from 'vitest';
import { openMemoryDatabase } from '../db.ts';
import {
  countAdmins,
  countUsers,
  createUser,
  deleteUser,
  findUserById,
  findUserForLogin,
  listUsers,
  setPassword,
  setRole,
  toSessionUser,
} from './users.ts';
import { createSession, findSession } from './sessions.ts';

describe('users', () => {
  it('creates users and counts them', () => {
    const { db } = openMemoryDatabase();
    expect(countUsers(db)).toBe(0);
    const user = createUser(db, { username: 'admin', passwordHash: 'h', role: 'admin' });
    expect(user).toMatchObject({ username: 'admin', role: 'admin', mustChangePassword: false });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(countUsers(db)).toBe(1);
  });

  it('finds a user for login ignoring case and surrounding spaces', () => {
    const { db } = openMemoryDatabase();
    createUser(db, { username: 'admin', passwordHash: 'h', role: 'admin' });
    expect(findUserForLogin(db, ' ADMIN ')).toMatchObject({ username: 'admin', passwordHash: 'h' });
    expect(findUserForLogin(db, 'nobody')).toBeNull();
  });

  it('rejects a duplicate username', () => {
    const { db } = openMemoryDatabase();
    createUser(db, { username: 'admin', passwordHash: 'h', role: 'admin' });
    expect(() => createUser(db, { username: 'admin', passwordHash: 'h', role: 'producer' })).toThrow(/UNIQUE/);
  });

  it('sets a new password and the must-change flag', () => {
    const { db } = openMemoryDatabase();
    const user = createUser(db, { username: 'p1', passwordHash: 'old', role: 'producer', mustChangePassword: true });
    setPassword(db, user.id, 'new', { mustChangePassword: false });
    expect(findUserForLogin(db, 'p1')).toMatchObject({ passwordHash: 'new', mustChangePassword: false });
  });

  it('maps to the shared session user shape', () => {
    const { db } = openMemoryDatabase();
    const user = createUser(db, { username: 'a1', passwordHash: 'h', role: 'announcer' });
    expect(toSessionUser(user)).toEqual({ id: user.id, username: 'a1', role: 'announcer', mustChangePassword: false });
  });

  it('lists users by username and finds them by id', () => {
    const { db } = openMemoryDatabase();
    const bravo = createUser(db, { username: 'bravo', passwordHash: 'h', role: 'producer' });
    createUser(db, { username: 'alpha', passwordHash: 'h', role: 'admin' });
    expect(listUsers(db).map((u) => u.username)).toEqual(['alpha', 'bravo']);
    expect(findUserById(db, bravo.id)).toEqual(bravo);
    expect(findUserById(db, 'missing')).toBeNull();
  });

  it('changes a role, and counts Admins with or without one of them', () => {
    const { db } = openMemoryDatabase();
    const alpha = createUser(db, { username: 'alpha', passwordHash: 'h', role: 'admin' });
    const bravo = createUser(db, { username: 'bravo', passwordHash: 'h', role: 'producer' });
    expect(countAdmins(db)).toBe(1);
    setRole(db, bravo.id, 'admin');
    expect(findUserById(db, bravo.id)?.role).toBe('admin');
    expect(countAdmins(db)).toBe(2);
    expect(countAdmins(db, { excluding: alpha.id })).toBe(1);
  });

  it('deletes a user along with their sessions', () => {
    const { db } = openMemoryDatabase();
    const alpha = createUser(db, { username: 'alpha', passwordHash: 'h', role: 'admin' });
    const { token } = createSession(db, alpha.id);
    deleteUser(db, alpha.id);
    expect(findUserById(db, alpha.id)).toBeNull();
    expect(findSession(db, token)).toBeNull();
  });
});
