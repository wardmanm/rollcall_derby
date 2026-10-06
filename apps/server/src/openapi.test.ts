import { describe, expect, it } from 'vitest';
import { testApp } from './testing.ts';

// Reads a nested value from parsed JSON without a type for every level.
const at = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], value);

describe('API explorer', () => {
  it('is off unless asked for', async () => {
    const { app } = testApp();
    expect((await app.inject({ method: 'GET', url: '/docs' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(404);
  });

  it('serves Swagger UI at /docs with no online validator and nothing loaded from outside', async () => {
    const { app } = testApp({ apiDocs: true });
    const page = await app.inject({ method: 'GET', url: '/docs' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    const initializer = await app.inject({ method: 'GET', url: '/docs/static/swagger-initializer.js' });
    expect(initializer.statusCode).toBe(200);
    expect(initializer.body).toContain('validatorUrl: null');
    // The page shell and its initializer point at no other host, and the online validator is off. Swagger UI's own
    // bundle contains documentation links as plain strings; they load nothing (checked by reading it, not by this test).
    expect(page.body).not.toMatch(/(src|href)=["']https?:/);
    expect(initializer.body).not.toMatch(/:\s*["']https?:/);
  });

  it('describes the API from the shared schemas', async () => {
    const { app } = testApp({ apiDocs: true });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    expect(at(doc, 'openapi')).toMatch(/^3\./);
    expect(at(doc, 'info', 'title')).toBe('OBS Producer API');
    expect(at(doc, 'info', 'version')).toBe('1.0.0');
    expect(at(doc, 'components', 'securitySchemes', 'session')).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'obs_producer_session',
    });
    const json = 'application/json';
    expect(at(doc, 'paths', '/api/users', 'post', 'requestBody', 'content', json, 'schema', 'required')).toEqual(
      expect.arrayContaining(['username', 'role']),
    );
    const me = at(doc, 'paths', '/api/auth/me', 'get', 'responses', '200', 'content', json, 'schema', 'properties');
    expect(Object.keys(me ?? {})).toEqual(expect.arrayContaining(['id', 'username', 'role', 'mustChangePassword']));
    expect(at(doc, 'paths', '/api/users/{id}', 'delete', 'tags')).toEqual(['users']);
  });
});
