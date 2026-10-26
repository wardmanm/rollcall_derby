import { existsSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
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
import { createSession } from '../auth/sessions.ts';
import { teams } from '../db/schema.ts';
import { addFontFace, listFonts } from '../fonts/fonts.ts';
import { fontTypeOf, saveMedia } from '../media.ts';
import { addMember, createTeam, deleteTeam, findTeam, listTeams, updateMember, updateTeam } from '../teams/teams.ts';
import { addUser, FONTS, IMAGES, testApp } from '../testing.ts';
import { mediaPathFor, packExport } from '../transfer/zip.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// A demo app with one kind, "demo:note", kept in memory: version 2, migrated from 1, able to be the default, needing a
// font family, and failing to save a note named "boom", for what core's own kinds don't show.
function demoApp(db: () => ReturnType<typeof testApp>['db']) {
  const notes: { id: string; name: string; text: string; isDefault: boolean; fontHere: boolean }[] = [];
  let afterImports = 0;
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
  };
  const app: AppModule = {
    id: 'demo',
    title: 'Demo',
    version: '1.0.0',
    requiresCore: '*',
    permissions: [{ key: 'demo:notes.manage', summary: 'Manage notes', roles: [] }],
    transfer: () => [kind],
  };
  return { app, notes, afterImports: () => afterImports };
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

// An export file holding `items`, with every media file the tests use unless told otherwise.
const fileOf = (items: ManifestItem[], { media = MEDIA } = {}) =>
  packExport(
    {
      format: 'rollcall-export',
      formatVersion: 1,
      exportedAt: '2026-10-26T12:00:00.000Z',
      apps: { core: '0.3.0' },
      items,
    },
    media,
  );
const team = (data: object = TEAM): ManifestItem => ({ kind: 'core:team', version: 1, data });
const note = (data: object, version = 2): ManifestItem => ({ kind: 'demo:note', version, data });
const face = (family: string, weight = '700'): ManifestItem => ({
  kind: 'core:font-face',
  version: 1,
  data: { family, weight, style: 'normal', file: FONT },
});
// The manifest of an exported file.
const manifestOf = (body: Buffer) =>
  ManifestSchema.parse(JSON.parse(strFromU8(unzipSync(body)['rollcall-export.json']!)));
const choose = (file: string, ...items: ImportChoices['items']): ImportChoices => ({ file, items });

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

  it('saves nothing, and leaves no files, when an item fails partway', async () => {
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
