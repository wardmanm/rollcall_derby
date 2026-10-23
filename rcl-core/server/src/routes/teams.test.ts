import { readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { TeamSchema, TeamSummarySchema, type Role, type Team } from '@rollcall/core-contract';
import { createApiKey } from '../auth/api-keys.ts';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { media, teamMembers, teams } from '../db/schema.ts';
import { saveMedia } from '../media.ts';
import { addUser, IMAGES, testApp } from '../testing.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// An app with someone signed in as `role`, and a way to call it as them.
async function as(role: Role = 'producer') {
  const { app, db, mediaDir } = testApp();
  opened.push(app);
  const user = await addUser(db, `${role}1`, 'correct horse', role);
  const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
  const call = (method: InjectOptions['method'], url: string, payload?: object) =>
    app.inject({ method, url: `/api/core${url}`, cookies, ...(payload ? { payload } : {}) });
  const team = async (payload: object = { name: 'All Stars' }) =>
    TeamSchema.parse((await call('POST', '/teams', payload)).json());
  const member = async (teamId: string, payload: object) => call('POST', `/teams/${teamId}/members`, payload);
  return { app, db, mediaDir, call, team, member };
}

const skater = (name: string, number: string, more: object = {}) => ({ kind: 'skater', name, number, ...more });
const numbersOf = (team: Team) => team.members.map((m) => m.number ?? m.name);

describe('teams', () => {
  it('creates, lists, shows, changes and deletes a team', async () => {
    const { call, team } = await as();
    const created = await team({ name: ' All Stars ', leagueName: 'Rose City Rollers', primaryColor: '#AA0000' });
    expect(created).toMatchObject({
      name: 'All Stars',
      leagueName: 'Rose City Rollers',
      shortName: null,
      primaryColor: '#aa0000',
      secondaryColor: null,
      logoUrl: null,
      members: [],
    });
    await team({ name: 'B Team' });
    const listed = TeamSummarySchema.array().parse((await call('GET', '/teams')).json());
    expect(listed.map((t) => [t.name, t.skaterCount, t.benchCount])).toEqual([
      ['All Stars', 0, 0],
      ['B Team', 0, 0],
    ]);
    expect(TeamSchema.parse((await call('GET', `/teams/${created.id}`)).json())).toEqual(created);

    const changed = await call('PATCH', `/teams/${created.id}`, { shortName: 'RCR', leagueName: null });
    expect(changed.statusCode).toBe(200);
    expect(TeamSchema.parse(changed.json())).toMatchObject({ name: 'All Stars', shortName: 'RCR', leagueName: null });

    expect((await call('DELETE', `/teams/${created.id}`)).statusCode).toBe(204);
    expect((await call('GET', `/teams/${created.id}`)).statusCode).toBe(404);
  });

  it('answers 404 for a team that does not exist', async () => {
    const { call } = await as();
    for (const [method, payload] of [['GET'], ['PATCH', { name: 'X' }], ['DELETE']] as const) {
      const res = await call(method, '/teams/no-such-team', payload);
      expect(res.statusCode, method).toBe(404);
      expect(res.json(), method).toEqual({ error: 'not_found' });
    }
    expect((await call('POST', '/teams/no-such-team/members', skater('Jammy', '7'))).statusCode).toBe(404);
  });

  it('refuses a team with no name, in plain words', async () => {
    const { call } = await as();
    expect((await call('POST', '/teams', { name: '  ' })).json()).toEqual({
      error: 'validation_failed',
      message: 'Give the team a name',
    });
  });
});

describe('members', () => {
  it('lists skaters by number, keeping leading zeros, then bench staff by name', async () => {
    const { team, member, call } = await as();
    const { id } = await team();
    for (const [name, number] of [
      ['Twelve', '12'],
      ['Seven', '7'],
      ['Double zero', '00'],
      ['Oh seven', '07'],
      ['Zero', '0'],
    ]) {
      expect((await member(id, skater(name!, number!))).statusCode).toBe(201);
    }
    await member(id, { kind: 'bench', name: 'Zed', roles: ['bench-manager'] });
    await member(id, { kind: 'bench', name: 'Coach Amy', roles: ['bench-coach'] });
    const shown = TeamSchema.parse((await call('GET', `/teams/${id}`)).json());
    expect(numbersOf(shown)).toEqual(['0', '00', '07', '7', '12', 'Coach Amy', 'Zed']);
    const listed = TeamSummarySchema.array().parse((await call('GET', '/teams')).json());
    expect(listed[0]).toMatchObject({ skaterCount: 5, benchCount: 2 });
  });

  it('replies to every change with the whole team, and marks the team updated', async () => {
    const { team, member, call } = await as();
    const before = await team();
    const added = TeamSchema.parse((await member(before.id, skater('Jammy', '7', { pronouns: 'she/her' }))).json());
    expect(added.members).toEqual([
      {
        id: expect.any(String),
        kind: 'skater',
        name: 'Jammy',
        number: '7',
        pronouns: 'she/her',
        roles: [],
        customRoles: [],
        photoUrl: null,
      },
    ]);
    expect(added.updatedAt >= before.updatedAt).toBe(true);
    const memberId = added.members[0]!.id;
    const changed = await call('PATCH', `/teams/${before.id}/members/${memberId}`, {
      roles: ['captain'],
      customRoles: ['MVP'],
    });
    expect(TeamSchema.parse(changed.json()).members[0]).toMatchObject({
      name: 'Jammy',
      roles: ['captain'],
      customRoles: ['MVP'],
    });
    const removed = await call('DELETE', `/teams/${before.id}/members/${memberId}`);
    expect(TeamSchema.parse(removed.json()).members).toEqual([]);
  });

  it('refuses a number another skater has, on add and on change', async () => {
    const { team, member, call } = await as();
    const { id } = await team();
    await member(id, skater('Jammy', '07'));
    expect((await member(id, skater('Seven', '7'))).statusCode).toBe(201);
    const taken = await member(id, skater('Copycat', '07'));
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'number_taken', message: 'Another skater already has number 07' });
    const seven = TeamSchema.parse((await call('GET', `/teams/${id}`)).json()).members.find((m) => m.number === '7')!;
    const change = await call('PATCH', `/teams/${id}/members/${seven.id}`, { number: '07' });
    expect(change.json()).toMatchObject({ error: 'number_taken' });
    // Keeping your own number isn't a clash.
    expect((await call('PATCH', `/teams/${id}/members/${seven.id}`, { number: '7', name: 'Lucky' })).statusCode).toBe(
      200,
    );
  });

  it('lets two teams use the same number', async () => {
    const { team, member } = await as();
    const a = await team({ name: 'A' });
    const b = await team({ name: 'B' });
    expect((await member(a.id, skater('One', '1'))).statusCode).toBe(201);
    expect((await member(b.id, skater('Uno', '1'))).statusCode).toBe(201);
  });

  it('allows one Captain and one Alt captain per team', async () => {
    const { team, member, call } = await as();
    const { id } = await team();
    await member(id, skater('Cap', '1', { roles: ['captain'] }));
    await member(id, skater('Alt', '2', { roles: ['alt-captain'] }));
    const second = await member(id, skater('Wannabe', '3', { roles: ['captain'] }));
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'role_taken', message: 'This team already has a Captain' });
    const alt = TeamSchema.parse((await call('GET', `/teams/${id}`)).json()).members.find((m) => m.name === 'Alt')!;
    expect((await call('PATCH', `/teams/${id}/members/${alt.id}`, { roles: ['captain'] })).json()).toMatchObject({
      error: 'role_taken',
    });
    // Bench roles can be shared.
    await member(id, { kind: 'bench', name: 'Coach A', roles: ['bench-coach'] });
    expect((await member(id, { kind: 'bench', name: 'Coach B', roles: ['bench-coach'] })).statusCode).toBe(201);
  });

  it('checks the member a change makes, such as a skater moving to the bench', async () => {
    const { team, member, call } = await as();
    const { id } = await team();
    const added = TeamSchema.parse((await member(id, skater('Jammy', '7', { roles: ['captain'] }))).json());
    const memberId = added.members[0]!.id;
    const toBench = await call('PATCH', `/teams/${id}/members/${memberId}`, { kind: 'bench' });
    expect(toBench.json()).toEqual({ error: 'validation_failed', message: 'Bench staff have no number' });
    const stillCaptain = await call('PATCH', `/teams/${id}/members/${memberId}`, { kind: 'bench', number: null });
    expect(stillCaptain.json()).toEqual({
      error: 'validation_failed',
      message: "Captain isn't a role for bench staff",
    });
    const moved = await call('PATCH', `/teams/${id}/members/${memberId}`, {
      kind: 'bench',
      number: null,
      roles: ['bench-coach'],
    });
    expect(TeamSchema.parse(moved.json()).members[0]).toMatchObject({
      kind: 'bench',
      number: null,
      roles: ['bench-coach'],
    });
  });

  it("answers 404 for a member that isn't on that team", async () => {
    const { team, member, call } = await as();
    const a = await team({ name: 'A' });
    const b = await team({ name: 'B' });
    const onA = TeamSchema.parse((await member(a.id, skater('Jammy', '7'))).json()).members[0]!;
    expect((await call('PATCH', `/teams/${b.id}/members/${onA.id}`, { name: 'X' })).statusCode).toBe(404);
    expect((await call('DELETE', `/teams/${b.id}/members/${onA.id}`)).statusCode).toBe(404);
  });
});

