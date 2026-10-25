import { existsSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppContext, AppModule } from '@rollcall/app-sdk';
import { type FontFamily, FontFamilySchema, MAX_FONT_BYTES, type Role } from '@rollcall/core-contract';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { BUNDLED_FAMILIES } from '../fonts/bundled.ts';
import { addUser, FONTS, IMAGES, testApp } from '../testing.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// An app with `role` signed in, and ways to upload, remove and list fonts as them.
async function as(role: Role = 'admin', options: Parameters<typeof testApp>[0] = {}) {
  const { app, db, mediaDir } = testApp(options);
  opened.push(app);
  const user = await addUser(db, `${role}1`, 'correct horse', role);
  const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
  const upload = (query: string, body: Buffer | string, contentType = 'font/woff2') =>
    app.inject({
      method: 'POST',
      url: `/api/core/fonts/faces?${query}`,
      cookies,
      headers: { 'content-type': contentType },
      payload: body,
    });
  const remove = (id: string) => app.inject({ method: 'DELETE', url: `/api/core/fonts/faces/${id}`, cookies });
  const list = async () =>
    FontFamilySchema.array().parse((await app.inject({ method: 'GET', url: '/api/core/fonts', cookies })).json());
  return { app, mediaDir, upload, remove, list };
}

const uploaded = (families: FontFamily[]) => families.filter((family) => !family.bundled);
const padded = (size: number) => Buffer.concat([FONTS.woff2, Buffer.alloc(size - FONTS.woff2.length)]);

describe('uploading a font face', () => {
  it('adds it to its family, served at its media address, after the bundled families', async () => {
    const { app, upload, list } = await as();
    const res = await upload('family=Rollerball&weight=700', FONTS.woff2);
    expect(res.statusCode).toBe(201);
    const family = FontFamilySchema.parse(res.json());
    expect(family).toEqual({
      name: 'Rollerball',
      bundled: false,
      faces: [
        {
          id: expect.any(String),
          weightMin: 700,
          weightMax: 700,
          style: 'normal',
          format: 'font/woff2',
          url: expect.stringMatching(/^\/media\/[0-9a-f]{32}$/),
        },
      ],
    });
    const served = await app.inject({ method: 'GET', url: family.faces[0]!.url });
    expect(served.headers['content-type']).toBe('font/woff2');
    expect((await list()).slice(0, BUNDLED_FAMILIES.length)).toEqual(BUNDLED_FAMILIES);
    expect(uploaded(await list())).toEqual([family]);
  });

  it('accepts each font type by its bytes, a weight range for a variable font, and italics', async () => {
    const { upload, list } = await as();
    expect((await upload('family=Rollerball&weight=400', FONTS.woff, 'font/woff')).statusCode).toBe(201);
    expect((await upload('family=Rollerball&weight=400&style=italic', FONTS.otf, 'font/otf')).statusCode).toBe(201);
    expect((await upload('family=Jammer Sans&weight=100-900', FONTS.ttf, 'font/ttf')).statusCode).toBe(201);
    expect((await upload('family=Apple Old&weight=400', FONTS.appleTtf, 'font/ttf')).statusCode).toBe(201);
    const families = uploaded(await list());
    expect(families.map((f) => f.name)).toEqual(['Apple Old', 'Jammer Sans', 'Rollerball']);
    expect(families[1]!.faces[0]).toMatchObject({ weightMin: 100, weightMax: 900, format: 'font/ttf' });
    expect(families[2]!.faces.map((f) => [f.weightMin, f.style, f.format])).toEqual([
      [400, 'italic', 'font/otf'],
      [400, 'normal', 'font/woff'],
    ]);
  });

  it('keeps the first spelling of a family whose name differs only in case', async () => {
    const { upload, list } = await as();
    await upload('family=Rollerball&weight=400', FONTS.woff2);
    const bold = await upload('family=ROLLERBALL&weight=700', FONTS.woff2);
    expect(FontFamilySchema.parse(bold.json()).name).toBe('Rollerball');
    expect(uploaded(await list()).map((f) => [f.name, f.faces.length])).toEqual([['Rollerball', 2]]);
  });

  it('refuses a face its family already has, and a bundled family’s name', async () => {
    const { upload } = await as();
    await upload('family=Rollerball&weight=700', FONTS.woff2);
    const again = await upload('family=rollerball&weight=700', FONTS.otf, 'font/otf');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'face_taken', message: 'Rollerball already has a 700 normal face' });
    const bundled = await upload('family=oswald&weight=900', FONTS.woff2);
    expect(bundled.statusCode).toBe(409);
    expect(bundled.json()).toEqual({
      error: 'family_bundled',
      message: 'Oswald comes with Rollcall. Upload yours under another family name.',
    });
  });

  it('refuses anything that is not a font, by its bytes or its type, saving nothing', async () => {
    const { upload, mediaDir } = await as();
    for (const [body, type] of [
      [IMAGES.png, 'font/woff2'],
      ['<svg/>', 'font/ttf'],
      [FONTS.woff2, 'image/png'],
      [FONTS.woff2, 'application/octet-stream'],
      ['{}', 'application/json'],
    ] as const) {
      const res = await upload('family=Rollerball&weight=400', body, type);
      expect(res.statusCode, type).toBe(415);
      expect(res.json(), type).toEqual({ error: 'unsupported_font', message: 'Use a WOFF2, WOFF, TTF or OTF font' });
    }
    expect(existsSync(mediaDir)).toBe(false);
  });

  it('accepts a font of exactly 5 MB and refuses one a byte over', async () => {
    const { upload } = await as();
    expect((await upload('family=Big&weight=400', padded(MAX_FONT_BYTES))).statusCode).toBe(201);
    const tooBig = await upload('family=Bigger&weight=400', padded(MAX_FONT_BYTES + 1));
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json()).toEqual({ error: 'too_large', message: 'That font is over 5 MB' });
  });

  it('refuses a bad family, weight or style, in plain words', async () => {
    const { upload } = await as();
    const res = await upload('family=Bad;Name&weight=400', FONTS.woff2);
    expect(res.json()).toEqual({
      error: 'validation_failed',
      message: 'Use 1–64 letters, digits, spaces, dashes or underscores',
    });
    expect((await upload('family=R&weight=900-100', FONTS.woff2)).json()).toMatchObject({ error: 'validation_failed' });
  });
});

