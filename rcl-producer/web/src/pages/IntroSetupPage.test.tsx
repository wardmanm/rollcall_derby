import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Team, TeamSummary } from '@rollcall/core-contract';
import { DEFAULT_TOKENS } from '@rollcall/producer-contract';
import { json, signedIn } from '@rollcall/web-sdk/testing';
import { intro, MANAGER, summary } from '../test/intro-fixtures.ts';
import { openProducer } from '../test/open-producer.tsx';

afterEach(() => vi.unstubAllGlobals());

const omitCounts = ({ skaterCount: _s, benchCount: _b, ...rest }: TeamSummary) => rest;
const team = (id: string, name: string): Team => ({
  ...omitCounts(summary(id, name)),
  createdAt: '2026-11-01T10:00:00.000Z',
  members: [
    {
      id: `${id}-m1`,
      kind: 'skater',
      name: 'Ada Slam',
      number: '7',
      pronouns: null,
      roles: [],
      customRoles: [],
      photoUrl: null,
    },
  ],
});
const SAVED = intro('i1', 'Saturday bout', { teamAId: 'tm1', teamBId: 'tm2' });
const THEME = {
  id: 't1',
  name: 'Finals',
  tokens: DEFAULT_TOKENS,
  isDefault: false,
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:00:00.000Z',
};

async function openSetup(saved = SAVED, more = {}, user = MANAGER) {
  const server = signedIn(user, {
    'GET /api/producer/intros/i1': json(saved),
    'GET /api/core/teams': json([summary('tm1', 'Wreckers'), summary('tm2', 'Brawlers')]),
    'GET /api/core/teams/tm1': json(team('tm1', 'Wreckers')),
    'GET /api/core/teams/tm2': json(team('tm2', 'Brawlers')),
    'GET /api/producer/themes': json([THEME]),
    'GET /api/core/fonts': json([]),
    ...more,
  });
  const router = openProducer('/producer/intros/i1');
  await screen.findByDisplayValue('Saturday bout');
  return { ...server, router };
}

const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const patches = (requests: { method: string }[]) => requests.filter((r) => r.method === 'PATCH');

