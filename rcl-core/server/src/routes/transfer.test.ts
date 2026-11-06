import { existsSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import type { AppModule, TransferKind } from '@rollcall/app-sdk';
import {
  ImportPreviewSchema,
  ImportResultSchema,
  ManifestSchema,
  type ImportChoices,
  type ManifestItem,
  type Role,
  type TeamItem,
} from '@rollcall/core-contract';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession, revokeSession } from '../auth/sessions.ts';
import { fontFaces, media as mediaTable, teams } from '../db/schema.ts';
import { addFontFace, deleteFontFace, listFonts } from '../fonts/fonts.ts';
import type * as Media from '../media.ts';
import { fontTypeOf, saveMedia } from '../media.ts';
import { addMember, createTeam, deleteTeam, findTeam, listTeams, updateMember, updateTeam } from '../teams/teams.ts';
import { addUser, FONTS, IMAGES, longestStall, testApp } from '../testing.ts';
import { mediaPathFor, packZip, sha256 } from '../transfer/zip.ts';

// Lets a test change things while an import writes its media files: `onWrite` runs after each one is written.
const writing = vi.hoisted(() => ({ onWrite: undefined as (() => void) | undefined }));
vi.mock('../media.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof Media>();
  return {
    ...actual,
    writeMediaFile: async (...args: Parameters<typeof actual.writeMediaFile>) => {
      const id = await actual.writeMediaFile(...args);
      writing.onWrite?.();
      return id;
    },
  };
});

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  writing.onWrite = undefined;
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// A demo app with one kind, "demo:note", kept in memory: version 2, migrated from 1, able to be the default, needing a
// font family, failing to save a note named "boom", counting the imports it's told were committed or failed, and
// calling `onExport` each time it exports a note, for what core's own kinds don't show.
function demoApp(db: () => ReturnType<typeof testApp>['db']) {
  const notes: { id: string; name: string; text: string; isDefault: boolean; fontHere: boolean }[] = [];
  let afterImports = 0;
  let afterFailedImports = 0;
  const hooks = { onExport: () => {} };
  const NoteSchema = z.strictObject({
    name: z.string().min(1, 'Give the note a name'),
    text: z.string(),
    font: z.string().optional(),
  });
  const kind: TransferKind<z.infer<typeof NoteSchema>> = {
    name: 'demo:note',
    label: { one: 'Note', many: 'notes' },
    version: 2,
    // Version 1 called the text "body".
    migrations: {
      1: (data) => {
        const { body, ...rest } = data as { body: string };
        return { ...rest, text: body };
      },
    },
    exportPermission: 'demo:notes.manage',
    importPermission: 'demo:notes.manage',
    canBeDefault: true,
    list: () => notes.map(({ id, name }) => ({ id, name })),
    exportItem: (id) => {
      const note = notes.find((n) => n.id === id);
      hooks.onExport();
      return note && { name: note.name, data: { name: note.name, text: note.text } };
    },
    check(data) {
      const checked = NoteSchema.safeParse(data);
      return checked.success
        ? { ok: true, data: checked.data }
        : { ok: false, message: checked.error.issues[0]!.message };
    },
    nameOf: (data) => data.name,
    facts: (data) => [{ label: 'Text', value: data.text }],
    media: () => [],
    needs: (data) => (data.font ? [{ kind: 'core:font-face', key: data.font }] : []),
    wasDefault: (data) => data.name === 'Was default',
    match: (data) =>
      notes.some((n) => n.name === data.name)
        ? {
            status: 'conflict',
            targets: notes
              .filter((n) => n.name === data.name)
              .map((n) => ({ id: n.id, name: n.name, facts: [], updatedAt: null })),
          }
        : { status: 'new' },
    save(data, how, _mediaId, { makeDefault }) {
      if (data.name === 'boom') throw new Error('boom');
      if (makeDefault) for (const note of notes) note.isDefault = false;
      const fontHere = data.font === undefined || listFonts(db()).some((f) => f.name === data.font);
      notes.push({
        id: `n${notes.length + 1}`,
        name: how.as === 'copy' ? `${data.name} copy` : data.name,
        text: data.text,
        isDefault: makeDefault,
        fontHere,
      });
      return { name: notes.at(-1)!.name };
    },
    afterImport: () => void (afterImports += 1),
    afterFailedImport: () => void (afterFailedImports += 1),
  };
  const app: AppModule = {
    id: 'demo',
    title: 'Demo',
    version: '1.0.0',
    requiresCore: '*',
    permissions: [{ key: 'demo:notes.manage', summary: 'Manage notes', roles: [] }],
    transfer: () => [kind],
  };
  return { app, notes, hooks, afterImports: () => afterImports, afterFailedImports: () => afterFailedImports };
}

