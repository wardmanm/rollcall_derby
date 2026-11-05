import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamsService } from '@rollcall/app-sdk';
import type { Team, TeamMember } from '@rollcall/core-contract';
import { DEFAULT_ROSTER_OPTIONS, IntroSchema, type RosterOptions } from '@rollcall/producer-contract';
import * as schema from '../db/schema.ts';
import { testProducer } from '../testing.ts';
import { introRuns } from './runs.ts';

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

const skater = (id: string, pronouns: string | null = null): TeamMember => ({
  id,
  kind: 'skater',
  name: `Skater ${id}`,
  number: id.slice(1),
  pronouns,
  roles: [],
  customRoles: [],
  photoUrl: null,
});
const team: Team = {
  id: 't1',
  name: 'All Stars',
  leagueName: null,
  shortName: null,
  primaryColor: null,
  secondaryColor: null,
  logoUrl: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  members: ['m1', 'm2', 'm3'].map((id) => skater(id)),
};

// An intro of All Stars as team A, saved through the routes, and what a runs service needs, without the app's own.
async function anIntro(options: RosterOptions = DEFAULT_ROSTER_OPTIONS) {
  const { api, ctx } = testProducer({ teams: [team] });
  opened.push(api);
  const created = await api.inject({ method: 'POST', url: '/api/producer/intros', payload: { name: 'Bout 1' } });
  const { id } = IntroSchema.parse(created.json());
  const saved = await api.inject({
    method: 'PATCH',
    url: `/api/producer/intros/${id}`,
    payload: { teamAId: 't1', options },
  });
  const log = { error: vi.fn<(details: object, message: string) => void>() };
  return {
    intro: IntroSchema.parse(saved.json()),
    db: ctx.db(schema),
    teams: ctx.teams,
    log,
    logger: log as unknown as FastifyBaseLogger,
  };
}

describe('the intro runs service', () => {
  it("numbers revisions from when it was made, so a restarted server's are newer than any before it", async () => {
    const { intro, db, teams, logger } = await anIntro();
    const before = introRuns({ db, teams, onChange: () => {}, log: logger });
    const sent = [before.run(intro).revision, before.overlay(intro).revision];
    before.start(intro, 'a');
    for (let i = 0; i < 3; i++) sent.push(before.next(intro).revision, before.overlay(intro).revision);
    sent.push(before.forget(intro.id).revision);
    before.close();

    // The server restarts a minute later.
    vi.setSystemTime(NOW.getTime() + 60_000);
    const after = introRuns({ db, teams, onChange: () => {}, log: logger });
    const newest = Math.max(...sent);
    expect(after.run(intro).revision).toBeGreaterThan(newest);
    expect(after.overlay(intro).revision).toBeGreaterThan(newest);
    expect(after.overlay(undefined).revision).toBeGreaterThan(newest);
    after.close();
  });

  it('shows pronouns for an intro saved before the switch existed', async () => {
    const { intro, db, logger } = await anIntro();
    const withPronouns: Team = { ...team, members: ['m1', 'm2', 'm3'].map((id) => skater(id, 'she/her')) };
    const runs = introRuns({ db, teams: { list: () => [], get: () => withPronouns }, onChange: () => {}, log: logger });
    runs.start(intro, 'a');
    runs.next(intro);
    expect(runs.overlay(intro).onAir?.cards[0]?.roleLine).toBe('she/her');
    runs.close();
  });

  it('logs a timer step that throws, never throwing from the timer, and the next Next still works', async () => {
    const { intro, db, teams, log, logger } = await anIntro({
      ...DEFAULT_ROSTER_OPTIONS,
      advance: { mode: 'timer', seconds: 5 },
    });
    const failing = new Error('database is closed');
    const get = vi.fn<(id: string) => Team | undefined>((id) => teams.get(id));
    const flaky: TeamsService = { list: () => teams.list(), get };
    const runs = introRuns({ db, teams: flaky, onChange: () => {}, log: logger });
    runs.start(intro, 'a');
    get.mockImplementationOnce(() => {
      throw failing;
    });
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(log.error).toHaveBeenCalledExactlyOnceWith({ err: failing, introId: intro.id }, expect.any(String));
    expect(runs.next(intro)).toMatchObject({ onScreen: ['m1'], timerMsLeft: 5000 });
    // The timer carries on too: one at once, so the next step shows the next person alone.
    vi.advanceTimersByTime(5000);
    expect(runs.run(intro).onScreen).toEqual(['m2']);
    runs.close();
  });
});
