import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { FontFamily } from '@rollcall/core-contract';
import { DEFAULT_TOKENS, type Theme, type ThemeTokens } from '@rollcall/producer-contract';
import { ADMIN, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openProducer } from '../test/open-producer.tsx';

afterEach(() => vi.unstubAllGlobals());

const family = (name: string): FontFamily => ({
  name,
  bundled: true,
  faces: [{ id: name, weightMin: 100, weightMax: 900, style: 'normal', format: 'font/ttf', url: `/fonts/${name}.ttf` }],
});
const LIBRARY = [family('Inter'), family('Oswald')];
const THEME: Theme = {
  id: 't1',
  name: 'Derby Night',
  tokens: DEFAULT_TOKENS,
  isDefault: false,
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:00:00.000Z',
};
const withTokens = (change: (tokens: ThemeTokens) => void): Theme => {
  const tokens = structuredClone(DEFAULT_TOKENS);
  change(tokens);
  return { ...THEME, tokens };
};

const scope = () => document.querySelector<HTMLElement>('[data-theme-scope]')!;
const variable = (name: string) => scope().style.getPropertyValue(name);
const patches = (requests: { method: string }[]) => requests.filter((r) => r.method === 'PATCH');

async function openTheme(user = ADMIN, theme = THEME, more = {}) {
  const server = signedIn(user, {
    'GET /api/producer/themes/t1': json(theme),
    'GET /api/core/fonts': json(LIBRARY),
    ...more,
  });
  openProducer('/producer/themes/t1');
  expect(await screen.findByRole('heading', { name: theme.name })).toBeTruthy();
  await vi.waitFor(() => expect(variable('--theme-color-accent')).toBe(theme.tokens.colors.accent));
  return server;
}

