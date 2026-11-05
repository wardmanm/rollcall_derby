import { useEffect, useReducer, useRef } from 'react';
import type { RosterOnAir } from '@rollcall/producer-contract';
import { PersonCard } from './PersonCard.tsx';
import { TeamBanner } from './TeamBanner.tsx';
import { continuesRow } from './roster/continues-row.ts';
import { cssVars } from './roster/css-vars.ts';
import { anchor, CANVAS_HEIGHT, CANVAS_WIDTH, CARD_GAP, cardWidth } from './roster/layout.ts';
import { teamColorVariables } from './roster/team-colors.ts';
import classes from './TeamRoster.module.css';

export interface TeamRosterProps {
  /** What is on air, as the server sends it; null when nothing is. */
  onAir: RosterOnAir | null;
}

/**
 * A piece (the banner, or one card) waits, hidden, for its picture. A card's place then opens, with the card still
 * hidden; the banner skips that. Then the piece plays its entrance, and is shown.
 */
type Phase = 'waiting' | 'opening' | 'entering' | 'shown';

/** The banner's key among the pieces. Cards go by their ids; a title screen has no cards, so the two never meet. */
const TITLE = 'title';

/**
 * A place opens in 300 ms and a piece leaves in 400 ms. If neither has ended by this time (the browser source was
 * hidden, say), the roster takes it as ended, so it never sticks.
 */
const FALLBACK_MS = 1000;

interface RosterState {
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
  /** Whether what is on screen is leaving, and the pieces that have finished. */
  leaving: boolean;
  left: string[];
}

type Action =
  | { type: 'onAir'; onAir: RosterOnAir | null }
  | { type: 'ready'; key: string; screen: number }
  | { type: 'opened'; key: string }
  | { type: 'animationEnd'; key: string }
  | { type: 'openTimeout'; screen: number }
  | { type: 'leaveTimeout'; screen: number };

function keysOf(onAir: RosterOnAir | null): string[] {
  if (!onAir) return [];
  return onAir.title ? [TITLE] : onAir.cards.map((card) => card.id);
}

/** Whether a piece can be seen: one still waiting for its picture, or for its place to open, is hidden. */
function isUp(phase: Phase | undefined): boolean {
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
    leaving: false,
    left: [],
  };
}

// The first state at mount is a reload (or the first thing the server sent): its pieces come in quietly.
function start(onAir: RosterOnAir | null): RosterState {
  const keys = keysOf(onAir);
  return { latest: onAir, shown: onAir, screen: 0, phases: waiting(keys), quiet: keys, leaving: false, left: [] };
}

function withPhase(state: RosterState, keys: string[], phase: Phase): RosterState {
  return { ...state, phases: { ...state.phases, ...Object.fromEntries(keys.map((key) => [key, phase])) } };
}

function reduce(state: RosterState, action: Action): RosterState {
  switch (action.type) {
    case 'onAir': {
      const next = action.onAir;
      if (state.leaving) return { ...state, latest: next };
      if (carriesOn(state.shown, next)) {
        const phases = { ...state.phases };
        for (const key of keysOf(next)) phases[key] ??= 'waiting';
        return { ...state, latest: next, shown: next, phases };
      }
      if (upNow(state).length === 0) return show(state, next);
      return { ...state, latest: next, leaving: true, left: [] };
    }
    case 'ready': {
      const { key } = action;
      if (action.screen !== state.screen || state.leaving || state.phases[key] !== 'waiting') return state;
      if (state.quiet.includes(key)) return withPhase(state, [key], 'shown');
      return withPhase(state, [key], key === TITLE ? 'entering' : 'opening');
    }
    case 'opened':
      // While the row leaves, a card whose place has only just opened stays hidden.
      if (state.leaving || state.phases[action.key] !== 'opening') return state;
      return withPhase(state, [action.key], 'entering');
    case 'animationEnd': {
      if (state.leaving) {
        const left = state.left.includes(action.key) ? state.left : [...state.left, action.key];
        return upNow(state).every((key) => left.includes(key)) ? show(state, state.latest) : { ...state, left };
      }
      if (state.phases[action.key] !== 'entering') return state;
      return withPhase(state, [action.key], 'shown');
    }
    case 'openTimeout': {
      if (state.leaving || action.screen !== state.screen) return state;
      const opening = keysOf(state.shown).filter((key) => state.phases[key] === 'opening');
      return withPhase(state, opening, 'entering');
    }
    default: // 'leaveTimeout'
      return state.leaving && action.screen === state.screen ? show(state, state.latest) : state;
  }
}

