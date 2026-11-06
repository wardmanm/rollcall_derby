import { describe, expect, it } from 'vitest';
import type { Team, TeamMember } from '@rollcall/core-contract';
import {
  CreateIntroRequestSchema,
  DEFAULT_PLACEMENT,
  DEFAULT_ROSTER_OPTIONS,
  INTRO_TEAM_SLOTS,
  IntroOverlayStateSchema,
  IntroPlacementSchema,
  IntroRunSchema,
  IntroSchema,
  NextIntroRequestSchema,
  ROSTER_ENTRANCES,
  ROSTER_SPOTS,
  RosterOnAirSchema,
  RosterOptionsSchema,
  StartIntroRequestSchema,
  UpdateIntroRequestSchema,
  roleLine,
  rosterCard,
  rosterTeam,
} from './intros.ts';

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: 'm1',
  kind: 'skater',
  name: 'Ada Lace',
  number: '42',
  pronouns: null,
  roles: [],
  customRoles: [],
  photoUrl: null,
  ...overrides,
});

const options = (patch: object) => RosterOptionsSchema.safeParse({ ...DEFAULT_ROSTER_OPTIONS, ...patch }).success;

describe('roster options and placement', () => {
  it('accepts the defaults and every entrance and spot', () => {
    expect(RosterOptionsSchema.parse(DEFAULT_ROSTER_OPTIONS)).toEqual(DEFAULT_ROSTER_OPTIONS);
    expect(IntroPlacementSchema.parse(DEFAULT_PLACEMENT)).toEqual(DEFAULT_PLACEMENT);
    for (const entrance of ROSTER_ENTRANCES)
      expect(RosterOptionsSchema.safeParse({ ...DEFAULT_ROSTER_OPTIONS, entrance }).success).toBe(true);
    for (const spot of ROSTER_SPOTS) expect(IntroPlacementSchema.safeParse({ spot, edge: 0 }).success).toBe(true);
    expect(INTRO_TEAM_SLOTS).toEqual(['a', 'b']);
    expect(RosterOptionsSchema.safeParse({ ...DEFAULT_ROSTER_OPTIONS, atOnce: 'team' }).success).toBe(true);
    expect(
      RosterOptionsSchema.safeParse({ ...DEFAULT_ROSTER_OPTIONS, advance: { mode: 'timer', seconds: 5 } }).success,
    ).toBe(true);
  });

  it('reads options saved before the pronouns switch as on, and accepts off', () => {
    const { showPronouns: _on, ...saved } = DEFAULT_ROSTER_OPTIONS;
    expect(RosterOptionsSchema.parse(saved).showPronouns).toBe(true);
    expect(RosterOptionsSchema.parse({ ...saved, showPronouns: false }).showPronouns).toBe(false);
    expect(DEFAULT_ROSTER_OPTIONS.showPronouns).toBe(true);
  });

  it('accepts settings at the ends of their ranges', () => {
    expect(options({ atOnce: 1 })).toBe(true);
    expect(options({ atOnce: 20 })).toBe(true);
    expect(options({ advance: { mode: 'timer', seconds: 2 } })).toBe(true);
    expect(options({ advance: { mode: 'timer', seconds: 60 } })).toBe(true);
    expect(IntroPlacementSchema.safeParse({ spot: 'top-left', edge: 0 }).success).toBe(true);
    expect(IntroPlacementSchema.safeParse({ spot: 'top-left', edge: 200 }).success).toBe(true);
  });

  it('refuses out-of-range settings', () => {
    expect(options({ atOnce: 0 })).toBe(false);
    expect(options({ atOnce: 21 })).toBe(false);
    expect(options({ atOnce: 2.5 })).toBe(false);
    expect(options({ atOnce: 'all' })).toBe(false);
    expect(options({ advance: { mode: 'timer', seconds: 1 } })).toBe(false);
    expect(options({ advance: { mode: 'timer', seconds: 61 } })).toBe(false);
    expect(options({ advance: { mode: 'timer' } })).toBe(false);
    expect(options({ advance: { mode: 'next', seconds: 5 } })).toBe(false);
    expect(options({ entrance: 'spin' })).toBe(false);
    expect(options({ extra: true })).toBe(false);
    expect(IntroPlacementSchema.safeParse({ spot: 'top-left', edge: -1 }).success).toBe(false);
    expect(IntroPlacementSchema.safeParse({ spot: 'top-left', edge: 201 }).success).toBe(false);
    expect(IntroPlacementSchema.safeParse({ spot: 'centre', edge: 0 }).success).toBe(false);
  });
});

const INTRO = {
  id: 'i1',
  name: 'Bout 1',
  teamAId: 't1',
  teamBId: null,
  themeId: null,
  placement: DEFAULT_PLACEMENT,
  options: DEFAULT_ROSTER_OPTIONS,
  createdAt: '2026-11-05T19:00:00.000Z',
  updatedAt: '2026-11-05T19:05:00.000Z',
};

