import { describe, expect, it } from 'vitest';
import { parseHealth } from './health.ts';

describe('parseHealth', () => {
  it('returns a typed health response from the server JSON', () => {
    const json: unknown = { status: 'ok', name: 'OBS Producer', version: '0.1.0', uptimeSeconds: 3 };
    expect(parseHealth(json).version).toBe('0.1.0');
  });

  it('throws when the server sends something off-contract', () => {
    expect(() => parseHealth({ status: 'ok' })).toThrow(/invalid input/i);
  });
});