// Lays a new card's place out while it is still closed, so its opening is a transition even when the card is ready at
// once (a preloaded photo, or no picture at all).
function settle(place: HTMLDivElement | null): void {
  place?.getBoundingClientRect();
}

/**
 * The team roster: a team's title banner, or a row of its person cards, on the 1920x1080 canvas. It works out from each
 * new `onAir` what leaves, stays or joins, so pieces never overlap: what is up leaves before anything else comes in,
 * unless the row is carried on, when a new card's place opens (the cards already up slide aside) and then the card
 * comes in. Each piece comes in only once its picture is on show.
 */
export function TeamRoster({ onAir }: TeamRosterProps) {
  const [state, dispatch] = useReducer(reduce, onAir, start);
  // A new state from the server (React's pattern for state that follows a prop).
  if (state.latest !== onAir) dispatch({ type: 'onAir', onAir });

  const { shown, phases, quiet, leaving, screen } = state;

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'leaveTimeout', screen }), FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [leaving, screen]);

  // Restarts whenever another place starts opening, so every place has had the whole time when it goes off.
  const opening = JSON.stringify(keysOf(shown).filter((key) => phases[key] === 'opening'));
  useEffect(() => {
    if (opening === '[]') return undefined;
    const timer = setTimeout(() => dispatch({ type: 'openTimeout', screen }), FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [opening, screen]);

  // Every piece's animationend, and each place's own transitionend as it opens, bubble up to the root. This listens
  // natively: React's onAnimationEnd listens for a vendor-prefixed name where AnimationEvent is missing (as in jsdom).
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const onEnd = (event: Event) => {
      const piece = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-piece]') : null;
      const key = piece?.dataset.piece;
      if (key === undefined) return;
      if (event.type === 'animationend') dispatch({ type: 'animationEnd', key });
      else if (event.target === piece) dispatch({ type: 'opened', key });
    };
    element.addEventListener('animationend', onEnd);
    element.addEventListener('transitionend', onEnd);
    return () => {
      element.removeEventListener('animationend', onEnd);
      element.removeEventListener('transitionend', onEnd);
    };
  }, []);

  const preload = onAir?.upNext?.photoUrl ?? null;

  let box = null;
  if (shown) {
    const { edge, spot } = shown.placement;
    const width = cardWidth(CANVAS_WIDTH - 2 * edge, shown.slots);
    const pieceAttributes = (key: string) => {
      const phase = phases[key] ?? 'waiting';
      const goes = leaving && isUp(phase);
      return {
        'data-piece': key,
        'data-state': phase,
        'data-quiet': quiet.includes(key) ? '' : undefined,
        'data-entrance': goes || phase === 'entering' ? shown.entrance : undefined,
        'data-leaving': goes ? '' : undefined,
      };
    };
    const ready = (key: string) => () => dispatch({ type: 'ready', key, screen });
    box = (
      <div
        key={screen}
        className={classes.box}
        data-testid="roster-box"
        style={{
          inset: edge,
          ...anchor(spot),
          ...cssVars({ '--card-width': `${width}px`, '--card-gap': `${CARD_GAP}px` }),
        }}
      >
        {shown.title ? (
          <div className={`${classes.piece} ${classes.title}`} {...pieceAttributes(TITLE)}>
            <div className={classes.motion}>
              <TeamBanner team={shown.team} onReady={ready(TITLE)} />
            </div>
          </div>
        ) : (
          shown.cards.map((card) => (
            <div
              key={card.id}
              ref={settle}
              className={`${classes.piece} ${classes.place}`}
              {...pieceAttributes(card.id)}
            >
              <div className={classes.motion}>
                <PersonCard card={card} width={width} logoUrl={shown.team.logoUrl} onReady={ready(card.id)} />
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div
      ref={root}
      className={classes.roster}
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, ...(shown ? cssVars(teamColorVariables(shown.team)) : {}) }}
    >
      {preload !== null && <link rel="preload" as="image" href={preload} />}
      {box}
    </div>
  );
}
