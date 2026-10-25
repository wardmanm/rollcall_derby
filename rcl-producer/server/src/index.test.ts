import { describe, expect, it, vi } from 'vitest';
import type { AppContext, Realtime } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import { SERVER_HELLO_EVENT, ServerHelloSchema } from '@rollcall/producer-contract';
import { producerApp } from './index.ts';
import { tablesIn, testProducer } from './testing.ts';

describe('the producer app module', () => {
  it('serves its web build with the OBS overlay page at /producer/overlay', () => {
    expect(producerApp.id).toBe('producer');
    expect(producerApp.web?.dir).toMatch(/rcl-producer\/web\/dist$/);
    expect(producerApp.web?.pages).toEqual({ overlay: 'overlay.html' });
  });

  it('creates only its themes table, in its own migrations table', async () => {
    const { api, client } = testProducer();
    await api.close();
    expect(tablesIn(client)).toEqual(['__drizzle_migrations_producer', 'producer_themes']);
  });

  it('greets every client of the public /producer/overlay namespace with the server it is talking to', () => {
    let onConnection: ((socket: { emit: (event: string, payload: unknown) => void }) => void) | undefined;
    const namespace = vi.fn<Realtime['namespace']>(
      () => ({ on: (_event: string, listener: typeof onConnection) => (onConnection = listener) }) as never,
    );
    producerApp.realtime?.({ namespace }, { coreVersion: '0.1.0' } as AppContext);

    expect(namespace).toHaveBeenCalledWith('/producer/overlay', {
      access: { public: expect.stringContaining('OBS browser sources') as string },
    });
    const emit = vi.fn<(event: string, payload: unknown) => void>();
    onConnection?.({ emit });
    expect(emit).toHaveBeenCalledWith(SERVER_HELLO_EVENT, { name: APP_NAME, version: '0.1.0' });
    expect(ServerHelloSchema.parse(emit.mock.calls[0]?.[1])).toEqual({ name: APP_NAME, version: '0.1.0' });
  });
});
