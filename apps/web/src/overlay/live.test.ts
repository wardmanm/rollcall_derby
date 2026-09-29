import { describe, expect, it, vi } from 'vitest';
import { liveApi, makeOverlayStore, type LiveSocket } from './live.ts';

class FakeSocket implements LiveSocket {
  private handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  close = vi.fn();
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
  get listening() {
    return this.handlers.size > 0;
  }
}

const hello = { name: 'OBS Producer', version: '0.1.0' };

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
    expect(state()).toEqual({ connected: false, server: null });
    socket.emit('connect');
    socket.emit('server:hello', hello);
    expect(state()).toEqual({ connected: true, server: hello });
  });

  it('keeps the last known state when the connection drops', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    socket.emit('connect');
    socket.emit('server:hello', hello);
    socket.emit('disconnect');
    expect(state()).toEqual({ connected: false, server: hello });
  });

  it('ignores messages that break the shared contract', async () => {
    const socket = new FakeSocket();
    const { state } = await subscribe(socket);
    socket.emit('server:hello', { name: 'OBS Producer' });
    expect(state()?.server).toBeNull();
  });

  it('rebuilds everything from the server after a reload', async () => {
    const first = new FakeSocket();
    (await subscribe(first)).state;
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
