import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { json, noContent, signedIn } from '@rollcall/web-sdk/testing';
import { intro, MANAGER, RUNNER, summary } from '../test/intro-fixtures.ts';
import { openProducer, whereIs } from '../test/open-producer.tsx';

const WRECKERS = summary('tm1', 'Wreckers');
const BRAWLERS = summary('tm2', 'Brawlers');
const INTROS = [intro('i1', 'Saturday bout', { teamAId: 'tm1', teamBId: 'tm2' }), intro('i2', 'Practice')];

async function openIntros(user = MANAGER, more = {}) {
  const server = signedIn(user, {
    'GET /api/producer/intros': json(INTROS),
    'GET /api/core/teams': json([WRECKERS, BRAWLERS]),
    ...more,
  });
  const router = openProducer('/producer/intros');
  await screen.findByText('Saturday bout');
  return { ...server, router };
}

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('the Intros page', () => {
  it('lists intros with their teams', async () => {
    await openIntros();
    expect(screen.getByRole('heading', { name: 'Intros' })).toBeTruthy();
    expect(within(rowOf('Saturday bout')).getByText('Wreckers vs Brawlers')).toBeTruthy();
    expect(within(rowOf('Practice')).getByText('No teams yet')).toBeTruthy();
    expect(within(rowOf('Saturday bout')).getByRole('link', { name: 'Run' }).getAttribute('href')).toBe(
      '/producer/intros/i1/run',
    );
    expect(within(rowOf('Saturday bout')).getByRole('link', { name: 'Set up' }).getAttribute('href')).toBe(
      '/producer/intros/i1',
    );
    expect(screen.getByRole('link', { name: 'Intros' })).toBeTruthy();
  });

  it('creates an intro by name and opens its setup page', async () => {
    const created = intro('i3', 'Finals');
    const { requests, router } = await openIntros(MANAGER, {
      'POST /api/producer/intros': json(created, 201),
      'GET /api/producer/intros/i3': json(created),
      'GET /api/producer/themes': json([]),
      'GET /api/core/fonts': json([]),
    });
    fireEvent.change(screen.getByLabelText('Intro name'), { target: { value: ' Finals ' } });
    fireEvent.click(screen.getByRole('button', { name: 'New intro' }));
    await vi.waitFor(() => expect(whereIs(router)).toBe('/producer/intros/i3'));
    expect(requests).toContainEqual({ method: 'POST', path: '/api/producer/intros', body: { name: 'Finals' } });
  });

  it('asks before deleting', async () => {
    const { requests } = await openIntros(MANAGER, { 'DELETE /api/producer/intros/i2': noContent });
    fireEvent.click(within(rowOf('Practice')).getByRole('button', { name: 'Delete Practice' }));
    const confirm = await screen.findByRole('dialog');
    expect(
      within(confirm).getByText('Delete intro “Practice”? Its OBS browser source will show nothing.'),
    ).toBeTruthy();
    expect(requests.filter((r) => r.method === 'DELETE')).toEqual([]);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/producer/intros/i2', body: undefined }),
    );
  });

  it('without intros.manage, shows Run but not Set up, New intro or Delete', async () => {
    await openIntros(RUNNER);
    expect(within(rowOf('Practice')).getByRole('link', { name: 'Run' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Set up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New intro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Practice' })).toBeNull();
  });
});
