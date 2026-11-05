import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
