import { describe, expect, it } from 'vitest';
import { openMemoryDatabase } from '../db.ts';
import { countUsers, createUser, findUserForLogin, setPassword, toSessionUser } from './users.ts';

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
});
