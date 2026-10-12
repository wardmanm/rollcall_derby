import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { browser } from '@rollcall/web-sdk';
import { ADMIN, asSessionUser, json, signedIn } from '@rollcall/web-sdk/testing';
import { openCore, whereIs } from '../test/open-core.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PASSWORD = 'correct horse battery';

// Signed out until a login with the right password.
function signedOutServer() {
  let me: typeof ADMIN | null = null;
  return signedIn(null, {
    'GET /api/core/auth/me': () =>
      me ? Response.json(me) : Response.json({ error: 'unauthenticated' }, { status: 401 }),
    'POST /api/core/auth/login': async (request) => {
      const { password } = (await request.json()) as { password: string };
      if (password !== PASSWORD) return Response.json({ error: 'invalid_credentials' }, { status: 401 });
      me = ADMIN;
      return Response.json(asSessionUser(ADMIN));
    },
    'GET /api/core/apps': json([]),
  });
}

async function signIn(username: string, password: string) {
  await screen.findByRole('heading', { name: 'Sign in' });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('signing in', () => {
  it('goes back to the page that sent you here, query and all', async () => {
    const { requests } = signedOutServer();
    const router = openCore('/core/?from=bookmark');
    await signIn('admin', PASSWORD);
    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/?from=bookmark');
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/auth/login',
      body: { username: 'admin', password: PASSWORD },
    });
  });

  it("goes on to another app's page with a full page load", async () => {
    const replace = vi.spyOn(browser, 'replace').mockImplementation(() => undefined);
    signedOutServer();
    openCore('/core/login?next=%2Fproducer%2Fscreens%2F3');
    await signIn('admin', PASSWORD);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/producer/screens/3'));
  });

  it('never goes on to another site, whatever the address says', async () => {
    const replace = vi.spyOn(browser, 'replace').mockImplementation(() => undefined);
    signedOutServer();
    const router = openCore('/core/login?next=%2F%2Fevil.example%2F');
    await signIn('admin', PASSWORD);
    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/');
    expect(replace).not.toHaveBeenCalled();
  });

  it('never goes on to another site, even with a tab hidden in the address', async () => {
    const replace = vi.spyOn(browser, 'replace').mockImplementation(() => undefined);
    signedOutServer();
    const router = openCore('/core/login?next=%2F%09%2Fevil.example%2F');
    await signIn('admin', PASSWORD);
    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/');
    expect(replace).not.toHaveBeenCalled();
  });

  it('says when the username or password is wrong, without saying which', async () => {
    signedOutServer();
    openCore('/core/login');
    await signIn('admin', 'not the password');
    expect(await screen.findByText('Wrong username or password.')).toBeTruthy();
  });

  it('says when there have been too many attempts', async () => {
    signedIn(null, {
      'POST /api/core/auth/login': json({ error: 'rate_limited', message: 'Rate limit exceeded' }, 429),
    });
    openCore('/core/login');
    await signIn('admin', PASSWORD);
    expect(await screen.findByText('Too many attempts from this device. Wait a minute, then try again.')).toBeTruthy();
  });

  it('asks for both fields before sending anything', async () => {
    const { requests } = signedOutServer();
    openCore('/core/login');
    await signIn('', '');
    expect(await screen.findByText('Enter your username')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });
});
