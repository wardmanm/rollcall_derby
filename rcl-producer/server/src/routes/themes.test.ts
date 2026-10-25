import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TOKENS, ThemeSchema, type CreateThemeRequest, type ThemeTokens } from '@rollcall/producer-contract';
import { testProducer } from '../testing.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
});

const GOLD: ThemeTokens = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: '#ffd700' } };

// The Producer app with ways to call its theme routes.
function themes() {
  const { api } = testProducer();
  opened.push(api);
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    api.inject({ method, url: `/api/producer${url}`, ...(payload ? { payload } : {}) });
  const create = async (body: CreateThemeRequest) => ThemeSchema.parse((await call('POST', '/themes', body)).json());
  const list = async () => ThemeSchema.array().parse((await call('GET', '/themes')).json());
  const defaultName = async () => (await list()).filter((theme) => theme.isDefault).map((theme) => theme.name);
  return { call, create, list, defaultName };
}

describe('creating and reading themes', () => {
  it('starts a theme from the built-in look, with its name trimmed, not the default', async () => {
    const { call } = themes();
    const res = await call('POST', '/themes', { name: '  Derby Night ' });
    expect(res.statusCode).toBe(201);
    const theme = ThemeSchema.parse(res.json());
    expect(theme).toMatchObject({ name: 'Derby Night', tokens: DEFAULT_TOKENS, isDefault: false });
    expect(theme.updatedAt).toBe(theme.createdAt);
    expect(ThemeSchema.parse((await call('GET', `/themes/${theme.id}`)).json())).toEqual(theme);
  });

  it('keeps the tokens a new theme is sent', async () => {
    const { create } = themes();
    expect((await create({ name: 'Gold', tokens: GOLD })).tokens).toEqual(GOLD);
  });

  it('lists every theme by name, ignoring case', async () => {
    const { create, list } = themes();
    for (const name of ['league night', 'Bout 10', 'Bout 9', 'Default look']) await create({ name });
    expect((await list()).map((theme) => theme.name)).toEqual(['Bout 9', 'Bout 10', 'Default look', 'league night']);
  });

  it('answers 404 for a theme that does not exist', async () => {
    const { call } = themes();
    for (const [method, url, body] of [
      ['GET', '/themes/nope'],
      ['PATCH', '/themes/nope', { name: 'X' }],
      ['POST', '/themes/nope/duplicate'],
      ['DELETE', '/themes/nope'],
      ['PUT', '/default-theme', { themeId: 'nope' }],
    ] as const) {
      const res = await call(method, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json(), `${method} ${url}`).toEqual({ error: 'not_found' });
    }
  });

  it('refuses a name another theme has, exactly as trimmed', async () => {
    const { call, create } = themes();
    await create({ name: 'Derby Night' });
    const taken = await call('POST', '/themes', { name: ' Derby Night ' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'name_taken', message: 'That name is already taken' });
    expect((await call('POST', '/themes', { name: 'derby night' })).statusCode).toBe(201);
  });

  it('refuses tokens the contract refuses, saving nothing', async () => {
    const { call, list } = themes();
    const tokens = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: 'gold' } };
    const res = await call('POST', '/themes', { name: 'Gold', tokens });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ message: string }>().message).toContain('Use a color like #1a2b3c');
    expect(await list()).toEqual([]);
  });
});

describe('changing a theme', () => {
  it('renames it and replaces its tokens whole, leaving what is not sent', async () => {
    const { call, create } = themes();
    const theme = await create({ name: 'Derby Night' });
    const renamed = ThemeSchema.parse((await call('PATCH', `/themes/${theme.id}`, { name: 'Finals' })).json());
    expect(renamed).toMatchObject({ name: 'Finals', tokens: DEFAULT_TOKENS, createdAt: theme.createdAt });
    const recolored = ThemeSchema.parse((await call('PATCH', `/themes/${theme.id}`, { tokens: GOLD })).json());
    expect(recolored).toMatchObject({ name: 'Finals', tokens: GOLD });
    expect(recolored.updatedAt >= theme.updatedAt).toBe(true);
  });

  it('keeps its own name, but refuses another theme’s', async () => {
    const { call, create } = themes();
    const theme = await create({ name: 'Derby Night' });
    await create({ name: 'Finals' });
    expect((await call('PATCH', `/themes/${theme.id}`, { name: 'Derby Night' })).statusCode).toBe(200);
    expect((await call('PATCH', `/themes/${theme.id}`, { name: 'Finals' })).json()).toEqual({
      error: 'name_taken',
      message: 'That name is already taken',
    });
  });
});

describe('duplicating a theme', () => {
  it('copies it as "<name> copy", then "copy 2", never as the default', async () => {
    const { call, create } = themes();
    const theme = await create({ name: 'Derby Night', tokens: GOLD });
    await call('PUT', '/default-theme', { themeId: theme.id });
    const first = await call('POST', `/themes/${theme.id}/duplicate`);
    expect(first.statusCode).toBe(201);
    expect(ThemeSchema.parse(first.json())).toMatchObject({ name: 'Derby Night copy', tokens: GOLD, isDefault: false });
    const second = ThemeSchema.parse((await call('POST', `/themes/${theme.id}/duplicate`)).json());
    expect(second.name).toBe('Derby Night copy 2');
  });

  it('shortens a long name so the copy’s name still fits in 64 characters', async () => {
    const { call, create } = themes();
    const theme = await create({ name: 'x'.repeat(64) });
    const first = ThemeSchema.parse((await call('POST', `/themes/${theme.id}/duplicate`)).json());
    const second = ThemeSchema.parse((await call('POST', `/themes/${theme.id}/duplicate`)).json());
    expect(first.name).toBe(`${'x'.repeat(59)} copy`);
    expect(second.name).toBe(`${'x'.repeat(57)} copy 2`);
  });
});

describe('deleting a theme', () => {
  it('deletes it, and deleting the default leaves no default', async () => {
    const { call, create, list, defaultName } = themes();
    const theme = await create({ name: 'Derby Night' });
    await call('PUT', '/default-theme', { themeId: theme.id });
    expect((await call('DELETE', `/themes/${theme.id}`)).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    expect(await defaultName()).toEqual([]);
  });
});

describe('the default theme', () => {
  it('is at most one theme: choosing another switches the old one off, and null clears it', async () => {
    const { call, create, defaultName } = themes();
    const night = await create({ name: 'Derby Night' });
    const finals = await create({ name: 'Finals' });
    const chosen = await call('PUT', '/default-theme', { themeId: night.id });
    expect([chosen.statusCode, chosen.json()]).toEqual([200, { themeId: night.id }]);
    expect(await defaultName()).toEqual(['Derby Night']);
    await call('PUT', '/default-theme', { themeId: finals.id });
    expect(await defaultName()).toEqual(['Finals']);
    expect((await call('PUT', '/default-theme', { themeId: null })).json()).toEqual({ themeId: null });
    expect(await defaultName()).toEqual([]);
  });

  it('stays as it was when the theme asked for does not exist', async () => {
    const { call, create, defaultName } = themes();
    const night = await create({ name: 'Derby Night' });
    await call('PUT', '/default-theme', { themeId: night.id });
    expect((await call('PUT', '/default-theme', { themeId: 'nope' })).statusCode).toBe(404);
    expect(await defaultName()).toEqual(['Derby Night']);
  });
});
