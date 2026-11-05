import type { RosterOnAir } from '@rollcall/producer-contract';
import { continuesRow } from './continues-row.ts';

// The team roster's state machine (TeamRoster.tsx renders it): what is on screen, and where each piece is in its
// entrance or exit. Pure, so the roster's timing rules can be read and tested in one place.

/**
 * A piece (the banner, or one card) waits, hidden, for its picture. A card then waits its turn (ready) until every card
 * before it has come in, and its place opens, with the card still hidden. The banner, and a screen's first card, have
 * nothing to slide aside and skip both. Then the piece plays its entrance, and is shown.
 */
export type Phase = 'waiting' | 'ready' | 'opening' | 'entering' | 'shown';

/** The phases of a card that has come in, so the cards after it may follow. */
const ENTERED: ReadonlySet<Phase> = new Set<Phase>(['entering', 'shown']);

/** The banner's key among the pieces. Cards go by their ids; a title screen has no cards, so the two never meet. */
export const TITLE = 'title';

/**
 * A place opens in 300 ms and a piece leaves in 400 ms. If neither has ended by this time (the browser source was
 * hidden, say), the roster takes it as ended, so it never sticks.
 */
export const FALLBACK_MS = 1000;

export interface RosterState {
  /** The latest `onAir` given. While something is leaving, it comes in once that has gone. */
  latest: RosterOnAir | null;
  /** What is on screen. */
  shown: RosterOnAir | null;
  /** Counts the screens shown, so each one mounts fresh pieces: a piece says it's ready only once. */
  screen: number;
  phases: Record<string, Phase>;
  /**
   * The pieces on screen at mount, which is a reload. Each waits in its place, so the row doesn't move, and appears
   * with no entrance once its picture is on show.
   */
  quiet: string[];
  /** The first card of a screen that isn't a reload: its place is open from the start, so it comes straight in. */
  opener: string | null;
  /** Whether what is on screen is leaving, and the pieces that have finished. */
  leaving: boolean;
  left: string[];
}

export type RosterAction =
  | { type: 'onAir'; onAir: RosterOnAir | null }
  | { type: 'ready'; key: string; screen: number }
  /** A card's place has finished its own transition. */
  | { type: 'placeEnd'; key: string }
  /** A piece's own entrance or exit has ended; `exit` says which. */
  | { type: 'animationEnd'; key: string; exit: boolean }
  /** No place opening has ended within FALLBACK_MS. */
  | { type: 'stuckTimeout'; screen: number }
  | { type: 'leaveTimeout'; screen: number };

export function keysOf(onAir: RosterOnAir | null): string[] {
  if (!onAir) return [];
  return onAir.title ? [TITLE] : onAir.cards.map((card) => card.id);
}

/** Whether a piece can be seen: one still waiting for its picture, or for its place to open, is hidden. */
export function isUp(phase: Phase | undefined): boolean {
  return phase === 'entering' || phase === 'shown';
}

function waiting(keys: string[]): Record<string, Phase> {
  return Object.fromEntries(keys.map((key) => [key, 'waiting']));
}

/** The row carried on, or the same title again (sent again after a reconnect, say): nothing leaves. */
function carriesOn(shown: RosterOnAir | null, next: RosterOnAir | null): boolean {
  if (continuesRow(shown, next)) return true;
  if (!shown || !next) return shown === next;
  return shown.title && next.title && shown.team.name === next.team.name;
}

/** The pieces that can be seen, and so have to leave. */
function upNow({ shown, phases }: RosterState): string[] {
  return keysOf(shown).filter((key) => isUp(phases[key]));
}

function show(state: RosterState, onAir: RosterOnAir | null): RosterState {
  return {
    latest: onAir,
    shown: onAir,
    screen: state.screen + 1,
    phases: waiting(keysOf(onAir)),
    quiet: [],
    opener: onAir && !onAir.title ? (onAir.cards[0]?.id ?? null) : null,
    leaving: false,
    left: [],
  };
}

/** The first state at mount is a reload (or the first thing the server sent): its pieces come in quietly. */
export function startRoster(onAir: RosterOnAir | null): RosterState {
  const keys = keysOf(onAir);
  return {
    latest: onAir,
    shown: onAir,
    screen: 0,
    phases: waiting(keys),
    quiet: keys,
    opener: null,
    leaving: false,
    left: [],
  };
}

function withPhase(state: RosterState, keys: string[], phase: Phase): RosterState {
  return { ...state, phases: { ...state.phases, ...Object.fromEntries(keys.map((key) => [key, phase])) } };
}

/**
 * Lets ready cards in, in row order: each waits until every card before it has come in. The opener comes straight in;
 * any other card's place opens first.
 */
function advance(state: RosterState): RosterState {
  if (state.leaving || !state.shown || state.shown.title) return state;
  const phases = { ...state.phases };
  let changed = false;
  let clear = true;
  for (const { id } of state.shown.cards) {
    let phase = phases[id];
    if (phase === 'ready' && clear) {
      phase = id === state.opener ? 'entering' : 'opening';
      phases[id] = phase;
      changed = true;
    }
    clear &&= phase !== undefined && ENTERED.has(phase);
  }
  return changed ? { ...state, phases } : state;
}

export function reduceRoster(state: RosterState, action: RosterAction): RosterState {
  switch (action.type) {
    case 'onAir': {
      const next = action.onAir;
      if (state.leaving) return { ...state, latest: next };
      if (carriesOn(state.shown, next)) {
        const phases = { ...state.phases };
        for (const key of keysOf(next)) phases[key] ??= 'waiting';
        return advance({ ...state, latest: next, shown: next, phases });
      }
      if (upNow(state).length === 0) return show(state, next);
      return { ...state, latest: next, leaving: true, left: [] };
    }
    case 'ready': {
      const { key } = action;
      if (action.screen !== state.screen || state.leaving || state.phases[key] !== 'waiting') return state;
      if (state.quiet.includes(key)) return withPhase(state, [key], 'shown');
      if (key === TITLE) return withPhase(state, [key], 'entering');
      return advance(withPhase(state, [key], 'ready'));
    }
    case 'placeEnd':
      // While the row leaves, a card whose place has only just opened stays hidden.
      if (state.leaving || state.phases[action.key] !== 'opening') return state;
      return advance(withPhase(state, [action.key], 'entering'));
    case 'animationEnd': {
      if (state.leaving) {
        // An entrance that ends as the row starts leaving isn't the piece leaving: its exit is still to play.
        if (!action.exit) return state;
        const left = state.left.includes(action.key) ? state.left : [...state.left, action.key];
        return upNow(state).every((key) => left.includes(key)) ? show(state, state.latest) : { ...state, left };
      }
      if (action.exit || state.phases[action.key] !== 'entering') return state;
      return withPhase(state, [action.key], 'shown');
    }
    case 'stuckTimeout': {
      if (state.leaving || action.screen !== state.screen) return state;
      const opening = keysOf(state.shown).filter((key) => state.phases[key] === 'opening');
      return advance(withPhase(state, opening, 'entering'));
    }
    case 'leaveTimeout':
      return state.leaving && action.screen === state.screen ? show(state, state.latest) : state;
    default: {
      // Every action is handled above; a new one fails to compile here rather than doing nothing unnoticed.
      const unhandled: never = action;
      void unhandled;
      return state;
    }
  }
}
