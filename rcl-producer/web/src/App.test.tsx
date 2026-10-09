import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App, makeStore } from '@rollcall/web-sdk';
import { routes } from './routes.tsx';

const health = { status: 'ok', name: 'Rollcall', version: '0.1.0', uptimeSeconds: 5 };
afterEach(() => vi.unstubAllGlobals());

describe('the Producer app', () => {
  it('shows its shell, the server version and where to point OBS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(health)),
    );
    render(<App router={createMemoryRouter(routes)} store={makeStore()} />);
    expect(await screen.findByRole('heading', { name: 'Rollcall Producer' })).toBeTruthy();
    expect(await screen.findByText('Server v0.1.0')).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/producer/overlay`)).toBeTruthy();
  });
});
