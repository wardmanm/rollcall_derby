import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { HostedApp } from '@rollcall/core-contract';
import { ADMIN, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore } from './test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const CORE: HostedApp = { id: 'core', title: 'Rollcall', version: '0.1.0', url: '/core/' };
const PRODUCER_APP: HostedApp = { id: 'producer', title: 'Rollcall Producer', version: '0.1.0', url: '/producer/' };

describe("rcl-core's home", () => {
  it('shows the app shell, the server version and a link to each other app', async () => {
    signedIn(ADMIN, { 'GET /api/core/apps': json([CORE, PRODUCER_APP]) });
    openCore('/core/');
    expect(await screen.findByRole('heading', { name: 'Rollcall' })).toBeTruthy();
    expect(await screen.findByText('Server v0.1.0')).toBeTruthy();
    const producer = await screen.findByRole('link', { name: /Rollcall Producer/ });
    expect(producer.getAttribute('href')).toBe('/producer/');
    expect(screen.queryByRole('link', { name: /^Rollcall\s*v/ })).toBeNull();
  });

  it('says when no other apps are installed', async () => {
    signedIn(PRODUCER, { 'GET /api/core/apps': json([CORE]) });
    openCore('/core/');
    expect(await screen.findByText('No other apps are installed on this server.')).toBeTruthy();
  });

  it("says so at an address that isn't one of its pages, with the way home", async () => {
    signedIn(ADMIN, { 'GET /api/core/apps': json([CORE]) });
    openCore('/core/no-such-page');
    expect(await screen.findByText("There's no page at this address")).toBeTruthy();
    expect(screen.getByRole('link', { name: "Go to this app's home page" }).getAttribute('href')).toBe('/core/');
  });

  it('says when the server is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    openCore('/core/');
    expect(await screen.findByText("Can't reach the Rollcall server")).toBeTruthy();
  });
});