// An app with `role` signed in, and ways to export and import as them.
async function as(role: Role = 'admin', { demo = false } = {}) {
  let database: ReturnType<typeof testApp>['db'] | undefined;
  const notes = demoApp(() => database!);
  const { app, db, mediaDir } = testApp(demo ? { apps: [notes.app] } : {});
  database = db;
  opened.push(app);
  const user = await addUser(db, `${role}1`, 'correct horse', role);
  const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
  const exportOf = (query: string) => app.inject({ method: 'GET', url: `/api/core/transfer/export?${query}`, cookies });
  const send = (url: string, zip: Uint8Array | string, contentType = 'application/zip') =>
    app.inject({ method: 'POST', url, cookies, headers: { 'content-type': contentType }, payload: Buffer.from(zip) });
  const preview = async (zip: Uint8Array) => {
    const res = await send('/api/core/transfer/import/preview', zip);
    return { res, body: res.statusCode === 200 ? ImportPreviewSchema.parse(res.json()) : undefined };
  };
  const importFile = (zip: Uint8Array, choices: ImportChoices) =>
    send(`/api/core/transfer/import?choices=${encodeURIComponent(JSON.stringify(choices))}`, zip);
  const image = () => saveMedia(db, mediaDir, IMAGES.png)!;
  // All Stars, with a logo and a photographed captain.
  const allStars = (name = 'All Stars') => {
    const team = createTeam(db, {
      name,
      leagueName: 'Rose City Rollers',
      shortName: null,
      primaryColor: '#aa0000',
      secondaryColor: null,
    });
    updateTeam(db, team.id, { logoMediaId: image() });
    const added = addMember(db, team.id, {
      kind: 'skater',
      name: 'Jammy Dodger',
      number: '07',
      pronouns: null,
      roles: ['captain'],
      customRoles: [],
    });
    updateMember(db, team.id, added.members[0]!.id, { photoMediaId: image() });
    return team.id;
  };
  const uploadFont = (family: string, weight: number) =>
    addFontFace(db, {
      family,
      weightMin: weight,
      weightMax: weight,
      style: 'normal',
      mediaId: saveMedia(db, mediaDir, FONTS.woff2, fontTypeOf)!,
    });
  return { app, db, mediaDir, cookies, notes, exportOf, send, preview, importFile, allStars, uploadFont };
}

const LOGO = mediaPathFor(IMAGES.png, 'image/png');
const PHOTO = mediaPathFor(IMAGES.jpeg, 'image/jpeg');
const FONT = mediaPathFor(FONTS.woff2, 'font/woff2');
const TEAM: TeamItem = {
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  logo: LOGO,
  members: [{ kind: 'skater', name: 'Jammy Dodger', number: '07', roles: ['captain'], photo: PHOTO }],
};
const MEDIA = new Map([
  [LOGO, IMAGES.png],
  [PHOTO, IMAGES.jpeg],
  [FONT, FONTS.woff2],
]);

const MANIFEST = {
  format: 'rollcall-export',
  formatVersion: 1,
  exportedAt: '2026-10-26T12:00:00.000Z',
  apps: { core: '0.3.0' },
} as const;

// An export file holding `items`, with every media file the tests use unless told otherwise.
const fileOf = (items: ManifestItem[], { media = MEDIA }: { media?: ReadonlyMap<string, Uint8Array> } = {}) =>
  packZip({ ...MANIFEST, items }, media);
const team = (data: object = TEAM): ManifestItem => ({ kind: 'core:team', version: 1, data });
const note = (data: object, version = 2): ManifestItem => ({ kind: 'demo:note', version, data });
const face = (family: string, weight = '700'): ManifestItem => ({
  kind: 'core:font-face',
  version: 1,
  data: { family, weight, style: 'normal', file: FONT },
});
// A file's real first bytes, padded past 5 MB.
const padded = (bytes: Uint8Array) => {
  const big = new Uint8Array(5 * 1024 * 1024 + 1);
  big.set(bytes);
  return big;
};
// The manifest of an exported file.
const manifestOf = (body: Buffer) =>
  ManifestSchema.parse(JSON.parse(strFromU8(unzipSync(body)['rollcall-export.json']!)));
