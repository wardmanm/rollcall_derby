import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RosterCard } from '@rollcall/producer-contract';
import { PersonCard } from './PersonCard.tsx';

const skater: RosterCard = {
  id: 'm1',
  kind: 'skater',
  name: 'Jammy Dodger',
  number: '07',
  roleLine: 'Captain · she/her',
  photoUrl: '/photo.png',
};
const LOGO = '/logo.png';

describe('PersonCard', () => {
  it('shows the number badge for a skater and none for bench staff', () => {
    const { rerender } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} />);
    const card = screen.getByRole('figure', { name: 'Jammy Dodger' });
    expect(card.textContent).toContain('07');
    expect(card.textContent).toContain('Captain · she/her');
    rerender(<PersonCard card={{ ...skater, kind: 'bench', number: null }} width={420} logoUrl={LOGO} />);
    expect(screen.getByRole('figure', { name: 'Jammy Dodger' }).textContent).not.toContain('07');
  });

  it('hands the name length to the CSS that fits it, and lets the role line wrap instead of shrinking', () => {
    render(<PersonCard card={skater} width={420} logoUrl={LOGO} />);
    const card = screen.getByRole('figure', { name: 'Jammy Dodger' });
    expect(card.style.getPropertyValue('--name-length')).toBe('12');
    expect(card.style.getPropertyValue('--role-length')).toBe('');
    const role = screen.getByText('Captain · she/her');
    expect(role.className).toContain('role');
  });

  it('keeps the role area on a card with no role line', () => {
    render(<PersonCard card={{ ...skater, roleLine: '' }} width={420} logoUrl={LOGO} />);
    const role = screen.getByRole('figure', { name: 'Jammy Dodger' }).querySelector('[class*="role"]');
    expect(role).not.toBeNull();
    expect(role!.textContent).toBe('');
  });

  it('is ready when its photo loads', () => {
    const onReady = vi.fn<() => void>();
    const { container } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} onReady={onReady} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/photo.png');
    expect(img.getAttribute('alt')).toBe('');
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.load(img);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a failed photo shows the team logo and is ready once the logo has loaded', () => {
    const onReady = vi.fn<() => void>();
    const { container } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} onReady={onReady} />);
    fireEvent.error(container.querySelector('img')!);
    const logo = container.querySelector('img')!;
    expect(logo.getAttribute('src')).toBe(LOGO);
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.load(logo);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('is ready when the fallback logo fails too', () => {
    const onReady = vi.fn<() => void>();
    const { container } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} onReady={onReady} />);
    fireEvent.error(container.querySelector('img')!);
    fireEvent.error(container.querySelector('img')!);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a failed photo with no logo is ready at once', () => {
    const onReady = vi.fn<() => void>();
    const { container } = render(<PersonCard card={skater} width={420} logoUrl={null} onReady={onReady} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('with no photo and no logo, is ready at once', () => {
    const onReady = vi.fn<() => void>();
    const { container } = render(
      <PersonCard card={{ ...skater, photoUrl: null }} width={420} logoUrl={null} onReady={onReady} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  describe('with a photo that hangs', () => {
    afterEach(() => vi.useRealTimers());

    it('counts it as failed after 4 s: the logo shows and the card is ready', () => {
      vi.useFakeTimers();
      const onReady = vi.fn<() => void>();
      const { container } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} onReady={onReady} />);
      act(() => void vi.advanceTimersByTime(3999));
      expect(onReady).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(1));
      expect(onReady).toHaveBeenCalledTimes(1);
      expect(container.querySelector('img')!.getAttribute('src')).toBe(LOGO);
    });

    it('is ready once, however many loads follow', () => {
      vi.useFakeTimers();
      const onReady = vi.fn<() => void>();
      const { container, rerender } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} onReady={onReady} />);
      fireEvent.load(container.querySelector('img')!);
      rerender(<PersonCard card={{ ...skater, photoUrl: '/new.png' }} width={420} logoUrl={LOGO} onReady={onReady} />);
      fireEvent.load(container.querySelector('img')!);
      act(() => void vi.advanceTimersByTime(5000));
      expect(onReady).toHaveBeenCalledTimes(1);
    });
  });

  it('tries a new photo when the photo address changes', () => {
    const { container, rerender } = render(
      <PersonCard card={{ ...skater, photoUrl: '/a.png' }} width={420} logoUrl={LOGO} />,
    );
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')!.getAttribute('src')).toBe(LOGO);
    rerender(<PersonCard card={{ ...skater, photoUrl: '/b.png' }} width={420} logoUrl={LOGO} />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/b.png');
  });
});
