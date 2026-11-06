import { useEffect, useReducer, useRef } from 'react';
import type { RosterOnAir } from '@rollcall/producer-contract';
import { PersonCard } from './PersonCard.tsx';
import { TeamBanner } from './TeamBanner.tsx';
import { EXIT_ANIMATIONS } from './roster/animations.ts';
import { cssVars } from './roster/css-vars.ts';
import { anchor, CANVAS_HEIGHT, CANVAS_WIDTH, CARD_GAP, cardWidth } from './roster/layout.ts';
import { FALLBACK_MS, isUp, reduceRoster, settling, startRoster, TITLE } from './roster/roster-state.ts';
import { roleColor, teamColorVariables } from './roster/team-colors.ts';
import classes from './TeamRoster.module.css';

export interface TeamRosterProps {
  /** What is on air, as the server sends it; null when nothing is. */
  onAir: RosterOnAir | null;
  /**
   * The surface colour of the theme on show, which the cards sit on, so a team colour that wouldn't read on it isn't
   * used for text.
   */
  surface: string;
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
export function TeamRoster({ onAir, surface }: TeamRosterProps) {
  const [state, dispatch] = useReducer(reduceRoster, onAir, startRoster);
  // A new state from the server (React's pattern for state that follows a prop).
  if (state.latest !== onAir) dispatch({ type: 'onAir', onAir });

  const { shown, phases, quiet, opener, leaving, screen } = state;

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'leaveTimeout', screen }), FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [leaving, screen]);

  // Runs while a place is opening or a removed card is going or closing, and restarts whenever one of them moves on.
  const stuck = settling(state);
  useEffect(() => {
    if (stuck === '') return undefined;
    const timer = setTimeout(() => dispatch({ type: 'stuckTimeout', screen }), FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [stuck, screen]);

  // Every piece's animationend, and each place's own transitionend as it opens, bubble up to the root. This listens
  // natively: React's onAnimationEnd listens for a vendor-prefixed name where AnimationEvent is missing (as in jsdom).
  // Only a piece's own motion layer (its first child) plays its entrance and exit, and only the place itself opens, so
  // an animation or transition inside a card says nothing about the piece.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const onEnd = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const piece = target?.closest<HTMLElement>('[data-piece]');
      const key = piece?.dataset.piece;
      if (!piece || key === undefined) return;
      if (event.type === 'transitionend') {
        if (target === piece) dispatch({ type: 'placeEnd', key });
      } else if (target === piece.firstElementChild) {
        const { animationName = '' } = event as Partial<AnimationEvent>;
        dispatch({ type: 'animationEnd', key, exit: EXIT_ANIMATIONS.has(animationName) });
      }
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
      // A removed card leaves on its own; anything up leaves with the row.
      const goes = phase === 'going' || (leaving && isUp(phase));
      return {
        'data-piece': key,
        'data-state': phase,
        'data-quiet': quiet.includes(key) ? '' : undefined,
        'data-open': key === opener ? '' : undefined,
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

  const colors = shown && { ...teamColorVariables(shown.team), '--team-role': roleColor(shown.team, surface) };
  return (
    <div
      ref={root}
      className={classes.roster}
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, ...(colors ? cssVars(colors) : {}) }}
    >
      {preload !== null && <link rel="preload" as="image" href={preload} />}
      {box}
    </div>
  );
}
