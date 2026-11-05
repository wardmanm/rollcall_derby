import { describe, expect, it } from 'vitest';
import type { RosterCard, RosterOnAir } from '@rollcall/producer-contract';
import { continuesRow } from './continues-row.ts';

const team = {
  name: 'Harbour City Wreckers',
  leagueName: null,
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
};

const person = (n: number): RosterCard => ({
  id: `p${n}`,
  kind: 'skater',
  name: `Skater ${n}`,
  number: String(n),
  roleLine: '',
  photoUrl: `/p${n}.png`,
});

const base: RosterOnAir = {
  team,
  title: false,
  cards: [],
  upNext: null,
  slots: 4,
  entrance: 'pop',
  placement: { spot: 'bottom-center', edge: 48 },
};
const title: RosterOnAir = { ...base, title: true, upNext: person(1) };
const row = (...ns: number[]): RosterOnAir => ({ ...base, cards: ns.map(person) });

describe('continuesRow', () => {
  it('is true for adding a card', () => {
    expect(continuesRow(row(1), row(1, 2))).toBe(true);
    expect(continuesRow(row(1, 2, 3), row(1, 2, 3, 4))).toBe(true);
  });

  it('is false for title to row, for row to a new row, and for another team', () => {
    expect(continuesRow(title, row(1))).toBe(false);
    expect(continuesRow(row(1, 2, 3, 4), row(5))).toBe(false);
    expect(continuesRow(row(1), { ...row(1, 2), team: { ...team, name: 'Other Team' } })).toBe(false);
  });

  it('is true for the same cards with a new photo', () => {
    const fixed = { ...row(1, 2), cards: [person(1), { ...person(2), photoUrl: '/new.png' }] };
    expect(continuesRow(row(1, 2), fixed)).toBe(true);
  });

  it('is false when nothing is on air, before or after', () => {
    expect(continuesRow(null, row(1))).toBe(false);
    expect(continuesRow(row(1), null)).toBe(false);
    expect(continuesRow(null, null)).toBe(false);
  });
});
