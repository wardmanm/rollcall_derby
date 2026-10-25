import { describe, expect, it } from 'vitest';
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
});
