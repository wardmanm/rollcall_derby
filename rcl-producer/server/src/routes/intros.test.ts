import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Team } from '@rollcall/core-contract';
import {
  DEFAULT_PLACEMENT,
  DEFAULT_ROSTER_OPTIONS,
  IntroSchema,
  ThemeSchema,
  type Intro,
} from '@rollcall/producer-contract';
import * as schema from '../db/schema.ts';
import { testProducer } from '../testing.ts';
import { registerIntroRoutes } from './intros.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
});

const team = (id: string, name: string): Team => ({
  id,
  name,
  leagueName: null,
  shortName: null,
  primaryColor: null,
  secondaryColor: null,
  logoUrl: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  members: [],
});
const ALL_STARS = team('t1', 'All Stars');
const WRECKERS = team('t2', 'Wreckers');

// The Producer app with ways to call its intro routes.
function intros() {
  const { api } = testProducer({ teams: [ALL_STARS, WRECKERS] });
  opened.push(api);
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    api.inject({ method, url: `/api/producer${url}`, ...(payload ? { payload } : {}) });
  const create = async (name: string) => IntroSchema.parse((await call('POST', '/intros', { name })).json());
  return { call, create };
}

describe('intros', () => {
  it('creates an intro with the defaults, no teams and the default theme', async () => {
    const { call } = intros();
    const res = await call('POST', '/intros', { name: ' Bout 1 ' });
    expect(res.statusCode).toBe(201);
    const intro = IntroSchema.parse(res.json());
    expect(intro).toMatchObject({
      name: 'Bout 1',
      placement: DEFAULT_PLACEMENT,
      options: DEFAULT_ROSTER_OPTIONS,
      teamAId: null,
      teamBId: null,
      themeId: null,
    });
    expect(IntroSchema.parse((await call('GET', `/intros/${intro.id}`)).json())).toEqual(intro);
  });

  it('lists intros by name, ignoring case', async () => {
    const { call, create } = intros();
    for (const name of ['league night', 'Bout 10', 'Bout 9']) await create(name);
    const list = IntroSchema.array().parse((await call('GET', '/intros')).json());
    expect(list.map((intro) => intro.name)).toEqual(['Bout 9', 'Bout 10', 'league night']);
  });

  it("saves teams, a theme and settings, keeping what isn't sent", async () => {
    const { call, create } = intros();
    const intro = await create('Bout 1');
    const theme = ThemeSchema.parse((await call('POST', '/themes', { name: 'Gold' })).json());
    const saved = await call('PATCH', `/intros/${intro.id}`, { teamAId: 't1', teamBId: 't2', themeId: theme.id });
    expect(saved.statusCode).toBe(200);
    const options = { atOnce: 'team', advance: { mode: 'timer', seconds: 5 }, entrance: 'fade' };
    const res = await call('PATCH', `/intros/${intro.id}`, { options, placement: { spot: 'top-left', edge: 10 } });
    expect(IntroSchema.parse(res.json())).toMatchObject({
      teamAId: 't1',
      teamBId: 't2',
      themeId: theme.id,
      options,
      placement: { spot: 'top-left', edge: 10 },
    });
  });

  it('refuses the same team twice, even across two saves', async () => {
    const { call, create } = intros();
    const intro = await create('Bout 1');
    expect((await call('PATCH', `/intros/${intro.id}`, { teamAId: 't1' })).statusCode).toBe(200);
    const res = await call('PATCH', `/intros/${intro.id}`, { teamBId: 't1' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'same_team', message: 'Pick two different teams' });
  });

  it("refuses a team or theme that doesn't exist", async () => {
    const { call, create } = intros();
    const intro = await create('Bout 1');
    const badTeam = await call('PATCH', `/intros/${intro.id}`, { teamAId: 'nope' });
    expect(badTeam.statusCode).toBe(400);
    expect(badTeam.json()).toEqual({ error: 'unknown_team', message: 'That team no longer exists' });
    const theme = await call('PATCH', `/intros/${intro.id}`, { themeId: 'nope' });
    expect(theme.statusCode).toBe(400);
    expect(theme.json()).toEqual({ error: 'unknown_theme', message: 'That theme no longer exists' });
  });

  it('refuses a name another intro has', async () => {
    const { call, create } = intros();
    await create('Bout 1');
    const other = await create('Bout 2');
    const expected = { error: 'name_taken', message: 'That name is already taken' };
    const created = await call('POST', '/intros', { name: 'Bout 1' });
    expect(created.statusCode).toBe(409);
    expect(created.json()).toEqual(expected);
    const renamed = await call('PATCH', `/intros/${other.id}`, { name: 'Bout 1' });
    expect(renamed.statusCode).toBe(409);
    expect(renamed.json()).toEqual(expected);
    expect((await call('PATCH', `/intros/${other.id}`, { name: 'Bout 2' })).statusCode).toBe(200);
  });

  it('answers 404 for an unknown intro', async () => {
    const { call } = intros();
    for (const [method, url, body] of [
      ['GET', '/intros/nope'],
      ['PATCH', '/intros/nope', { name: 'X' }],
      ['DELETE', '/intros/nope'],
    ] as const) {
      const res = await call(method, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json(), `${method} ${url}`).toEqual({ error: 'not_found' });
    }
  });

  it('falls back to the default theme when its theme is deleted', async () => {
    const { call, create } = intros();
    const intro = await create('Bout 1');
    const theme = ThemeSchema.parse((await call('POST', '/themes', { name: 'Gold' })).json());
    await call('PATCH', `/intros/${intro.id}`, { themeId: theme.id });
    expect((await call('DELETE', `/themes/${theme.id}`)).statusCode).toBe(204);
    expect(IntroSchema.parse((await call('GET', `/intros/${intro.id}`)).json()).themeId).toBeNull();
  });

  it('deletes an intro', async () => {
    const { call, create } = intros();
    const intro = await create('Bout 1');
    expect((await call('DELETE', `/intros/${intro.id}`)).statusCode).toBe(204);
    expect((await call('GET', `/intros/${intro.id}`)).statusCode).toBe(404);
  });

  it('tells the server after each save and delete', async () => {
    const { ctx, api: host } = testProducer({ teams: [ALL_STARS, WRECKERS] });
    opened.push(host);
    const onSaved = vi.fn<(before: Intro | undefined, after: Intro) => void>();
    const onDeleted = vi.fn<(id: string) => void>();
    const api = Fastify();
    opened.push(api);
    api.setValidatorCompiler(validatorCompiler);
    api.setSerializerCompiler(serializerCompiler);
    registerIntroRoutes(api, { db: ctx.db(schema), teams: ctx.teams, onSaved, onDeleted });
    const created = IntroSchema.parse(
      (await api.inject({ method: 'POST', url: '/intros', payload: { name: 'A' } })).json(),
    );
    expect(onSaved).toHaveBeenLastCalledWith(undefined, created);
    const res = await api.inject({ method: 'PATCH', url: `/intros/${created.id}`, payload: { teamAId: 't1' } });
    const changed = IntroSchema.parse(res.json());
    expect(onSaved).toHaveBeenLastCalledWith(created, changed);
    await api.inject({ method: 'PATCH', url: `/intros/${created.id}`, payload: { teamBId: 't1' } });
    expect(onSaved).toHaveBeenCalledTimes(2);
    await api.inject({ method: 'DELETE', url: `/intros/${created.id}` });
    expect(onDeleted).toHaveBeenCalledExactlyOnceWith(created.id);
  });
});