const choose = (file: string, ...items: ImportChoices['items']): ImportChoices => ({ file, items });
const CHANGED = {
  error: 'changed_since_preview',
  message: 'Something changed since you checked this file. Check it again.',
};
// The files in the media folder that have no row, which nothing can show: there should never be any once an import
// has answered.
const strays = (db: ReturnType<typeof testApp>['db'], mediaDir: string) => {
  const rows = new Set(
    db
      .select({ id: mediaTable.id })
      .from(mediaTable)
      .all()
      .map(({ id }) => id),
  );
  return existsSync(mediaDir) ? readdirSync(mediaDir).filter((file) => !rows.has(file)) : [];
};
// Five milliseconds, for racing against something slow.
const pause = () => new Promise<false>((resolve) => setTimeout(() => resolve(false), 5));
// An export file of 30 media files of 5 MB that nothing uses, compressed, so reading it means inflating 150 MB.
const bigFile = () =>
  zipSync({
    'rollcall-export.json': strToU8(JSON.stringify({ ...MANIFEST, items: [] })),
    ...Object.fromEntries(
      Array.from(
        { length: 30 },
        (_, n) => [`media/${n}.png`, [new Uint8Array(5 * 1024 * 1024), { level: 1 }]] as const,
      ),
    ),
  });

describe('the kinds of item', () => {
  it('lists those the caller may export or import, with counts, leaving out those that only travel with others', async () => {
    const admin = await as('admin', { demo: true });
    admin.allStars();
    const kinds = await admin.app.inject({ method: 'GET', url: '/api/core/transfer/kinds', cookies: admin.cookies });
    expect(kinds.json()).toEqual([
      { kind: 'core:team', one: 'Team', many: 'teams', count: 1, mayExport: true, mayImport: true },
      { kind: 'demo:note', one: 'Note', many: 'notes', count: 0, mayExport: true, mayImport: true },
    ]);
    const producer = await as('producer', { demo: true });
    const theirs = await producer.app.inject({
      method: 'GET',
      url: '/api/core/transfer/kinds',
      cookies: producer.cookies,
    });
    expect(theirs.json()).toEqual([
      { kind: 'core:team', one: 'Team', many: 'teams', count: 0, mayExport: true, mayImport: true },
    ]);
    const announcer = await as('announcer');
    const none = await announcer.app.inject({
      method: 'GET',
      url: '/api/core/transfer/kinds',
      cookies: announcer.cookies,
    });
    expect(none.json()).toEqual([]);
  });
});

