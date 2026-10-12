import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, useLocation } from 'react-router';
import type { CurrentUser } from '@rollcall/core-contract';
import { App } from './App.tsx';
import { AppLayout } from './AppLayout.tsx';
import { SignInGate } from './SignInGate.tsx';
import { makeStore } from './store.ts';
import { ADMIN, PRODUCER, signedIn } from './testing.ts';

afterEach(() => vi.unstubAllGlobals());

// jsdom has no layout, so every element measures 0×0 and Mantine may hide an open menu as if its button had scrolled
// out of view. Menu items are found whether or not they're hidden.
const menuItem = (name: string) => screen.findByRole('menuitem', { name, hidden: true });

function Here() {
  const { pathname, search } = useLocation();
  return <p>{`at ${pathname}${search}`}</p>;
}

function openCore() {
  const layout = (
    <SignInGate>
      <AppLayout title="Rollcall" links={[{ label: 'Users', to: '/users', permission: 'core:users.manage' }]} />
    </SignInGate>
  );
  const routes = [
    { path: '/', element: layout, children: [{ index: true, element: <p>Home</p> }] },
    { path: '/login', element: <Here /> },
    { path: '/change-password', element: <Here /> },
  ];
  render(
    <App router={createMemoryRouter(routes, { basename: '/core/', initialEntries: ['/core/'] })} store={makeStore()} />,
  );
}

describe('AppLayout', () => {
  it('shows a link only to people whose role holds its permission', async () => {
    signedIn(ADMIN);
    openCore();
    expect(await screen.findByRole('link', { name: 'Users' })).toBeTruthy();
  });

  it('hides it from everyone else', async () => {
    signedIn(PRODUCER);
    openCore();
    expect(await screen.findByText('Home')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
  });

  it('shows who is signed in, with their role', async () => {
    signedIn(PRODUCER);
    openCore();
    expect(await screen.findByRole('button', { name: 'producer1 Producer' })).toBeTruthy();
  });

  it('opens the change-password page from the account menu, coming back here afterwards', async () => {
    signedIn(ADMIN);
    openCore();
    fireEvent.click(await screen.findByRole('button', { name: 'admin Admin' }));
    fireEvent.click(await menuItem('Change password'));
    expect(await screen.findByText('at /change-password?next=%2Fcore%2F')).toBeTruthy();
  });

  it('logs out from the account menu, then asks to sign in again', async () => {
    let me: CurrentUser | null = ADMIN;
    const { requests } = signedIn(ADMIN, {
      'GET /api/core/auth/me': () =>
        me ? Response.json(me) : Response.json({ error: 'unauthenticated' }, { status: 401 }),
      'POST /api/core/auth/logout': () => {
        me = null;
        return new Response(null, { status: 204 });
      },
    });
    openCore();
    fireEvent.click(await screen.findByRole('button', { name: 'admin Admin' }));
    fireEvent.click(await menuItem('Log out'));
    expect(await screen.findByText('at /login?next=%2Fcore%2F')).toBeTruthy();
    expect(requests).toContainEqual({ method: 'POST', path: '/api/core/auth/logout', body: {} });
  });
});
