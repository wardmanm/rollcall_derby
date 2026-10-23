import { describe, expect, it } from 'vitest';
import {
  CreateMemberRequestSchema,
  CreateTeamRequestSchema,
  MAX_IMAGE_BYTES,
  memberProblem,
  TeamSchema,
  TeamSummarySchema,
  UpdateMemberRequestSchema,
  UpdateTeamRequestSchema,
  type MemberFields,
} from './teams.ts';

const MEMBER = {
  id: 'm1',
  kind: 'skater',
  name: 'Jammy Dodger',
  number: '07',
  pronouns: 'she/her',
  roles: ['captain'],
  customRoles: ['Team MVP'],
  photoUrl: '/media/0123456789abcdef0123456789abcdef',
};
const TEAM = {
  id: 't1',
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  shortName: 'RCR',
  primaryColor: '#1a2b3c',
  secondaryColor: null,
  logoUrl: null,
  createdAt: '2026-10-23T10:00:00.000Z',
  updatedAt: '2026-10-23T11:00:00.000Z',
  members: [MEMBER],
};

describe('TeamSchema and TeamSummarySchema', () => {
  it('accept a team as the server sends it', () => {
    expect(TeamSchema.parse(TEAM)).toEqual(TEAM);
    const { createdAt: _createdAt, members: _members, ...summary } = TEAM;
    const listed = { ...summary, skaterCount: 1, benchCount: 0 };
    expect(TeamSummarySchema.parse(listed)).toEqual(listed);
  });

  it('refuse a member with a role that is not one of the fixed roles', () => {
    expect(TeamSchema.safeParse({ ...TEAM, members: [{ ...MEMBER, roles: ['mvp'] }] }).success).toBe(false);
  });
});

describe('CreateTeamRequestSchema', () => {
  it('trims, lowercases colors, and treats blank optional fields as none', () => {
    expect(
      CreateTeamRequestSchema.parse({
        name: '  All Stars ',
        leagueName: ' ',
        shortName: 'RCR',
        primaryColor: '#AABBCC',
      }),
    ).toEqual({ name: 'All Stars', leagueName: null, shortName: 'RCR', primaryColor: '#aabbcc', secondaryColor: null });
  });

  it('refuses a blank or overlong name, an overlong short name and a color that is not #rrggbb', () => {
    for (const request of [
      { name: '  ' },
      { name: 'x'.repeat(65) },
      { name: 'All Stars', leagueName: 'x'.repeat(65) },
      { name: 'All Stars', shortName: 'TOOLONGXX' },
      { name: 'All Stars', primaryColor: 'red' },
      { name: 'All Stars', secondaryColor: '#abc' },
      { name: 'All Stars', logoUrl: '/media/x' },
    ]) {
      expect(CreateTeamRequestSchema.safeParse(request).success, JSON.stringify(request)).toBe(false);
    }
  });
});

describe('UpdateTeamRequestSchema', () => {
  it('leaves out what is missing, and clears what is null or blank', () => {
    expect(UpdateTeamRequestSchema.parse({ shortName: null, secondaryColor: '' })).toEqual({
      shortName: null,
      secondaryColor: null,
    });
    expect(UpdateTeamRequestSchema.parse({})).toEqual({});
  });

  it("refuses to clear the team's name", () => {
    expect(UpdateTeamRequestSchema.safeParse({ name: null }).success).toBe(false);
    expect(UpdateTeamRequestSchema.safeParse({ name: ' ' }).success).toBe(false);
  });
});

describe('CreateMemberRequestSchema', () => {
  it('keeps a number as text, with its leading zeros, and fills in what is left out', () => {
    expect(CreateMemberRequestSchema.parse({ kind: 'skater', name: ' Jammy ', number: ' 00 ' })).toEqual({
      kind: 'skater',
      name: 'Jammy',
      number: '00',
      pronouns: null,
      roles: [],
      customRoles: [],
    });
  });

  it('accepts bench staff with no number, and up to 3 custom roles', () => {
    const coach = { kind: 'bench', name: 'Coach', roles: ['bench-coach'], customRoles: ['Lineups', 'Hype', 'Snacks'] };
    expect(CreateMemberRequestSchema.parse(coach)).toMatchObject(coach);
  });

  it('refuses each member that breaks a rule, naming the field', () => {
    const cases: [object, string][] = [
      [{ kind: 'skater', name: 'Jammy' }, 'number'],
      [{ kind: 'skater', name: 'Jammy', number: '12345' }, 'number'],
      [{ kind: 'skater', name: 'Jammy', number: '1 2' }, 'number'],
      [{ kind: 'bench', name: 'Coach', number: '7' }, 'number'],
      [{ kind: 'skater', name: 'Jammy', number: '7', roles: ['bench-coach'] }, 'roles'],
      [{ kind: 'bench', name: 'Coach', roles: ['captain'] }, 'roles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', roles: ['captain', 'captain'] }, 'roles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', customRoles: ['a', 'b', 'c', 'd'] }, 'customRoles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', customRoles: ['MVP', 'MVP'] }, 'customRoles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', customRoles: ['x'.repeat(33)] }, 'customRoles'],
      [{ kind: 'skater', name: 'Jammy', number: '7', pronouns: 'x'.repeat(33) }, 'pronouns'],
      [{ kind: 'skater', name: ' ', number: '7' }, 'name'],
    ];
    for (const [request, field] of cases) {
      const result = CreateMemberRequestSchema.safeParse(request);
      expect(result.error?.issues[0]?.path[0], JSON.stringify(request)).toBe(field);
    }
  });
});

describe('UpdateMemberRequestSchema', () => {
  it('accepts any subset of fields, leaving the whole member to the server', () => {
    expect(UpdateMemberRequestSchema.parse({ number: '', kind: 'bench' })).toEqual({ number: null, kind: 'bench' });
    expect(UpdateMemberRequestSchema.safeParse({ photoUrl: null }).success).toBe(false);
  });
});

describe('memberProblem', () => {
  const skater: MemberFields = {
    kind: 'skater',
    name: 'Jammy',
    number: '7',
    pronouns: null,
    roles: [],
    customRoles: [],
  };

  it('says what is wrong with a member on its own, or nothing', () => {
    expect(memberProblem(skater)).toBeNull();
    expect(memberProblem({ ...skater, kind: 'bench' })).toEqual({
      field: 'number',
      message: 'Bench staff have no number',
    });
    expect(memberProblem({ ...skater, roles: ['bench-manager'] })).toEqual({
      field: 'roles',
      message: "Bench manager isn't a role for a skater",
    });
  });
});

describe('MAX_IMAGE_BYTES', () => {
  it('is 5 MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(5_242_880);
  });
});
