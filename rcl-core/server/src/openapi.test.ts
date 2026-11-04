import { describe, expect, it } from 'vitest';
import type { AppModule } from '@rollcall/app-sdk';
import { INSTALLED_APPS } from './installed-apps.ts';
import { CORE_VERSION, testApp } from './testing.ts';

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
    expect(at(doc, 'info', 'title')).toBe('Rollcall API');
    expect(at(doc, 'info', 'version')).toBe('1.0.0');
    expect(at(doc, 'components', 'securitySchemes', 'session')).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'rollcall_session',
    });
    const json = 'application/json';
    expect(at(doc, 'paths', '/api/core/users', 'post', 'requestBody', 'content', json, 'schema', 'required')).toEqual(
      expect.arrayContaining(['username', 'role']),
    );
    const me = at(
      doc,
      'paths',
      '/api/core/auth/me',
      'get',
      'responses',
      '200',
      'content',
      json,
      'schema',
      'properties',
    );
    expect(Object.keys(me ?? {})).toEqual(expect.arrayContaining(['id', 'username', 'role', 'mustChangePassword']));
    expect(at(doc, 'paths', '/api/core/users/{id}', 'delete', 'tags')).toEqual(['core/users']);
  });

  it('says who may call each operation, that public ones need no session, and which take only a session', async () => {
    const { app } = testApp({ apiDocs: true });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    expect(at(doc, 'security')).toEqual([{ session: [] }, { bearer: [] }]);
    expect(at(doc, 'components', 'securitySchemes', 'bearer')).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(at(doc, 'paths', '/api/core/health', 'get', 'security')).toEqual([]);
    expect(at(doc, 'paths', '/api/core/health', 'get', 'description')).toBe(
      '**Public:** Shows whether the server is up, before anyone signs in.',
    );
    expect(at(doc, 'paths', '/api/core/auth/me', 'get', 'description')).toBe(
      '**Any signed-in user**, even with a password change pending. Not API keys.',
    );
    expect(at(doc, 'paths', '/api/core/users', 'get', 'description')).toBe(
      '**Needs `core:users.manage`:** Admin. Not API keys: people only.',
    );
    // Operations that refuse API keys offer only the session, for any signed-in user and for people-only permissions.
    expect(at(doc, 'paths', '/api/core/auth/me', 'get', 'security')).toEqual([{ session: [] }]);
    expect(at(doc, 'paths', '/api/core/users', 'get', 'security')).toEqual([{ session: [] }]);
  });

  it("documents an upload's body as a file of each image type it accepts, so Try it out offers a file picker", async () => {
    const { app } = testApp({ apiDocs: true });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    for (const path of ['/api/core/teams/{id}/logo', '/api/core/teams/{id}/members/{memberId}/photo']) {
      const content = at(doc, 'paths', path, 'put', 'requestBody', 'content');
      expect(Object.keys(content ?? {}), path).toEqual(['image/png', 'image/jpeg', 'image/webp']);
      expect(at(content, 'image/png', 'schema'), path).toEqual({ type: 'string', format: 'binary' });
    }
    // JSON operations keep their own schemas.
    expect(
      at(doc, 'paths', '/api/core/teams', 'post', 'requestBody', 'content', 'application/json', 'schema', 'required'),
    ).toEqual(['name']);
  });

  it('says when an API key that holds the permission may call an operation too', async () => {
    const demo: AppModule = {
      id: 'demo',
      title: 'Demo',
      version: '1.0.0',
      requiresCore: '*',
      permissions: [{ key: 'demo:things.read', summary: 'Read things', roles: ['producer'] }],
      register(api) {
        api.get('/things', { config: { access: { permission: 'demo:things.read' } } }, async () => ({ things: [] }));
      },
    };
    const { app } = testApp({ apiDocs: true, apps: [demo] });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    expect(at(doc, 'paths', '/api/demo/things', 'get', 'description')).toBe(
      '**Needs `demo:things.read`:** Admin, Producer. Also API keys that hold it.',
    );
    // It keeps the document's security: a session or an API key.
    expect(at(doc, 'paths', '/api/demo/things', 'get', 'security')).toBeUndefined();
  });

  it('describes every tag the operations of core and the installed apps use', async () => {
    // Hosted at this core's version, so every installed app is too.
    const { app } = testApp({ apiDocs: true, version: CORE_VERSION, apps: INSTALLED_APPS });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    const operations = Object.values(at(doc, 'paths') as Record<string, Record<string, unknown>>).flatMap(
      Object.values,
    );
    const used = new Set(operations.flatMap((operation) => (at(operation, 'tags') as string[] | undefined) ?? []));
    const described = (at(doc, 'tags') as { name: string; description?: string }[]).filter((tag) => tag.description);
    expect(used).toContain('producer/themes');
    expect([...used].filter((tag) => !described.some((d) => d.name === tag))).toEqual([]);
  });

  it("describes a hosted app's own tags, after core's", async () => {
    const demo: AppModule = {
      id: 'demo',
      title: 'Demo',
      version: '1.0.0',
      requiresCore: '*',
      permissions: [],
      tags: { 'demo/things': 'Things, for trying out an app' },
    };
    const { app } = testApp({ apiDocs: true, apps: [demo] });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    const tags = at(doc, 'tags') as { name: string }[];
    expect(tags[0]).toEqual({ name: 'core/health', description: 'Is the server up?' });
    expect(tags.at(-1)).toEqual({ name: 'demo/things', description: 'Things, for trying out an app' });
  });

  it("keeps an operation's own description, after who may call it", async () => {
    const demo: AppModule = {
      id: 'demo',
      title: 'Demo',
      version: '1.0.0',
      requiresCore: '*',
      permissions: [],
      register(api) {
        api.get(
          '/things',
          { config: { access: { signedIn: true } }, schema: { description: 'Every thing, newest first.' } },
          async () => ({ things: [] }),
        );
      },
    };
    const { app } = testApp({ apiDocs: true, apps: [demo] });
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json<unknown>();
    expect(at(doc, 'paths', '/api/demo/things', 'get', 'description')).toBe(
      '**Any signed-in user.** Not API keys.\n\nEvery thing, newest first.',
    );
  });
});
