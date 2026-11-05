import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import type { IntroRun } from '@rollcall/producer-contract';
import { json, signedIn } from '@rollcall/web-sdk/testing';
import { FakeSocket } from '../overlay/test-socket.ts';
import { intro, RUNNER, summary } from '../test/intro-fixtures.ts';
import { openProducer } from '../test/open-producer.tsx';

let socket = new FakeSocket();
vi.mock('socket.io-client', () => ({ io: () => socket }));

beforeEach(() => {
  socket = new FakeSocket();
});
afterEach(() => vi.useRealTimers());

const run = (change: Partial<IntroRun> = {}): IntroRun => ({
  revision: 1,
  team: null,
  title: false,
  onAir: false,
  people: [],
  onScreen: [],
  next: null,
  done: false,
  timerMsLeft: null,
  ...change,
});
const PEOPLE = [
  { id: 'p1', name: 'Ada Slam', number: '7', kind: 'skater' as const },
  { id: 'p2', name: 'Bea Block', number: '12', kind: 'skater' as const },
];
const SAVED = intro('i1', 'Saturday bout', { teamAId: 'tm1', teamBId: 'tm2' });

async function openRun(state = run(), more = {}) {
  const server = signedIn(RUNNER, {
    'GET /api/producer/intros/i1': json(SAVED),
    'GET /api/producer/intros/i1/run': json(state),
    'GET /api/core/teams': json([summary('tm1', 'Wreckers'), summary('tm2', 'Brawlers')]),
    ...more,
  });
  const router = openProducer('/producer/intros/i1/run');
  await screen.findByRole('heading', { name: 'Saturday bout' });
  await screen.findByRole('button', { name: 'Start Wreckers' });
  await vi.waitFor(() => expect(socket.listening).toBe(true));
  await tell('connect');
  return { ...server, router };
}

// The server says something. The page follows a moment later, once the store has told it.
const tell = (event: string, ...args: unknown[]) =>
  act(async () => {
    socket.emit(event, ...args);
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(20);
    else await new Promise((resolve) => setTimeout(resolve, 20));
  });
const send = (state: IntroRun) => tell('intro:run', state);

describe('the intro control page', () => {
  it("starts a team and marks who's on screen and who's next, as the server says", async () => {
    const started = run({ revision: 2, team: 'a', onAir: true, people: PEOPLE, onScreen: ['p1'], next: 'p2' });
    const { requests } = await openRun(run(), { 'POST /api/producer/intros/i1/start': json(started) });
    fireEvent.click(screen.getByRole('button', { name: 'Start Wreckers' }));
    await screen.findByText('Ada Slam');
    expect(requests).toContainEqual({ method: 'POST', path: '/api/producer/intros/i1/start', body: { team: 'a' } });
    expect(within(screen.getByText('Ada Slam').closest('li')!).getByText('On screen')).toBeTruthy();
    expect(within(screen.getByText('Bea Block').closest('li')!).getByText('Next')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('sends the revision it shows with Next', async () => {
    const { requests } = await openRun(run({ revision: 3, team: 'a', people: PEOPLE, next: 'p1' }), {
      'POST /api/producer/intros/i1/next': json(run({ revision: 4, team: 'a', people: PEOPLE, onScreen: ['p1'] })),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'POST', path: '/api/producer/intros/i1/next', body: { revision: 3 } }),
    );
  });

  it('shows a newer state from the socket and ignores an older one', async () => {
    await openRun(run({ revision: 3, team: 'a', people: PEOPLE }));
    await send(run({ revision: 4, team: 'a', people: PEOPLE, title: true }));
    expect(screen.getByText('Title card is up')).toBeTruthy();
    await send(run({ revision: 2, team: 'a', people: PEOPLE, title: false }));
    expect(screen.getByText('Title card is up')).toBeTruthy();
  });

  it('accepts an older state after a reconnect', async () => {
    await openRun(run({ revision: 9, team: 'a', people: PEOPLE, title: true }));
    await tell('disconnect');
    await tell('connect');
    await send(run({ revision: 1, team: 'a', people: PEOPLE, title: false }));
    expect(screen.queryByText('Title card is up')).toBeNull();
  });

  it('disables the buttons while the connection is down', async () => {
    await openRun(run({ team: 'a', people: PEOPLE }));
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(false);
    await tell('disconnect');
    expect(screen.getByText('Reconnecting… The buttons come back when the connection does.')).toBeTruthy();
    for (const name of ['Start Wreckers', 'Start Brawlers', 'Next', 'Clear']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    }
  });

  it('says the team is done after the last person', async () => {
    await openRun(run({ team: 'a', people: PEOPLE, onScreen: ['p1', 'p2'], done: true }));
    const button = screen.getByRole('button', { name: 'Team done' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('counts down to the next step on the timer', async () => {
    await openRun(run({ team: 'a', people: PEOPLE, next: 'p2' }));
    vi.useFakeTimers();
    await send(run({ revision: 2, team: 'a', people: PEOPLE, next: 'p2', timerMsLeft: 5000 }));
    expect(screen.getByText('Next in 5 s')).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByText('Next in 3 s')).toBeTruthy();
  });

  it('shows the server’s message when a team is not picked', async () => {
    await openRun(run(), {
      'POST /api/producer/intros/i1/start': json({ error: 'no_team', message: 'Pick team A first' }, 409),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Wreckers' }));
    expect(await screen.findByText('Pick team A first')).toBeTruthy();
  });

  it('names a team that has left as Start team B and keeps it disabled', async () => {
    const server = signedIn(RUNNER, {
      'GET /api/producer/intros/i1': json(intro('i1', 'Saturday bout', { teamAId: 'tm1', teamBId: 'gone' })),
      'GET /api/producer/intros/i1/run': json(run()),
      'GET /api/core/teams': json([summary('tm1', 'Wreckers')]),
    });
    expect(server).toBeTruthy();
    openProducer('/producer/intros/i1/run');
    const button = await screen.findByRole('button', { name: 'Start team B' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('says so when the intro was deleted, and disables the buttons', async () => {
    await openRun(run(), { 'POST /api/producer/intros/i1/start': json({ error: 'not_found' }, 404) });
    fireEvent.click(screen.getByRole('button', { name: 'Start Wreckers' }));
    expect(await screen.findByText('This intro was deleted.')).toBeTruthy();
    const back = within(screen.getByText('This intro was deleted.').closest('.mantine-Alert-root')!);
    expect(back.getByRole('link', { name: 'Intros' }).getAttribute('href')).toBe('/producer/intros');
    expect(screen.getByRole('button', { name: 'Start Wreckers' }).hasAttribute('disabled')).toBe(true);
  });

  it('says so when the run cannot be found at all', async () => {
    signedIn(RUNNER, { 'GET /api/core/teams': json([]) });
    openProducer('/producer/intros/i1/run');
    expect(await screen.findByText('This intro was deleted.')).toBeTruthy();
  });
});
