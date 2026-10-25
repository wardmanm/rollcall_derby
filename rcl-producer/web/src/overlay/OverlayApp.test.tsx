import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { DEFAULT_TOKENS } from '@rollcall/producer-contract';
import { makeOverlayStore } from './live.ts';
import { OverlayApp } from './OverlayApp.tsx';
import { FakeSocket } from './test-socket.ts';

const GOLD = { ...DEFAULT_TOKENS, colors: { ...DEFAULT_TOKENS.colors, accent: '#ffd700' } };

function overlay() {
  const socket = new FakeSocket();
  const { container } = render(
    <Provider store={makeOverlayStore(() => socket)}>
      <OverlayApp />
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
});
