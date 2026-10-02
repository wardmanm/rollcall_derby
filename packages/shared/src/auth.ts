import { z } from 'zod';

// Accounts and sessions (docs/features/users-and-access.md, ADR-0008). Server and web share these shapes.

export const ROLES = ['admin', 'producer', 'announcer'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

// Stored lowercase, so login ignores case and surrounding spaces.
export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Use 3–32 letters, digits, dots, dashes or underscores');

// The upper bound stops oversized input from tying up password hashing.
export const PasswordSchema = z.string().min(10, 'Use at least 10 characters').max(256, 'Use at most 256 characters');

const passwordIsNotUsername = (data: { username: string; password: string }) =>
  data.password.toLowerCase() !== data.username.toLowerCase();

export const SetupStatusSchema = z.strictObject({ needsSetup: z.boolean(), canSetupHere: z.boolean() });
export type SetupStatus = z.infer<typeof SetupStatusSchema>;

export const SetupRequestSchema = z
  .strictObject({ username: UsernameSchema, password: PasswordSchema })
  .refine(passwordIsNotUsername, { message: 'The password must not be the username', path: ['password'] });
export type SetupRequest = z.infer<typeof SetupRequestSchema>;

// Deliberately loose: a malformed login must fail exactly like wrong credentials.
export const LoginRequestSchema = z.strictObject({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const SessionUserSchema = z.strictObject({
  id: z.string(),
  username: z.string(),
  role: RoleSchema,
  mustChangePassword: z.boolean(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const ChangePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(256),
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

// User management (Admin only). A temporary password appears in exactly one response and is never stored.
export const UserSchema = z.strictObject({
  id: z.string(),
  username: z.string(),
  role: RoleSchema,
  mustChangePassword: z.boolean(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserRequestSchema = z.strictObject({ username: UsernameSchema, role: RoleSchema });
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const CreateUserResponseSchema = z.strictObject({ user: UserSchema, temporaryPassword: z.string() });
export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;

export const UpdateUserRequestSchema = z.strictObject({ role: RoleSchema });
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const PasswordResetResponseSchema = z.strictObject({ temporaryPassword: z.string() });
export type PasswordResetResponse = z.infer<typeof PasswordResetResponseSchema>;

// Error bodies: a stable code for the web app to act on, plus an optional human-readable message.
export const ApiErrorSchema = z.object({ error: z.string(), message: z.string().optional() });
export type ApiError = z.infer<typeof ApiErrorSchema>;