describe('an intro', () => {
  it('accepts a saved intro, with or without its teams and theme', () => {
    expect(IntroSchema.parse(INTRO)).toEqual(INTRO);
    const bare = { ...INTRO, teamAId: null, themeId: null };
    expect(IntroSchema.parse(bare)).toEqual(bare);
    expect(IntroSchema.parse({ ...INTRO, themeId: 'th1', teamBId: 't2' })).toMatchObject({ themeId: 'th1' });
  });

  it('refuses one with a missing or bad field, or an extra one', () => {
    const { updatedAt: _updatedAt, ...noUpdatedAt } = INTRO;
    expect(IntroSchema.safeParse(noUpdatedAt).success).toBe(false);
    expect(IntroSchema.safeParse({ ...INTRO, createdAt: 'yesterday' }).success).toBe(false);
    expect(IntroSchema.safeParse({ ...INTRO, teamAId: undefined }).success).toBe(false);
    expect(IntroSchema.safeParse({ ...INTRO, placement: { spot: 'top-left' } }).success).toBe(false);
    expect(IntroSchema.safeParse({ ...INTRO, options: { ...DEFAULT_ROSTER_OPTIONS, atOnce: 0 } }).success).toBe(false);
    expect(IntroSchema.safeParse({ ...INTRO, running: true }).success).toBe(false);
  });
});

describe('intro requests', () => {
  it("trims an intro's name and explains an empty or long one", () => {
    expect(CreateIntroRequestSchema.parse({ name: '  Bout 1 ' })).toEqual({ name: 'Bout 1' });
    const empty = CreateIntroRequestSchema.safeParse({ name: '   ' });
    expect(empty.error?.issues[0]?.message).toBe('Give the intro a name');
    const long = CreateIntroRequestSchema.safeParse({ name: 'x'.repeat(65) });
    expect(long.error?.issues[0]?.message).toBe('Use at most 64 characters');
  });

  it('refuses the same team for A and B', () => {
    const same = UpdateIntroRequestSchema.safeParse({ teamAId: 't1', teamBId: 't1' });
    expect(same.success).toBe(false);
    expect(same.error?.issues[0]?.message).toBe('Pick two different teams');
    expect(same.error?.issues[0]?.path).toEqual(['teamBId']);
    expect(UpdateIntroRequestSchema.safeParse({ teamAId: 't1', teamBId: null }).success).toBe(true);
    expect(UpdateIntroRequestSchema.safeParse({ teamAId: null, teamBId: null }).success).toBe(true);
    expect(UpdateIntroRequestSchema.safeParse({ teamAId: 't1', teamBId: 't2' }).success).toBe(true);
  });

  it('leaves the same-team rule to the server when team A is empty or not sent', () => {
    // Without team A in the request, the stored one decides, which only the server knows.
    expect(UpdateIntroRequestSchema.safeParse({ teamBId: 't1' }).success).toBe(true);
    expect(UpdateIntroRequestSchema.safeParse({ teamAId: null, teamBId: 't1' }).success).toBe(true);
    expect(UpdateIntroRequestSchema.safeParse({ teamAId: undefined, teamBId: 't1' }).success).toBe(true);
  });

  it('starts team A or B', () => {
    expect(StartIntroRequestSchema.parse({ team: 'a' })).toEqual({ team: 'a' });
    expect(StartIntroRequestSchema.parse({ team: 'b' })).toEqual({ team: 'b' });
    expect(StartIntroRequestSchema.safeParse({ team: 'c' }).success).toBe(false);
    expect(StartIntroRequestSchema.safeParse({ team: 'A' }).success).toBe(false);
    expect(StartIntroRequestSchema.safeParse({}).success).toBe(false);
    expect(StartIntroRequestSchema.safeParse({ team: 'a', revision: 1 }).success).toBe(false);
  });

  it('presses Next with or without the revision it was pressed on', () => {
    expect(NextIntroRequestSchema.parse({})).toEqual({});
    expect(NextIntroRequestSchema.parse({ revision: 0 })).toEqual({ revision: 0 });
    expect(NextIntroRequestSchema.parse({ revision: 1_762_369_200_000 })).toEqual({ revision: 1_762_369_200_000 });
    expect(NextIntroRequestSchema.safeParse({ revision: -1 }).success).toBe(false);
    expect(NextIntroRequestSchema.safeParse({ revision: 1.5 }).success).toBe(false);
    expect(NextIntroRequestSchema.safeParse({ revision: '3' }).success).toBe(false);
    expect(NextIntroRequestSchema.safeParse({ revision: null }).success).toBe(false);
    expect(NextIntroRequestSchema.safeParse({ team: 'a' }).success).toBe(false);
  });
});

