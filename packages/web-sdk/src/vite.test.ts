// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { serverProxy } from './vite.ts';

describe('serverProxy', () => {
  it('passes the API, the API explorer and Socket.IO to the server, keeping Host as it is', () => {
    const proxy = serverProxy('http://localhost:5580');
    expect(Object.keys(proxy)).toEqual(['/api', '/docs', '/socket.io']);
    for (const [path, entry] of Object.entries(proxy)) {
      expect(entry.target, path).toBe('http://localhost:5580');
      expect(entry.changeOrigin, path).not.toBe(true);
    }
    expect(proxy['/socket.io']?.ws).toBe(true);
  });
});
