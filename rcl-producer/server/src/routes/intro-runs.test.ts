import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROSTER_OPTIONS,
  INTRO_STATE_EVENT,
  IntroOverlayStateSchema,
  IntroRunSchema,
  IntroSchema,
  type RosterOptions,
} from '@rollcall/producer-contract';
import { allStars, testProducer, testRealtime, type Sent } from '../testing.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
const NOW = new Date('2026-11-05T19:00:00.000Z');
// Only timeouts and the clock are faked: Fastify's inject waits on the real setImmediate.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
});
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
  vi.useRealTimers();
});

// All Stars' six people, in team page order: five skaters, then a bench coach.
const [m1, m2, m3, m4, m5, m6] = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'] as const;

// The Producer app with an intro whose team A is All Stars, four at once, and ways to run it.
async function running(options: Partial<RosterOptions> = {}) {
  const { api, ctx, client, teams } = testProducer({ teams: [allStars()] });
  opened.push(api);
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    api.inject({ method, url: `/api/producer${url}`, ...(payload ? { payload } : {}) });
  const intro = IntroSchema.parse((await call('POST', '/intros', { name: 'Bout 1' })).json());
  const setUp = { teamAId: 't1', options: { ...DEFAULT_ROSTER_OPTIONS, atOnce: 4, ...options } };
  expect((await call('PATCH', `/intros/${intro.id}`, setUp)).statusCode).toBe(200);
  const runFrom = async (method: 'GET' | 'POST', action: string, payload?: object) => {
    const res = await call(method, `/intros/${intro.id}/${action}`, payload);
    expect(res.statusCode, action).toBe(200);
    return IntroRunSchema.parse(res.json());
  };
  return {
    api,
    ctx,
    client,
    teams,
    intro,
    call,
    read: async () => runFrom('GET', 'run'),
    start: async (team: 'a' | 'b') => runFrom('POST', 'start', { team }),
    next: async (body: { revision?: number } = {}) => runFrom('POST', 'next', body),
    clear: async () => runFrom('POST', 'clear', {}),
  };
}

const lastState = (sent: Sent[]) =>
  IntroOverlayStateSchema.parse(sent.findLast(([event]) => event === INTRO_STATE_EVENT)?.[1]);

