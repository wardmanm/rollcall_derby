import { describe, expect, it } from 'vitest';
import type { TransferKind } from '@rollcall/app-sdk';
import type { ManifestItem } from '@rollcall/core-contract';
import { planImport } from './import.ts';
import { packExport } from './zip.ts';

type Thing = { name: string; uses?: string };

// A stand-in kind whose items each need the `test:font` keyed by their `uses`, calling `onNeedKey` when it gives a key.
function kind(name: `test:${string}`, onNeedKey: () => void = () => undefined): TransferKind<Thing> {
  return {
    name,
    label: { one: 'Thing', many: 'things' },
    version: 1,
    exportPermission: 'test:things.manage',
    importPermission: 'test:things.manage',
    list: () => [],
    exportItem: () => undefined,
    check: (data) => ({ ok: true, data: data as Thing }),
    nameOf: (data) => data.name,
    facts: () => [],
    media: () => [],
    needs: (data) => (data.uses ? [{ kind: 'test:font', key: data.uses }] : []),
    needKey: (data) => {
      onNeedKey();
      return data.name;
    },
    match: () => ({ status: 'new' }),
    save: (data) => ({ name: data.name }),
  };
}

const fileOf = (items: ManifestItem[]) =>
  packExport(
    { format: 'rollcall-export', formatVersion: 1, exportedAt: '2026-10-26T12:00:00.000Z', apps: {}, items },
    new Map(),
  );

describe('planImport', () => {
  it('finds what items need by looking each item up once, not by searching the file for every need', () => {
    let lookups = 0;
    const fonts = kind('test:font', () => (lookups += 1));
    const themes = kind('test:theme');
    const zip = fileOf([
      ...Array.from({ length: 50 }, (_, n) => ({ kind: 'test:font', version: 1, data: { name: `Font ${n}` } })),
      ...Array.from({ length: 50 }, (_, n) => ({
        kind: 'test:theme',
        version: 1,
        data: { name: `Theme ${n}`, uses: `font ${n}` },
      })),
    ]);
    const kinds = new Map<string, TransferKind>([
      [fonts.name, fonts],
      [themes.name, themes],
    ]);
    const plan = planImport({ zip, kinds, mayImport: () => true });
    expect(plan.items.slice(50).map((item) => item.needs)).toEqual(Array.from({ length: 50 }, (_, n) => [n]));
    expect(lookups).toBe(50);
  });
});
