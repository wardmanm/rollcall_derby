import { existsSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, TeamSchema, type Role } from '@rollcall/core-contract';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { addUser, IMAGES, testApp } from '../testing.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// An app with a team that has one skater, and `role` signed in.
async function withTeam(role: Role = 'producer') {
  const { app, db, mediaDir } = testApp();
  opened.push(app);
  const user = await addUser(db, `${role}1`, 'correct horse', role);
  const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
  const producer = await addUser(db, 'setup', 'correct horse', 'producer');
  const setup = { [SESSION_COOKIE]: createSession(db, producer.id).token };
  const created = await app.inject({
    method: 'POST',
    url: '/api/core/teams',
    cookies: setup,
    payload: { name: 'All Stars' },
  });
  const teamId = TeamSchema.parse(created.json()).id;
  const added = await app.inject({
    method: 'POST',
    url: `/api/core/teams/${teamId}/members`,
    cookies: setup,
    payload: { kind: 'skater', name: 'Jammy', number: '7' },
  });
  const memberId = TeamSchema.parse(added.json()).members[0]!.id;
  const upload = (url: string, body: Buffer | string, contentType = 'image/png') =>
    app.inject({
      method: 'PUT',
      url: `/api/core${url}`,
      cookies,
      headers: { 'content-type': contentType },
      payload: body,
    });
  const remove = (url: string) => app.inject({ method: 'DELETE', url: `/api/core${url}`, cookies });
  const logo = `/teams/${teamId}/logo`;
  const photo = `/teams/${teamId}/members/${memberId}/photo`;
  return { app, mediaDir, cookies, teamId, memberId, upload, remove, logo, photo };
}

// A PNG padded out to `size` bytes.
const padded = (size: number) => Buffer.concat([IMAGES.png, Buffer.alloc(size - IMAGES.png.length)]);
const mediaIdOf = (url: string | null | undefined) => url?.replace('/media/', '');

describe('team logos', () => {
  it('sets a logo, serves it at its address, and replaces it, deleting the old file', async () => {
    const { app, upload, logo, mediaDir } = await withTeam();
    const first = TeamSchema.parse((await upload(logo, IMAGES.png)).json());
    expect(first.logoUrl).toMatch(/^\/media\/[0-9a-f]{32}$/);
    const served = await app.inject({ method: 'GET', url: first.logoUrl! });
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.rawPayload.equals(IMAGES.png)).toBe(true);

    const second = TeamSchema.parse((await upload(logo, IMAGES.webp, 'image/webp')).json());
    expect(second.logoUrl).not.toBe(first.logoUrl);
    expect(readdirSync(mediaDir)).toEqual([mediaIdOf(second.logoUrl)]);
    expect((await app.inject({ method: 'GET', url: first.logoUrl! })).statusCode).toBe(404);
  });

  it('removes a logo, file and all, and removing it again is fine', async () => {
    const { upload, remove, logo, mediaDir } = await withTeam();
    await upload(logo, IMAGES.jpeg, 'image/jpeg');
    const removed = await remove(logo);
    expect(TeamSchema.parse(removed.json()).logoUrl).toBeNull();
    expect(readdirSync(mediaDir)).toEqual([]);
    expect((await remove(logo)).statusCode).toBe(200);
  });

  it('answers 404 for a team that does not exist', async () => {
    const { upload, remove } = await withTeam();
    expect((await upload('/teams/no-such-team/logo', IMAGES.png)).statusCode).toBe(404);
    expect((await remove('/teams/no-such-team/logo')).statusCode).toBe(404);
  });
});

