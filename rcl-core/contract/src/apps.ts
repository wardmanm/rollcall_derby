import { z } from 'zod';

// GET /api/core/apps: the rcl apps this server hosts, core first (ADR-0019). It feeds the app launcher on core's home
// page. `url` is where the app's web app is served, or null when it has none.
export const HostedAppSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  version: z.string(),
  url: z.string().nullable(),
});
export type HostedApp = z.infer<typeof HostedAppSchema>;
