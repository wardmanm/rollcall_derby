import { describe, expect, it } from 'vitest';
import {
  copyName,
  ExportQuerySchema,
  FontFaceItemSchema,
  ImportQuerySchema,
  ManifestHeadSchema,
  ManifestSchema,
  TeamItemSchema,
  type TeamItem,
} from './transfer.ts';

const LOGO = `media/${'a'.repeat(64)}.png`;
const PHOTO = `media/${'b'.repeat(64)}.jpg`;
const FILE = 'c'.repeat(64);

const TEAM: TeamItem = {
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  shortName: 'RCR',
  primaryColor: '#aa0000',
  secondaryColor: null,
  logo: LOGO,
  members: [
    { kind: 'skater', name: 'Jammy Dodger', number: '07', pronouns: 'she/her', roles: ['captain'], photo: PHOTO },
    { kind: 'bench', name: 'Coach Carter', roles: ['bench-coach'] },
  ],
};

// The first problem the team schema finds, as `path: message`, or undefined when the team is accepted.
function problem(team: unknown) {
  const issue = TeamItemSchema.safeParse(team).error?.issues[0];
  return issue && `${issue.path.join('.')}: ${issue.message}`;
}

describe('ManifestSchema', () => {
  const manifest = {
    format: 'rollcall-export',
    formatVersion: 1,
    exportedAt: '2026-10-26T12:00:00.000Z',
    apps: { core: '0.3.0', producer: '0.4.0' },
    items: [{ kind: 'core:team', version: 1, data: TEAM }],
  };

  it('accepts a manifest as Rollcall writes it, leaving item data to each kind', () => {
    expect(ManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it('refuses another format, a kind not named <app>:<thing>, and a version that is not a whole number', () => {
    expect(ManifestSchema.safeParse({ ...manifest, format: 'something-else' }).success).toBe(false);
    expect(ManifestSchema.safeParse({ ...manifest, items: [{ kind: 'team', version: 1, data: {} }] }).success).toBe(
      false,
    );
    expect(
      ManifestSchema.safeParse({ ...manifest, items: [{ kind: 'core:team', version: 1.5, data: {} }] }).success,
    ).toBe(false);
  });

  it('reads enough of a newer manifest to know it is newer', () => {
    const newer = { format: 'rollcall-export', formatVersion: 2, somethingNew: true };
    expect(ManifestHeadSchema.parse(newer)).toMatchObject({ formatVersion: 2 });
    expect(ManifestSchema.safeParse(newer).success).toBe(false);
  });
});

describe('TeamItemSchema', () => {
  it('accepts a team with its logo and members, filling in what is left out', () => {
    expect(TeamItemSchema.parse(TEAM)).toEqual({
      ...TEAM,
      members: [
        { ...TEAM.members[0], customRoles: [] },
        { ...TEAM.members[1], number: null, pronouns: null, customRoles: [], photo: null },
      ],
    });
  });

  it('applies the Team pages’ rules to each member and to the team as a whole', () => {
    const member = (fields: object) => ({ ...TEAM, members: [{ kind: 'skater', name: 'X', number: '1', ...fields }] });
    expect(problem(member({ number: null }))).toBe('members.0.number: Give the skater a number');
    expect(problem(member({ kind: 'bench', roles: ['captain'], number: null }))).toBe(
      "members.0.roles: Captain isn't a role for bench staff",
    );
    const twoSevens = { ...TEAM, members: [TEAM.members[0], { kind: 'skater', name: 'Seven', number: '07' }] };
    expect(problem(twoSevens)).toBe('members.1.number: Number 07 is used by two skaters');
    const twoCaptains = {
      ...TEAM,
      members: [TEAM.members[0], { kind: 'skater', name: 'Cap', number: '1', roles: ['captain'] }],
    };
    expect(problem(twoCaptains)).toBe('members.1.roles: Only one member can be Captain');
  });

  it('refuses media that is not a file of the export, and a blank name', () => {
    expect(problem({ ...TEAM, logo: '/media/0123456789abcdef0123456789abcdef' })).toBe(
      'logo: Use a media file of this export, such as media/<sha256>.png',
    );
    expect(problem({ ...TEAM, name: '  ' })).toBe('name: Give the team a name');
  });

  it('takes as many members as the Team pages do, so any team exported can be imported again', () => {
    const members = Array.from({ length: 201 }, (_, n) => ({ kind: 'skater', name: `Skater ${n}`, number: `${n}` }));
    expect(TeamItemSchema.parse({ ...TEAM, members }).members).toHaveLength(201);
  });
});

describe('FontFaceItemSchema', () => {
  it('accepts a face with its file, reading its weights as an upload does', () => {
    const face = { family: 'Rollerball', weight: '100-900', style: 'italic', file: `media/${'d'.repeat(64)}.woff2` };
    expect(FontFaceItemSchema.parse(face)).toEqual({
      family: 'Rollerball',
      weightMin: 100,
      weightMax: 900,
      style: 'italic',
      file: face.file,
    });
    expect(FontFaceItemSchema.safeParse({ ...face, family: 'Bad"; }' }).success).toBe(false);
    expect(FontFaceItemSchema.safeParse({ ...face, weight: '900-100' }).success).toBe(false);
  });
});

describe('ImportQuerySchema', () => {
  it('reads the choices as JSON, defaulting to no default theme', () => {
    const choices = { file: FILE, items: [{ action: 'add' }, { action: 'replace', target: 't1' }, { action: 'skip' }] };
    expect(ImportQuerySchema.parse({ choices: JSON.stringify(choices) })).toEqual({
      choices: { ...choices, default: null },
    });
  });

  it('refuses choices that are not JSON, an unknown action, and a replace with no target', () => {
    expect(ImportQuerySchema.safeParse({ choices: '{' }).error?.issues[0]?.message).toBe('Send the choices as JSON');
    for (const item of [{ action: 'merge' }, { action: 'replace' }]) {
      const choices = JSON.stringify({ file: FILE, items: [item] });
      expect(ImportQuerySchema.safeParse({ choices }).success, JSON.stringify(item)).toBe(false);
    }
  });
});

describe('copyName', () => {
  it('names copies "<name> copy", then "copy 2", shortened to fit', () => {
    expect([1, 2, 3].map((n) => copyName('All Stars', n))).toEqual([
      'All Stars copy',
      'All Stars copy 2',
      'All Stars copy 3',
    ]);
    expect(copyName('x'.repeat(64), 1)).toBe(`${'x'.repeat(59)} copy`);
    expect(copyName('x'.repeat(64), 2)).toBe(`${'x'.repeat(57)} copy 2`);
  });
});

describe('ExportQuerySchema', () => {
  it('reads chosen items as kind:id, or whole kinds', () => {
    expect(ExportQuerySchema.parse({ items: 'core:team:t1,producer:theme:th-2' })).toEqual({
      items: [
        { kind: 'core:team', id: 't1' },
        { kind: 'producer:theme', id: 'th-2' },
      ],
    });
    expect(ExportQuerySchema.parse({ kinds: 'core:team,producer:theme' })).toEqual({
      kinds: ['core:team', 'producer:theme'],
    });
  });

  it('refuses both, neither, an empty list of items, and an item with no kind', () => {
    for (const query of [{ items: 'core:team:t1', kinds: 'core:team' }, {}, { items: '' }, { items: 't1' }]) {
      expect(ExportQuerySchema.safeParse(query).error?.issues[0]?.message, JSON.stringify(query)).toBe(
        'Choose items, as kind:id, or kinds to export',
      );
    }
  });
});
