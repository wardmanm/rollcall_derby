import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.ts';
import { makeStore } from './store.ts';

const health = { status: 'ok', name: 'OBS Producer', version: '0.1.0', uptimeSeconds: 5 };
afterEach(() => vi.unstubAllGlobals());

describe('api.getHealth', () => {
  it('fetches /api/health and returns the parsed contract', async () => {
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () => Response.json(health));
    vi.stubGlobal('fetch', fetchMock);
    const result = await makeStore().dispatch(api.endpoints.getHealth.initiate());
    expect(result.data).toEqual(health);
    expect(new URL(fetchMock.mock.calls[0]![0].url).pathname).toBe('/api/health');
  });

  it('reports an error when the response is off-contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'ok' })),
    );
    const result = await makeStore().dispatch(api.endpoints.getHealth.initiate());
    expect(result.isError).toBe(true);
  });
});
