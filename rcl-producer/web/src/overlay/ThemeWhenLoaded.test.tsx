import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { DEFAULT_TOKENS, type ThemeChanged } from '@rollcall/producer-contract';
import { ThemeWhenLoaded } from './ThemeWhenLoaded.tsx';

const withAccent = (accent: string, family = 'Inter'): ThemeChanged => ({
  tokens: {
    ...DEFAULT_TOKENS,
    colors: { ...DEFAULT_TOKENS.colors, accent },
    fonts: { ...DEFAULT_TOKENS.fonts, heading: { ...DEFAULT_TOKENS.fonts.heading, family } },
  },
  families: [
    {
      name: family,
      bundled: true,
      faces: [
        { id: 'f', weightMin: 400, weightMax: 400, style: 'normal', format: 'font/woff2', url: '/fonts/x.woff2' },
      ],
    },
  ],
});
const RED = withAccent('#ff0000');
const GOLD = withAccent('#ffd700');

const accent = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-theme-scope]')?.style.getPropertyValue('--theme-color-accent');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => void (resolve = done));
  return { promise, resolve };
}

describe('ThemeWhenLoaded', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'fonts');
  });

  it('holds back what is inside until the first theme fonts have loaded', async () => {
    const pending = deferred();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn<() => Promise<unknown>>(() => pending.promise) },
    });
    const { container } = render(
      <ThemeWhenLoaded theme={RED}>
        <p>roster</p>
      </ThemeWhenLoaded>,
    );
    expect(container.textContent).not.toContain('roster');
    expect(container.querySelector('style[data-pending-fonts]')?.textContent).toContain('font-family: "Inter"');
    await act(async () => pending.resolve());
    expect(container.textContent).toContain('roster');
    expect(accent(container)).toBe('#ff0000');
    expect(container.querySelector('style[data-pending-fonts]')).toBeNull();
  });

  it("holds the old theme until the new theme's fonts load", async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn<() => Promise<unknown>>(() => Promise.resolve()) },
    });
    const { container, rerender } = render(<ThemeWhenLoaded theme={RED}>x</ThemeWhenLoaded>);
    await vi.waitFor(() => expect(accent(container)).toBe('#ff0000'));

    const pending = deferred();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn<() => Promise<unknown>>(() => pending.promise) },
    });
    rerender(<ThemeWhenLoaded theme={withAccent('#ffd700', 'Oswald')}>x</ThemeWhenLoaded>);
    expect(accent(container)).toBe('#ff0000');
    expect(container.querySelector('style[data-pending-fonts]')?.textContent).toContain('"Oswald"');
    await act(async () => pending.resolve());
    expect(accent(container)).toBe('#ffd700');
  });

  it('switches anyway when a font fails to load', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn<() => Promise<unknown>>(() => Promise.reject(new Error('no'))) },
    });
    const { container } = render(<ThemeWhenLoaded theme={GOLD}>x</ThemeWhenLoaded>);
    await vi.waitFor(() => expect(accent(container)).toBe('#ffd700'));
  });

  it('switches at once without a font loading API', () => {
    const { container, rerender } = render(<ThemeWhenLoaded theme={RED}>x</ThemeWhenLoaded>);
    expect(accent(container)).toBe('#ff0000');
    rerender(<ThemeWhenLoaded theme={GOLD}>x</ThemeWhenLoaded>);
    expect(accent(container)).toBe('#ffd700');
  });

  it('shows the built-in look at once for no theme', () => {
    const { container } = render(<ThemeWhenLoaded theme={null}>roster</ThemeWhenLoaded>);
    expect(container.textContent).toBe('roster');
  });
});
