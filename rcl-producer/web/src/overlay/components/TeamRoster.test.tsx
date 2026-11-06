import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RosterCard, RosterOnAir, RosterTeam } from '@rollcall/producer-contract';
import { TeamRoster } from './TeamRoster.tsx';
import classes from './TeamRoster.module.css';

const team: RosterTeam = {
  name: 'Harbour City Wreckers',
  leagueName: 'Harbour City Roller Derby',
  logoUrl: '/logo.png',
  primaryColor: '#b3123f',
  secondaryColor: '#f5c518',
};

const person = (n: number): RosterCard => ({
  id: `p${n}`,
  kind: 'skater',
  name: `Skater ${n}`,
  number: String(n),
  roleLine: 'Skater',
  photoUrl: `/p${n}.png`,
});

function onAir(fields: Partial<RosterOnAir> = {}): RosterOnAir {
  return {
    team,
    title: false,
    cards: [],
    upNext: null,
    slots: 4,
    entrance: 'pop',
    placement: { spot: 'bottom-center', edge: 48 },
    ...fields,
  };
}
const title = onAir({ title: true, upNext: person(1) });
const row = (...ns: number[]) => onAir({ cards: ns.map(person), upNext: person(Math.max(...ns) + 1) });

// The piece of the roster (a card's place, or the banner) that carries data-state.
const card = (name: string) => screen.getByRole('figure', { name }).closest<HTMLElement>('[data-state]')!;
const banner = () => screen.getByText(team.name).closest<HTMLElement>('[data-state]')!;
const img = (piece: HTMLElement) => piece.querySelector('img')!;
const leaving = (piece: HTMLElement) => piece.hasAttribute('data-leaving');
/**
 * An animation called `name` ends on `target`: by default the piece's own motion layer, which plays its entrance and
 * exit. jsdom has no AnimationEvent, so the name is set on a plain event.
 */
function endAnimation(piece: HTMLElement, name: string, target: Element = piece.firstElementChild!) {
  const event = new Event('animationend', { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: name });
  act(() => void target.dispatchEvent(event));
}
const entered = (piece: HTMLElement) => endAnimation(piece, classes['pop-in']!);
const exited = (piece: HTMLElement) => endAnimation(piece, classes['pop-out']!);
// React puts the preload link in the document's head.
const preload = () => document.querySelector('link[rel="preload"][as="image"]');

/** OBS (re)loads with `state` on air, and every picture loads. */
function reload(state: RosterOnAir) {
  const view = render(<TeamRoster onAir={state} />);
  for (const image of view.container.querySelectorAll('img')) fireEvent.load(image);
  return view;
}

