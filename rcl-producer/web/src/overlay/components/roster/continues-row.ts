import type { RosterOnAir } from '@rollcall/producer-contract';

/**
 * Whether `next` carries on the row `shown` has up: the same team's row, keeping at least one of its cards, in their
 * order, with any new cards after them. Cards may have been removed (a member deleted mid-run) or had their details
 * changed. Then the kept cards stay where they are, removed ones leave on their own and new ones join; anything else,
 * such as a new row, which shares no cards with the last, replaces them.
 */
export function continuesRow(shown: RosterOnAir | null, next: RosterOnAir | null): boolean {
  if (!shown || !next || shown.title || next.title || shown.team.name !== next.team.name) return false;
  const nextIds = next.cards.map((card) => card.id);
  const kept = shown.cards.filter((card) => nextIds.includes(card.id));
  return kept.length > 0 && kept.every((card, i) => nextIds[i] === card.id);
}

/**
 * The row on screen once `next` carries it on: `shown`'s cards in their places (with `next`'s details where it has
 * them, so removed cards stay put while they leave), then `next`'s new cards. A removed member's id never comes back,
 * since who is in a run is fixed at Start.
 */
export function joinRow(shown: RosterOnAir, next: RosterOnAir): RosterOnAir {
  const fresh = new Map(next.cards.map((card) => [card.id, card]));
  const had = new Set(shown.cards.map((card) => card.id));
  return {
    ...next,
    cards: [
      ...shown.cards.map((card) => fresh.get(card.id) ?? card),
      ...next.cards.filter((card) => !had.has(card.id)),
    ],
  };
}
