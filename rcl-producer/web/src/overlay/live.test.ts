import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOKENS } from '@rollcall/producer-contract';
import { liveApi, makeOverlayStore } from './live.ts';
import { FakeSocket } from './test-socket.ts';

const hello = { name: 'Rollcall', version: '0.1.0' };

async function subscribe(socket: FakeSocket) {
  const store = makeOverlayStore(() => socket);
  const subscription = store.dispatch(liveApi.endpoints.getLiveState.initiate());
  await vi.waitFor(() => expect(socket.listening).toBe(true));
  const state = () => liveApi.endpoints.getLiveState.select()(store.getState()).data;
  return { state, subscription };
}

describe('overlay live state', () => {
  it('starts empty and fills in from the server hello', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    expect(state()).toEqual({ connected: false, server: null, theme: null });
    socket.emit('connect');
    socket.emit('server:hello', hello);
    expect(state()).toEqual({ connected: true, server: hello, theme: null });
  });

  it('keeps the last known state when the connection drops', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    socket.emit('connect');
    socket.emit('server:hello', hello);
    socket.emit('disconnect');
    expect(state()).toEqual({ connected: false, server: hello, theme: null });
  });

  it('keeps the default theme the server sends, and goes back to the built-in look on null', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    const theme = { tokens: DEFAULT_TOKENS, families: [] };
    socket.emit('theme:changed', theme);
    expect(state()?.theme).toEqual(theme);
    socket.emit('theme:changed', null);
    expect(state()?.theme).toBeNull();
  });

  it('ignores messages that break the shared contract', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    socket.emit('server:hello', { name: 'Rollcall' });
    socket.emit('theme:changed', { tokens: { colors: {} }, families: [] });
    expect(state()?.server).toBeNull();
    expect(state()?.theme).toBeNull();
  });

  it('rebuilds everything from the server after a reload', async () => {
    const first = new FakeSocket();
    await subscribe(first);
    first.emit('server:hello', hello);

    const afterReload = new FakeSocket();
    const { state } = await subscribe(afterReload);
    expect(state()?.server).toBeNull();
    afterReload.emit('server:hello', { ...hello, version: '0.1.1' });
    expect(state()?.server?.version).toBe('0.1.1');
  });

  it('closes the socket once nothing uses the live state', async () => {
    const socket = new FakeSocket();
    const { subscription } = await subscribe(socket);
    subscription.unsubscribe();
    await vi.waitFor(() => expect(socket.close).toHaveBeenCalled());
  });
});
