import { z } from 'zod';

// GET /api/health. Strict so an unexpected field is caught instead of silently passed through.
export const HealthResponseSchema = z.strictObject({
  status: z.literal('ok'),
  name: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
