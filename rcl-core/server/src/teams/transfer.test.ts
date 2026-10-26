import { afterEach, describe, expect, it } from 'vitest';
import type { TeamItem } from '@rollcall/core-contract';
import { saveMedia } from '../media.ts';
import { IMAGES, testApp } from '../testing.ts';
import { addMember, createTeam, findTeam, findTeamRow, membersOf, updateMember, updateTeam } from './teams.ts';
import { teamKind } from './transfer.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// A media id as a path of an export file, as core names them.
const mediaPath = (id: string) => `media/${id}${id}.png`;

function setup() {
  const { app, db, mediaDir } = testApp();
  opened.push(app);
  const kind = teamKind({ db });
  const image = () => saveMedia(db, mediaDir, IMAGES.png)!;
  // All Stars, with a logo, a photographed captain and a coach.
  const allStars = () => {
    const team = createTeam(db, {
      name: 'All Stars',
      leagueName: 'Rose City Rollers',
      shortName: 'RCR',
      primaryColor: '#aa0000',
      secondaryColor: null,
    });
    updateTeam(db, team.id, { logoMediaId: image() });
    const jammy = addMember(db, team.id, {
      kind: 'skater',
      name: 'Jammy Dodger',
      number: '07',
      pronouns: 'she/her',
      roles: ['captain'],
      customRoles: [],
    });
    updateMember(db, team.id, jammy.members[0]!.id, { photoMediaId: image() });
    addMember(db, team.id, {
      kind: 'bench',
      name: 'Coach Carter',
      number: null,
      pronouns: null,
      roles: ['bench-coach'],
      customRoles: [],
    });
    return team.id;
  };
  // Turns a file's media paths into newly saved media ids, as an import does.
  const saved = new Map<string, string>();
  const mediaId = (path: string) => {
    const id = saved.get(path) ?? image();
    saved.set(path, id);
    return id;
  };
  return { db, kind, image, allStars, mediaId };
}

const ITEM: TeamItem = {
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  shortName: 'RCR',
  primaryColor: '#aa0000',
  secondaryColor: '#000000',
  logo: `media/${'a'.repeat(64)}.png`,
  members: [
    { kind: 'skater', name: 'Jammy Dodger', number: '07', roles: ['captain'], photo: `media/${'b'.repeat(64)}.png` },
    { kind: 'skater', name: 'Zero Cool', number: '00' },
    { kind: 'bench', name: 'Coach Carter', roles: ['bench-coach'] },
  ],
};

