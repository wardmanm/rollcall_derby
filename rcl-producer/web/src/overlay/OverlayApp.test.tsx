import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { DEFAULT_TOKENS, type RosterOnAir } from '@rollcall/producer-contract';
import { makeOverlayStore } from './live.ts';
import { OverlayApp } from './OverlayApp.tsx';
import { FakeSocket } from './test-socket.ts';

const GOLD = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: '#ffd700' } };

const intro = (revision: number, state: RosterOnAir | null) => ({ revision, onAir: state });

function overlay(introId: string | null = null) {
  const socket = new FakeSocket();
  const { container } = render(
    <Provider store={makeOverlayStore(() => socket)}>
      <OverlayApp introId={introId} />
    </Provider>,
  );
  const accent = () =>
    container.querySelector<HTMLElement>('[data-theme-scope]')?.style.getPropertyValue('--theme-color-accent');
  return { socket, container, accent };
}

describe('OverlayApp', () => {
  it('shows nothing until the server has spoken', () => {
    const { container } = overlay();
    expect(container.innerHTML).toBe('');
  });

  it('applies the default theme the server sends, live, and the built-in look on null', async () => {
    const { socket, accent } = overlay();
    await vi.waitFor(() => expect(socket.listening).toBe(true));
    // RTK batches store updates to the next animation frame, so each change is waited for rather than acted on.
    socket.emit('server:hello', { name: 'Rollcall', version: '0.2.0' });
    socket.emit('theme:changed', { tokens: GOLD, families: [] });
    expect(await screen.findByText('Rollcall')).toBeTruthy();
    await vi.waitFor(() => expect(accent()).toBe('#ffd700'));
    socket.emit('theme:changed', null);
    await vi.waitFor(() => expect(accent()).toBe(''));
  });

  describe("at an intro's address", () => {
    const team = {
      name: 'Harbour City Wreckers',
      leagueName: 'Harbour City Roller Derby',
      logoUrl: null,
      primaryColor: '#b3123f',
      secondaryColor: '#f5c518',
    };
    const onAir = (fields: Partial<RosterOnAir> = {}): RosterOnAir => ({
      team,
      title: false,
      cards: [],
      upNext: null,
      slots: 4,
      entrance: 'pop',
      placement: { spot: 'bottom-center', edge: 48 },
      ...fields,
    });

    it('shows the roster the server sends, and nothing before', async () => {
      const { socket, container } = overlay('abc');
      await vi.waitFor(() => expect(socket.listening).toBe(true));
      expect(container.innerHTML).toBe('');
      socket.emit('server:hello', { name: 'Rollcall', version: '0.2.0' });
      socket.emit('theme:changed', null);
      socket.emit('intro:state', intro(1, onAir({ title: true })));
      expect(await screen.findByText(team.name)).toBeTruthy();
    });

    it('does not mount the roster until the intro state arrives, then mounts it as a reload', async () => {
      const { socket, container } = overlay('abc');
      await vi.waitFor(() => expect(socket.listening).toBe(true));
      socket.emit('server:hello', { name: 'Rollcall', version: '0.2.0' });
      socket.emit('theme:changed', { tokens: GOLD, families: [] });
      // Let the store settle: hello and theme are in, so the placeholder would show by now.
      await act(() => new Promise((done) => setTimeout(done, 50)));
      expect(container.innerHTML).toBe('');
      socket.emit('intro:state', intro(1, onAir({ title: true })));
      const banner = (await screen.findByText(team.name)).closest<HTMLElement>('[data-state]')!;
      expect(banner.hasAttribute('data-entrance')).toBe(false);
    });

    it("checks the team's role line colour against the surface of the theme on show", async () => {
      const { socket, container } = overlay('abc');
      await vi.waitFor(() => expect(socket.listening).toBe(true));
      socket.emit('server:hello', { name: 'Rollcall', version: '0.2.0' });
      socket.emit('theme:changed', null);
      socket.emit('intro:state', intro(1, onAir({ title: true })));
      await screen.findByText(team.name);
      const role = () =>
        container.querySelector<HTMLElement>('[style*="--team-role"]')?.style.getPropertyValue('--team-role');
      // Gold reads on the built-in look's dark surface, but not on a light one.
      expect(role()).toBe('#f5c518');
      const light = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, surface: '#fffffff0' } };
      socket.emit('theme:changed', { tokens: light, families: [] });
      await vi.waitFor(() => expect(role()).toBe('var(--theme-color-text-muted)'));
    });

    it('ignores an intro state older than the one shown', async () => {
      const { socket } = overlay('abc');
      await vi.waitFor(() => expect(socket.listening).toBe(true));
      socket.emit('server:hello', { name: 'Rollcall', version: '0.2.0' });
      socket.emit('theme:changed', null);
      socket.emit('intro:state', intro(5, onAir({ title: true })));
      expect(await screen.findByText(team.name)).toBeTruthy();
      socket.emit('intro:state', intro(4, null));
      await act(() => new Promise((done) => setTimeout(done, 50)));
      expect(screen.getByText(team.name)).toBeTruthy();
    });
  });
});
