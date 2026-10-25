import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeSample } from './ThemeSample.tsx';

describe('ThemeSample', () => {
  it('shows each kind of text, a table, an accent bar and a bordered panel', () => {
    render(<ThemeSample />);
    expect(screen.getByText('Heading')).toBeTruthy();
    expect(screen.getByText('Body text: the jammer laps the pack.')).toBeTruthy();
    expect(screen.getByText('Muted text: Jam 3 · Period 1')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Accent bar')).toBeTruthy();
    expect(screen.getByText('Bordered panel')).toBeTruthy();
    expect(screen.queryByText('Extra colors')).toBeNull();
  });

  it('shows a swatch of each extra color, by its variable', () => {
    const { container } = render(<ThemeSample extras={['gold', 'team-2']} />);
    expect(screen.getByText('Extra colors')).toBeTruthy();
    const chips = [...container.querySelectorAll<HTMLElement>('[data-extra]')];
    expect(chips.map((chip) => chip.style.background)).toEqual([
      'var(--theme-extra-gold)',
      'var(--theme-extra-team-2)',
    ]);
    expect(screen.getByText('team-2')).toBeTruthy();
  });
});
