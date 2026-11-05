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
  ROSTER_ENTRANCES,
  ROSTER_SPOTS,
  RosterOptionsSchema,
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

  it('refuses out-of-range settings', () => {
    expect(options({ atOnce: 0 })).toBe(false);
    expect(options({ atOnce: 21 })).toBe(false);
    expect(options({ atOnce: 'all' })).toBe(false);
    expect(options({ advance: { mode: 'timer', seconds: 1 } })).toBe(false);
    expect(options({ advance: { mode: 'timer', seconds: 61 } })).toBe(false);
    expect(IntroPlacementSchema.safeParse({ spot: 'top-left', edge: -1 }).success).toBe(false);
    expect(IntroPlacementSchema.safeParse({ spot: 'top-left', edge: 201 }).success).toBe(false);
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
});
