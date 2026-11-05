import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RosterCard, RosterOnAir, RosterTeam } from '@rollcall/producer-contract';
import { TeamRoster } from './TeamRoster.tsx';

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
    fireEvent.animationEnd(banner());
    expect(banner().dataset.state).toBe('shown');

    rerender(<TeamRoster onAir={row(1)} />);
    expect(leaving(banner())).toBe(true);
    expect(banner().dataset.entrance).toBe('pop');
    expect(screen.queryByRole('figure')).toBeNull();
    fireEvent.animationEnd(banner());
    expect(screen.queryByText(team.name)).toBeNull();
    expect(card('Skater 1').dataset.state).toBe('waiting');
    fireEvent.load(img(card('Skater 1')));
    // Its place opens first; the card plays its entrance once the place is open.
    expect(card('Skater 1').dataset.state).toBe('opening');
    expect(card('Skater 1').hasAttribute('data-entrance')).toBe(false);
    fireEvent.transitionEnd(card('Skater 1'));
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
    fireEvent.animationEnd(card('Skater 2'));
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
    for (const piece of full.slice(0, 3)) fireEvent.animationEnd(piece);
    expect(screen.queryByRole('figure', { name: 'Skater 5' })).toBeNull();
    fireEvent.animationEnd(full[3]!);
    expect(screen.queryByRole('figure', { name: 'Skater 1' })).toBeNull();
    expect(card('Skater 5').dataset.state).toBe('waiting');
  });

  it('a card waits for its photo before it enters', () => {
    const { rerender } = render(<TeamRoster onAir={null} />);
    rerender(<TeamRoster onAir={row(1)} />);
    expect(card('Skater 1').dataset.state).toBe('waiting');
    fireEvent.load(img(card('Skater 1')));
    expect(card('Skater 1').dataset.state).toBe('opening');

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
    fireEvent.animationEnd(up[0]!);
    expect(screen.getAllByRole('figure')).toHaveLength(2);
    fireEvent.animationEnd(up[1]!);
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
    fireEvent.animationEnd(card('Skater 1'));
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
    fireEvent.animationEnd(card('Skater 1'));
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
});
