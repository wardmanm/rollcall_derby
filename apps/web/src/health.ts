import { HealthResponseSchema, type HealthResponse } from '@obs-producer/shared';

// Validates GET /api/health against the shared contract. #8 wires this into the RTK Query API slice.
export function parseHealth(json: unknown): HealthResponse {
  return HealthResponseSchema.parse(json);
}
