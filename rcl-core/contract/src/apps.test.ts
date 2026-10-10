import { describe, expect, it } from 'vitest';
import { HostedAppSchema } from './apps.ts';

const producer = { id: 'producer', title: 'Rollcall Producer', version: '0.1.0', url: '/producer/' };

describe('HostedAppSchema', () => {
  it('accepts an app with a web app, and one without', () => {
    expect(HostedAppSchema.parse(producer)).toEqual(producer);
    expect(HostedAppSchema.parse({ ...producer, url: null })).toEqual({ ...producer, url: null });
  });

  it('rejects a missing url and unknown keys', () => {
    const { url: _url, ...withoutUrl } = producer;
    expect(HostedAppSchema.safeParse(withoutUrl).success).toBe(false);
    expect(HostedAppSchema.safeParse({ ...producer, extra: true }).success).toBe(false);
  });
});