describe('exporting', () => {
  it('exports a team with its logo and photos, as a download named after it', async () => {
    const { exportOf, allStars } = await as();
    const id = allStars();
    const res = await exportOf(`items=core:team:${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="rollcall-team-all-stars-\d{4}-\d\d-\d\d\.zip"$/,
    );
    const files = unzipSync(res.rawPayload);
    const manifest = manifestOf(res.rawPayload);
    expect(manifest).toMatchObject({ format: 'rollcall-export', formatVersion: 1, apps: { core: expect.any(String) } });
    expect(manifest.items).toEqual([
      { kind: 'core:team', version: 1, data: expect.objectContaining({ name: 'All Stars' }) },
    ]);
    const data = manifest.items[0]!.data as TeamItem;
    expect(Object.keys(files).toSorted()).toEqual(['rollcall-export.json', data.logo!].toSorted());
    expect(data.logo).toBe(data.members[0]!.photo);
  });

  it('exports every item of a kind, named after the kind', async () => {
    const { exportOf, allStars } = await as();
    allStars();
    allStars('B Team');
    const res = await exportOf('kinds=core:team');
    expect(res.headers['content-disposition']).toMatch(/filename="rollcall-teams-/);
    expect(
      manifestOf(res.rawPayload)
        .items.map((item) => (item.data as TeamItem).name)
        .toSorted(),
    ).toEqual(['All Stars', 'B Team']);
  });

  it('refuses an unknown item or kind, nothing at all, and fonts on their own', async () => {
    const { exportOf } = await as();
    expect((await exportOf('items=core:team:nope')).json()).toEqual({
      error: 'not_found',
      message: "There's no such team",
    });
    expect((await exportOf('kinds=demo:note')).json()).toEqual({
      error: 'not_found',
      message: 'Nothing here is a demo:note',
    });
    expect((await exportOf('kinds=core:team')).json()).toEqual({
      error: 'nothing_to_export',
      message: 'There’s nothing to export',
    });
    const fonts = await exportOf('kinds=core:font-face');
    expect([fonts.statusCode, fonts.json()]).toEqual([
      400,
      { error: 'bad_selection', message: 'Fonts travel only with what uses them' },
    ]);
    expect((await exportOf('items=nope')).json()).toMatchObject({ error: 'validation_failed' });
  });

  it('refuses a kind the caller may not export, naming it', async () => {
    const { exportOf, allStars } = await as('announcer');
    allStars();
    const res = await exportOf('kinds=core:team');
    expect([res.statusCode, res.json()]).toEqual([
      403,
      { error: 'forbidden', message: "Your account can't export teams" },
    ]);
  });

  it('exports items as they are once their files are read, with a file one took up meanwhile', async () => {
    const { db, mediaDir, notes, exportOf, allStars } = await as('admin', { demo: true });
    const id = allStars();
    notes.notes.push({ id: 'n1', name: 'Hello', text: '', isDefault: false, fontHere: true });
    // The team is exported first, then the note, which gives the team a new logo the first time it's exported.
    const webp = saveMedia(db, mediaDir, IMAGES.webp)!;
    let exported = 0;
    notes.hooks.onExport = () => {
      exported += 1;
      if (exported === 1) updateTeam(db, id, { logoMediaId: webp });
    };
    const res = await exportOf(`items=core:team:${id},demo:note:n1`);
    const logo = mediaPathFor(IMAGES.webp, 'image/webp');
    expect((manifestOf(res.rawPayload).items[0]!.data as TeamItem).logo).toBe(logo);
    expect(Object.keys(unzipSync(res.rawPayload)).toSorted()).toEqual(['rollcall-export.json', LOGO, logo].toSorted());
  });

  it('refuses the export if the caller loses access while its files are read', async () => {
    const { db, cookies, notes, exportOf, allStars } = await as('admin', { demo: true });
    const id = allStars();
    notes.notes.push({ id: 'n1', name: 'Hello', text: '', isDefault: false, fontHere: true });
    notes.hooks.onExport = () => revokeSession(db, cookies[SESSION_COOKIE]);
    const res = await exportOf(`items=core:team:${id},demo:note:n1`);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('builds a big file without holding up the server', async () => {
    const { app, db, mediaDir, cookies } = await as();
    // A team whose 30 skaters each have a photo of their own of 5 MB, the most one may be: 150 MB in all.
    const { id } = createTeam(db, {
      name: 'Big Team',
      leagueName: null,
      shortName: null,
      primaryColor: null,
      secondaryColor: null,
    });
    for (let n = 0; n < 30; n += 1) {
      const name = `Skater ${n}`;
      const { members } = addMember(db, id, {
        kind: 'skater',
        name,
        number: String(n),
        pronouns: null,
        roles: [],
        customRoles: [],
      });
      const photo = new Uint8Array(5 * 1024 * 1024).fill(n);
      photo.set(IMAGES.png);
      updateMember(db, id, members.find((member) => member.name === name)!.id, {
        photoMediaId: saveMedia(db, mediaDir, photo),
      });
    }
    // Downloaded over HTTP, a chunk at a time as a browser does: inject would copy the body and make a string of it.
    const url = await app.listen({ host: '127.0.0.1', port: 0 });
    let status = 0;
    const chunks: Uint8Array[] = [];
    const stall = await longestStall(async () => {
      const res = await fetch(`${url}/api/core/transfer/export?items=core:team:${id}`, {
        headers: { cookie: `${SESSION_COOKIE}=${cookies[SESSION_COOKIE]}` },
      });
      status = res.status;
      for await (const chunk of res.body!) chunks.push(chunk);
    });
    expect(status).toBe(200);
    expect(Object.keys(unzipSync(Buffer.concat(chunks)))).toHaveLength(31);
    // Reading and hashing 150 MB on the main thread holds it for about 70 ms, so the bar is lower than the zip's.
    expect(stall).toBeLessThan(40);
  });
});

describe('previewing an import', () => {
  it('says what each item is and what would happen to it, saving nothing', async () => {
    const { preview, allStars, db } = await as('admin', { demo: true });
    const here = allStars('ALL STARS');
    const { body } = await preview(
      fileOf([
        team(),
        team({ ...TEAM, name: 'B Team' }),
        { kind: 'core:screen', version: 1, data: { name: 'Bout intro' } },
        note({ name: 'Old', body: 'hi' }, 1),
      ]),
    );
    expect(body?.items.map((item) => [item.index, item.label, item.name, item.status, item.reason])).toEqual([
      [0, 'Team', 'All Stars', 'conflict', null],
      [1, 'Team', 'B Team', 'new', null],
      [2, 'Screen', 'Bout intro', 'cant', "Screens aren't known here yet"],
      [3, 'Note', 'Old', 'new', null],
    ]);
    expect(body?.items[0]?.conflicts).toEqual([
      {
        id: here,
        name: 'ALL STARS',
        facts: expect.arrayContaining([{ label: 'Skaters', value: '1' }]),
        updatedAt: expect.any(String),
      },
    ]);
    expect(body?.items[1]?.facts).toContainEqual({ label: 'League', value: 'Rose City Rollers' });
    expect(body?.items[3]?.facts).toEqual([{ label: 'Text', value: 'hi' }]);
    expect(listTeams(db)).toHaveLength(1);
  });

  it('marks items made by a newer Rollcall, and kinds the caller may not import, as can’t-import', async () => {
    const { preview } = await as('producer', { demo: true });
    const { body } = await preview(
      fileOf([note({ name: 'Future', text: '' }, 3), note({ name: 'Mine', text: '' }), face('Rollerball')]),
    );
    expect(body?.items.map((item) => [item.status, item.reason])).toEqual([
      ['cant', 'This file was made by a newer Rollcall. Update Rollcall to import it.'],
      ['cant', "Your account can't import notes"],
      ['cant', "Your account can't import fonts"],
    ]);
  });

  it('reuses an identical font face, never imports a bundled family’s, and links fonts to what needs them', async () => {
    const { preview, uploadFont } = await as('admin', { demo: true });
    uploadFont('Rollerball', 700);
    const { body } = await preview(
      fileOf([
        face('rollerball'),
        face('Oswald'),
        face('Jammer', '400'),
        note({ name: 'Uses Jammer', text: '', font: 'jammer' }),
      ]),
    );
    expect(body?.items.map((item) => [item.name, item.status, item.reason])).toEqual([
      ['rollerball 700', 'reused', 'Already here: the one here is used'],
      ['Oswald 700', 'cant', 'Oswald comes with Rollcall, so themes use that'],
      ['Jammer 400', 'new', null],
      ['Uses Jammer', 'new', null],
    ]);
    expect(body?.items[3]?.needs).toEqual([2]);
    expect(body?.items.map((item) => item.canBeDefault)).toEqual([false, false, false, true]);
  });

  it('can’t import a second font face the same as another in the file, whatever the family’s case', async () => {
    const { preview, importFile } = await as();
    const zip = fileOf([face('Rollerball'), face('rollerball')]);
    const { body } = await preview(zip);
    expect(body?.items.map((item) => [item.name, item.status, item.reason])).toEqual([
      ['Rollerball 700', 'new', null],
      ['rollerball 700', 'cant', 'Same name as item 1 of this file'],
    ]);
    const imported = await importFile(zip, choose(body!.file, { action: 'add' }, { action: 'skip' }));
    expect(imported.json()).toEqual({ added: 1, replaced: 0, keptBoth: 0, skipped: 1, copies: [] });
  });

  it('shortens an item’s name to 64 characters where it shows the name as the file gives it', async () => {
    const { preview } = await as();
    const broken = await preview(fileOf([team({ ...TEAM, name: 'A'.repeat(10_000) })]));
    const { message } = broken.res.json<{ message: string }>();
    expect(message.startsWith(`Item 1 (team “${'A'.repeat(63)}…”): `)).toBe(true);
    expect(message.length).toBeLessThan(200);
    const unknown = await preview(fileOf([{ kind: 'core:screen', version: 1, data: { name: 'B'.repeat(10_000) } }]));
    expect(unknown.body?.items[0]?.name).toBe(`${'B'.repeat(63)}…`);
  });

  it('refuses an image or font file over its kind’s 5 MB limit', async () => {
    const { preview } = await as();
    const bigLogo = padded(IMAGES.png);
    const bigFont = padded(FONTS.woff2);
    const logo = mediaPathFor(bigLogo, 'image/png');
    const file = mediaPathFor(bigFont, 'font/woff2');
    const refusal = async (item: ManifestItem, media: Map<string, Uint8Array>) =>
      (await preview(fileOf([item], { media }))).res.json<{ error: string; message: string }>();
    expect(await refusal(team({ ...TEAM, logo, members: [] }), new Map([[logo, bigLogo]]))).toEqual({
      error: 'bad_media',
      message: 'Item 1 (team “All Stars”): the logo is over 5 MB',
    });
    const font = { kind: 'core:font-face', version: 1, data: { family: 'Jammer', weight: '700', file } };
    expect(await refusal(font, new Map([[file, bigFont]]))).toEqual({
      error: 'bad_media',
      message: 'Item 1 (font “Jammer 700”): the font file is over 5 MB',
    });
  });

  it('refuses a file that isn’t an export, is newer, or holds a broken item or media file, saying where', async () => {
    const { send, preview } = await as();
    const refusal = async (zip: Uint8Array) => (await preview(zip)).res.json<{ error: string; message: string }>();
    expect(await refusal(new TextEncoder().encode('not a zip'))).toEqual({
      error: 'bad_file',
      message: "This isn't a Rollcall export file.",
    });
    // A formatVersion 2 file, written by hand since this Rollcall writes only 1.
    const newer = zipSync({
      'rollcall-export.json': strToU8(JSON.stringify({ format: 'rollcall-export', formatVersion: 2 })),
    });
    expect(await refusal(newer)).toEqual({
      error: 'newer_format',
      message: 'This file was made by a newer Rollcall. Update Rollcall to import it.',
    });
    expect((await preview(fileOf([]))).body?.items).toEqual([]);
    const twoSevens = { ...TEAM, members: [...TEAM.members, { kind: 'skater', name: 'Seven', number: '07' }] };
    expect(await refusal(fileOf([team(), team(twoSevens)]))).toEqual({
      error: 'invalid_item',
      message: 'Item 2 (team “All Stars”): Number 07 is used by two skaters',
    });
    expect(await refusal(fileOf([team()], { media: new Map([[PHOTO, IMAGES.jpeg]]) }))).toEqual({
      error: 'bad_media',
      message: 'Item 1 (team “All Stars”): the logo is missing from the file',
    });
    expect(
      await refusal(
        fileOf([team()], {
          media: new Map([
            [LOGO, IMAGES.png],
            [PHOTO, FONTS.woff2],
          ]),
        }),
      ),
    ).toEqual({
      error: 'bad_media',
      message: "Item 1 (team “All Stars”): the photo of Jammy Dodger isn't a PNG, JPEG or WebP image",
    });
    expect(await refusal(fileOf([face('Jammer')], { media: new Map([[FONT, IMAGES.png]]) }))).toEqual({
      error: 'bad_media',
      message: "Item 1 (font “Jammer 700”): the font file isn't a WOFF2, WOFF, TTF or OTF font",
    });
    const json = await send('/api/core/transfer/import/preview', '{}', 'application/json');
    expect([json.statusCode, json.json()]).toEqual([
      415,
      { error: 'unsupported_file', message: 'Send a Rollcall export file (.zip)' },
    ]);
  });
});

describe('importing', () => {
  it('round-trips: everything exported comes back with its media', async () => {
    const { db, mediaDir, exportOf, preview, importFile, allStars, app } = await as();
    const id = allStars();
    const zip = (await exportOf('kinds=core:team')).rawPayload;
    deleteTeam(db, id);
    const { body } = await preview(zip);
    const res = await importFile(zip, choose(body!.file, { action: 'add' }));
    expect(ImportResultSchema.parse(res.json())).toEqual({
      added: 1,
      replaced: 0,
      keptBoth: 0,
      skipped: 0,
      copies: [],
    });
    const [back] = listTeams(db);
    const restored = findTeam(db, back!.id)!;
    expect(restored).toMatchObject({ name: 'All Stars', leagueName: 'Rose City Rollers', primaryColor: '#aa0000' });
    expect(restored.members.map((member) => [member.name, member.number, member.roles])).toEqual([
      ['Jammy Dodger', '07', ['captain']],
    ]);
    const logo = await app.inject({ method: 'GET', url: restored.logoUrl! });
    expect([logo.statusCode, logo.headers['content-type']]).toEqual([200, 'image/png']);
    expect(existsSync(mediaDir) && readdirSync(mediaDir).length).toBeGreaterThan(0);
  });

  it('replaces in place, keeps both as a copy, or skips, as chosen for each conflict', async () => {
    const { db, mediaDir, preview, importFile, allStars } = await as();
    const replaced = allStars();
    allStars('B Team');
    allStars('C Team');
    const oldFiles = readdirSync(mediaDir);
    const zip = fileOf([
      team({ ...TEAM, leagueName: 'From the file' }),
      team({ ...TEAM, name: 'B Team' }),
      team({ ...TEAM, name: 'C Team' }),
    ]);
    const { body } = await preview(zip);
    const res = await importFile(
      zip,
      choose(body!.file, { action: 'replace', target: replaced }, { action: 'keep-both' }, { action: 'skip' }),
    );
    expect(res.json()).toEqual({ added: 0, replaced: 1, keptBoth: 1, skipped: 1, copies: ['B Team copy'] });
    expect(findTeam(db, replaced)).toMatchObject({ id: replaced, name: 'All Stars', leagueName: 'From the file' });
    expect(listTeams(db).map((t) => t.name)).toEqual(['All Stars', 'B Team', 'B Team copy', 'C Team']);
    // The replaced team's old logo and photo are gone; the others' are kept.
    expect(readdirSync(mediaDir).filter((file) => oldFiles.includes(file))).toHaveLength(oldFiles.length - 2);
  });

  it('replaces the team chosen when two here have the conflicting name', async () => {
    const { db, preview, importFile, allStars } = await as();
    const first = allStars();
    const second = allStars('all stars');
    // The first was changed longer ago.
    db.update(teams).set({ updatedAt: '2026-01-01T00:00:00.000Z' }).where(eq(teams.id, first)).run();
    const zip = fileOf([team({ ...TEAM, leagueName: 'New' })]);
    const { body } = await preview(zip);
    expect(body?.items[0]?.conflicts.map((c) => c.id)).toEqual([second, first]);
    await importFile(zip, choose(body!.file, { action: 'replace', target: first }));
    expect(findTeam(db, first)?.leagueName).toBe('New');
    expect(findTeam(db, second)?.leagueName).toBe('Rose City Rollers');
  });

  it('saves an item kept as a copy under its own name when nothing here has that name, fonts included', async () => {
    const { db, preview, importFile, allStars } = await as();
    const here = allStars();
    const zip = fileOf([team(), face('Jammer')]);
    const { body } = await preview(zip);
    expect(body?.items.map((item) => item.status)).toEqual(['conflict', 'new']);
    // The team here goes before the import, and a font face, which never conflicts, is sent as Keep both.
    deleteTeam(db, here);
    const res = await importFile(zip, choose(body!.file, { action: 'keep-both' }, { action: 'keep-both' }));
    expect(res.json()).toEqual({ added: 2, replaced: 0, keptBoth: 0, skipped: 0, copies: [] });
    expect(listTeams(db).map((t) => t.name)).toEqual(['All Stars']);
  });

  it('migrates old items, saves needs first, makes only the chosen item the default, then runs after-import', async () => {
    const { notes, preview, importFile } = await as('admin', { demo: true });
    const zip = fileOf([
      note({ name: 'Uses Jammer', text: 'x', font: 'Jammer' }),
      note({ name: 'Old', body: 'from v1' }, 1),
      face('Jammer', '400'),
    ]);
    const { body } = await preview(zip);
    const res = await importFile(zip, {
      ...choose(body!.file, { action: 'add' }, { action: 'add' }, { action: 'add' }),
      default: 1,
    });
    expect(res.json()).toMatchObject({ added: 3 });
    expect(notes.notes.map((n) => [n.name, n.text, n.isDefault, n.fontHere])).toEqual([
      ['Uses Jammer', 'x', false, true],
      ['Old', 'from v1', true, true],
    ]);
    expect(notes.afterImports()).toBe(1);
    expect(notes.afterFailedImports()).toBe(0);
  });

  it('makes nothing the default unless chosen, and only an item that can be', async () => {
    const { notes, preview, importFile } = await as('admin', { demo: true });
    const zip = fileOf([note({ name: 'Was default', text: '' }), face('Jammer', '400')]);
    const { body } = await preview(zip);
    expect(body?.items[0]?.wasDefault).toBe(true);
    const wrong = await importFile(zip, { ...choose(body!.file, { action: 'add' }, { action: 'add' }), default: 1 });
    expect([wrong.statusCode, wrong.json()]).toEqual([
      400,
      { error: 'bad_choices', message: 'Only a theme being imported can be made the default' },
    ]);
    await importFile(zip, choose(body!.file, { action: 'add' }, { action: 'add' }));
    expect(notes.notes.map((n) => n.isDefault)).toEqual([false]);
  });

  it('saves nothing, and leaves no files, when an item fails partway, and tells its kind', async () => {
    const { db, mediaDir, notes, preview, importFile, allStars } = await as('admin', { demo: true });
    allStars('Here already');
    const before = readdirSync(mediaDir);
    const zip = fileOf([team(), note({ name: 'boom', text: '' })]);
    const { body } = await preview(zip);
    const res = await importFile(zip, choose(body!.file, { action: 'add' }, { action: 'add' }));
    expect(res.statusCode).toBe(500);
    expect(listTeams(db).map((t) => t.name)).toEqual(['Here already']);
    expect(notes.notes).toEqual([]);
    expect(readdirSync(mediaDir).toSorted()).toEqual(before.toSorted());
    // The kind whose save threw is told too, so it can forget what it noted for afterImport.
    expect([notes.afterImports(), notes.afterFailedImports()]).toEqual([0, 1]);
  });

  it('saves nothing, and leaves no files, if the caller loses access while the files are written', async () => {
    const { db, mediaDir, cookies, preview, importFile } = await as();
    const zip = fileOf([team()]);
    const { body } = await preview(zip);
    writing.onWrite = () => revokeSession(db, cookies[SESSION_COOKIE]);
    const res = await importFile(zip, choose(body!.file, { action: 'add' }));
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
    expect(listTeams(db)).toEqual([]);
    expect(strays(db, mediaDir)).toEqual([]);
  });

  it('refuses the import as changed, saving nothing and leaving no files, if a team it replaces goes meanwhile', async () => {
    const { db, mediaDir, preview, importFile, allStars } = await as();
    const here = allStars();
    const zip = fileOf([team({ ...TEAM, leagueName: 'From the file' })]);
    const { body } = await preview(zip);
    writing.onWrite = () => {
      writing.onWrite = undefined;
      deleteTeam(db, here);
    };
    const res = await importFile(zip, choose(body!.file, { action: 'replace', target: here }));
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(CHANGED);
    expect(listTeams(db)).toEqual([]);
    expect(strays(db, mediaDir)).toEqual([]);
  });

  it('refuses the import as changed if an item comes to need a file it didn’t write, as a reused font went', async () => {
    const { db, mediaDir, preview, importFile, uploadFont } = await as();
    uploadFont('Jammer', 700);
    const zip = fileOf([team(), face('Jammer')]);
    const { body } = await preview(zip);
    expect(body?.items.map((item) => item.status)).toEqual(['new', 'reused']);
    writing.onWrite = () => {
      writing.onWrite = undefined;
      for (const { id } of db.select().from(fontFaces).all()) deleteFontFace(db, id);
    };
    const res = await importFile(zip, choose(body!.file, { action: 'add' }, { action: 'add' }));
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(CHANGED);
    expect(listTeams(db)).toEqual([]);
    expect(db.select().from(fontFaces).all()).toEqual([]);
    expect(strays(db, mediaDir)).toEqual([]);
  });

  it('deletes a file it wrote for an item that, by the time it’s saved, is reused instead', async () => {
    const { db, mediaDir, preview, importFile, uploadFont } = await as();
    const zip = fileOf([face('Jammer')]);
    const { body } = await preview(zip);
    writing.onWrite = () => {
      writing.onWrite = undefined;
      uploadFont('Jammer', 700);
    };
    const res = await importFile(zip, choose(body!.file, { action: 'add' }));
    expect(res.json()).toEqual({ added: 0, replaced: 0, keptBoth: 0, skipped: 1, copies: [] });
    expect(db.select().from(fontFaces).all()).toHaveLength(1);
    expect(strays(db, mediaDir)).toEqual([]);
  });

  it('refuses choices made for another file, or that no longer fit what’s here', async () => {
    const { db, preview, importFile, allStars } = await as();
    const doomed = allStars('B Team');
    const zip = fileOf([team(), team({ ...TEAM, name: 'B Team' })]);
    const { body } = await preview(zip);
    const changed = {
      error: 'changed_since_preview',
      message: 'Something changed since you checked this file. Check it again.',
    };
    const otherFile = await importFile(zip, choose('0'.repeat(64), { action: 'add' }, { action: 'skip' }));
    expect([otherFile.statusCode, otherFile.json()]).toEqual([409, changed]);
    allStars();
    expect((await importFile(zip, choose(body!.file, { action: 'add' }, { action: 'skip' }))).json()).toEqual(changed);
    deleteTeam(db, doomed);
    expect(
      (await importFile(zip, choose(body!.file, { action: 'skip' }, { action: 'replace', target: doomed }))).json(),
    ).toEqual(changed);
    expect((await importFile(zip, choose(body!.file, { action: 'skip' }))).json()).toEqual({
      error: 'bad_choices',
      message: 'Choose what happens to each item of the file',
    });
  });

  it('answers other requests while it reads a big file, none of them waiting long', async () => {
    const { app, cookies, importFile } = await as();
    const big = bigFile();
    const importing = importFile(big, choose(sha256(big)));
    const imported = importing.then(() => true);
    // Another request every 5 ms or so, until the import is answered: the longest gap between their answers.
    let answered = 0;
    let longest = 0;
    let last = performance.now();
    while (!(await Promise.race([imported, pause()]))) {
      const res = await app.inject({ method: 'GET', url: '/api/core/transfer/kinds', cookies });
      expect(res.statusCode).toBe(200);
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
      answered += 1;
    }
    expect((await importing).json()).toEqual({ added: 0, replaced: 0, keptBoth: 0, skipped: 0, copies: [] });
    expect(longest).toBeLessThan(100);
    expect(answered).toBeGreaterThan(1);
  });

  it('runs one export or import at a time, so one asked for meanwhile waits its turn', async () => {
    const { exportOf, importFile, allStars } = await as();
    const id = allStars();
    const big = bigFile();
    const finished: string[] = [];
    const importing = importFile(big, choose(sha256(big))).then(() => finished.push('import'));
    // The import is reading the file by now.
    await pause();
    await pause();
    const exporting = exportOf(`items=core:team:${id}`).then(() => finished.push('export'));
    await Promise.all([importing, exporting]);
    expect(finished).toEqual(['import', 'export']);
  });

  it('refuses to import an item that can’t be imported', async () => {
    const { preview, importFile } = await as();
    const zip = fileOf([{ kind: 'core:screen', version: 1, data: {} }]);
    const { body } = await preview(zip);
    expect((await importFile(zip, choose(body!.file, { action: 'add' }))).json()).toEqual({
      error: 'bad_choices',
      message: "Item 1 can't be imported",
    });
  });
});
