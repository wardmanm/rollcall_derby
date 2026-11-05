import type { RosterOnAir } from '@rollcall/producer-contract';
import { continuesRow, joinRow } from './continues-row.ts';

// The team roster's state machine (TeamRoster.tsx renders it): what is on screen, and where each piece is in its
// entrance or exit. Pure, so the roster's timing rules can be read and tested in one place.

/**
 * A piece (the banner, or one card) waits, hidden, for its picture. A card then waits its turn (ready) until every card
 * before it has come in, and its place opens, with the card still hidden. The banner, and a screen's first card, have
 * nothing to slide aside and skip both. Then the piece plays its entrance, and is shown. A card whose member is removed
 * mid-row plays its exit on its own (going), then its place closes (closing) and it is dropped.
 */
export type Phase = 'waiting' | 'ready' | 'opening' | 'entering' | 'shown' | 'going' | 'closing';

/** The phases of a card that has come in, so the cards after it may follow. */
const ENTERED: ReadonlySet<Phase> = new Set<Phase>(['entering', 'shown', 'going', 'closing']);

/** A removed member's card, on its way out. */
const DEPARTING: ReadonlySet<Phase> = new Set<Phase>(['going', 'closing']);

/** The phases that end with an event that may never come (a hidden browser source), so the fallback timer runs. */
const SETTLING: ReadonlySet<Phase> = new Set<Phase>(['opening', 'going', 'closing']);

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
  /** A card's place has finished opening or closing. */
  | { type: 'placeEnd'; key: string }
  /** A piece's own entrance or exit has ended; `exit` says which. */
  | { type: 'animationEnd'; key: string; exit: boolean }
  /** Nothing settling has moved on within FALLBACK_MS. */
  | { type: 'stuckTimeout'; screen: number }
  | { type: 'leaveTimeout'; screen: number };

export function keysOf(onAir: RosterOnAir | null): string[] {
  if (!onAir) return [];
  return onAir.title ? [TITLE] : onAir.cards.map((card) => card.id);
}

/**
 * Whether a piece can be seen: one still waiting for its picture, its turn or its place to open is hidden, and so is a
 * removed card whose place is closing.
 */
export function isUp(phase: Phase | undefined): boolean {
  return phase === 'entering' || phase === 'shown' || phase === 'going';
}

/**
 * The pieces that are opening, going or closing, with their phases. The roster's fallback timer runs while there are
 * any, and restarts when this changes, so each has had the whole time when it goes off.
 */
export function settling({ shown, phases }: RosterState): string {
  return keysOf(shown)
    .flatMap((key) => {
      const phase = phases[key];
      return phase && SETTLING.has(phase) ? [`${key}:${phase}`] : [];
    })
    .join(' ');
}

function waiting(keys: string[]): Record<string, Phase> {
  return Object.fromEntries(keys.map((key) => [key, 'waiting']));
}

/** The same title again (sent again after a reconnect, say), or nothing again: nothing leaves. */
function sameTitle(shown: RosterOnAir | null, next: RosterOnAir | null): boolean {
  if (!shown || !next) return shown === next;
  return shown.title && next.title && shown.team.name === next.team.name;
}

/** What is on screen less the removed cards on their way out: what the server last sent, as far as it's shown. */
function live({ shown, phases }: RosterState): RosterOnAir | null {
  if (!shown || shown.title) return shown;
  return { ...shown, cards: shown.cards.filter((card) => !DEPARTING.has(phases[card.id] ?? 'waiting')) };
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

function inPhase({ shown, phases }: RosterState, phase: Phase): string[] {
  return keysOf(shown).filter((key) => phases[key] === phase);
}

/** Takes cards off the screen at once. */
function drop(state: RosterState, keys: string[]): RosterState {
  if (keys.length === 0 || !state.shown) return state;
  const gone = new Set(keys);
  return {
    ...state,
    shown: { ...state.shown, cards: state.shown.cards.filter((card) => !gone.has(card.id)) },
    phases: Object.fromEntries(Object.entries(state.phases).filter(([key]) => !gone.has(key))),
  };
}

/**
 * The row carried on to `next`. A removed card that is up leaves on its own (going); one whose place is open but which
 * isn't up yet just closes its place; one whose place never opened is dropped at once. New cards wait for their
 * pictures.
 */
function carryOn(state: RosterState, now: RosterOnAir, next: RosterOnAir): RosterState {
  const nextIds = new Set(next.cards.map((card) => card.id));
  const phases = { ...state.phases };
  const dropped: string[] = [];
  for (const { id } of now.cards) {
    if (nextIds.has(id)) continue;
    const phase = phases[id];
    const placeOpen = phase === 'opening' || state.quiet.includes(id) || id === state.opener;
    if (isUp(phase)) phases[id] = 'going';
    else if (placeOpen) phases[id] = 'closing';
    else dropped.push(id);
  }
  for (const { id } of next.cards) phases[id] ??= 'waiting';
  // `now` is shown less its departing cards, so `state.shown` is set whenever there is a row to carry on.
  return drop({ ...state, latest: next, shown: joinRow(state.shown ?? now, next), phases }, dropped);
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
      const now = live(state);
      if (now && next && continuesRow(now, next)) return advance(carryOn(state, now, next));
      if (sameTitle(now, next)) return { ...state, latest: next, shown: next };
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
    case 'placeEnd': {
      // While the row leaves, a card whose place has only just opened stays hidden.
      if (state.leaving) return state;
      const phase = state.phases[action.key];
      if (phase === 'opening') return advance(withPhase(state, [action.key], 'entering'));
      if (phase === 'closing') return drop(state, [action.key]);
      return state;
    }
    case 'animationEnd': {
      if (state.leaving) {
        // An entrance that ends as the row starts leaving isn't the piece leaving: its exit is still to play.
        if (!action.exit) return state;
        const left = state.left.includes(action.key) ? state.left : [...state.left, action.key];
        return upNow(state).every((key) => left.includes(key)) ? show(state, state.latest) : { ...state, left };
      }
      const phase = state.phases[action.key];
      if (action.exit) return phase === 'going' ? withPhase(state, [action.key], 'closing') : state;
      return phase === 'entering' ? withPhase(state, [action.key], 'shown') : state;
    }
    case 'stuckTimeout': {
      if (state.leaving || action.screen !== state.screen) return state;
      const moved = withPhase(
        withPhase(state, inPhase(state, 'opening'), 'entering'),
        inPhase(state, 'going'),
        'closing',
      );
      return advance(drop(moved, inPhase(state, 'closing')));
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
