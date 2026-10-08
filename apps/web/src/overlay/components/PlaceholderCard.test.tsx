import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaceholderCard } from './PlaceholderCard.tsx';

describe('PlaceholderCard', () => {
  it('renders the title and subtitle it is given', () => {
    render(<PlaceholderCard title="Rollcall" subtitle="v0.1.0" />);
    expect(screen.getByText('Rollcall')).toBeTruthy();
    expect(screen.getByText('v0.1.0')).toBeTruthy();
  });

  it('leaves out the subtitle when there is none', () => {
    const { container } = render(<PlaceholderCard title="Rollcall" />);
    expect(container.textContent).toBe('Rollcall');
  });
});
