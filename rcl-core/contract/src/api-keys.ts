import { z } from 'zod';

// API keys for devices and scripts (ADR-0020, docs/features/users-and-access.md). A key is shown once, when it's
// created; afterwards only its first characters (`prefix`) are.

export const API_KEY_EXPIRIES = ['never', '1d', '7d', '30d', '1y'] as const;
export const ApiKeyExpirySchema = z.enum(API_KEY_EXPIRIES);
export type ApiKeyExpiry = z.infer<typeof ApiKeyExpirySchema>;

export const ApiKeySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  permissions: z.array(z.string()),
  createdAt: z.iso.datetime(),
  createdBy: z.string(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeyRequestSchema = z.strictObject({
  name: z.string().trim().min(1, 'Give the key a name').max(64, 'Use at most 64 characters'),
  permissions: z.array(z.string()).max(100),
  expiresIn: ApiKeyExpirySchema,
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;

export const CreateApiKeyResponseSchema = z.strictObject({ apiKey: ApiKeySchema, key: z.string() });
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponseSchema>;

// A permission an API key may hold (one that isn't people-only), for the form that creates keys.
export const GrantablePermissionSchema = z.strictObject({ key: z.string(), summary: z.string() });
export type GrantablePermission = z.infer<typeof GrantablePermissionSchema>;
