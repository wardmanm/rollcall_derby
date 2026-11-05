import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Team } from '@rollcall/core-contract';
import {
  DEFAULT_PLACEMENT,
  DEFAULT_ROSTER_OPTIONS,
  INTRO_RUN_EVENT,
  INTRO_STATE_EVENT,
  IntroOverlayStateSchema,
  IntroSchema,
  ThemeSchema,
} from '@rollcall/producer-contract';
import { testProducer, testRealtime, type Sent } from '../testing.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
  vi.useRealTimers();
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

// The Producer app with ways to call its intro routes, and its namespaces open on a stand-in for Socket.IO, to see
// what each intro's rooms are sent.
function intros() {
  const { api, ctx, client } = testProducer({ teams: [ALL_STARS, WRECKERS] });
  opened.push(api);
  const realtime = testRealtime(ctx);
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    api.inject({ method, url: `/api/producer${url}`, ...(payload ? { payload } : {}) });
  const create = async (name: string) => IntroSchema.parse((await call('POST', '/intros', { name })).json());
  return {
    client,
    call,
    create,
    controlRoom: (id: string) => realtime.sentTo('/producer/intros', `intro:${id}`),
    overlayRoom: (id: string) => realtime.sentTo('/producer/overlay', `intro:${id}`),
  };
}

const sentOf = (event: string, sent: Sent[]) => sent.filter(([name]) => name === event).map(([, payload]) => payload);

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

  it("tells the intro's rooms after each save and delete, and not after a refused save", async () => {
    const { call, create, controlRoom, overlayRoom } = intros();
    const intro = await create('A');
    const [control, overlay] = [controlRoom(intro.id), overlayRoom(intro.id)];
    expect(sentOf(INTRO_RUN_EVENT, control)).toHaveLength(1);
    expect((await call('PATCH', `/intros/${intro.id}`, { teamAId: 't1' })).statusCode).toBe(200);
    expect(sentOf(INTRO_RUN_EVENT, control)).toHaveLength(2);
    expect((await call('PATCH', `/intros/${intro.id}`, { teamBId: 't1' })).statusCode).toBe(400);
    expect(sentOf(INTRO_RUN_EVENT, control)).toHaveLength(2);
    expect((await call('DELETE', `/intros/${intro.id}`)).statusCode).toBe(204);
    expect(IntroOverlayStateSchema.parse(sentOf(INTRO_STATE_EVENT, overlay).at(-1)).onAir).toBeNull();
  });

  it('answers a save that changes nothing with the intro as it is, writing and telling nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T19:00:00.000Z'));
    const { call, create, controlRoom } = intros();
    const intro = await create('Bout 1');
    const theme = ThemeSchema.parse((await call('POST', '/themes', { name: 'Gold' })).json());
    const setUp = {
      teamAId: 't1',
      teamBId: 't2',
      themeId: theme.id,
      placement: { spot: 'top-left', edge: 10 },
      options: { atOnce: 3, advance: { mode: 'timer', seconds: 5 }, entrance: 'fade', showPronouns: true },
    };
    const saved = IntroSchema.parse((await call('PATCH', `/intros/${intro.id}`, setUp)).json());
    const control = controlRoom(intro.id);
    const told = control.length;
    vi.setSystemTime(new Date('2026-11-05T19:05:00.000Z'));

    for (const same of [
      {},
      { name: 'Bout 1' },
      setUp,
      // Placement and settings are compared by what they hold, not how they're written.
      {
        placement: { edge: 10, spot: 'top-left' },
        options: { entrance: 'fade', showPronouns: true, advance: { seconds: 5, mode: 'timer' }, atOnce: 3 },
      },
      // Pronouns show unless the request says otherwise.
      { options: { atOnce: 3, advance: { mode: 'timer', seconds: 5 }, entrance: 'fade' } },
    ]) {
      const res = await call('PATCH', `/intros/${intro.id}`, same);
      expect(res.statusCode, JSON.stringify(same)).toBe(200);
      expect(IntroSchema.parse(res.json()), JSON.stringify(same)).toEqual(saved);
    }
    expect(IntroSchema.parse((await call('GET', `/intros/${intro.id}`)).json())).toEqual(saved);
    expect(control).toHaveLength(told);

    // One real change among the same values saves, and tells the rooms.
    const renamed = IntroSchema.parse((await call('PATCH', `/intros/${intro.id}`, { ...setUp, name: 'B1' })).json());
    expect(renamed).toEqual({ ...saved, name: 'B1', updatedAt: '2026-11-05T19:05:00.000Z' });
    expect(control).toHaveLength(told + 1);
  });

  it('clears a team or the theme with null, never counting two empty slots as the same team', async () => {
    const { call, create } = intros();
    const intro = await create('Bout 1');
    const theme = ThemeSchema.parse((await call('POST', '/themes', { name: 'Gold' })).json());
    await call('PATCH', `/intros/${intro.id}`, { teamAId: 't1', teamBId: 't2', themeId: theme.id });
    const oneGone = await call('PATCH', `/intros/${intro.id}`, { teamAId: null });
    expect(oneGone.statusCode).toBe(200);
    expect(IntroSchema.parse(oneGone.json())).toMatchObject({ teamAId: null, teamBId: 't2', themeId: theme.id });
    const allGone = await call('PATCH', `/intros/${intro.id}`, { teamBId: null, themeId: null });
    expect(allGone.statusCode).toBe(200);
    expect(IntroSchema.parse(allGone.json())).toMatchObject({ teamAId: null, teamBId: null, themeId: null });
    const setBoth = await call('PATCH', `/intros/${intro.id}`, { teamAId: 't1', teamBId: 't2' });
    expect(setBoth.statusCode).toBe(200);
    const clearBoth = await call('PATCH', `/intros/${intro.id}`, { teamAId: null, teamBId: null });
    expect(clearBoth.statusCode).toBe(200);
    expect(IntroSchema.parse(clearBoth.json())).toMatchObject({ teamAId: null, teamBId: null });
  });

  it('reads a stored intro with unreadable settings or placement as the defaults, so the others still list', async () => {
    const { client, call, create } = intros();
    const good = await create('Bout 1');
    const bad = await create('Bout 2');
    await call('PATCH', `/intros/${good.id}`, { placement: { spot: 'top-left', edge: 10 } });
    const corrupt = client.prepare('UPDATE producer_intros SET options = ?, placement = ? WHERE id = ?');
    corrupt.run(JSON.stringify({ atOnce: 'lots' }), JSON.stringify({ spot: 'nowhere' }), bad.id);
    const list = await call('GET', '/intros');
    expect(list.statusCode).toBe(200);
    const [first, second] = IntroSchema.array().parse(list.json());
    expect(first).toMatchObject({ id: good.id, placement: { spot: 'top-left', edge: 10 } });
    expect(second).toMatchObject({ id: bad.id, options: DEFAULT_ROSTER_OPTIONS, placement: DEFAULT_PLACEMENT });
    const one = await call('GET', `/intros/${bad.id}`);
    expect(one.statusCode).toBe(200);
    expect(IntroSchema.parse(one.json())).toMatchObject({
      options: DEFAULT_ROSTER_OPTIONS,
      placement: DEFAULT_PLACEMENT,
    });
  });
});
