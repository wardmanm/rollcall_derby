import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App } from './App.tsx';
import { routes } from './routes.tsx';
import { makeStore } from './store/store.ts';

const health = { status: 'ok', name: 'OBS Producer', version: '0.1.0', uptimeSeconds: 5 };
afterEach(() => vi.unstubAllGlobals());

const renderApp = () => render(<App router={createMemoryRouter(routes)} store={makeStore()} />);

describe('App', () => {
  it('shows the app shell and the server version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(health)),
    );
    renderApp();
    expect(await screen.findByRole('heading', { name: 'OBS Producer' })).toBeTruthy();
    expect(await screen.findByText('Server v0.1.0')).toBeTruthy();
  });

  it('says when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderApp();
    expect(await screen.findByText('Server unreachable')).toBeTruthy();
  });
});
