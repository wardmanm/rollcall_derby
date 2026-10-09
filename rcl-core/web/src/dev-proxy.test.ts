// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { frontDoorProxy } from '@rollcall/web-sdk/vite';
import config from '../vite.config.ts';

// rcl-core's Vite is the front door: the shared helper's proxy, which keeps `Host` unchanged for the server's Origin
// checks (ADR-0018) and reaches the Producer app's Vite too.
describe('dev proxy', () => {
  it('passes the server paths and /producer on', () => {
    expect(config.server?.proxy).toEqual(frontDoorProxy());
  });
});
