import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.ts';
import { makeStore } from './store.ts';
import { ADMIN, json, signedIn } from './testing.ts';

const health = { status: 'ok', name: 'Rollcall', version: '0.1.0', uptimeSeconds: 5 };
afterEach(() => vi.unstubAllGlobals());

describe('api.getHealth', () => {
  it('fetches /api/core/health and returns the parsed contract', async () => {
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () => Response.json(health));
    vi.stubGlobal('fetch', fetchMock);
    const result = await makeStore().dispatch(api.endpoints.getHealth.initiate());
    expect(result.data).toEqual(health);
    expect(new URL(fetchMock.mock.calls[0]![0].url).pathname).toBe('/api/core/health');
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

describe('a request refused because the session ended', () => {
  it('makes the app ask the server again who is signed in', async () => {
    const { requests } = signedIn(ADMIN, { 'GET /api/core/users': json({ error: 'unauthenticated' }, 401) });
    const probe = api.injectEndpoints({
      endpoints: (build) => ({ probeUsers: build.query<unknown, void>({ query: () => 'core/users' }) }),
    });
    const store = makeStore();
    await store.dispatch(api.endpoints.getMe.initiate());
    await store.dispatch(probe.endpoints.probeUsers.initiate());
    await vi.waitFor(() => expect(requests.filter((r) => r.path === '/api/core/auth/me')).toHaveLength(2));
  });
});
