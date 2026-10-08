// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ProxyOptions } from 'vite';
import config from '../vite.config.ts';

// The server's CSRF check (origin vs. host) and the socket Origin check both compare `Origin` with `Host`, so the
// dev proxy must pass `Host` through unchanged (ADR-0008): the string shorthand turns on `changeOrigin`, which
// rewrites it.
describe('dev proxy', () => {
  it.each(['/api', '/docs', '/socket.io'])('%s is an object entry with changeOrigin not set to true', (path) => {
    const entry = config.server?.proxy?.[path];
    expect(typeof entry).toBe('object');
    expect((entry as ProxyOptions | undefined)?.changeOrigin).not.toBe(true);
  });
});