describe('roster data', () => {
  it("writes a member's roles, custom roles and pronouns as one line", () => {
    expect(roleLine(member({ roles: ['captain'], customRoles: ['Jammer'], pronouns: 'she/her' }))).toBe(
      'Captain · Jammer · she/her',
    );
    expect(roleLine(member({ roles: [], customRoles: [], pronouns: null }))).toBe('');
    const she = member({ roles: ['captain'], customRoles: ['Jammer'], pronouns: 'she/her' });
    expect(roleLine(she, { showPronouns: true })).toBe('Captain · Jammer · she/her');
    expect(roleLine(she, { showPronouns: false })).toBe('Captain · Jammer');
    expect(roleLine(member({ roles: [], customRoles: [], pronouns: 'she/her' }), { showPronouns: false })).toBe('');
    expect(roleLine(member({ kind: 'bench', roles: ['bench-coach'], pronouns: null }))).toBe('Bench coach');
  });

  it('passes the pronouns option through to the card', () => {
    const she = member({ roles: ['captain'], pronouns: 'she/her' });
    expect(rosterCard(she).roleLine).toBe('Captain · she/her');
    expect(rosterCard(she, { showPronouns: true }).roleLine).toBe('Captain · she/her');
    expect(rosterCard(she, { showPronouns: false }).roleLine).toBe('Captain');
  });

  it('makes roster data from a team and its members', () => {
    const card = rosterCard(member({ number: '07', photoUrl: '/media/p1', roles: ['captain'] }));
    expect(card).toEqual({
      id: 'm1',
      kind: 'skater',
      name: 'Ada Lace',
      number: '07',
      roleLine: 'Captain',
      photoUrl: '/media/p1',
    });
    const team: Team = {
      id: 't1',
      name: 'Rollers',
      leagueName: 'City Derby',
      shortName: 'ROL',
      primaryColor: '#112233',
      secondaryColor: null,
      logoUrl: '/media/l1',
      updatedAt: '2026-11-05T10:00:00.000Z',
      createdAt: '2026-11-05T10:00:00.000Z',
      members: [],
    };
    expect(rosterTeam(team)).toEqual({
      name: 'Rollers',
      leagueName: 'City Derby',
      logoUrl: '/media/l1',
      primaryColor: '#112233',
      secondaryColor: null,
    });
  });
});

describe('the run and overlay state', () => {
  it('accept a run in progress and nothing on air', () => {
    const run = {
      revision: 3,
      team: 'a',
      title: false,
      onAir: true,
      people: [{ id: 'm1', name: 'Ada Lace', number: '42', kind: 'skater' }],
      onScreen: ['m1'],
      next: null,
      done: false,
      timerMsLeft: 4000,
    };
    expect(IntroRunSchema.parse(run)).toEqual(run);
    expect(IntroRunSchema.parse({ ...run, team: null, timerMsLeft: null }).team).toBeNull();
    expect(IntroRunSchema.safeParse({ ...run, revision: -1 }).success).toBe(false);
    expect(IntroOverlayStateSchema.parse({ revision: 0, onAir: null })).toEqual({ revision: 0, onAir: null });
  });

  const card = rosterCard(member());
  const ON_AIR = {
    team: { name: 'Rollers', leagueName: null, logoUrl: null, primaryColor: '#112233', secondaryColor: null },
    title: false,
    cards: [card],
    upNext: { ...card, id: 'm2' },
    slots: 4,
    entrance: 'pop',
    placement: DEFAULT_PLACEMENT,
  };

  it("accept what's on air: the title card, a row of cards, and who's next or no one", () => {
    expect(RosterOnAirSchema.parse(ON_AIR)).toEqual(ON_AIR);
    const title = { ...ON_AIR, title: true, cards: [], upNext: card };
    expect(RosterOnAirSchema.parse(title)).toEqual(title);
    expect(RosterOnAirSchema.parse({ ...ON_AIR, upNext: null }).upNext).toBeNull();
    expect(RosterOnAirSchema.parse({ ...ON_AIR, slots: 1 }).slots).toBe(1);
    expect(IntroOverlayStateSchema.parse({ revision: 4, onAir: ON_AIR })).toEqual({ revision: 4, onAir: ON_AIR });
  });

  it("refuse what's on air with a bad shape", () => {
    expect(RosterOnAirSchema.safeParse({ ...ON_AIR, slots: 0 }).success).toBe(false);
    expect(RosterOnAirSchema.safeParse({ ...ON_AIR, slots: 1.5 }).success).toBe(false);
    expect(RosterOnAirSchema.safeParse({ ...ON_AIR, entrance: 'spin' }).success).toBe(false);
    expect(RosterOnAirSchema.safeParse({ ...ON_AIR, placement: { spot: 'top-left', edge: 201 } }).success).toBe(false);
    expect(RosterOnAirSchema.safeParse({ ...ON_AIR, cards: [{ ...card, kind: 'referee' }] }).success).toBe(false);
    expect(RosterOnAirSchema.safeParse({ ...ON_AIR, cards: [{ ...card, pronouns: 'she/her' }] }).success).toBe(false);
    const { upNext: _upNext, ...noUpNext } = ON_AIR;
    expect(RosterOnAirSchema.safeParse(noUpNext).success).toBe(false);
    const { name: _name, ...nameless } = ON_AIR.team;
    expect(RosterOnAirSchema.safeParse({ ...ON_AIR, team: nameless }).success).toBe(false);
  });
});
