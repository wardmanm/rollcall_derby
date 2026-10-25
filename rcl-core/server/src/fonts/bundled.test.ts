import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FontFamilySchema } from '@rollcall/core-contract';
import { addUser, testApp } from '../testing.ts';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { BUNDLED_FAMILIES, BUNDLED_FONTS_DIR } from './bundled.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
function fresh() {
  const made = testApp();
  opened.push(made.app);
  return made;
}

describe('the bundled fonts', () => {
  it('are the six families, each face a file that is really there, with its licence beside it', () => {
    expect(BUNDLED_FAMILIES.map((f) => f.name)).toEqual([
      'Anton',
      'Barlow Condensed',
      'Bebas Neue',
      'Inter',
      'Oswald',
      'Roboto Condensed',
    ]);
    for (const family of BUNDLED_FAMILIES) {
      expect(FontFamilySchema.parse(family)).toEqual(family);
      for (const face of family.faces) {
        const file = join(BUNDLED_FONTS_DIR, face.url.replace('/fonts/', ''));
        expect(readFileSync(file).subarray(0, 4).toString('hex'), face.url).toBe('00010000');
      }
    }
    for (const folder of readdirSync(BUNDLED_FONTS_DIR)) {
      expect(existsSync(join(BUNDLED_FONTS_DIR, folder, 'OFL.txt')), folder).toBe(true);
    }
  });
});

describe('GET /fonts/:folder/:file', () => {
  it('serves each bundled face to anyone, cached for good', async () => {
    const { app } = fresh();
    for (const face of BUNDLED_FAMILIES.flatMap((family) => family.faces)) {
      const res = await app.inject({ method: 'GET', url: face.url });
      expect(res.statusCode, face.url).toBe(200);
      expect(res.headers).toMatchObject({
        'content-type': 'font/ttf',
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      expect(res.rawPayload.subarray(0, 4).toString('hex'), face.url).toBe('00010000');
    }
  });

  it('answers 404 for anything that is not a bundled face, even a file that is there', async () => {
    const { app } = fresh();
    for (const url of [
      '/fonts/inter/OFL.txt',
      '/fonts/inter/nope.ttf',
      '/fonts/..%2Fpackage.json/x',
      '/fonts/inter',
      '/fonts/',
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
  });
});

describe('GET /api/core/fonts', () => {
  it('lists the bundled families for anyone who may read fonts', async () => {
    const { app, db } = fresh();
    for (const role of ['admin', 'producer', 'announcer'] as const) {
      const user = await addUser(db, `${role}1`, 'correct horse', role);
      const cookies = { [SESSION_COOKIE]: createSession(db, user.id).token };
      const res = await app.inject({ method: 'GET', url: '/api/core/fonts', cookies });
      expect(res.statusCode, role).toBe(200);
      expect(FontFamilySchema.array().parse(res.json()), role).toEqual(BUNDLED_FAMILIES);
    }
  });
});
