import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { DEFAULT_TOKENS, type Theme } from '@rollcall/producer-contract';
import { ADMIN, ANNOUNCER, json, noContent, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openProducer, whereIs } from '../test/open-producer.tsx';

afterEach(() => vi.unstubAllGlobals());

const theme = (id: string, name: string, change: Partial<Theme> = {}): Theme => ({
  id,
  name,
  tokens: DEFAULT_TOKENS,
  isDefault: false,
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:00:00.000Z',
  ...change,
});
const NIGHT = theme('t1', 'Derby Night', {
  isDefault: true,
  tokens: { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: '#ffd700' } },
});
const FINALS = theme('t2', 'Finals');
const THEMES = [NIGHT, FINALS];

const rowOf = (name: string) => within(screen.getByRole('table')).getByText(name).closest('tr')!;

async function openThemes(user = ADMIN, more = {}) {
  const server = signedIn(user, { 'GET /api/producer/themes': json(THEMES), ...more });
  const router = openProducer('/producer/themes');
  await within(await screen.findByRole('table')).findByText('Derby Night');
  return { ...server, router };
}

// Opens a theme's row menu and picks `item`.
async function pick(name: string, item: string) {
  fireEvent.click(within(rowOf(name)).getByRole('button', { name: `Actions for ${name}` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
}

describe('the Themes page', () => {
  it('lists each theme with its default badge and its surface and accent colors, linking to it', async () => {
    await openThemes(PRODUCER);
    const night = within(rowOf('Derby Night'));
    expect(night.getByRole('link', { name: 'Derby Night' }).getAttribute('href')).toBe('/producer/themes/t1');
    expect(night.getByText('Default')).toBeTruthy();
    expect(night.getByText('Accent #ffd700')).toBeTruthy();
    expect(night.getByText(`Surface ${DEFAULT_TOKENS.colors.surface}`)).toBeTruthy();
    expect(within(rowOf('Finals')).queryByText('Default')).toBeNull();
    expect(screen.getByRole('link', { name: 'Themes' })).toBeTruthy();
  });

  it('creates a theme from its name, then opens it', async () => {
    const created = theme('t3', 'Playoffs');
    const { requests, router } = await openThemes(ADMIN, {
      'POST /api/producer/themes': json(created, 201),
      'GET /api/producer/themes/t3': json(created),
      'GET /api/core/fonts': json([]),
    });
    fireEvent.change(screen.getByLabelText('New theme'), { target: { value: ' Playoffs ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create theme' }));
    await vi.waitFor(() => expect(whereIs(router)).toBe('/producer/themes/t3'));
    expect(requests).toContainEqual({ method: 'POST', path: '/api/producer/themes', body: { name: 'Playoffs' } });
  });

  it('asks for a name before sending anything, and shows a name that is taken', async () => {
    const { requests } = await openThemes(ADMIN, {
      'POST /api/producer/themes': json({ error: 'name_taken', message: 'That name is already taken' }, 409),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create theme' }));
    expect(await screen.findByText('Give the theme a name')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
    fireEvent.change(screen.getByLabelText('New theme'), { target: { value: 'Finals' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create theme' }));
    expect(await screen.findByText('That name is already taken')).toBeTruthy();
  });

  it('duplicates a theme from its menu', async () => {
    const { requests } = await openThemes(ADMIN, {
      'POST /api/producer/themes/t2/duplicate': json(theme('t4', 'Finals copy'), 201),
    });
    await pick('Finals', 'Duplicate');
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'POST', path: '/api/producer/themes/t2/duplicate', body: {} }),
    );
  });

  it('makes a theme the default, or stops using the default', async () => {
    const { requests } = await openThemes(ADMIN, {
      'PUT /api/producer/default-theme': async (request: Request) => Response.json(await request.json()),
    });
    await pick('Finals', 'Make default');
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'PUT', path: '/api/producer/default-theme', body: { themeId: 't2' } }),
    );
    await pick('Derby Night', 'Stop using as default');
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'PUT', path: '/api/producer/default-theme', body: { themeId: null } }),
    );
  });

  it('deletes a theme once you confirm, warning when it is the default', async () => {
    const { requests } = await openThemes(ADMIN, { 'DELETE /api/producer/themes/t1': noContent });
    await pick('Derby Night', 'Delete');
    const confirm = await screen.findByRole('dialog', { name: 'Delete Derby Night?' });
    expect(
      within(confirm).getByText('The overlay goes back to the built-in look. This cannot be undone.'),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete theme' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/producer/themes/t1', body: undefined }),
    );
  });

  it('is read-only for a Producer, who may still export themes', async () => {
    await openThemes(PRODUCER);
    expect(screen.queryByRole('button', { name: 'Create theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import…' })).toBeNull();
    fireEvent.click(within(rowOf('Derby Night')).getByRole('button', { name: 'Actions for Derby Night' }));
    expect((await screen.findByRole('menuitem', { name: 'Export' })).getAttribute('href')).toBe(
      '/api/core/transfer/export?items=producer%3Atheme%3At1',
    );
    expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Export all' }).getAttribute('href')).toBe(
      '/api/core/transfer/export?kinds=producer%3Atheme',
    );
  });

  it('opens the Import dialog for an Admin', async () => {
    await openThemes(ADMIN);
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeTruthy();
  });

  it('hides the page and its link from someone who may not view themes', async () => {
    signedIn(ANNOUNCER);
    openProducer('/producer/themes');
    expect(await screen.findByText("Your account can't view themes.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Themes' })).toBeNull();
  });
});
