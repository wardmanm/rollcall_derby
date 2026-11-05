import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import type { IntroRun } from '@rollcall/producer-contract';
import { App, makeStore } from '@rollcall/web-sdk';
import { json, signedIn } from '@rollcall/web-sdk/testing';
import { PRODUCER_BASE } from '../base.ts';
import { FakeSocket } from '../overlay/test-socket.ts';
import { intro, RUNNER, summary } from '../test/intro-fixtures.ts';
import { openProducer } from '../test/open-producer.tsx';
import { IntroRunPage } from './IntroRunPage.tsx';

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
  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start Wreckers' }).hasAttribute('disabled')).toBe(false),
  );
  return { ...server, router };
}

// The server says something. The page follows once the store has told it, so tests wait for what they expect to see.
const tell = (event: string, ...args: unknown[]) =>
  act(async () => {
    socket.emit(event, ...args);
    await Promise.resolve();
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
    await screen.findByText('Title card is up');
    // Watch the page for the stale state's mark, then send a newer state to know the stale one has had its chance.
    let staleShown = false;
    const watcher = new MutationObserver(() => {
      if (document.body.textContent.includes('Stale Sam')) staleShown = true;
    });
    watcher.observe(document.body, { childList: true, subtree: true, characterData: true });
    await send(
      run({
        revision: 2,
        team: 'a',
        title: false,
        people: [{ id: 'p9', name: 'Stale Sam', number: '1', kind: 'skater' }],
      }),
    );
    await send(run({ revision: 5, team: 'a', people: PEOPLE, title: true }));
    await screen.findByText('Ada Slam');
    watcher.disconnect();
    expect(staleShown).toBe(false);
    expect(screen.getByText('Title card is up')).toBeTruthy();
  });

  it('accepts an older state after a reconnect', async () => {
    await openRun(run({ revision: 9, team: 'a', people: PEOPLE, title: true }));
    await tell('disconnect');
    await tell('connect');
    await send(run({ revision: 1, team: 'a', people: PEOPLE, title: false }));
    await vi.waitFor(() => expect(screen.queryByText('Title card is up')).toBeNull());
  });

  it('keeps the buttons enabled when the run is fetched again while connected', async () => {
    // The second fetch has a newer state, so the page shows when it has arrived.
    const states = [run({ revision: 3, team: 'a', people: PEOPLE }), run({ revision: 4, team: 'a', title: true })];
    let fetches = 0;
    await openRun(states[0], { 'GET /api/producer/intros/i1/run': () => Response.json(states[fetches++]) });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await screen.findByText('Title card is up');
    expect(fetches).toBe(2);
    expect(screen.queryByText(/onnecting/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(false);
  });

  it('says nothing about the connection on load, then "Connecting…" once it has taken a second', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    signedIn(RUNNER, {
      'GET /api/producer/intros/i1': json(SAVED),
      'GET /api/producer/intros/i1/run': json(run({ team: 'a', people: PEOPLE })),
      'GET /api/core/teams': json([summary('tm1', 'Wreckers'), summary('tm2', 'Brawlers')]),
    });
    openProducer('/producer/intros/i1/run');
    await vi.waitFor(() => {
      expect(socket.listening).toBe(true);
      expect(screen.getByText('Ada Slam')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start Wreckers' })).toBeTruthy();
    });
    expect(screen.queryByText(/onnecting/)).toBeNull();
    for (const name of ['Start Wreckers', 'Start Brawlers', 'Next', 'Clear']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    }
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByText('Connecting…')).toBeTruthy();
    expect(screen.queryByText(/Reconnecting/)).toBeNull();
    await tell('connect');
    await vi.waitFor(() => expect(screen.queryByText('Connecting…')).toBeNull());
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(false);
  });

  it('disables the buttons while the connection is down', async () => {
    await openRun(run({ team: 'a', people: PEOPLE }));
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(false);
    await tell('disconnect');
    expect(await screen.findByText('Reconnecting… The buttons come back when the connection does.')).toBeTruthy();
    for (const name of ['Start Wreckers', 'Start Brawlers', 'Next', 'Clear']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    }
  });

  it('shows a loader, never "can\'t run intros", while your account is loading', async () => {
    signedIn(RUNNER, { 'GET /api/core/auth/me': () => new Promise<Response>(() => {}) }); // never answers
    // The page alone, without the sign-in gate, which waits for the account itself.
    const router = createMemoryRouter([{ path: '/intros/:id/run', element: <IntroRunPage /> }], {
      basename: PRODUCER_BASE,
      initialEntries: ['/producer/intros/i1/run'],
    });
    render(<App router={router} store={makeStore()} />);
    expect(await screen.findByRole('status', { name: 'Loading your account' })).toBeTruthy();
    expect(screen.queryByText("Your account can't run intros.")).toBeNull();
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
    await vi.waitFor(() => expect(screen.getByText('Next in 5 s')).toBeTruthy());
    // Two seconds plus a little: the 250 ms ticks land exactly on 2000 ms, and the extra margin keeps the rounding safe.
    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(screen.getByText('Next in 3 s')).toBeTruthy();
  });

  it('shows the server’s message when a team is not picked', async () => {
    await openRun(run(), {
      'POST /api/producer/intros/i1/start': json({ error: 'no_team', message: 'Pick team A first' }, 409),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Wreckers' }));
    expect(await screen.findByText('Pick team A first')).toBeTruthy();
  });

  it('names a missing team or an empty slot as Start team A or B and keeps it disabled', async () => {
    for (const [teamAId, teamBId, slot] of [
      ['tm1', 'gone', 'B'],
      ['tm1', null, 'B'],
    ] as const) {
      cleanup();
      signedIn(RUNNER, {
        'GET /api/producer/intros/i1': json(intro('i1', 'Saturday bout', { teamAId, teamBId })),
        'GET /api/producer/intros/i1/run': json(run()),
        'GET /api/core/teams': json([summary('tm1', 'Wreckers')]),
      });
      socket = new FakeSocket();
      openProducer('/producer/intros/i1/run');
      const missing = await screen.findByRole('button', { name: `Start team ${slot}` });
      await vi.waitFor(() => expect(socket.listening).toBe(true));
      await tell('connect');
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: 'Start Wreckers' }).hasAttribute('disabled')).toBe(false),
      );
      expect(missing.hasAttribute('disabled')).toBe(true);
    }
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