describe('TeamRoster', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the title card, then on the first person the title leaves before the card comes in', () => {
    const { rerender } = render(<TeamRoster onAir={null} />);
    rerender(<TeamRoster onAir={title} />);
    expect(banner().dataset.state).toBe('waiting');
    fireEvent.load(img(banner()));
    expect(banner().dataset.state).toBe('entering');
    expect(banner().dataset.entrance).toBe('pop');
    entered(banner());
    expect(banner().dataset.state).toBe('shown');

    rerender(<TeamRoster onAir={row(1)} />);
    expect(leaving(banner())).toBe(true);
    expect(banner().dataset.entrance).toBe('pop');
    expect(screen.queryByRole('figure')).toBeNull();
    exited(banner());
    expect(screen.queryByText(team.name)).toBeNull();
    expect(card('Skater 1').dataset.state).toBe('waiting');
    expect(card('Skater 1').hasAttribute('data-entrance')).toBe(false);
    // The row's first card has nothing to slide aside, so it enters as soon as its photo is on show.
    fireEvent.load(img(card('Skater 1')));
    expect(card('Skater 1').dataset.state).toBe('entering');
    expect(card('Skater 1').dataset.entrance).toBe('pop');
  });

  it('adds a card to the row without the others leaving', () => {
    const { rerender } = reload(row(1));
    const first = card('Skater 1');
    rerender(<TeamRoster onAir={row(1, 2)} />);
    expect(card('Skater 1')).toBe(first);
    expect(first.dataset.state).toBe('shown');
    expect(leaving(first)).toBe(false);
    expect(card('Skater 2').dataset.state).toBe('waiting');
    fireEvent.load(img(card('Skater 2')));
    expect(card('Skater 2').dataset.state).toBe('opening');
    fireEvent.transitionEnd(card('Skater 2'));
    expect(card('Skater 2').dataset.state).toBe('entering');
    entered(card('Skater 2'));
    expect(card('Skater 2').dataset.state).toBe('shown');
    expect(card('Skater 2').hasAttribute('data-entrance')).toBe(false);
  });

  it("clears a full row before the next row's first card comes in", () => {
    const { rerender } = reload(row(1, 2, 3, 4));
    rerender(<TeamRoster onAir={row(5)} />);
    const full = [1, 2, 3, 4].map((n) => card(`Skater ${n}`));
    expect(full.every(leaving)).toBe(true);
    expect(full.map((piece) => piece.dataset.entrance)).toEqual(['pop', 'pop', 'pop', 'pop']);
    expect(screen.queryByRole('figure', { name: 'Skater 5' })).toBeNull();
    for (const piece of full.slice(0, 3)) exited(piece);
    expect(screen.queryByRole('figure', { name: 'Skater 5' })).toBeNull();
    exited(full[3]!);
    expect(screen.queryByRole('figure', { name: 'Skater 1' })).toBeNull();
    expect(card('Skater 5').dataset.state).toBe('waiting');
  });

  it('a card waits for its photo before it enters', () => {
    const { rerender } = render(<TeamRoster onAir={null} />);
    rerender(<TeamRoster onAir={row(1)} />);
    expect(card('Skater 1').dataset.state).toBe('waiting');
    fireEvent.load(img(card('Skater 1')));
    expect(card('Skater 1').dataset.state).toBe('entering');

    // A photo that fails shows the team logo instead, and the card enters once that is on show.
    rerender(<TeamRoster onAir={row(1, 2)} />);
    fireEvent.error(img(card('Skater 2')));
    expect(img(card('Skater 2')).getAttribute('src')).toBe('/logo.png');
    expect(card('Skater 2').dataset.state).toBe('waiting');
    fireEvent.load(img(card('Skater 2')));
    expect(card('Skater 2').dataset.state).toBe('opening');
  });

  it("on a reload, shows what's on air without entrances", () => {
    // Each piece keeps its place, hidden until its picture is on show, then appears as it is.
    const { container, unmount } = render(<TeamRoster onAir={row(1, 2)} />);
    const both = [card('Skater 1'), card('Skater 2')];
    expect(both.map((piece) => piece.dataset.state)).toEqual(['waiting', 'waiting']);
    expect(both.every((piece) => piece.hasAttribute('data-quiet'))).toBe(true);
    expect(container.querySelector('[data-entrance]')).toBeNull();
    for (const piece of both) fireEvent.load(img(piece));
    expect(both.map((piece) => piece.dataset.state)).toEqual(['shown', 'shown']);
    expect(container.querySelector('[data-entrance]')).toBeNull();
    unmount();

    render(<TeamRoster onAir={title} />);
    expect(banner().dataset.state).toBe('waiting');
    fireEvent.load(img(banner()));
    expect(banner().dataset.state).toBe('shown');
    expect(banner().hasAttribute('data-entrance')).toBe(false);
  });

  it("sizes every card for the run's slots, in the team's colors", () => {
    const { container } = render(
      <TeamRoster
        onAir={onAir({ cards: [person(1), person(2)], slots: 10, placement: { spot: 'bottom-center', edge: 48 } })}
      />,
    );
    const widths = screen.getAllByRole('figure').map((figure) => figure.style.width);
    expect(widths).toEqual(['160px', '160px']);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--team-primary')).toBe('#b3123f');
    expect(root.style.getPropertyValue('--team-secondary')).toBe('#f5c518');
  });

  it('anchors the row to its spot', () => {
    render(<TeamRoster onAir={onAir({ cards: [person(1)], placement: { spot: 'bottom-right', edge: 48 } })} />);
    const box = screen.getByTestId('roster-box');
    expect(box.style.justifyContent).toBe('flex-end');
    expect(box.style.alignItems).toBe('flex-end');
    expect(box.style.inset).toBe('48px');
  });

  it('when nothing is on air, whatever is up leaves', () => {
    const { rerender } = reload(row(1, 2));
    rerender(<TeamRoster onAir={null} />);
    const up = [card('Skater 1'), card('Skater 2')];
    expect(up.every(leaving)).toBe(true);
    exited(up[0]!);
    expect(screen.getAllByRole('figure')).toHaveLength(2);
    exited(up[1]!);
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it("preloads the next person's photo", () => {
    const { rerender } = render(<TeamRoster onAir={title} />);
    expect(preload()?.getAttribute('href')).toBe('/p1.png');
    rerender(<TeamRoster onAir={onAir({ cards: [person(1)], upNext: { ...person(2), photoUrl: null } })} />);
    expect(preload()).toBeNull();
  });

  it("a card still waiting for its photo doesn't hold up the row leaving", () => {
    const { rerender } = reload(row(1));
    rerender(<TeamRoster onAir={row(1, 2)} />);
    rerender(<TeamRoster onAir={null} />);
    expect(leaving(card('Skater 1'))).toBe(true);
    expect(leaving(card('Skater 2'))).toBe(false);
    exited(card('Skater 1'));
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it("a card whose place is still opening when the row leaves stays hidden and doesn't hold it up", () => {
    const { rerender } = reload(row(1));
    rerender(<TeamRoster onAir={row(1, 2)} />);
    fireEvent.load(img(card('Skater 2')));
    expect(card('Skater 2').dataset.state).toBe('opening');
    rerender(<TeamRoster onAir={null} />);
    expect(leaving(card('Skater 1'))).toBe(true);
    expect(leaving(card('Skater 2'))).toBe(false);
    expect(card('Skater 2').hasAttribute('data-entrance')).toBe(false);
    // Its place finishing opening doesn't bring it in now.
    fireEvent.transitionEnd(card('Skater 2'));
    expect(card('Skater 2').dataset.state).toBe('opening');
    exited(card('Skater 1'));
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('moves on even if a leaving animation never ends', () => {
    vi.useFakeTimers();
    const { rerender } = reload(row(1));
    rerender(<TeamRoster onAir={title} />);
    expect(leaving(card('Skater 1'))).toBe(true);
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('figure')).toBeNull();
    expect(banner().dataset.state).toBe('waiting');
  });

  it("a card comes in even if its place's opening never ends", () => {
    vi.useFakeTimers();
    const { rerender } = reload(row(1));
    rerender(<TeamRoster onAir={row(1, 2)} />);
    fireEvent.load(img(card('Skater 2')));
    expect(card('Skater 2').dataset.state).toBe('opening');
    act(() => void vi.advanceTimersByTime(1000));
    expect(card('Skater 2').dataset.state).toBe('entering');
  });

  it("doesn't replay the title when the same title comes again", () => {
    const { rerender } = reload(title);
    rerender(<TeamRoster onAir={{ ...title, team: { ...team } }} />);
    expect(leaving(banner())).toBe(false);
    expect(banner().dataset.state).toBe('shown');
  });

  it('ignores an animation that ends inside a piece', () => {
    const { rerender } = reload(row(1));
    rerender(<TeamRoster onAir={row(1, 2)} />);
    fireEvent.load(img(card('Skater 2')));
    fireEvent.transitionEnd(card('Skater 2'));
    endAnimation(card('Skater 2'), classes['pop-in']!, img(card('Skater 2')));
    expect(card('Skater 2').dataset.state).toBe('entering');

    rerender(<TeamRoster onAir={null} />);
    exited(card('Skater 2'));
    endAnimation(card('Skater 1'), classes['pop-out']!, img(card('Skater 1')));
    expect(screen.getAllByRole('figure')).toHaveLength(2);
    exited(card('Skater 1'));
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it("an entrance that ends after the row starts leaving doesn't count as leaving", () => {
    const { rerender } = reload(row(1));
    rerender(<TeamRoster onAir={row(1, 2)} />);
    fireEvent.load(img(card('Skater 2')));
    fireEvent.transitionEnd(card('Skater 2'));
    expect(card('Skater 2').dataset.state).toBe('entering');
    rerender(<TeamRoster onAir={null} />);
    entered(card('Skater 2'));
    exited(card('Skater 1'));
    expect(screen.getByRole('figure', { name: 'Skater 2' })).toBeTruthy();
    exited(card('Skater 2'));
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it("a transition inside a card's place doesn't open it", () => {
    const { rerender } = reload(row(1));
    rerender(<TeamRoster onAir={row(1, 2)} />);
    fireEvent.load(img(card('Skater 2')));
    fireEvent.transitionEnd(img(card('Skater 2')));
    expect(card('Skater 2').dataset.state).toBe('opening');
  });

  it('the first card of a new screen enters without waiting for its place', () => {
    const { rerender } = reload(title);
    rerender(<TeamRoster onAir={row(1)} />);
    exited(banner());
    expect(card('Skater 1').hasAttribute('data-open')).toBe(true);
    fireEvent.load(img(card('Skater 1')));
    expect(card('Skater 1').dataset.state).toBe('entering');
  });

  it('a card whose photo loads first waits for the cards before it', () => {
    const { rerender } = reload(row(1));
    rerender(<TeamRoster onAir={row(1, 2)} />);
    rerender(<TeamRoster onAir={row(1, 2, 3)} />);
    expect(card('Skater 2').hasAttribute('data-open')).toBe(false);
    fireEvent.load(img(card('Skater 3')));
    expect(card('Skater 3').dataset.state).toBe('ready');
    fireEvent.load(img(card('Skater 2')));
    expect(card('Skater 2').dataset.state).toBe('opening');
    expect(card('Skater 3').dataset.state).toBe('ready');
    fireEvent.transitionEnd(card('Skater 2'));
    expect(card('Skater 2').dataset.state).toBe('entering');
    expect(card('Skater 3').dataset.state).toBe('opening');
  });

  describe('a member removed mid-row', () => {
    // The server's next step: the shown cards without Skater 2, and the next person joining.
    const withoutTwo = onAir({ cards: [person(1), person(3), person(4)], upNext: person(5) });

    it('leaves on its own while the others stay, then its place closes', () => {
      const { rerender } = reload(row(1, 2, 3));
      rerender(<TeamRoster onAir={withoutTwo} />);
      expect(card('Skater 2').dataset.state).toBe('going');
      expect(leaving(card('Skater 2'))).toBe(true);
      expect(card('Skater 2').dataset.entrance).toBe('pop');
      for (const name of ['Skater 1', 'Skater 3']) {
        expect(card(name).dataset.state).toBe('shown');
        expect(leaving(card(name))).toBe(false);
      }
      // The new card waits for the removed one's exit, then its place opens as the removed one's closes, so the row
      // keeps its width instead of growing and shrinking back.
      fireEvent.load(img(card('Skater 4')));
      expect(card('Skater 4').dataset.state).toBe('ready');
      exited(card('Skater 2'));
      expect(card('Skater 2').dataset.state).toBe('closing');
      expect(card('Skater 4').dataset.state).toBe('opening');
      fireEvent.transitionEnd(card('Skater 2'));
      expect(screen.queryByRole('figure', { name: 'Skater 2' })).toBeNull();
      expect(screen.getAllByRole('figure').map((figure) => figure.getAttribute('aria-label'))).toEqual([
        'Skater 1',
        'Skater 3',
        'Skater 4',
      ]);
    });

    it('clears even with no animation or transition events', () => {
      vi.useFakeTimers();
      const { rerender } = reload(row(1, 2, 3));
      rerender(<TeamRoster onAir={withoutTwo} />);
      act(() => void vi.advanceTimersByTime(1000));
      expect(card('Skater 2').dataset.state).toBe('closing');
      act(() => void vi.advanceTimersByTime(1000));
      expect(screen.queryByRole('figure', { name: 'Skater 2' })).toBeNull();
    });

    it('closes its gap too when it was the first card', () => {
      const { rerender } = reload(row(1, 2));
      rerender(<TeamRoster onAir={onAir({ cards: [person(2), person(3)], upNext: person(4) })} />);
      exited(card('Skater 1'));
      expect(card('Skater 1').dataset.state).toBe('closing');
      // The closing first place takes the next place's gap with it (TeamRoster.module.css).
      expect(card('Skater 1').parentElement!.firstElementChild).toBe(card('Skater 1'));
    });

    it('goes with the row if the row leaves first', () => {
      const { rerender } = reload(row(1, 2, 3));
      rerender(<TeamRoster onAir={withoutTwo} />);
      rerender(<TeamRoster onAir={null} />);
      const up = [1, 2, 3].map((n) => card(`Skater ${n}`));
      expect(up.every(leaving)).toBe(true);
      expect(leaving(card('Skater 4'))).toBe(false);
      exited(up[0]!);
      exited(up[2]!);
      expect(screen.getByRole('figure', { name: 'Skater 2' })).toBeTruthy();
      exited(up[1]!);
      expect(screen.queryByRole('figure')).toBeNull();
    });

    it('is dropped at once while still waiting for its photo', () => {
      const { rerender } = reload(row(1));
      rerender(<TeamRoster onAir={row(1, 2)} />);
      expect(card('Skater 2').dataset.state).toBe('waiting');
      rerender(<TeamRoster onAir={onAir({ cards: [person(1), person(3)], upNext: person(4) })} />);
      expect(screen.queryByRole('figure', { name: 'Skater 2' })).toBeNull();
      expect(card('Skater 3').dataset.state).toBe('waiting');
    });
  });

  it("a shown card's new photo swaps in place without the card coming in again", () => {
    const { rerender } = reload(row(1));
    rerender(<TeamRoster onAir={onAir({ cards: [{ ...person(1), photoUrl: '/new.png' }], upNext: person(2) })} />);
    expect(card('Skater 1').dataset.state).toBe('shown');
    expect(card('Skater 1').hasAttribute('data-entrance')).toBe(false);
    expect(img(card('Skater 1')).getAttribute('src')).toBe('/new.png');
  });

  describe('races', () => {
    const other: RosterTeam = { ...team, name: 'Seaside Sirens', logoUrl: '/other.png' };

    it('the latest state wins after a leave', () => {
      const { rerender } = reload(row(1));
      rerender(<TeamRoster onAir={title} />);
      rerender(<TeamRoster onAir={row(5)} />);
      exited(card('Skater 1'));
      expect(screen.queryByText(team.name)).toBeNull();
      expect(card('Skater 5').dataset.state).toBe('waiting');
    });

    it('another team started mid-row: the row leaves, then their title comes in', () => {
      const { rerender } = reload(row(1, 2));
      rerender(<TeamRoster onAir={onAir({ team: other, title: true, upNext: person(1) })} />);
      const up = [card('Skater 1'), card('Skater 2')];
      expect(up.every(leaving)).toBe(true);
      expect(screen.queryByText(other.name)).toBeNull();
      for (const piece of up) exited(piece);
      expect(screen.queryByRole('figure')).toBeNull();
      expect(screen.getByText(other.name).closest<HTMLElement>('[data-state]')!.dataset.state).toBe('waiting');
    });

    it("another team's row never carries on this team's row, even with the same card ids", () => {
      const { rerender } = reload(row(1, 2));
      rerender(<TeamRoster onAir={{ ...row(1, 2, 3), team: other }} />);
      expect(leaving(card('Skater 1'))).toBe(true);
      expect(leaving(card('Skater 2'))).toBe(true);
    });
  });
});