describe('the intro setup page', () => {
  it('shows the saved settings', async () => {
    await openSetup(
      intro('i1', 'Saturday bout', {
        teamAId: 'tm1',
        teamBId: 'tm2',
        themeId: 't1',
        placement: { spot: 'top-left', edge: 20 },
        options: { atOnce: 'team', advance: { mode: 'timer', seconds: 5 }, entrance: 'wipe', showPronouns: false },
      }),
    );
    await screen.findAllByRole('option', { name: 'Wreckers' });
    expect(screen.getByLabelText<HTMLSelectElement>('Team A').value).toBe('tm1');
    expect(screen.getByLabelText<HTMLSelectElement>('Team B').value).toBe('tm2');
    expect(screen.getByLabelText<HTMLSelectElement>('Theme').value).toBe('t1');
    expect(screen.getByLabelText<HTMLSelectElement>('How many at once').value).toBe('team');
    expect(screen.getByLabelText<HTMLSelectElement>('Moves on').value).toBe('timer');
    expect(screen.getByLabelText<HTMLInputElement>('Seconds per step').value).toBe('5');
    expect(screen.getByLabelText<HTMLSelectElement>('Entrance').value).toBe('wipe');
    expect(screen.getByLabelText<HTMLInputElement>('Show pronouns').checked).toBe(false);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Top left' }).checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Distance from the edge (px)').value).toBe('20');
    expect(screen.getAllByRole('option', { name: /^Default theme$/ })).toHaveLength(1);
  });

  it('hides the seconds unless it moves on a timer', async () => {
    await openSetup();
    expect(screen.queryByLabelText('Seconds per step')).toBeNull();
    choose('Moves on', 'timer');
    expect(await screen.findByLabelText('Seconds per step')).toBeTruthy();
  });

  it('saves the changes it sends', async () => {
    const { requests } = await openSetup(SAVED, {
      'PATCH /api/producer/intros/i1': json({
        ...SAVED,
        name: 'Sunday bout',
        options: { ...SAVED.options, atOnce: 3 },
      }),
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sunday bout' } });
    choose('How many at once', '3');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(patches(requests)).toHaveLength(1));
    expect(patches(requests)[0]).toEqual({
      method: 'PATCH',
      path: '/api/producer/intros/i1',
      body: {
        name: 'Sunday bout',
        options: { atOnce: 3, advance: { mode: 'next' }, entrance: 'pop', showPronouns: true },
      },
    });
  });

  it('saves the pronouns switch, and the preview follows it before saving', async () => {
    const withPronouns = {
      ...team('tm1', 'Wreckers'),
      members: [{ ...team('tm1', 'Wreckers').members[0]!, roles: ['captain' as const], pronouns: 'she/her' }],
    };
    const { requests } = await openSetup(SAVED, {
      'GET /api/core/teams/tm1': json(withPronouns),
      'PATCH /api/producer/intros/i1': json({ ...SAVED, options: { ...SAVED.options, showPronouns: false } }),
    });
    const preview = screen.getByTestId('intro-preview');
    const toggle = screen.getByLabelText<HTMLInputElement>('Show pronouns');
    expect(toggle.checked).toBe(true);
    // The preview loops through its title card and then the cards, so wait for a card to be showing.
    const slow = { timeout: 4000 };
    await vi.waitFor(() => expect(preview.textContent).toContain('Captain · she/her'), slow);
    fireEvent.click(toggle);
    await vi.waitFor(() => {
      expect(preview.textContent).toContain('Captain');
      expect(preview.textContent).not.toContain('she/her');
    }, slow);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(patches(requests)).toHaveLength(1));
    expect(patches(requests)[0]).toMatchObject({
      body: { options: { atOnce: 1, advance: { mode: 'next' }, entrance: 'pop', showPronouns: false } },
    });
  });

  it('refuses the same team twice before sending', async () => {
    const { requests } = await openSetup();
    await screen.findAllByRole('option', { name: 'Wreckers' });
    choose('Team B', 'tm1');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Pick two different teams')).toBeTruthy();
    expect(patches(requests)).toEqual([]);
  });

  it('says when a team was deleted', async () => {
    await openSetup(intro('i1', 'Saturday bout', { teamAId: 'gone', teamBId: 'tm2' }));
    expect(await screen.findByText('This team was deleted. Pick another.')).toBeTruthy();
  });

  it('says "Teams unavailable" in the team fields when the teams can’t be loaded, and keeps the saved teams', async () => {
    const { requests } = await openSetup(SAVED, {
      'GET /api/core/teams': json({ error: 'internal', message: 'Boom' }, 500),
      'PATCH /api/producer/intros/i1': json({ ...SAVED, name: 'Sunday bout' }),
    });
    const teamA = screen.getByLabelText<HTMLSelectElement>('Team A');
    await vi.waitFor(() => expect(teamA.selectedOptions[0]?.textContent).toBe('Teams unavailable'));
    expect(teamA.value).toBe('tm1');
    expect(screen.getByLabelText<HTMLSelectElement>('Team B').selectedOptions[0]?.textContent).toBe(
      'Teams unavailable',
    );
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sunday bout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(patches(requests)).toHaveLength(1));
    expect(patches(requests)).toEqual([expect.objectContaining({ body: { name: 'Sunday bout' } })]);
  });

  it('keeps a deleted theme, and asks for another', async () => {
    const { requests } = await openSetup(intro('i1', 'Saturday bout', { teamAId: 'tm1', themeId: 'gone' }), {
      'PATCH /api/producer/intros/i1': json({ ...SAVED, name: 'Sunday bout' }),
    });
    const theme = screen.getByLabelText<HTMLSelectElement>('Theme');
    await vi.waitFor(() => expect(theme.selectedOptions[0]?.textContent).toBe('Deleted theme'));
    expect(theme.value).toBe('gone');
    expect(screen.getByText('This theme was deleted. Pick another.')).toBeTruthy();
    // Saving something else leaves the theme alone.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sunday bout' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(patches(requests)).toHaveLength(1));
    expect(patches(requests)).toEqual([expect.objectContaining({ body: { name: 'Sunday bout' } })]);
  });

  it('names a saved theme it can’t list by why, and keeps it', async () => {
    const saved = intro('i1', 'Saturday bout', { teamAId: 'tm1', themeId: 't1' });
    const cases = [
      { label: 'Themes unavailable', more: { 'GET /api/producer/themes': json({ error: 'internal' }, 500) } },
      { label: '…', more: { 'GET /api/producer/themes': () => new Promise<Response>(() => {}) } },
      {
        label: 'Saved theme',
        user: { ...MANAGER, permissions: MANAGER.permissions.filter((p) => p !== 'producer:themes.read') },
      },
    ];
    for (const { label, more, user } of cases) {
      cleanup();
      await openSetup(saved, more, user);
      const theme = screen.getByLabelText<HTMLSelectElement>('Theme');
      await vi.waitFor(() => expect(theme.selectedOptions[0]?.textContent).toBe(label));
      expect(theme.value).toBe('t1');
      expect(screen.queryByText('This theme was deleted. Pick another.')).toBeNull();
    }
  });

  it('shows the OBS address to copy', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await openSetup();
    expect(screen.getByText('OBS browser source')).toBeTruthy();
    const address = `${location.origin}/producer/overlay/intros/i1`;
    expect(screen.getByText(address)).toBeTruthy();
    expect(screen.getByText('Add it to OBS as a browser source sized 1920×1080.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(address));
  });

  it('previews team A’s title card', async () => {
    await openSetup();
    expect(await screen.findByText('Wreckers', { selector: 'div' })).toBeTruthy();
  });
});
