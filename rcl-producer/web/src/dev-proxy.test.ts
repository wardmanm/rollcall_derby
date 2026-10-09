// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { serverProxy } from '@rollcall/web-sdk/vite';
import config from '../vite.config.ts';

// The dev proxy is the shared helper's, which keeps `Host` unchanged for the server's Origin checks (ADR-0018).
describe('dev proxy', () => {
  it('passes the API, the API explorer and Socket.IO to the server', () => {
    expect(config.server?.proxy).toEqual(serverProxy());
  });
});
