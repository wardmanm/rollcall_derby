import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App, browser, makeStore } from '@rollcall/web-sdk';
import { PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { PRODUCER_BASE } from './base.ts';
import { routes } from './routes.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const openProducer = (url: string) =>
  render(
    <App router={createMemoryRouter(routes, { basename: PRODUCER_BASE, initialEntries: [url] })} store={makeStore()} />,
  );

describe('the Producer app', () => {
  it('shows its shell, the server version, who is signed in and where to point OBS', async () => {
    signedIn(PRODUCER);
    openProducer('/producer/');
    expect(await screen.findByRole('heading', { name: 'Rollcall Producer' })).toBeTruthy();
    expect(await screen.findByText('Server v0.1.0')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'producer1 Producer' })).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/producer/overlay`)).toBeTruthy();
  });

  it("sends someone signed out to rcl-core's sign-in page, and back here afterwards", async () => {
    const replace = vi.spyOn(browser, 'replace').mockImplementation(() => undefined);
    signedIn(null);
    openProducer('/producer/');
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/core/login?next=%2Fproducer%2F'));
    expect(screen.queryByText(`${window.location.origin}/producer/overlay`)).toBeNull();
  });
});
