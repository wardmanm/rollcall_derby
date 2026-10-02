import { describe, expect, it } from 'vitest';
import {
  ChangePasswordRequestSchema,
  CreateUserRequestSchema,
  CreateUserResponseSchema,
  LoginRequestSchema,
  PasswordResetResponseSchema,
  PasswordSchema,
  ROLES,
  SessionUserSchema,
  SetupRequestSchema,
  UpdateUserRequestSchema,
  UsernameSchema,
  UserSchema,
} from './auth.ts';

describe('roles', () => {
  it('are admin, producer and announcer', () => {
    expect(ROLES).toEqual(['admin', 'producer', 'announcer']);
  });
});

describe('UsernameSchema', () => {
  it('trims and lowercases', () => {
    expect(UsernameSchema.parse('  Mike.W ')).toBe('mike.w');
  });

  it('accepts 3–32 letters, digits, dots, dashes and underscores', () => {
    for (const ok of ['abc', 'a_b-c.d', 'x'.repeat(32)]) expect(UsernameSchema.safeParse(ok).success, ok).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['ab', 'x'.repeat(33), 'has space', 'émile', 'a/b', '']) {
      expect(UsernameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('PasswordSchema', () => {
  it('needs 10 to 256 characters', () => {
    expect(PasswordSchema.safeParse('123456789').success).toBe(false);
    expect(PasswordSchema.safeParse('1234567890').success).toBe(true);
    expect(PasswordSchema.safeParse('x'.repeat(256)).success).toBe(true);
    expect(PasswordSchema.safeParse('x'.repeat(257)).success).toBe(false);
  });
});

describe('SetupRequestSchema', () => {
  it('normalizes the username', () => {
    expect(SetupRequestSchema.parse({ username: ' Admin ', password: 'correct horse' })).toEqual({
      username: 'admin',
      password: 'correct horse',
    });
  });

  it('rejects a password equal to the username, ignoring case', () => {
    expect(SetupRequestSchema.safeParse({ username: 'producer01', password: 'PRODUCER01' }).success).toBe(false);
  });
});

describe('LoginRequestSchema', () => {
  it('accepts any non-empty username and password so a bad shape looks like bad credentials', () => {
    expect(LoginRequestSchema.safeParse({ username: 'X', password: 'y' }).success).toBe(true);
    expect(LoginRequestSchema.safeParse({ username: '', password: 'y' }).success).toBe(false);
  });

  it('caps the password length so oversized input is never hashed', () => {
    expect(LoginRequestSchema.safeParse({ username: 'admin', password: 'x'.repeat(257) }).success).toBe(false);
  });
});

describe('ChangePasswordRequestSchema', () => {
  it('applies the password rules to the new password', () => {
    expect(ChangePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword: 'short' }).success).toBe(false);
    expect(ChangePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword: 'long enough!' }).success).toBe(
      true,
    );
  });
});

describe('SessionUserSchema', () => {
  it('rejects unknown roles and extra keys', () => {
    const user = { id: 'u1', username: 'admin', role: 'admin', mustChangePassword: false };
    expect(SessionUserSchema.parse(user)).toEqual(user);
    expect(SessionUserSchema.safeParse({ ...user, role: 'root' }).success).toBe(false);
    expect(SessionUserSchema.safeParse({ ...user, extra: 1 }).success).toBe(false);
  });
});

describe('user management schemas', () => {
  const user = {
    id: '7d0c8f8e-2f4b-4c1e-9a7a-0b6f1d2e3c4d',
    username: 'producer1',
    role: 'producer',
    mustChangePassword: true,
    createdAt: '2026-10-02T12:00:00.000Z',
  };

  it('describes a user without any password data', () => {
    expect(UserSchema.parse(user)).toEqual(user);
    expect(UserSchema.safeParse({ ...user, passwordHash: 'x' }).success).toBe(false);
    expect(UserSchema.safeParse({ ...user, createdAt: 'yesterday' }).success).toBe(false);
  });

  it('creates a user from a username and role, normalizing the username', () => {
    expect(CreateUserRequestSchema.parse({ username: ' Producer1 ', role: 'producer' })).toEqual({
      username: 'producer1',
      role: 'producer',
    });
    expect(CreateUserRequestSchema.safeParse({ username: 'ab', role: 'producer' }).success).toBe(false);
    expect(CreateUserRequestSchema.safeParse({ username: 'producer1', role: 'owner' }).success).toBe(false);
    expect(CreateUserRequestSchema.safeParse({ username: 'producer1', role: 'producer', password: 'x' }).success).toBe(
      false,
    );
  });

  it('returns the temporary password alongside the new user', () => {
    const response = { user, temporaryPassword: 'ABCDEFGHJKLMNPQRSTUV' };
    expect(CreateUserResponseSchema.parse(response)).toEqual(response);
    expect(CreateUserResponseSchema.safeParse({ user }).success).toBe(false);
  });

  it('changes only the role', () => {
    expect(UpdateUserRequestSchema.parse({ role: 'announcer' })).toEqual({ role: 'announcer' });
    expect(UpdateUserRequestSchema.safeParse({ role: 'announcer', username: 'x' }).success).toBe(false);
    expect(UpdateUserRequestSchema.safeParse({}).success).toBe(false);
  });

  it('returns a reset password', () => {
    expect(PasswordResetResponseSchema.parse({ temporaryPassword: 'ABCDEFGHJKLMNPQRSTUV' })).toEqual({
      temporaryPassword: 'ABCDEFGHJKLMNPQRSTUV',
    });
  });
});
