import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import type { RosterTeam } from '@rollcall/producer-contract';
import { TeamBanner } from './TeamBanner.tsx';

const team: RosterTeam = {
  name: 'Harbour City Wreckers',
  leagueName: 'Harbour City Roller Derby',
  logoUrl: '/logo.png',
  primaryColor: '#b3123f',
  secondaryColor: '#f5c518',
};

describe('TeamBanner', () => {
  it('shows the name and league, and leaves out a missing logo or league', () => {
    const { container, rerender } = render(<TeamBanner team={team} />);
    expect(container.textContent).toContain('Harbour City Wreckers');
    expect(container.textContent).toContain('Harbour City Roller Derby');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/logo.png');
    rerender(<TeamBanner team={{ ...team, leagueName: null, logoUrl: null }} />);
    expect(container.textContent).toBe('Harbour City Wreckers');
    expect(container.querySelector('img')).toBeNull();
  });

  it('hands the name length to the CSS that fits it', () => {
    const { container } = render(<TeamBanner team={team} />);
    expect(
      container.querySelector<HTMLElement>('[style*="--name-length"]')?.style.getPropertyValue('--name-length'),
    ).toBe('21');
  });

  it('is ready when its logo loads or fails, and at once with no logo', () => {
    const onReady = vi.fn<() => void>();
    const { container, unmount } = render(<TeamBanner team={team} onReady={onReady} />);
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.error(container.querySelector('img')!);
    expect(onReady).toHaveBeenCalledTimes(1);
    unmount();
    const again = vi.fn<() => void>();
    render(<TeamBanner team={{ ...team, logoUrl: null }} onReady={again} />);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('a logo that hangs makes the banner ready after 4 s', () => {
    vi.useFakeTimers();
    try {
      const onReady = vi.fn<() => void>();
      render(<TeamBanner team={team} onReady={onReady} />);
      act(() => void vi.advanceTimersByTime(3999));
      expect(onReady).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(1));
      expect(onReady).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
