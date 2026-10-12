import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, useLocation } from 'react-router';
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
});