describe('running an intro', () => {
  it('starts a team with its title card, then shows people in team page order', async () => {
    const { read, start, next } = await running();
    // Revisions count from when the server's runs were made, so a restarted server's are newer than any before.
    expect(await read()).toEqual({
      revision: NOW.getTime(),
      team: null,
      title: false,
      onAir: false,
      people: [],
      onScreen: [],
      next: null,
      done: false,
      timerMsLeft: null,
    });
    const run = await start('a');
    expect(run).toMatchObject({ team: 'a', title: true, onAir: true, onScreen: [], next: m1, done: false });
    expect(run.timerMsLeft).toBeNull();
    expect(run.people.map((person) => person.id)).toEqual([m1, m2, m3, m4, m5, m6]);
    expect(run.people[0]).toEqual({ id: m1, name: 'Ada Bruise', number: '1', kind: 'skater' });
    expect(run.people[5]).toEqual({ id: m6, name: 'Fay Coach', number: null, kind: 'bench' });
    const after = await next();
    expect(after).toMatchObject({ title: false, onScreen: [m1], next: m2 });
    expect(await read()).toEqual(after);
  });

  it('answers 409 no_team for an empty slot or a deleted team', async () => {
    const { call, intro, teams } = await running();
    const empty = await call('POST', `/intros/${intro.id}/start`, { team: 'b' });
    expect(empty.statusCode).toBe(409);
    expect(empty.json()).toEqual({ error: 'no_team', message: 'Pick team B first' });
    teams.splice(0);
    const deleted = await call('POST', `/intros/${intro.id}/start`, { team: 'a' });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json()).toEqual({ error: 'no_team', message: 'Pick team A first' });
  });

  it('answers 404 for an unknown intro', async () => {
    const { call } = await running();
    for (const [method, action, body] of [
      ['GET', 'run'],
      ['POST', 'start', { team: 'a' }],
      ['POST', 'next', {}],
      ['POST', 'clear', {}],
    ] as const) {
      const res = await call(method, `/intros/nope/${action}`, body);
      expect(res.statusCode, action).toBe(404);
      expect(res.json(), action).toEqual({ error: 'not_found' });
    }
  });

  it('answers a Next pressed on a step that has passed with the run as it is, moving nothing', async () => {
    const { read, start, next } = await running();
    const { revision } = await start('a');
    const first = await next({ revision });
    // A second press on the same step, or a retry after a reconnect.
    const stale = await next({ revision });
    expect(stale).toEqual(first);
    expect(stale.onScreen).toEqual([m1]);
    expect(await read()).toEqual(first);
    // So is one with a revision the run hasn't reached.
    expect(await next({ revision: first.revision + 1 })).toEqual(first);
    // The run's own revision moves on.
    expect((await next({ revision: first.revision })).onScreen).toEqual([m1, m2]);
  });

  it('a Next without a revision always moves on', async () => {
    const { start, next } = await running();
    await start('a');
    await next();
    expect((await next()).onScreen).toEqual([m1, m2]);
  });

  it('keeps the place after Clear: the next Next starts a fresh row', async () => {
    const { start, next, clear } = await running();
    await start('a');
    await next();
    await next();
    expect(await clear()).toMatchObject({ onAir: false, title: false, onScreen: [], next: m3 });
    expect((await next()).onScreen).toEqual([m3]);
  });

  it('on the timer, moves on by itself and stops after the last person', async () => {
    const { read, start } = await running({ advance: { mode: 'timer', seconds: 5 } });
    expect((await start('a')).timerMsLeft).toBe(5000);
    vi.advanceTimersByTime(5000);
    expect(await read()).toMatchObject({ onScreen: [m1], timerMsLeft: 5000 });
    vi.advanceTimersByTime(6 * 5000);
    expect(await read()).toMatchObject({ onAir: true, onScreen: [m5, m6], next: null, done: true, timerMsLeft: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Next during the timer restarts the countdown', async () => {
    const { read, start, next } = await running({ advance: { mode: 'timer', seconds: 5 } });
    await start('a');
    vi.advanceTimersByTime(4000);
    expect(await next()).toMatchObject({ onScreen: [m1], timerMsLeft: 5000 });
    vi.advanceTimersByTime(4000);
    expect(await read()).toMatchObject({ onScreen: [m1], timerMsLeft: 1000 });
    vi.advanceTimersByTime(1000);
    expect((await read()).onScreen).toEqual([m1, m2]);
  });

  it('Clear stops the timer, and the next Next starts it again', async () => {
    const { read, start, next, clear } = await running({ advance: { mode: 'timer', seconds: 5 } });
    await start('a');
    vi.advanceTimersByTime(5000);
    expect((await clear()).timerMsLeft).toBeNull();
    vi.advanceTimersByTime(20_000);
    expect(await read()).toMatchObject({ onAir: false, next: m2, timerMsLeft: null });
    expect(await next()).toMatchObject({ onScreen: [m2], timerMsLeft: 5000 });
    vi.advanceTimersByTime(5000);
    expect((await read()).onScreen).toEqual([m2, m3]);
  });

  it('skips a person removed mid-run, and ends the run when its team is deleted', async () => {
    const { teams, start, next } = await running();
    await start('a');
    await next();
    const team = teams[0]!;
    team.members = team.members.filter((member) => member.id !== m2);
    const skipped = await next();
    expect(skipped.onScreen).toEqual([m1, m3]);
    expect(skipped.people.map((person) => person.id)).toEqual([m1, m3, m4, m5, m6]);
    teams.splice(0);
    const ended = await next();
    expect(ended).toMatchObject({ team: null, onAir: false, title: false, people: [], onScreen: [], next: null });
    expect(ended.revision).toBeGreaterThan(skipped.revision);
  });

  it('reads details fresh: a photo changed mid-run shows in the next overlay state', async () => {
    const { ctx, intro, teams, start, next } = await running();
    const overlay = testRealtime(ctx).connect('/producer/overlay', { intro: intro.id });
    await start('a');
    await next();
    expect(lastState(overlay).onAir?.cards.map((card) => card.photoUrl)).toEqual(['/media/photo-1']);
    teams[0]!.members[0]!.photoUrl = '/media/new-photo';
    teams[0]!.members[1]!.photoUrl = null;
    await next();
    expect(lastState(overlay).onAir?.cards.map((card) => card.photoUrl)).toEqual(['/media/new-photo', null]);
  });

  it('settings saved mid-run take effect at the next Start', async () => {
    const { call, intro, start, next } = await running();
    await start('a');
    await next();
    await call('PATCH', `/intros/${intro.id}`, { options: { ...DEFAULT_ROSTER_OPTIONS, atOnce: 2 } });
    await next();
    await next();
    expect((await next()).onScreen).toEqual([m1, m2, m3, m4]);
    await start('a');
    await next();
    expect((await next()).onScreen).toEqual([m1, m2]);
    expect((await next()).onScreen).toEqual([m3]);
  });

  it('with pronouns off, nothing sent to the overlay has them, and a change mid-run waits for the next Start', async () => {
    const { call, ctx, intro, teams, start, next } = await running({ showPronouns: false });
    teams[0]!.members[0]!.pronouns = 'she/her';
    teams[0]!.members[1]!.pronouns = 'they/them';
    const overlay = testRealtime(ctx).connect('/producer/overlay', { intro: intro.id });
    await start('a');
    await next();
    expect(JSON.stringify(overlay)).not.toMatch(/she\/her|they\/them/);
    expect(lastState(overlay).onAir?.upNext?.roleLine).toBe('');
    // Saving it on mid-run changes nothing until the next Start.
    await call('PATCH', `/intros/${intro.id}`, { options: { ...DEFAULT_ROSTER_OPTIONS, atOnce: 4 } });
    await next();
    expect(JSON.stringify(overlay)).not.toMatch(/she\/her|they\/them/);
    await start('a');
    await next();
    await next();
    expect(lastState(overlay).onAir?.cards.map((card) => card.roleLine)).toEqual(['she/her', 'they/them']);
  });

  it('reads an intro saved before the pronouns switch as on, in the routes and on air', async () => {
    const { client, call, teams, ctx, start, next } = await running();
    // A legacy row: its options JSON has no showPronouns.
    const legacy = JSON.stringify({ atOnce: 4, advance: { mode: 'next' }, entrance: 'pop' });
    client.prepare('UPDATE producer_intros SET options = ?').run(legacy);
    const list = await call('GET', '/intros');
    expect(list.statusCode).toBe(200);
    expect(list.json()[0].options.showPronouns).toBe(true);
    const intros = list.json() as { id: string }[];
    const one = await call('GET', `/intros/${intros[0]!.id}`);
    expect(one.statusCode).toBe(200);
    expect(one.json().options.showPronouns).toBe(true);
    teams[0]!.members[0]!.pronouns = 'she/her';
    const overlay = testRealtime(ctx).connect('/producer/overlay', { intro: intros[0]!.id });
    await start('a');
    await next();
    expect(lastState(overlay).onAir?.cards[0]?.roleLine).toBe('she/her');
  });

  it('deleting an intro forgets its run', async () => {
    const { call, intro, start } = await running({ advance: { mode: 'timer', seconds: 5 } });
    await start('a');
    expect(vi.getTimerCount()).toBe(1);
    expect((await call('DELETE', `/intros/${intro.id}`)).statusCode).toBe(204);
    expect(vi.getTimerCount()).toBe(0);
    expect((await call('GET', `/intros/${intro.id}/run`)).statusCode).toBe(404);
  });

  it('stops every timer when the server closes', async () => {
    const { api, start } = await running({ advance: { mode: 'timer', seconds: 5 } });
    await start('a');
    expect(vi.getTimerCount()).toBe(1);
    await api.close();
    expect(vi.getTimerCount()).toBe(0);
  });
});
