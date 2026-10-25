import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FontFamily } from '@rollcall/core-contract';
import { DEFAULT_TOKENS, themeToCss } from '@rollcall/producer-contract';
import { ThemeScope } from './ThemeScope.tsx';

const INTER: FontFamily = {
  name: 'Inter',
  bundled: true,
  faces: [{ id: 'inter', weightMin: 100, weightMax: 900, style: 'normal', format: 'font/ttf', url: '/fonts/i.ttf' }],
};
const GOLD = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: '#ffd700' } };

const scopeOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-theme-scope]')!;

describe('ThemeScope', () => {
  it('gives what is inside it the theme’s variables and font faces', () => {
    const { container } = render(
      <ThemeScope css={themeToCss(GOLD, [INTER])}>
        <span>Jam 3</span>
      </ThemeScope>,
    );
    expect(screen.getByText('Jam 3')).toBeTruthy();
    expect(scopeOf(container).style.getPropertyValue('--theme-color-accent')).toBe('#ffd700');
    expect(scopeOf(container).style.getPropertyValue('--theme-font-body')).toBe('"Inter", system-ui, sans-serif');
    expect(container.querySelector('style')?.textContent).toContain('font-family: "Inter";');
  });

  it('follows a new theme, and with none lets the built-in look show through', () => {
    const { container, rerender } = render(<ThemeScope css={themeToCss(GOLD, [INTER])}>x</ThemeScope>);
    rerender(<ThemeScope css={themeToCss(DEFAULT_TOKENS, [])}>x</ThemeScope>);
    expect(scopeOf(container).style.getPropertyValue('--theme-color-accent')).toBe(DEFAULT_TOKENS.colors.accent);
    expect(container.querySelector('style')).toBeNull();
    rerender(<ThemeScope css={null}>x</ThemeScope>);
    expect(scopeOf(container).style.getPropertyValue('--theme-color-accent')).toBe('');
  });
});
