import { randomUUID } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import {
  MEMBER_ROLE_NAMES,
  ONE_PER_TEAM,
  type CreateTeamRequestSchema,
  type MemberFields,
  type Team,
  type TeamMember,
  type TeamSummary,
} from '@rollcall/core-contract';
import type { z } from 'zod';
import type { Queryable } from '../db.ts';
import { teamMembers, teams } from '../db/schema.ts';
import { mediaUrl } from '../media.ts';

// Teams and their members (docs/features/team-builder.md). Logos and photos are media (ADR-0022): a team or member
// holds an image's id, and the routes save and remove the images themselves.

type TeamRow = typeof teams.$inferSelect;
type MemberRow = typeof teamMembers.$inferSelect;
export type TeamDetails = z.output<typeof CreateTeamRequestSchema>;

// Skaters by number, numbers compared as people read them (7 before 12), then bench staff by name.
const NUMBERS = new Intl.Collator('en', { numeric: true });
const NAMES = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const plainOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const byNumber = (a: string, b: string) => NUMBERS.compare(a, b) || plainOrder(a, b);
const memberOrder = (a: MemberRow, b: MemberRow) => {
  if (a.kind !== b.kind) return a.kind === 'skater' ? -1 : 1;
  if (a.kind === 'skater') return byNumber(a.number ?? '', b.number ?? '');
  return NAMES.compare(a.name, b.name) || plainOrder(a.name, b.name);
};

const toMember = (row: MemberRow): TeamMember => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  number: row.number,
  pronouns: row.pronouns,
  roles: row.roles,
  customRoles: row.customRoles,
  photoUrl: mediaUrl(row.photoMediaId),
});

const teamFields = (row: TeamRow) => ({
  id: row.id,
  name: row.name,
  leagueName: row.leagueName,
  shortName: row.shortName,
  primaryColor: row.primaryColor,
  secondaryColor: row.secondaryColor,
  logoUrl: mediaUrl(row.logoMediaId),
  updatedAt: row.updatedAt,
});

const membersOf = (db: Queryable, teamId: string) =>
  db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all();

/** Every team, by name, with how many skaters and bench staff each has. */
export function listTeams(db: Queryable): TeamSummary[] {
  const counts = db
    .select({ teamId: teamMembers.teamId, kind: teamMembers.kind, members: count() })
    .from(teamMembers)
    .groupBy(teamMembers.teamId, teamMembers.kind)
    .all();
  const countOf = (teamId: string, kind: MemberRow['kind']) =>
    counts.find((row) => row.teamId === teamId && row.kind === kind)?.members ?? 0;
  return db
    .select()
    .from(teams)
    .all()
    .toSorted((a, b) => NAMES.compare(a.name, b.name) || plainOrder(a.name, b.name))
    .map((row) =>
      Object.assign(teamFields(row), { skaterCount: countOf(row.id, 'skater'), benchCount: countOf(row.id, 'bench') }),
    );
}

export const findTeamRow = (db: Queryable, id: string): TeamRow | undefined =>
  db.select().from(teams).where(eq(teams.id, id)).get();

/** A team with its members in order, or undefined when there's no such team. */
export function findTeam(db: Queryable, id: string): Team | undefined {
  const row = findTeamRow(db, id);
  if (!row) return undefined;
  return {
    ...teamFields(row),
    createdAt: row.createdAt,
    members: membersOf(db, id).toSorted(memberOrder).map(toMember),
  };
}

// The team a change was just made to, which therefore exists.
function changedTeam(db: Queryable, id: string): Team {
  const team = findTeam(db, id);
  if (!team) throw new Error(`Team ${id} vanished during a change`);
  return team;
}

export function createTeam(db: Queryable, details: TeamDetails): Team {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.insert(teams)
    .values({ id, ...details, createdAt: now, updatedAt: now })
    .run();
  return changedTeam(db, id);
}

/** Changes a team's details, and marks it updated. Returns the team, or undefined when there's no such team. */
export function updateTeam(
  db: Queryable,
  id: string,
  changes: Partial<TeamDetails> & { logoMediaId?: string | null },
): Team | undefined {
  const result = db
    .update(teams)
    .set({ ...changes, updatedAt: new Date().toISOString() })
    .where(eq(teams.id, id))
    .run();
  return result.changes > 0 ? changedTeam(db, id) : undefined;
}

/** Deletes a team and its members. Returns the ids of the images they had, for the caller to remove. */
export function deleteTeam(db: Queryable, id: string): (string | null)[] | undefined {
  const row = findTeamRow(db, id);
  if (!row) return undefined;
  const photos = membersOf(db, id).map((member) => member.photoMediaId);
  db.delete(teams).where(eq(teams.id, id)).run();
  return [row.logoMediaId, ...photos];
}

export const findMember = (db: Queryable, teamId: string, memberId: string): MemberRow | undefined =>
  db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
    .get();

/** Why `member` can't join or stay on a team: another skater has its number, or another member its one-per-team role. */
export function memberConflict(
  db: Queryable,
  teamId: string,
  member: MemberFields,
  memberId?: string,
): { status: 409; error: 'number_taken' | 'role_taken'; message: string } | null {
  const others = membersOf(db, teamId).filter((other) => other.id !== memberId);
  if (member.number !== null && others.some((other) => other.number === member.number)) {
    return { status: 409, error: 'number_taken', message: `Another skater already has number ${member.number}` };
  }
  const taken = member.roles.find((role) => ONE_PER_TEAM.includes(role) && others.some((o) => o.roles.includes(role)));
  if (taken)
    return { status: 409, error: 'role_taken', message: `This team already has a ${MEMBER_ROLE_NAMES[taken]}` };
  return null;
}

/** Adds a member to a team, marks the team updated and returns it. The caller has checked memberConflict. */
export function addMember(db: Queryable, teamId: string, fields: MemberFields): Team {
  const now = new Date().toISOString();
  db.insert(teamMembers)
    .values({
      id: randomUUID(),
      teamId,
      ...fields,
      roles: [...fields.roles],
      customRoles: [...fields.customRoles],
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return touchTeam(db, teamId);
}

/** Changes a member, marks the team updated and returns it. The caller has checked memberProblem and memberConflict. */
export function updateMember(
  db: Queryable,
  teamId: string,
  memberId: string,
  changes: Partial<MemberFields> & { photoMediaId?: string | null },
): Team {
  const { roles, customRoles, ...rest } = changes;
  db.update(teamMembers)
    .set({
      ...rest,
      ...(roles ? { roles: [...roles] } : {}),
      ...(customRoles ? { customRoles: [...customRoles] } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
    .run();
  return touchTeam(db, teamId);
}

/** Removes a member and marks the team updated. Returns the team, and their photo's id for the caller to remove. */
export function deleteMember(db: Queryable, teamId: string, memberId: string): { team: Team; photo: string | null } {
  const member = findMember(db, teamId, memberId);
  db.delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
    .run();
  return { team: touchTeam(db, teamId), photo: member?.photoMediaId ?? null };
}

// Marks a team updated after a change to its members, and returns it.
function touchTeam(db: Queryable, teamId: string): Team {
  db.update(teams).set({ updatedAt: new Date().toISOString() }).where(eq(teams.id, teamId)).run();
  return changedTeam(db, teamId);
}
