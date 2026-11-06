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

const image = (container: HTMLElement, src: string) => container.querySelector<HTMLImageElement>(`img[src="${src}"]`);
const photo = (container: HTMLElement, src = '/photo.png') => image(container, src);
const logo = (container: HTMLElement) => image(container, LOGO);

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
    const img = photo(container)!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.hidden).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.load(img);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('loads the team logo alongside the photo, hidden, so it is ready if the photo fails', () => {
    const { container } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} />);
    expect(logo(container)?.hidden).toBe(true);
    fireEvent.load(photo(container)!);
    expect(logo(container)?.hidden).toBe(true);
  });

  it('a failed photo shows the logo, and is ready at once when the logo has loaded already', () => {
    const onReady = vi.fn<() => void>();
    const { container } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} onReady={onReady} />);
    fireEvent.load(logo(container)!);
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.error(photo(container)!);
    expect(photo(container)).toBeNull();
    expect(logo(container)?.hidden).toBe(false);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a failed photo is ready once the logo has loaded, when it is still loading', () => {
    const onReady = vi.fn<() => void>();
    const { container } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} onReady={onReady} />);
    fireEvent.error(photo(container)!);
    expect(logo(container)?.hidden).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.load(logo(container)!);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('is ready when the fallback logo fails too, before or after the photo', () => {
    for (const logoFirst of [true, false]) {
      const onReady = vi.fn<() => void>();
      const { container, unmount } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} onReady={onReady} />);
      if (logoFirst) fireEvent.error(logo(container)!);
      fireEvent.error(photo(container)!);
      if (!logoFirst) fireEvent.error(logo(container)!);
      expect(onReady).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('with no photo, shows the logo and is ready once it has loaded', () => {
    const onReady = vi.fn<() => void>();
    const { container } = render(
      <PersonCard card={{ ...skater, photoUrl: null }} width={420} logoUrl={LOGO} onReady={onReady} />,
    );
    expect(logo(container)?.hidden).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.load(logo(container)!);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a failed photo with no logo is ready at once', () => {
    const onReady = vi.fn<() => void>();
    const { container } = render(<PersonCard card={skater} width={420} logoUrl={null} onReady={onReady} />);
    fireEvent.error(photo(container)!);
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
      expect(photo(container)).toBeNull();
      expect(logo(container)?.hidden).toBe(false);
    });

    it('shows the logo that has been loading since the card appeared, not one that starts loading then', () => {
      vi.useFakeTimers();
      const { container } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} />);
      const loading = logo(container);
      act(() => void fireEvent.load(loading!));
      act(() => void vi.advanceTimersByTime(4000));
      expect(logo(container)).toBe(loading);
      expect(loading?.hidden).toBe(false);
    });

    it('is ready once, however many loads follow', () => {
      vi.useFakeTimers();
      const onReady = vi.fn<() => void>();
      const { container, rerender } = render(<PersonCard card={skater} width={420} logoUrl={LOGO} onReady={onReady} />);
      fireEvent.load(photo(container)!);
      rerender(<PersonCard card={{ ...skater, photoUrl: '/new.png' }} width={420} logoUrl={LOGO} onReady={onReady} />);
      fireEvent.load(photo(container, '/new.png')!);
      act(() => void vi.advanceTimersByTime(5000));
      expect(onReady).toHaveBeenCalledTimes(1);
    });
  });

  it('tries a new photo when the photo address changes', () => {
    const { container, rerender } = render(
      <PersonCard card={{ ...skater, photoUrl: '/a.png' }} width={420} logoUrl={LOGO} />,
    );
    fireEvent.error(photo(container, '/a.png')!);
    expect(logo(container)?.hidden).toBe(false);
    rerender(<PersonCard card={{ ...skater, photoUrl: '/b.png' }} width={420} logoUrl={LOGO} />);
    expect(photo(container, '/b.png')?.hidden).toBe(false);
    expect(logo(container)?.hidden).toBe(true);
  });
});