describe('deleting', () => {
  it("removes a member's photo, and a team's logo and every photo, rows and files", async () => {
    const { team, member, call, db, mediaDir } = await as();
    const { id } = await team();
    const kept = TeamSchema.parse((await member(id, skater('Keeper', '1'))).json()).members[0]!;
    const gone = TeamSchema.parse((await member(id, skater('Leaver', '2'))).json()).members.find(
      (m) => m.name === 'Leaver',
    )!;
    const logo = saveMedia(db, mediaDir, IMAGES.png)!;
    const keptPhoto = saveMedia(db, mediaDir, IMAGES.jpeg)!;
    const gonePhoto = saveMedia(db, mediaDir, IMAGES.webp)!;
    db.update(teams).set({ logoMediaId: logo }).run();
    db.update(teamMembers).set({ photoMediaId: keptPhoto }).where(eq(teamMembers.id, kept.id)).run();
    db.update(teamMembers).set({ photoMediaId: gonePhoto }).where(eq(teamMembers.id, gone.id)).run();

    await call('DELETE', `/teams/${id}/members/${gone.id}`);
    expect(readdirSync(mediaDir).toSorted()).toEqual([logo, keptPhoto].toSorted());

    await call('DELETE', `/teams/${id}`);
    expect(readdirSync(mediaDir)).toEqual([]);
    expect(db.select().from(media).all()).toEqual([]);
    expect(db.select().from(teamMembers).all()).toEqual([]);
  });
});

