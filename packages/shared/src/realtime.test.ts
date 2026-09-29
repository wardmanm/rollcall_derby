import { describe, expect, it } from 'vitest';
import { ServerHelloSchema, SERVER_HELLO_EVENT } from './realtime.ts';

describe('ServerHelloSchema', () => {
  it('accepts the hello the server sends on connect', () => {
    expect(ServerHelloSchema.parse({ name: 'OBS Producer', version: '0.1.0' })).toEqual({
      name: 'OBS Producer',
      version: '0.1.0',
    });
  });

  it('rejects a hello without a version', () => {
    expect(ServerHelloSchema.safeParse({ name: 'OBS Producer' }).success).toBe(false);
  });

  it('names the event', () => {
    expect(SERVER_HELLO_EVENT).toBe('server:hello');
  });
});
