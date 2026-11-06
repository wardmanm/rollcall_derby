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

/** A font load that never ends. */
const hang = () => new Promise<unknown>(() => undefined);

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

  it('waits for every face of a family, not just the regular one', async () => {
    const loads = new Map<string, ReturnType<typeof deferred>>();
    const load = vi.fn<(font: string) => Promise<unknown>>((font) => {
      const entry = deferred();
      loads.set(font, entry);
      return entry.promise;
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    const theme = withAccent('#ff0000');
    const [family] = theme!.families;
    family!.faces.push({
      id: 'g',
      weightMin: 700,
      weightMax: 700,
      style: 'normal',
      format: 'font/woff2',
      url: '/fonts/x-bold.woff2',
    });
    const { container } = render(<ThemeWhenLoaded theme={theme}>x</ThemeWhenLoaded>);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenCalledWith('normal 400 1em "Inter"');
    expect(load).toHaveBeenCalledWith('normal 700 1em "Inter"');
    await act(async () => loads.get('normal 400 1em "Inter"')!.resolve());
    expect(accent(container)).toBeUndefined();
    await act(async () => loads.get('normal 700 1em "Inter"')!.resolve());
    expect(accent(container)).toBe('#ff0000');
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

  describe('with fonts that hang', () => {
    afterEach(() => vi.useRealTimers());

    it('applies the theme after 4 s anyway', async () => {
      vi.useFakeTimers();
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { load: vi.fn<() => Promise<unknown>>(hang) },
      });
      const { container } = render(<ThemeWhenLoaded theme={RED}>roster</ThemeWhenLoaded>);
      await act(async () => void vi.advanceTimersByTime(3999));
      expect(container.textContent).not.toContain('roster');
      await act(async () => void vi.advanceTimersByTime(1));
      expect(accent(container)).toBe('#ff0000');
    });

    it("doesn't apply an old theme when its 4 s run out after a newer theme came", async () => {
      vi.useFakeTimers();
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { load: vi.fn<() => Promise<unknown>>(hang) },
      });
      const { container, rerender } = render(<ThemeWhenLoaded theme={RED}>x</ThemeWhenLoaded>);
      await act(async () => void vi.advanceTimersByTime(2000));
      rerender(<ThemeWhenLoaded theme={withAccent('#ffd700', 'Oswald')}>x</ThemeWhenLoaded>);
      await act(async () => void vi.advanceTimersByTime(2000));
      expect(accent(container)).toBeUndefined();
      await act(async () => void vi.advanceTimersByTime(2000));
      expect(accent(container)).toBe('#ffd700');
    });

    it('stops waiting when it unmounts', () => {
      vi.useFakeTimers();
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { load: vi.fn<() => Promise<unknown>>(hang) },
      });
      const { unmount } = render(<ThemeWhenLoaded theme={RED}>x</ThemeWhenLoaded>);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("a newer theme wins: the old theme's fonts finishing don't apply it", async () => {
    const loads = new Map<string, ReturnType<typeof deferred>>();
    const load = vi.fn<(font: string) => Promise<unknown>>((font) => {
      const entry = deferred();
      loads.set(font, entry);
      return entry.promise;
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    const { container, rerender } = render(<ThemeWhenLoaded theme={RED}>x</ThemeWhenLoaded>);
    rerender(<ThemeWhenLoaded theme={withAccent('#ffd700', 'Oswald')}>x</ThemeWhenLoaded>);
    await vi.waitFor(() => expect(loads.has('normal 400 1em "Oswald"')).toBe(true));
    await act(async () => loads.get('normal 400 1em "Inter"')!.resolve());
    expect(accent(container)).toBeUndefined();
    await act(async () => loads.get('normal 400 1em "Oswald"')!.resolve());
    expect(accent(container)).toBe('#ffd700');
  });
});
