import { afterEach, describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { FontFamilySchema, ImportPreviewSchema, ManifestSchema, type Role } from '@rollcall/core-contract';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { INSTALLED_APPS } from '../installed-apps.ts';
import { addUser, CORE_VERSION, FONTS, testApp } from '../testing.ts';

// Themes travel in export files through the Producer app's kind, which core hosts like any other (ADR-0024). Core's
// server doesn't depend on the Producer app's contract, so a theme here is just the fields these tests read.
interface Theme {
  id: string;
  name: string;
  isDefault: boolean;
  tokens: { fonts: { heading: { family: string; weight: number } } & Record<string, unknown> } & Record<
    string,
    unknown
  >;
}

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

// The installed apps, with ways to call routes as an Admin or a Producer.
async function installed() {
  const { app, db } = testApp({ version: CORE_VERSION, apps: INSTALLED_APPS });
  opened.push(app);
  const cookiesOf = async (role: Role) => {
    const user = await addUser(db, `${role}1`, 'correct horse', role);
    return { [SESSION_COOKIE]: createSession(db, user.id).token };
  };
  const admin = await cookiesOf('admin');
  const producer = await cookiesOf('producer');
  const call = (
    cookies: Record<string, string>,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) => app.inject({ method, url, cookies, ...(payload ? { payload } : {}) });
  // A file as the body, as uploads and the Import dialog send them.
  const send = (cookies: Record<string, string>, url: string, body: Uint8Array, type = 'application/zip') =>
    app.inject({ method: 'POST', url, cookies, headers: { 'content-type': type }, payload: Buffer.from(body) });
  return { admin, producer, call, send };
}

describe('themes in export files', () => {
  it('travel with their uploaded fonts, are imported by Admins only, and become the default only when chosen', async () => {
    const { admin, producer, call, send } = await installed();
    await send(admin, '/api/core/fonts/faces?family=Rollerball&weight=700', FONTS.woff2, 'font/woff2');
    const theme = (await call(admin, 'POST', '/api/producer/themes', { name: 'Derby Night' })).json<Theme>();
    const tokens = {
      ...theme.tokens,
      fonts: { ...theme.tokens.fonts, heading: { family: 'Rollerball', weight: 700 } },
    };
    await call(admin, 'PATCH', `/api/producer/themes/${theme.id}`, { tokens });
    await call(admin, 'PUT', '/api/producer/default-theme', { themeId: theme.id });

    // A Producer may export themes, their fonts included.
    const exported = await call(producer, 'GET', `/api/core/transfer/export?items=producer:theme:${theme.id}`);
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toMatch(/filename="rollcall-theme-derby-night-/);
    const files = unzipSync(exported.rawPayload);
    const manifest = ManifestSchema.parse(JSON.parse(strFromU8(files['rollcall-export.json']!)));
    expect(manifest.items.map((item) => item.kind)).toEqual(['producer:theme', 'core:font-face']);
    expect(Object.keys(files).filter((name) => name.endsWith('.woff2'))).toHaveLength(1);
    const zip = exported.rawPayload;

    // Only an Admin may import them.
    const asProducer = ImportPreviewSchema.parse(
      (await send(producer, '/api/core/transfer/import/preview', zip)).json(),
    );
    expect(asProducer.items.map((item) => [item.label, item.status, item.reason])).toEqual([
      ['Theme', 'cant', "Your account can't import themes"],
      ['Font', 'cant', "Your account can't import fonts"],
    ]);

    // Gone, then back, with no default until one is chosen.
    await call(admin, 'DELETE', `/api/producer/themes/${theme.id}`);
    const before = FontFamilySchema.array().parse((await call(admin, 'GET', '/api/core/fonts')).json());
    const face = before.find((family) => family.name === 'Rollerball')?.faces[0];
    await call(admin, 'DELETE', `/api/core/fonts/faces/${face?.id}`);
    const preview = ImportPreviewSchema.parse((await send(admin, '/api/core/transfer/import/preview', zip)).json());
    expect(
      preview.items.map((item) => [item.name, item.status, item.needs, item.wasDefault, item.canBeDefault]),
    ).toEqual([
      ['Derby Night', 'new', [1], true, true],
      ['Rollerball 700', 'new', [], false, false],
    ]);
    const choices = { file: preview.file, items: [{ action: 'add' }, { action: 'add' }] };
    const imported = await send(
      admin,
      `/api/core/transfer/import?choices=${encodeURIComponent(JSON.stringify(choices))}`,
      zip,
    );
    expect(imported.json()).toEqual({ added: 2, replaced: 0, keptBoth: 0, skipped: 0, copies: [] });
    const themes = (await call(admin, 'GET', '/api/producer/themes')).json<Theme[]>();
    expect(themes.map((t) => [t.name, t.tokens.fonts.heading.family, t.isDefault])).toEqual([
      ['Derby Night', 'Rollerball', false],
    ]);
    const after = FontFamilySchema.array().parse((await call(admin, 'GET', '/api/core/fonts')).json());
    expect(after.find((family) => family.name === 'Rollerball')?.faces).toHaveLength(1);

    // Imported again as a copy, made the default.
    const again = ImportPreviewSchema.parse((await send(admin, '/api/core/transfer/import/preview', zip)).json());
    expect(again.items.map((item) => item.status)).toEqual(['conflict', 'reused']);
    const copy = { file: again.file, items: [{ action: 'keep-both' }, { action: 'add' }], default: 0 };
    await send(admin, `/api/core/transfer/import?choices=${encodeURIComponent(JSON.stringify(copy))}`, zip);
    const now = (await call(admin, 'GET', '/api/producer/themes')).json<Theme[]>();
    expect(now.map((t) => [t.name, t.isDefault])).toEqual([
      ['Derby Night', false],
      ['Derby Night copy', true],
    ]);
  });

  it('keep a copy’s name clear of the themes the same file adds', async () => {
    const { admin, call, send } = await installed();
    await call(admin, 'POST', '/api/producer/themes', { name: 'Derby Night' });
    const copy = (await call(admin, 'POST', '/api/producer/themes', { name: 'Derby Night copy' })).json<Theme>();
    const zip = (await call(admin, 'GET', '/api/core/transfer/export?kinds=producer:theme')).rawPayload;
    await call(admin, 'DELETE', `/api/producer/themes/${copy.id}`);

    // The file's Derby Night is kept as a copy, as the dialog first suggests, and its Derby Night copy is new.
    const preview = ImportPreviewSchema.parse((await send(admin, '/api/core/transfer/import/preview', zip)).json());
    expect(preview.items.map((item) => [item.name, item.status])).toEqual([
      ['Derby Night', 'conflict'],
      ['Derby Night copy', 'new'],
    ]);
    const choices = { file: preview.file, items: [{ action: 'keep-both' }, { action: 'add' }] };
    const imported = await send(
      admin,
      `/api/core/transfer/import?choices=${encodeURIComponent(JSON.stringify(choices))}`,
      zip,
    );
    expect(imported.json()).toEqual({ added: 1, replaced: 0, keptBoth: 1, skipped: 0, copies: ['Derby Night copy 2'] });
    const themes = (await call(admin, 'GET', '/api/producer/themes')).json<Theme[]>();
    expect(themes.map((t) => t.name)).toEqual(['Derby Night', 'Derby Night copy', 'Derby Night copy 2']);
  });

  it('can’t share a name within one file: the second can’t be imported', async () => {
    const { admin, call, send } = await installed();
    const theme = (await call(admin, 'POST', '/api/producer/themes', { name: 'Derby Night' })).json<Theme>();
    const exported = await call(admin, 'GET', `/api/core/transfer/export?items=producer:theme:${theme.id}`);
    const manifest = ManifestSchema.parse(
      JSON.parse(strFromU8(unzipSync(exported.rawPayload)['rollcall-export.json']!)),
    );
    // A file put together by hand, holding the theme twice.
    const twice = { ...manifest, items: [...manifest.items, ...manifest.items] };
    const zip = zipSync({ 'rollcall-export.json': strToU8(JSON.stringify(twice)) });
    await call(admin, 'DELETE', `/api/producer/themes/${theme.id}`);

    const preview = ImportPreviewSchema.parse((await send(admin, '/api/core/transfer/import/preview', zip)).json());
    expect(preview.items.map((item) => [item.name, item.status, item.reason, item.canBeDefault])).toEqual([
      ['Derby Night', 'new', null, true],
      ['Derby Night', 'cant', 'Same name as item 1 of this file', false],
    ]);
    const choices = { file: preview.file, items: [{ action: 'add' }, { action: 'skip' }] };
    const imported = await send(
      admin,
      `/api/core/transfer/import?choices=${encodeURIComponent(JSON.stringify(choices))}`,
      zip,
    );
    expect(imported.json()).toEqual({ added: 1, replaced: 0, keptBoth: 0, skipped: 1, copies: [] });
  });
});