describe('removing a font face', () => {
  it('deletes it with its file, and its family goes once it has no faces', async () => {
    const { upload, remove, list, mediaDir } = await as();
    const family = FontFamilySchema.parse((await upload('family=Rollerball&weight=700', FONTS.woff2)).json());
    expect((await remove(family.faces[0]!.id)).statusCode).toBe(204);
    expect(uploaded(await list())).toEqual([]);
    expect(readdirSync(mediaDir)).toEqual([]);
  });

  it('answers 404 for a bundled face or one that does not exist', async () => {
    const { remove } = await as();
    expect((await remove('bundled-oswald')).statusCode).toBe(404);
    expect((await remove('no-such-face')).json()).toEqual({ error: 'not_found' });
  });
});

describe('who may do what', () => {
  it('lets Producers and Announcers list fonts, and refuses them every change before reading the upload', async () => {
    for (const role of ['producer', 'announcer'] as const) {
      const { upload, remove, list } = await as(role);
      expect((await list()).length, role).toBe(BUNDLED_FAMILIES.length);
      expect((await upload('family=Mine&weight=400', padded(MAX_FONT_BYTES + 1))).json(), role).toEqual({
        error: 'forbidden',
      });
      expect((await remove('anything')).json(), role).toEqual({ error: 'forbidden' });
    }
  });
});

describe('fonts for apps', () => {
  it('gives an app module the same list as GET /fonts, as it is now', async () => {
    let fonts: AppContext['fonts'] | undefined;
    const demo: AppModule = {
      id: 'demo',
      title: 'Demo',
      version: '1.0.0',
      requiresCore: '*',
      permissions: [],
      register: (_api, ctx) => {
        fonts = ctx.fonts;
      },
    };
    const { upload, list } = await as('admin', { apps: [demo] });
    await upload('family=Rollerball&weight=700', FONTS.woff2);
    expect(uploaded(fonts?.list() ?? [])).toHaveLength(1);
    expect(fonts?.list()).toEqual(await list());
  });
});