// An item's data, checked as an import checks it.
function checked(kind: ReturnType<typeof setup>['kind'], data: unknown) {
  const result = kind.check(data);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

describe('the core:team kind', () => {
  it('exports a team’s details and members, with its logo and photos as paths of the file', () => {
    const { db, kind, allStars } = setup();
    const id = allStars();
    const row = findTeamRow(db, id)!;
    const photo = membersOf(db, id).find((member) => member.name === 'Jammy Dodger')!.photoMediaId!;
    const exported = kind.exportItem(id, mediaPath);
    expect(exported?.name).toBe('All Stars');
    expect(exported?.data).toEqual({
      name: 'All Stars',
      leagueName: 'Rose City Rollers',
      shortName: 'RCR',
      primaryColor: '#aa0000',
      secondaryColor: null,
      logo: mediaPath(row.logoMediaId!),
      members: expect.arrayContaining([
        {
          kind: 'skater',
          name: 'Jammy Dodger',
          number: '07',
          pronouns: 'she/her',
          roles: ['captain'],
          customRoles: [],
          photo: mediaPath(photo),
        },
        {
          kind: 'bench',
          name: 'Coach Carter',
          number: null,
          pronouns: null,
          roles: ['bench-coach'],
          customRoles: [],
          photo: null,
        },
      ]),
    });
    expect(kind.check(exported?.data).ok).toBe(true);
    expect(kind.list()).toEqual([{ id, name: 'All Stars' }]);
    expect(kind.exportItem('nope', mediaPath)).toBeUndefined();
  });

  it('refuses a team that breaks the Team pages’ rules, in their words', () => {
    const { kind } = setup();
    const twoSevens = { ...ITEM, members: [...ITEM.members, { kind: 'skater', name: 'Seven', number: '07' }] };
    expect(kind.check(twoSevens)).toEqual({ ok: false, message: 'Number 07 is used by two skaters' });
    expect(kind.check({ ...ITEM, name: '' })).toEqual({ ok: false, message: 'Give the team a name' });
  });

  it('gives a team’s facts, and the media it uses with what each is', () => {
    const { kind } = setup();
    const data = checked(kind, ITEM);
    expect(kind.facts(data)).toEqual([
      { label: 'League', value: 'Rose City Rollers' },
      { label: 'Skaters', value: '2' },
      { label: 'Bench staff', value: '1' },
      { label: 'Colors', value: '#aa0000, #000000' },
      { label: 'Logo', value: 'yes' },
    ]);
    expect(kind.media(data)).toEqual([
      { path: ITEM.logo, type: 'image', what: 'the logo' },
      { path: ITEM.members[0]!.photo, type: 'image', what: 'the photo of Jammy Dodger' },
    ]);
  });

  it('is new unless teams here have the same name, ignoring case, listed most recently changed first', () => {
    const { db, kind, allStars } = setup();
    const data = checked(kind, ITEM);
    expect(kind.match(data)).toEqual({ status: 'new' });
    const older = allStars();
    const newer = createTeam(db, {
      name: 'ALL STARS',
      leagueName: null,
      shortName: null,
      primaryColor: null,
      secondaryColor: null,
    });
    updateTeam(db, newer.id, { shortName: 'AS' });
    const match = kind.match(data);
    expect(match.status === 'conflict' && match.targets.map((target) => target.id)).toEqual([newer.id, older]);
    expect(match.status === 'conflict' && match.targets[1]?.facts).toContainEqual({ label: 'Skaters', value: '1' });
  });

  it('adds a team with its members, logo and photos', () => {
    const { db, kind, mediaId } = setup();
    expect(kind.save(checked(kind, ITEM), { as: 'new' }, mediaId, { makeDefault: false })).toEqual({
      name: 'All Stars',
    });
    const [summary] = kind.list();
    const team = findTeam(db, summary!.id)!;
    expect(team).toMatchObject({
      name: 'All Stars',
      secondaryColor: '#000000',
      logoUrl: `/media/${mediaId(ITEM.logo!)}`,
    });
    expect(team.members.map((member) => [member.name, member.number, member.photoUrl])).toEqual([
      ['Zero Cool', '00', null],
      ['Jammy Dodger', '07', `/media/${mediaId(ITEM.members[0]!.photo!)}`],
      ['Coach Carter', null, null],
    ]);
  });

  it('keeps both under the first copy name no team has', () => {
    const { kind, allStars, mediaId } = setup();
    allStars();
    const data = checked(kind, ITEM);
    expect(kind.save(data, { as: 'copy' }, mediaId, { makeDefault: false }).name).toBe('All Stars copy');
    expect(kind.save(data, { as: 'copy' }, mediaId, { makeDefault: false }).name).toBe('All Stars copy 2');
  });

  it('replaces a team in place, keeping its id and name, and hands back the images it no longer uses', () => {
    const { db, kind, allStars, mediaId } = setup();
    const id = allStars();
    const oldLogo = findTeamRow(db, id)!.logoMediaId;
    const oldPhotos = membersOf(db, id).map((member) => member.photoMediaId);
    const saved = kind.save(checked(kind, { ...ITEM, name: 'all stars' }), { as: 'replace', id }, mediaId, {
      makeDefault: false,
    });
    expect(saved.name).toBe('All Stars');
    expect(saved.unusedMedia).toEqual(expect.arrayContaining([oldLogo, ...oldPhotos]));
    const team = findTeam(db, id)!;
    expect(team).toMatchObject({ id, name: 'All Stars', logoUrl: `/media/${mediaId(ITEM.logo!)}` });
    expect(team.members.map((member) => member.name)).toEqual(['Zero Cool', 'Jammy Dodger', 'Coach Carter']);
  });
});
