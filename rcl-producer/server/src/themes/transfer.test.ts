import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOKENS, type ThemeItem, type ThemeTokens } from '@rollcall/producer-contract';
import * as schema from '../db/schema.ts';
import { testProducer } from '../testing.ts';
import { createTheme, findDefaultTheme, findTheme, listThemes, setDefaultTheme } from './themes.ts';
import { themeKind } from './transfer.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
});

const OSWALD: ThemeTokens = {
  ...DEFAULT_TOKENS,
  fonts: { ...DEFAULT_TOKENS.fonts, heading: { family: 'Oswald', weight: 700 } },
};
const ITEM: ThemeItem = { name: 'Derby Night', tokens: OSWALD, default: true };

// Themes have no media, so saving one never asks for a media id.
const noMedia = () => {
  throw new Error('Themes have no media');
};

function setup() {
  const { api, ctx } = testProducer();
  opened.push(api);
  const db = ctx.db(schema);
  const announce = vi.fn<() => void>();
  const kind = themeKind({ db, announce });
  const checked = (data: unknown) => {
    const result = kind.check(data);
    if (!result.ok) throw new Error(result.message);
    return result.data;
  };
  return { db, kind, announce, checked };
}

describe('the producer:theme kind', () => {
  it('exports a theme’s name, tokens and whether it’s the default, needing its font families once each', () => {
    const { db, kind } = setup();
    const theme = createTheme(db, { name: 'Derby Night', tokens: OSWALD });
    setDefaultTheme(db, theme.id);
    expect(kind.exportItem(theme.id, () => '')).toEqual({
      name: 'Derby Night',
      data: { name: 'Derby Night', tokens: OSWALD, default: true },
      needs: [
        { kind: 'core:font-face', key: 'Oswald' },
        { kind: 'core:font-face', key: 'Inter' },
      ],
    });
    const plain = createTheme(db, { name: 'Plain' });
    expect(kind.exportItem(plain.id, () => '')?.needs).toEqual([{ kind: 'core:font-face', key: 'Inter' }]);
    expect(kind.list().map((t) => t.name)).toEqual(['Derby Night', 'Plain']);
    expect(kind.exportItem('nope', () => '')).toBeUndefined();
  });

  it('checks a theme as the contract does, and gives its facts, needs and default hint', () => {
    const { kind, checked } = setup();
    const data = checked(ITEM);
    expect(kind.facts(data)).toEqual([
      { label: 'Surface', value: DEFAULT_TOKENS.colors.surface },
      { label: 'Accent', value: DEFAULT_TOKENS.colors.accent },
      { label: 'Fonts', value: 'Oswald / Inter' },
    ]);
    expect(kind.wasDefault?.(data)).toBe(true);
    expect(kind.media(data)).toEqual([]);
    expect(kind.check({ ...ITEM, name: '' })).toEqual({ ok: false, message: 'Give the theme a name' });
  });

  it('conflicts only with a theme of exactly the same name, saying whether that one is the default', () => {
    const { db, kind, checked } = setup();
    expect(kind.match(checked(ITEM))).toEqual({ status: 'new' });
    const here = createTheme(db, { name: 'Derby Night' });
    setDefaultTheme(db, here.id);
    createTheme(db, { name: 'derby night' });
    expect(kind.match(checked(ITEM))).toEqual({
      status: 'conflict',
      targets: [
        {
          id: here.id,
          name: 'Derby Night',
          facts: expect.arrayContaining([{ label: 'Default', value: 'yes' }]),
          updatedAt: expect.any(String),
        },
      ],
    });
  });

  it('adds a theme, or a copy, never making it the default unless told to', () => {
    const { db, kind, checked, announce } = setup();
    expect(kind.save(checked(ITEM), { as: 'new' }, noMedia, { makeDefault: false })).toEqual({ name: 'Derby Night' });
    expect(kind.save(checked(ITEM), { as: 'copy' }, noMedia, { makeDefault: false })).toEqual({
      name: 'Derby Night copy',
    });
    expect(listThemes(db).map((t) => [t.name, t.tokens, t.isDefault])).toEqual([
      ['Derby Night', OSWALD, false],
      ['Derby Night copy', OSWALD, false],
    ]);
    kind.afterImport?.();
    expect(announce).not.toHaveBeenCalled();
  });

  it('makes the chosen theme the default, switching the old one off, and tells the overlay after the import', () => {
    const { db, kind, checked, announce } = setup();
    const old = createTheme(db, { name: 'Old' });
    setDefaultTheme(db, old.id);
    kind.save(checked(ITEM), { as: 'new' }, noMedia, { makeDefault: true });
    expect(announce).not.toHaveBeenCalled();
    kind.afterImport?.();
    expect(announce).toHaveBeenCalledOnce();
    expect(findDefaultTheme(db)?.name).toBe('Derby Night');
    expect(findTheme(db, old.id)?.isDefault).toBe(false);
  });

  it('replaces a theme’s tokens, keeping its id, name and default, and tells the overlay when it is the default', () => {
    const { db, kind, checked, announce } = setup();
    const here = createTheme(db, { name: 'Derby Night' });
    setDefaultTheme(db, here.id);
    const saved = kind.save(checked({ ...ITEM, default: false }), { as: 'replace', id: here.id }, noMedia, {
      makeDefault: false,
    });
    expect(saved).toEqual({ name: 'Derby Night' });
    expect(findTheme(db, here.id)).toMatchObject({ id: here.id, tokens: OSWALD, isDefault: true });
    kind.afterImport?.();
    expect(announce).toHaveBeenCalledOnce();
  });
});