describe('member photos', () => {
  it('sets, replaces and removes a photo, leaving no old files behind', async () => {
    const { upload, remove, photo, mediaDir } = await withTeam();
    const first = TeamSchema.parse((await upload(photo, IMAGES.png)).json()).members[0]!;
    expect(first.photoUrl).toMatch(/^\/media\/[0-9a-f]{32}$/);
    const second = TeamSchema.parse((await upload(photo, IMAGES.jpeg, 'image/jpeg')).json()).members[0]!;
    expect(readdirSync(mediaDir)).toEqual([mediaIdOf(second.photoUrl)]);
    const removed = TeamSchema.parse((await remove(photo)).json()).members[0]!;
    expect(removed.photoUrl).toBeNull();
    expect(readdirSync(mediaDir)).toEqual([]);
  });

  it("answers 404 for a member that isn't on that team", async () => {
    const { upload, remove, teamId } = await withTeam();
    expect((await upload(`/teams/${teamId}/members/no-such-member/photo`, IMAGES.png)).statusCode).toBe(404);
    expect((await remove(`/teams/${teamId}/members/no-such-member/photo`)).statusCode).toBe(404);
  });
});

describe('what an upload may be', () => {
  it('keeps an image as the type its bytes show, whatever it was labelled', async () => {
    const { app, upload, logo } = await withTeam();
    const team = TeamSchema.parse((await upload(logo, IMAGES.jpeg, 'image/png')).json());
    expect((await app.inject({ method: 'GET', url: team.logoUrl! })).headers['content-type']).toBe('image/jpeg');
  });

  it('refuses anything that is not a PNG, JPEG or WebP, by its bytes or its type, saving nothing', async () => {
    const { upload, logo, mediaDir } = await withTeam();
    for (const [body, type] of [
      ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/png'],
      ['<!doctype html><script>alert(1)</script>', 'image/jpeg'],
      ['just text', 'image/webp'],
      [IMAGES.png, 'image/gif'],
      [IMAGES.png, 'image/svg+xml'],
      [IMAGES.png, 'application/octet-stream'],
      ['{}', 'application/json'],
    ] as const) {
      const res = await upload(logo, body, type);
      expect(res.statusCode, type).toBe(415);
      expect(res.json(), type).toEqual({ error: 'unsupported_image', message: 'Use a PNG, JPEG or WebP image' });
    }
    // Nothing was ever saved, so the media folder was never made.
    expect(existsSync(mediaDir)).toBe(false);
  });

  it('accepts an image of exactly 5 MB and refuses one a byte over', async () => {
    const { upload, logo } = await withTeam();
    expect((await upload(logo, padded(MAX_IMAGE_BYTES))).statusCode).toBe(200);
    const tooBig = await upload(logo, padded(MAX_IMAGE_BYTES + 1));
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json()).toEqual({ error: 'too_large', message: 'That image is over 5 MB' });
  });
});

describe('who may upload', () => {
  it('refuses an Announcer, and anyone not signed in', async () => {
    const { app, upload, remove, logo, photo } = await withTeam('announcer');
    expect((await upload(logo, IMAGES.png)).json()).toEqual({ error: 'forbidden' });
    expect((await remove(photo)).json()).toEqual({ error: 'forbidden' });
    const anonymous = await app.inject({
      method: 'PUT',
      url: `/api/core${logo}`,
      headers: { 'content-type': 'image/png' },
      payload: IMAGES.png,
    });
    expect(anonymous.json()).toEqual({ error: 'unauthenticated' });
  });

  it("refuses a caller before reading the upload, so a refused caller can't learn what a valid body is", async () => {
    const { app, upload, logo } = await withTeam('announcer');
    for (const [body, type] of [
      [padded(MAX_IMAGE_BYTES + 1), 'image/png'],
      ['<svg/>', 'image/svg+xml'],
      ['{not json', 'application/json'],
    ] as const) {
      expect((await upload(logo, body, type)).json(), type).toEqual({ error: 'forbidden' });
      const anonymous = await app.inject({
        method: 'PUT',
        url: `/api/core${logo}`,
        headers: { 'content-type': type },
        payload: body,
      });
      expect(anonymous.json(), type).toEqual({ error: 'unauthenticated' });
    }
  });
});