describe('who may do what', () => {
  it('lets an Announcer look, and refuses every change', async () => {
    const { call, db } = await as('announcer');
    const now = new Date().toISOString();
    db.insert(teams).values({ id: 't1', name: 'All Stars', createdAt: now, updatedAt: now }).run();
    expect((await call('GET', '/teams')).statusCode).toBe(200);
    expect((await call('GET', '/teams/t1')).statusCode).toBe(200);
    for (const [method, url, payload] of [
      ['POST', '/teams', { name: 'Mine' }],
      ['PATCH', '/teams/t1', { name: 'Mine' }],
      ['DELETE', '/teams/t1'],
      ['POST', '/teams/t1/members', skater('Me', '1')],
    ] as const) {
      expect((await call(method, url, payload)).json(), `${method} ${url}`).toEqual({ error: 'forbidden' });
    }
  });

  it('lets an API key holding only teams.read look, and nothing more', async () => {
    const { app, db } = testApp();
    opened.push(app);
    const { key } = createApiKey(db, {
      name: 'Companion',
      permissions: ['core:teams.read'],
      expiresIn: 'never',
      createdBy: 'admin',
    });
    const headers = { authorization: `Bearer ${key}` };
    expect((await app.inject({ method: 'GET', url: '/api/core/teams', headers })).statusCode).toBe(200);
    const create = await app.inject({ method: 'POST', url: '/api/core/teams', headers, payload: { name: 'X' } });
    expect(create.json()).toEqual({ error: 'forbidden' });
  });
});
