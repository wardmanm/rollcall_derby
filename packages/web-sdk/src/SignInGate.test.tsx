import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, useLocation } from 'react-router';
import type { CurrentUser } from '@rollcall/core-contract';
import { App } from './App.tsx';
import { browser } from './navigation.ts';
import { SignInGate } from './SignInGate.tsx';
import { makeStore } from './store.ts';
import { ADMIN, fakeServer, json, signedIn } from './testing.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Here() {
  const { pathname, search } = useLocation();
  return <p>{`at ${pathname}${search}`}</p>;
}

// An app at `base` with one gated page, /screens/3, plus rcl-core's own pages when it's rcl-core.
function openApp(base: '/core/' | '/producer/') {
  const pages =
    base === '/core/' ? ['/setup', '/login', '/change-password'].map((path) => ({ path, element: <Here /> })) : [];
  const routes = [
    {
      path: '/',
      element: (
        <SignInGate>
          <Outlet />
        </SignInGate>
      ),
      children: [{ path: 'screens/3', element: <p>The gated page</p> }],
    },
    ...pages,
  ];
  const router = createMemoryRouter(routes, { basename: base, initialEntries: [`${base}screens/3`] });
  render(<App router={router} store={makeStore()} />);
}

describe('SignInGate', () => {
  it('shows its page to someone signed in', async () => {
    signedIn(ADMIN);
    openApp('/core/');
    expect(await screen.findByText('The gated page')).toBeTruthy();
  });

  it('sends a fresh install to first-run setup', async () => {
    fakeServer({ 'GET /api/core/setup': json({ needsSetup: true, canSetupHere: true }) });
    openApp('/core/');
    expect(await screen.findByText('at /setup')).toBeTruthy();
  });

  it('sends someone signed out to sign in, and back here afterwards', async () => {
    signedIn(null);
    openApp('/core/');
    expect(await screen.findByText('at /login?next=%2Fcore%2Fscreens%2F3')).toBeTruthy();
  });

  it('sends someone with a temporary password to choose their own first', async () => {
    signedIn({ ...ADMIN, mustChangePassword: true });
    openApp('/core/');
    expect(await screen.findByText('at /change-password?next=%2Fcore%2Fscreens%2F3')).toBeTruthy();
  });

  it("leaves another app for rcl-core's sign-in page", async () => {
    const replace = vi.spyOn(browser, 'replace').mockImplementation(() => undefined);
    signedIn(null);
    openApp('/producer/');
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/core/login?next=%2Fproducer%2Fscreens%2F3'));
    expect(screen.queryByText('The gated page')).toBeNull();
  });

  it('checks who is signed in again when you come back to the tab', async () => {
    const replace = vi.spyOn(browser, 'replace').mockImplementation(() => undefined);
    let me: CurrentUser | null = ADMIN;
    signedIn(ADMIN, {
      'GET /api/core/auth/me': () =>
        me ? Response.json(me) : Response.json({ error: 'unauthenticated' }, { status: 401 }),
    });
    openApp('/producer/');
    expect(await screen.findByText('The gated page')).toBeTruthy();
    me = null; // An Admin signed you out while you were in another tab.
    fireEvent.focus(window);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/core/login?next=%2Fproducer%2Fscreens%2F3'));
  });

  it("keeps its page if it can't reach the server when you come back to the tab", async () => {
    let reachable = true;
    const { requests } = signedIn(ADMIN, {
      'GET /api/core/auth/me': () => {
        if (!reachable) throw new TypeError('Failed to fetch');
        return Response.json(ADMIN);
      },
    });
    openApp('/core/');
    expect(await screen.findByText('The gated page')).toBeTruthy();
    reachable = false; // The venue Wi-Fi drops for a moment.
    fireEvent.focus(window);
    await vi.waitFor(() => expect(requests.filter((r) => r.path === '/api/core/auth/me')).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('The gated page')).toBeTruthy();
    expect(screen.queryByText("Can't reach the Rollcall server")).toBeNull();
  });

  it("says so when the server can't be reached", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    openApp('/core/');
    expect(await screen.findByText("Can't reach the Rollcall server")).toBeTruthy();
  });

  it('says what went wrong when the server answers with an error', async () => {
    fakeServer({ 'GET /api/core/setup': json({ error: 'internal_error' }, 500) });
    openApp('/core/');
    expect(await screen.findByText("The Rollcall server couldn't check who's signed in")).toBeTruthy();
    expect(screen.getByText('Something went wrong. Try again.')).toBeTruthy();
    expect(screen.queryByText("Can't reach the Rollcall server")).toBeNull();
  });

  it('says what went wrong when the server refuses to say who is signed in', async () => {
    signedIn(ADMIN, { 'GET /api/core/auth/me': json({ error: 'forbidden' }, 403) });
    openApp('/core/');
    expect(await screen.findByText("The Rollcall server couldn't check who's signed in")).toBeTruthy();
    expect(screen.getByText("Your account can't do that.")).toBeTruthy();
  });
});
