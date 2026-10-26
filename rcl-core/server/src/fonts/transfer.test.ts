import { afterEach, describe, expect, it } from 'vitest';
import { fontTypeOf, saveMedia } from '../media.ts';
import { FONTS, testApp } from '../testing.ts';
import { addFontFace, listFonts } from './fonts.ts';
import { fontFaceKind } from './transfer.ts';

const opened: ReturnType<typeof testApp>['app'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

const mediaPath = (id: string) => `media/${id}${id}.woff2`;
const FILE = `media/${'f'.repeat(64)}.woff2`;

function setup() {
  const { app, db, mediaDir } = testApp();
  opened.push(app);
  const kind = fontFaceKind({ db });
  const upload = (family: string, weightMin: number, weightMax = weightMin, style: 'normal' | 'italic' = 'normal') => {
    const mediaId = saveMedia(db, mediaDir, FONTS.woff2, fontTypeOf)!;
    addFontFace(db, { family, weightMin, weightMax, style, mediaId });
    return mediaId;
  };
  const checked = (data: unknown) => {
    const result = kind.check(data);
    if (!result.ok) throw new Error(result.message);
    return result.data;
  };
  const fontFile = () => saveMedia(db, mediaDir, FONTS.woff2, fontTypeOf)!;
  return { db, kind, upload, checked, fontFile };
}

describe('the core:font-face kind', () => {
  it('exports a family’s uploaded faces as another item’s need, and nothing for a bundled family', () => {
    const { kind, upload } = setup();
    const bold = upload('Rollerball', 700);
    upload('Rollerball', 400, 400, 'italic');
    upload('Jammer', 400);
    const faces = kind.exportNeed?.('rollerball', mediaPath) ?? [];
    expect(faces.map((face) => face.name)).toEqual(['Rollerball 700', 'Rollerball 400 italic']);
    expect(faces[0]?.data).toEqual({ family: 'Rollerball', weight: '700', style: 'normal', file: mediaPath(bold) });
    expect(kind.exportNeed?.('Oswald', mediaPath)).toEqual([]);
    expect(kind.onlyAsNeed).toBe(true);
  });

  it('reads a face as an upload does, and names it, its family and its file', () => {
    const { kind, checked } = setup();
    const data = checked({ family: 'Rollerball', weight: '100-900', style: 'italic', file: FILE });
    expect(kind.nameOf(data)).toBe('Rollerball 100–900 italic');
    expect(kind.needKey?.(data)).toBe('Rollerball');
    expect(kind.facts(data)).toEqual([
      { label: 'Family', value: 'Rollerball' },
      { label: 'Weights', value: '100-900' },
      { label: 'Style', value: 'italic' },
    ]);
    expect(kind.media(data)).toEqual([{ path: FILE, type: 'font', what: 'the font file' }]);
    expect(kind.check({ family: 'Bad"; }', weight: '400', file: FILE })).toMatchObject({ ok: false });
  });

  it('reuses an identical face here, never imports a bundled family’s, and is otherwise new', () => {
    const { kind, upload, checked } = setup();
    upload('Rollerball', 700);
    const face = (family: string, weight = '700') => kind.match(checked({ family, weight, file: FILE }));
    expect(face('ROLLERBALL')).toEqual({ status: 'reused', reason: 'Already here: the one here is used' });
    expect(face('oswald')).toEqual({ status: 'cant', reason: 'Oswald comes with Rollcall, so themes use that' });
    expect(face('Rollerball', '400')).toEqual({ status: 'new' });
  });

  it('adds a face to the family here whose name differs only in case', () => {
    const { db, kind, upload, checked, fontFile } = setup();
    upload('Rollerball', 700);
    const data = checked({ family: 'rollerball', weight: '400', file: FILE });
    const file = fontFile();
    expect(kind.save(data, { as: 'new' }, () => file, { makeDefault: false })).toEqual({ name: 'Rollerball 400' });
    const family = listFonts(db).find((f) => f.name === 'Rollerball');
    expect(family?.faces.map((f) => [f.weightMin, f.url])).toEqual([
      [400, `/media/${file}`],
      [700, expect.stringMatching(/^\/media\//)],
    ]);
    expect(() => kind.save(data, { as: 'copy' }, () => 'x', { makeDefault: false })).toThrow('only ever added');
  });
});