describe('the theme editor', () => {
  it('shows a live preview that follows every change before it is saved', async () => {
    const { requests } = await openTheme();
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#ffd700' } });
    await vi.waitFor(() => expect(variable('--theme-color-accent')).toBe('#ffd700'));
    fireEvent.change(screen.getByLabelText('Heading font'), { target: { value: 'Oswald' } });
    await vi.waitFor(() => expect(variable('--theme-font-heading')).toBe('"Oswald", system-ui, sans-serif'));
    expect(scope().querySelector('style')?.textContent).toContain('font-family: "Oswald";');
    expect(within(scope()).getByText('Accent bar')).toBeTruthy();
    expect(patches(requests)).toEqual([]);
  });

  it('saves the name and every token, checked against the contract first', async () => {
    const saved = withTokens((tokens) => {
      tokens.colors.accent = '#ffd700';
      tokens.shape.radius = 0;
    });
    const { requests } = await openTheme(ADMIN, THEME, { 'PATCH /api/producer/themes/t1': json(saved) });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Derby Night 2' } });
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#FFD700' } });
    fireEvent.change(screen.getByLabelText('Corner radius'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await vi.waitFor(() =>
      expect(patches(requests)).toEqual([
        {
          method: 'PATCH',
          path: '/api/producer/themes/t1',
          body: { name: 'Derby Night 2', tokens: saved.tokens },
        },
      ]),
    );
  });

  it('refuses what the contract refuses, in its own words, sending nothing', async () => {
    const { requests } = await openTheme();
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: 'gold' } });
    fireEvent.change(screen.getByLabelText('Base size'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    expect(await screen.findByText('Use a color like #1a2b3c')).toBeTruthy();
    expect(screen.getByText('Use 12 to 96 pixels')).toBeTruthy();
    expect(patches(requests)).toEqual([]);
  });

  it('shows the server’s reason when it refuses a save', async () => {
    await openTheme(ADMIN, THEME, {
      'PATCH /api/producer/themes/t1': json({ error: 'name_taken', message: 'That name is already taken' }, 409),
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Finals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    expect(await screen.findByText('That name is already taken')).toBeTruthy();
  });

  it('discards changes, back to the saved theme', async () => {
    await openTheme();
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#ffd700' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await vi.waitFor(() => expect(variable('--theme-color-accent')).toBe(DEFAULT_TOKENS.colors.accent));
    expect(screen.getByLabelText<HTMLInputElement>('Accent').value).toBe(DEFAULT_TOKENS.colors.accent);
  });

  it('adds, names and removes extra colors, up to 10', async () => {
    await openTheme();
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }));
    expect(screen.getByLabelText<HTMLInputElement>('Extra color 1 name').value).toBe('color-1');
    fireEvent.change(screen.getByLabelText('Extra color 1 name'), { target: { value: 'gold' } });
    fireEvent.change(screen.getByLabelText('Extra color 1'), { target: { value: '#ffd700' } });
    await vi.waitFor(() => expect(variable('--theme-extra-gold')).toBe('#ffd700'));
    expect(within(scope()).getByText('gold')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove extra color 1' }));
    expect(screen.queryByLabelText('Extra color 1 name')).toBeNull();
    for (let n = 0; n < 10; n += 1) fireEvent.click(screen.getByRole('button', { name: 'Add color' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add color' }).disabled).toBe(true);
  });

  it('marks a font that is not in the library, which the overlay shows in a system font', async () => {
    await openTheme(
      ADMIN,
      withTokens((tokens) => void (tokens.fonts.heading.family = 'Gone')),
    );
    expect(await screen.findByRole('option', { name: 'Gone (missing)' })).toBeTruthy();
    expect(screen.getByText('This font isn’t in the font library, so the overlay uses a system font.')).toBeTruthy();
  });

  it('says when saving changes the OBS overlay at once', async () => {
    await openTheme(ADMIN, { ...THEME, isDefault: true });
    expect(screen.getByText('This is the default theme: saving changes the OBS overlay at once.')).toBeTruthy();
  });

  it('is a read-only preview for a Producer', async () => {
    await openTheme(PRODUCER);
    expect(screen.queryByLabelText('Accent')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save theme' })).toBeNull();
    expect(within(scope()).getByText('Heading')).toBeTruthy();
  });

  it('keeps a colleague’s change to a token you didn’t touch, and shows it after your save', async () => {
    let current = THEME;
    const { requests } = await openTheme(ADMIN, THEME, {
      'GET /api/producer/themes/t1': () => Response.json(current),
      'PATCH /api/producer/themes/t1': async (request: Request) => {
        const { tokens } = (await request.json()) as { tokens: ThemeTokens };
        current = { ...current, tokens, updatedAt: '2026-10-24T12:00:00.000Z' };
        return Response.json(current);
      },
    });
    // Meanwhile, a colleague saves a new border color.
    current = {
      ...withTokens((tokens) => void (tokens.colors.border = '#00c853')),
      updatedAt: '2026-10-24T11:00:00.000Z',
    };
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#ffd700' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await vi.waitFor(() => expect(patches(requests)).toHaveLength(1));
    expect(patches(requests)[0]).toMatchObject({
      body: { tokens: { colors: { accent: '#ffd700', border: '#00c853' } } },
    });
    await vi.waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Border').value).toBe('#00c853'));
    expect(screen.getByLabelText<HTMLInputElement>('Accent').value).toBe('#ffd700');
  });

  it('sends your change to a token a colleague changed too: the last save wins', async () => {
    let current = THEME;
    const { requests } = await openTheme(ADMIN, THEME, {
      'GET /api/producer/themes/t1': () => Response.json(current),
      'PATCH /api/producer/themes/t1': () => Response.json(current),
    });
    current = withTokens((tokens) => void (tokens.colors.accent = '#111111'));
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#ffd700' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await vi.waitFor(() => expect(patches(requests)).toHaveLength(1));
    expect(patches(requests)[0]).toMatchObject({ body: { tokens: { colors: { accent: '#ffd700' } } } });
  });

  it('says when the font library can’t be loaded', async () => {
    await openTheme(ADMIN, THEME, { 'GET /api/core/fonts': json({ error: 'internal_error' }, 500) });
    expect(await screen.findByText('Can’t load the font library')).toBeTruthy();
    expect(screen.getByText('Something went wrong. Try again.')).toBeTruthy();
  });

  it('shows the library’s spelling of a family whose capitals differ', async () => {
    await openTheme(
      ADMIN,
      withTokens((tokens) => void (tokens.fonts.heading.family = 'oswald')),
    );
    await vi.waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('Heading font').value).toBe('Oswald'));
    expect(screen.queryByRole('option', { name: /missing/ })).toBeNull();
  });

  it('says when the theme does not exist', async () => {
    signedIn(ADMIN, { 'GET /api/core/fonts': json(LIBRARY) });
    openProducer('/producer/themes/t1');
    expect(await screen.findByText('That theme doesn’t exist. It may have been deleted.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to themes' })).toBeTruthy();
  });
});
