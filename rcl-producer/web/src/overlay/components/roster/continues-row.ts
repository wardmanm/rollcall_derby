import type { RosterOnAir } from '@rollcall/producer-contract';

/**
 * Whether `next` carries on the row `shown` has up: the same team's row, with cards only added at the end or their
 * details changed. Then the cards already up stay where they are and new ones join them; anything else replaces them.
 */
export function continuesRow(shown: RosterOnAir | null, next: RosterOnAir | null): boolean {
  if (!shown || !next || shown.title || next.title || shown.team.name !== next.team.name) return false;
  return shown.cards.every((card, i) => next.cards[i]?.id === card.id);
}
