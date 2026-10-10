import { HealthResponseSchema, type HealthResponse } from '@rollcall/core-contract';

// Validates GET /api/core/health against the shared contract, used by the RTK Query API slice.
export function parseHealth(json: unknown): HealthResponse {
  return HealthResponseSchema.parse(json);
}
