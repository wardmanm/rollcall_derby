import { copyName, TeamItemSchema, type TeamItem, type TransferFact } from '@rollcall/core-contract';
import type { TransferKind } from '@rollcall/app-sdk';
import type { z } from 'zod';
import type { Queryable } from '../db.ts';
import { createTeam, findTeamRow, listTeams, membersOf, replaceMembers, updateTeam } from './teams.ts';

// Teams in export files (docs/features/import-export.md, ADR-0024): a team's details, logo and members, with no ids.

type TeamData = z.output<typeof TeamItemSchema>;

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// The facts shown when a team in a file conflicts with one here.
function teamFacts(team: {
  leagueName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  hasLogo: boolean;
  skaters: number;
  bench: number;
}): TransferFact[] {
  const colors = [team.primaryColor, team.secondaryColor].filter((color) => color !== null);
  return [
    { label: 'League', value: team.leagueName ?? 'none' },
    { label: 'Skaters', value: String(team.skaters) },
    { label: 'Bench staff', value: String(team.bench) },
    { label: 'Colors', value: colors.length > 0 ? colors.join(', ') : 'none' },
    { label: 'Logo', value: team.hasLogo ? 'yes' : 'none' },
  ];
}

const factsOf = (data: TeamData) =>
  teamFacts({
    ...data,
    hasLogo: data.logo !== null,
    skaters: data.members.filter((member) => member.kind === 'skater').length,
    bench: data.members.filter((member) => member.kind === 'bench').length,
  });

/** The `core:team` kind: everyone holding core:teams.manage may export and import teams. */
export function teamKind({ db }: { db: Queryable }): TransferKind<TeamData> {
  // The first copy name no team here has, ignoring case.
  const freeCopyName = (name: string) => {
    const names = listTeams(db).map((team) => team.name);
    let n = 1;
    while (names.some((taken) => sameName(taken, copyName(name, n)))) n += 1;
    return copyName(name, n);
  };

  return {
    name: 'core:team',
    label: { one: 'Team', many: 'teams' },
    version: 1,
    exportPermission: 'core:teams.manage',
    importPermission: 'core:teams.manage',

    list: () => listTeams(db).map(({ id, name }) => ({ id, name })),

    exportItem(id, mediaPath) {
      const row = findTeamRow(db, id);
      if (!row) return undefined;
      const media = (mediaId: string | null) => (mediaId === null ? null : mediaPath(mediaId));
      const data: TeamItem = {
        name: row.name,
        leagueName: row.leagueName,
        shortName: row.shortName,
        primaryColor: row.primaryColor,
        secondaryColor: row.secondaryColor,
        logo: media(row.logoMediaId),
        members: membersOf(db, id).map((member) => ({
          kind: member.kind,
          name: member.name,
          number: member.number,
          pronouns: member.pronouns,
          roles: member.roles,
          customRoles: member.customRoles,
          photo: media(member.photoMediaId),
        })),
      };
      return { name: row.name, data };
    },

    check(data) {
      const checked = TeamItemSchema.safeParse(data);
      return checked.success
        ? { ok: true, data: checked.data }
        : { ok: false, message: checked.error.issues[0]?.message ?? 'Not a team' };
    },

    nameOf: (data) => data.name,
    facts: factsOf,

    media: (data) => [
      ...(data.logo === null ? [] : [{ path: data.logo, type: 'image' as const, what: 'the logo' }]),
      ...data.members.flatMap((member) =>
        member.photo === null
          ? []
          : [{ path: member.photo, type: 'image' as const, what: `the photo of ${member.name}` }],
      ),
    ],

    match(data) {
      const targets = listTeams(db)
        .filter((team) => sameName(team.name, data.name))
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((team) => ({
          id: team.id,
          name: team.name,
          facts: teamFacts({
            ...team,
            hasLogo: team.logoUrl !== null,
            skaters: team.skaterCount,
            bench: team.benchCount,
          }),
          updatedAt: team.updatedAt,
        }));
      return targets.length > 0 ? { status: 'conflict', targets } : { status: 'new' };
    },

    save(data, how, mediaId) {
      const { logo, members, ...details } = data;
      const logoMediaId = logo === null ? null : mediaId(logo);
      // Each member is a fresh object from the destructuring, so it's safe to add to.
      const roster = members.map(({ photo, ...member }) =>
        Object.assign(member, { photoMediaId: photo === null ? null : mediaId(photo) }),
      );
      if (how.as === 'replace') {
        const old = findTeamRow(db, how.id);
        if (!old) throw new Error(`Team ${how.id} to replace is gone`);
        updateTeam(db, how.id, { ...details, name: old.name, logoMediaId });
        const photos = replaceMembers(db, how.id, roster);
        return { name: old.name, unusedMedia: [old.logoMediaId, ...photos] };
      }
      const name = how.as === 'copy' ? freeCopyName(details.name) : details.name;
      const team = createTeam(db, { ...details, name });
      updateTeam(db, team.id, { logoMediaId });
      replaceMembers(db, team.id, roster);
      return { name };
    },
  };
}
