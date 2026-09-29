import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './health.ts';

const valid = { status: 'ok', name: 'OBS Producer', version: '0.1.0', uptimeSeconds: 12.5 };

describe('HealthResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(HealthResponseSchema.parse(valid)).toEqual(valid);
  });

  it('rejects any status other than "ok"', () => {
    expect(HealthResponseSchema.safeParse({ ...valid, status: 'degraded' }).success).toBe(false);
  });

  it('rejects a negative uptime', () => {
    expect(HealthResponseSchema.safeParse({ ...valid, uptimeSeconds: -1 }).success).toBe(false);
  });

  it('rejects unknown keys so the contract cannot drift silently', () => {
    expect(HealthResponseSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });
});
